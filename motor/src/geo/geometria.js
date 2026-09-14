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
import { cajaCircular, unir, radioAproximadoMetros } from './cajas.js';
import { aEcef } from './elipsoide.js';
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
    case 'MultiPoint': for (const p of c ?? []) if (valido(p)) r.puntos.push(p); else errores.push('MultiPoint con parte invalida'); break;
    case 'LineString': if (lineaValida(c)) r.lineas.push(c); else errores.push('LineString con menos de 1 vertice valido'); break;
    case 'MultiLineString': for (const l of c ?? []) if (lineaValida(l)) r.lineas.push(l); else errores.push('MultiLineString con parte invalida'); break;
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

const valido = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const lineaValida = (l) => Array.isArray(l) && l.length >= 1 && l.every(valido);

function agregarPoligono(r, anillos, errores) {
  if (!Array.isArray(anillos) || !anillos.length) { errores.push('Polygon sin anillos'); return; }
  if (!anillos.every((a) => Array.isArray(a) && a.length >= 3 && a.every(valido))) {
    errores.push('Polygon invalido: no se pueden eliminar vertices ni anillos'); return;
  }
  r.poligonos.push({ exterior: anillos[0], huecos: anillos.slice(1) });
}

function cajaDeVertices(vertices) {
  return cajaCircular(vertices);
}

function verticesDe(p) {
  return p.tipo === 'punto' ? [p.dato] : p.tipo === 'linea' ? p.dato : [p.dato.exterior, ...p.dato.huecos].flat();
}

// Solo para certificar que una parte compacta lejana no puede mejorar un
// minimo local ya obtenido. Envolventes cartesianas de las cuerdas ECEF:
// el casco convexo contiene segmentos y superficies del modelo. Se restan
// 1000 m de margen, mayor que la excursion normal de dos partes locales de
// radio <=50 km (<400 m cada una, R minimo WGS84 >6300 km). NO se usa esta
// cota para inventar una distancia ni para proyectar un par fuera de dominio.
function cotaPartesCompactas(a, b) {
  if ([a, b].some((p) => radioAproximadoMetros(p.caja) > RADIO_DOMINIO_METROS)) return 0;
  const cajas = [a, b].map((p) => {
    const vs = verticesDe(p).map(([lon, lat]) => aEcef(lon, lat));
    return [0, 1, 2].map((i) => [Math.min(...vs.map((v) => v[i])), Math.max(...vs.map((v) => v[i]))]);
  });
  return Math.max(0, Math.hypot(...[0, 1, 2].map((i) =>
    Math.max(0, cajas[0][i][0] - cajas[1][i][1], cajas[1][i][0] - cajas[0][i][1]))) - 1000);
}

function tramos(p) {
  if (p.tipo !== 'linea' || p.dato.length <= 2) return [p];
  return p.dato.slice(1).map((v, i) => {
    const dato = [p.dato[i], v];
    return { tipo: 'linea', dato, caja: cajaDeVertices(dato) };
  });
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
  if (errores.length || !partesA.length || !partesB.length) {
    if (!errores.length) errores.push('geometria sin partes utilizables');
    return { metros: null, intersecan: null, dominioValido: false, errores };
  }

  let min = Infinity;
  const pendientes = [];

  function comparar(pa, pb, permitirTramos = true) {
    const radio = radioAproximadoMetros(unir(pa.caja, pb.caja));
    if (radio > RADIO_DOMINIO_METROS) {
      const aa = tramos(pa), bb = tramos(pb);
      if (permitirTramos && (aa.length > 1 || bb.length > 1)) {
        for (const a of aa) for (const b of bb) {
          comparar(a, b, false);
          if (min === 0) return;
        }
      } else pendientes.push({ pa, pb, radio });
      return;
    }
    const plano = planoParaCajas([pa.caja, pb.caja]);
    min = Math.min(min, distanciaPartes(proyectarParte(pa, plano), proyectarParte(pb, plano)));
  }

  for (const pa of partesA) {
    for (const pb of partesB) {
      comparar(pa, pb);
      if (min === 0) break;
    }
    if (min === 0) break;
  }

  // Un contacto local prueba el minimo absoluto 0. Un minimo positivo solo
  // vale si ninguna parte pendiente puede mejorarlo, independientemente del orden.
  const sinResolver = min === 0 ? [] : pendientes.filter(({ pa, pb }) =>
    !Number.isFinite(min) || cotaPartesCompactas(pa, pb) <= min);
  if (!Number.isFinite(min) || sinResolver.length) {
    for (const { radio } of sinResolver) errores.push(
      `par no evaluable espacialmente, fuera del dominio: una parte abarca ~${Math.round(radio / 1000)} km de radio; limite 50 km`);
    return { metros: null, intersecan: null, dominioValido: false, errores };
  }
  const metros = ajustarACero(min);
  return { metros, intersecan: metros === 0, dominioValido: true, errores };
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
