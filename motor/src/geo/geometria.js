/**
 * Distancia minima e interseccion entre dos geometrias GeoJSON cualesquiera.
 *
 * Soporta todo el modelo GeoJSON, no solo punto y linea como el motor legado:
 *   Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon
 *   y GeometryCollection (recursiva).
 *
 * Los dos hechos que produce son INDEPENDIENTES entre si y se calculan sin
 * ninguna regla de negocio encima:
 *   - metros    : distancia minima real entre las geometrias originales
 *   - intersecan: si existe contacto geometrico fisico (distancia 0)
 *
 * ── DOMINIO DE LA PROYECCION ───────────────────────────────────────────────
 *
 * La medida se hace sobre un plano tangente local. Ese plano solo es fiable en
 * un entorno del punto donde toca la Tierra, asi que hay dos reglas duras:
 *
 *  1. El plano se construye PARA CADA PAR DE PARTES que se compara, con el
 *     origen en el punto medio de esas dos partes. No se usa un unico plano
 *     para toda la geometria.
 *
 *     Por que importa: con un plano comun, un componente lejano desplazaba el
 *     origen y falseaba la medida de los componentes cercanos. Medido:
 *     MultiPoint([[0,0],[2,0]]) contra un punto situado a 120,010 m del primer
 *     componente daba 119,992 m — 18 mm de error por culpa de un vertice a
 *     222 km. Y en el caso extremo, una linea que cruzaba el planeta entero
 *     hacia que el antipoda se proyectara sobre el propio origen, produciendo
 *     un falso contacto de 0 m.
 *
 *  2. Si el par de partes no cabe en el radio de dominio, NO se mide. Se
 *     devuelve `metros: null` con un error explicito. Nunca se entrega un
 *     numero que parezca valido cuando el metodo ha dejado de serlo.
 *
 * El dominio soportado se declara en RADIO_DOMINIO_METROS y esta justificado
 * en motor/README.md con el error medido.
 */

import { planoParaCajas } from './plano-local.js';
import { cotaInferiorMetros, unir, radioAproximadoMetros } from './cajas.js';
import {
  distPuntoSegmento, distSegmentoSegmento,
  puntoEnAnillo, distPuntoAnillo,
  ajustarACero, TOLERANCIA_NUMERICA_METROS,
} from './segmentos.js';

export { TOLERANCIA_NUMERICA_METROS };

/**
 * Radio maximo, en metros, desde el origen del plano local hasta cualquier
 * vertice que participe en una medida.
 *
 * 50 km. La distorsion del plano tangente crece como s^2/(2R^2): a 50 km del
 * origen vale 3,1e-5, es decir 3,7 mm sobre una medida de 120 m. Mas alla el
 * metodo sigue funcionando, pero preferimos declarar el limite antes que
 * defender numeros que no hemos comprobado.
 */
export const RADIO_DOMINIO_METROS = 50000;

/** Tipos GeoJSON que el motor entiende. */
export const TIPOS_SOPORTADOS = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString',
  'Polygon', 'MultiPolygon', 'GeometryCollection',
]);

/**
 * Descompone cualquier geometria GeoJSON en tres listas de primitivas.
 * Es el paso que impide que un tipo "raro" se descarte en silencio: lo que no
 * se reconoce se reporta como error, nunca se ignora.
 *
 * @returns {{puntos:Array, lineas:Array, poligonos:Array, errores:Array<string>}}
 */
export function descomponer(geom, errores = []) {
  const r = { puntos: [], lineas: [], poligonos: [], errores };
  if (!geom || typeof geom !== 'object' || !geom.type) {
    errores.push('geometria ausente o sin type');
    return r;
  }
  const c = geom.coordinates;
  switch (geom.type) {
    case 'Point': if (valido(c)) r.puntos.push(c); else errores.push('Point con coordenadas invalidas'); break;
    case 'MultiPoint': for (const p of c ?? []) if (valido(p)) r.puntos.push(p); break;
    case 'LineString': if (lineaValida(c)) r.lineas.push(c); else errores.push('LineString con menos de 1 vertice valido'); break;
    case 'MultiLineString': for (const l of c ?? []) if (lineaValida(l)) r.lineas.push(l); break;
    case 'Polygon': agregarPoligono(r, c, errores); break;
    case 'MultiPolygon': for (const pg of c ?? []) agregarPoligono(r, pg, errores); break;
    case 'GeometryCollection': {
      for (const g of geom.geometries ?? []) {
        const sub = descomponer(g, errores);
        r.puntos.push(...sub.puntos); r.lineas.push(...sub.lineas); r.poligonos.push(...sub.poligonos);
      }
      break;
    }
    default:
      errores.push(`tipo de geometria no soportado: ${geom.type}`);
  }
  return r;
}

const valido = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const lineaValida = (l) => Array.isArray(l) && l.filter(valido).length >= 1;

function agregarPoligono(r, anillos, errores) {
  if (!Array.isArray(anillos) || !anillos.length) { errores.push('Polygon sin anillos'); return; }
  const limpios = anillos.map((a) => (a ?? []).filter(valido)).filter((a) => a.length >= 3);
  if (!limpios.length) { errores.push('Polygon sin un anillo exterior valido'); return; }
  r.poligonos.push({ exterior: limpios[0], huecos: limpios.slice(1) });
}

function cajaDeVertices(vertices) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [x, y] of vertices) {
    if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
    if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
  }
  return minLon === Infinity ? null : { minLon, minLat, maxLon, maxLat };
}

/** Caja envolvente geografica de una geometria ya descompuesta. */
export function cajaDe(desc) {
  const todos = [];
  desc.puntos.forEach((p) => todos.push(p));
  desc.lineas.forEach((l) => l.forEach((p) => todos.push(p)));
  desc.poligonos.forEach((p) => {
    p.exterior.forEach((q) => todos.push(q));
    p.huecos.forEach((h) => h.forEach((q) => todos.push(q)));
  });
  return cajaDeVertices(todos);
}

/**
 * Enumera las PARTES independientes de una descomposicion, cada una con su
 * propia caja. Esta es la unidad sobre la que se proyecta y se mide.
 */
function enumerarPartes(desc) {
  const partes = [];
  for (const p of desc.puntos) partes.push({ tipo: 'punto', dato: p, caja: cajaDeVertices([p]) });
  for (const l of desc.lineas) partes.push({ tipo: 'linea', dato: l, caja: cajaDeVertices(l) });
  for (const g of desc.poligonos) {
    const vs = [...g.exterior, ...g.huecos.flat()];
    partes.push({ tipo: 'poligono', dato: g, caja: cajaDeVertices(vs) });
  }
  return partes.filter((p) => p.caja);
}

/** Proyecta una parte al plano metrico dado. */
function proyectarParte(parte, plano) {
  const P = plano.proyectar;
  if (parte.tipo === 'punto') return { tipo: 'punto', dato: P(parte.dato) };
  if (parte.tipo === 'linea') return { tipo: 'linea', dato: parte.dato.map(P) };
  return {
    tipo: 'poligono',
    dato: { exterior: parte.dato.exterior.map(P), huecos: parte.dato.huecos.map((h) => h.map(P)) },
  };
}

/** ¿El punto (plano) cae dentro del poligono, descontando huecos? */
function puntoEnPoligono(p, pg) {
  if (!puntoEnAnillo(p, pg.exterior)) return false;
  for (const h of pg.huecos) {
    // Sobre el borde de un hueco sigue habiendo contacto con el poligono.
    if (puntoEnAnillo(p, h) && distPuntoAnillo(p, h) > 0) return false;
  }
  return true;
}

function anillos(pg) { return [pg.exterior, ...pg.huecos]; }

function distPuntoPoligono(p, pg) {
  if (puntoEnPoligono(p, pg)) return 0;
  let min = Infinity;
  for (const an of anillos(pg)) min = Math.min(min, distPuntoAnillo(p, an));
  return min;
}

function distLineaAnillo(linea, anillo) {
  let min = Infinity;
  for (let i = 0; i < Math.max(1, linea.length - 1); i++) {
    const a = linea[i], b = linea[i + 1] ?? linea[i];
    for (let j = 0, k = anillo.length - 1; j < anillo.length; k = j++) {
      const d = a === b
        ? distPuntoSegmento(a, anillo[k], anillo[j])
        : distSegmentoSegmento(a, b, anillo[k], anillo[j]);
      if (d < min) min = d;
      if (min === 0) return 0;
    }
  }
  return min;
}

function distLineaPoligono(linea, pg) {
  for (const v of linea) if (puntoEnPoligono(v, pg)) return 0;
  let min = Infinity;
  for (const an of anillos(pg)) { min = Math.min(min, distLineaAnillo(linea, an)); if (min === 0) return 0; }
  return min;
}

function distLineaLinea(l1, l2) {
  let min = Infinity;
  const n1 = Math.max(1, l1.length - 1), n2 = Math.max(1, l2.length - 1);
  for (let i = 0; i < n1; i++) {
    const a = l1[i], b = l1[i + 1] ?? l1[i];
    for (let j = 0; j < n2; j++) {
      const c = l2[j], d = l2[j + 1] ?? l2[j];
      const dd = (a === b && c === d)
        ? ajustarACero(Math.hypot(a[0] - c[0], a[1] - c[1]))
        : a === b ? distPuntoSegmento(a, c, d)
        : c === d ? distPuntoSegmento(c, a, b)
        : distSegmentoSegmento(a, b, c, d);
      if (dd < min) min = dd;
      if (min === 0) return 0;
    }
  }
  return min;
}

function distPoligonoPoligono(p1, p2) {
  for (const v of p1.exterior) if (puntoEnPoligono(v, p2)) return 0;
  for (const v of p2.exterior) if (puntoEnPoligono(v, p1)) return 0;
  let min = Infinity;
  for (const a1 of anillos(p1)) for (const a2 of anillos(p2)) {
    min = Math.min(min, distLineaAnillo(a1, a2));
    if (min === 0) return 0;
  }
  return min;
}

/** Distancia entre dos partes ya proyectadas al mismo plano. */
function distanciaPartes(a, b) {
  if (a.tipo === 'punto' && b.tipo === 'punto') {
    return ajustarACero(Math.hypot(a.dato[0] - b.dato[0], a.dato[1] - b.dato[1]));
  }
  if (a.tipo === 'punto' && b.tipo === 'linea') return distLineaLinea([a.dato], b.dato);
  if (a.tipo === 'linea' && b.tipo === 'punto') return distLineaLinea(a.dato, [b.dato]);
  if (a.tipo === 'linea' && b.tipo === 'linea') return distLineaLinea(a.dato, b.dato);
  if (a.tipo === 'punto' && b.tipo === 'poligono') return distPuntoPoligono(a.dato, b.dato);
  if (a.tipo === 'poligono' && b.tipo === 'punto') return distPuntoPoligono(b.dato, a.dato);
  if (a.tipo === 'linea' && b.tipo === 'poligono') return distLineaPoligono(a.dato, b.dato);
  if (a.tipo === 'poligono' && b.tipo === 'linea') return distLineaPoligono(b.dato, a.dato);
  return distPoligonoPoligono(a.dato, b.dato);
}

/**
 * Distancia minima en metros entre dos geometrias GeoJSON.
 *
 * @param {object} geomA GeoJSON
 * @param {object} geomB GeoJSON
 * @returns {{metros:number|null, intersecan:boolean, dominioValido:boolean, errores:string[]}}
 */
export function medir(geomA, geomB) {
  const errores = [];
  const partesA = enumerarPartes(descomponer(geomA, errores));
  const partesB = enumerarPartes(descomponer(geomB, errores));
  if (!partesA.length || !partesB.length) {
    return { metros: null, intersecan: false, dominioValido: true, errores };
  }

  let min = Infinity;
  let dominioValido = true;

  for (const pa of partesA) {
    for (const pb of partesB) {
      // Poda por cota inferior: si ya sabemos que no puede mejorar el minimo,
      // no hace falta proyectar ni medir.
      if (cotaInferiorMetros(pa.caja, pb.caja) >= min) continue;

      // Dominio: el plano se construye para ESTE par, con origen en su centro.
      const union = unir(pa.caja, pb.caja);
      const radio = radioAproximadoMetros(union);
      if (radio > RADIO_DOMINIO_METROS) {
        dominioValido = false;
        errores.push(
          `par de geometrias fuera del dominio de la proyeccion local: abarca ~${Math.round(radio / 1000)} km ` +
          `de radio y el limite es ${RADIO_DOMINIO_METROS / 1000} km; no se mide`
        );
        continue;
      }

      const plano = planoParaCajas([pa.caja, pb.caja]);
      const d = distanciaPartes(proyectarParte(pa, plano), proyectarParte(pb, plano));
      if (d < min) min = d;
      if (min === 0) break;
    }
    if (min === 0) break;
  }

  if (!Number.isFinite(min)) {
    return { metros: null, intersecan: false, dominioValido, errores };
  }
  const metros = ajustarACero(min);
  return { metros, intersecan: metros === 0, dominioValido, errores };
}

/** Caja envolvente geografica de una geometria GeoJSON sin descomponer antes. */
export function caja(geom) {
  return cajaDe(descomponer(geom, []));
}

/**
 * Radio aproximado que ocupa una geometria, en metros. Sirve para decidir si
 * cabe dentro del dominio soportado antes de intentar medir nada con ella.
 */
export function radioDe(geom) {
  const c = caja(geom);
  return c ? radioAproximadoMetros(c) : 0;
}
