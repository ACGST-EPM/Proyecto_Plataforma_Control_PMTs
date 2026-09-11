/**
 * Distancia mínima e intersección entre dos geometrías GeoJSON cualesquiera.
 *
 * Soporta todo el modelo GeoJSON, no solo punto y línea como el motor legado:
 *   Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon
 *   y GeometryCollection (recursiva).
 *
 * Los dos hechos que produce son INDEPENDIENTES entre sí y se calculan sin
 * ninguna regla de negocio encima:
 *   - metros    : distancia mínima real entre las geometrías originales
 *   - intersecan: si existe contacto geométrico físico (distancia exactamente 0)
 */

import { planoParaCajas } from './plano-local.js';
import {
  distPuntoSegmento, distSegmentoSegmento,
  puntoEnAnillo, distPuntoAnillo,
  ajustarACero, TOLERANCIA_NUMERICA_METROS,
} from './segmentos.js';

export { TOLERANCIA_NUMERICA_METROS };

/** Tipos GeoJSON que el motor entiende. */
export const TIPOS_SOPORTADOS = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString',
  'Polygon', 'MultiPolygon', 'GeometryCollection',
]);

/**
 * Descompone cualquier geometría GeoJSON en tres listas de primitivas.
 * Es el paso que impide que un tipo "raro" se descarte en silencio: lo que no
 * se reconoce se reporta como error, nunca se ignora.
 *
 * @returns {{puntos:Array, lineas:Array, poligonos:Array, errores:Array<string>}}
 */
export function descomponer(geom, errores = []) {
  const r = { puntos: [], lineas: [], poligonos: [], errores };
  if (!geom || typeof geom !== 'object' || !geom.type) {
    errores.push('geometría ausente o sin type');
    return r;
  }
  const c = geom.coordinates;
  switch (geom.type) {
    case 'Point': if (valido(c)) r.puntos.push(c); else errores.push('Point con coordenadas inválidas'); break;
    case 'MultiPoint': for (const p of c ?? []) if (valido(p)) r.puntos.push(p); break;
    case 'LineString': if (lineaValida(c)) r.lineas.push(c); else errores.push('LineString con menos de 1 vértice válido'); break;
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
      errores.push(`tipo de geometría no soportado: ${geom.type}`);
  }
  return r;
}

const valido = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const lineaValida = (l) => Array.isArray(l) && l.filter(valido).length >= 1;

function agregarPoligono(r, anillos, errores) {
  if (!Array.isArray(anillos) || !anillos.length) { errores.push('Polygon sin anillos'); return; }
  const limpios = anillos.map((a) => (a ?? []).filter(valido)).filter((a) => a.length >= 3);
  if (!limpios.length) { errores.push('Polygon sin un anillo exterior válido'); return; }
  r.poligonos.push({ exterior: limpios[0], huecos: limpios.slice(1) });
}

/** Caja envolvente geográfica de una geometría ya descompuesta. */
export function cajaDe(desc) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const ver = ([x, y]) => {
    if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
    if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
  };
  desc.puntos.forEach(ver);
  desc.lineas.forEach((l) => l.forEach(ver));
  desc.poligonos.forEach((p) => { p.exterior.forEach(ver); p.huecos.forEach((h) => h.forEach(ver)); });
  if (minLon === Infinity) return null;
  return { minLon, minLat, maxLon, maxLat };
}

/** Proyecta una descomposición al plano métrico dado. */
function proyectar(desc, plano) {
  const P = plano.proyectar;
  return {
    puntos: desc.puntos.map(P),
    lineas: desc.lineas.map((l) => l.map(P)),
    poligonos: desc.poligonos.map((p) => ({
      exterior: p.exterior.map(P),
      huecos: p.huecos.map((h) => h.map(P)),
    })),
  };
}

/** ¿El punto (plano) cae dentro del polígono, descontando huecos? */
function puntoEnPoligono(p, pg) {
  if (!puntoEnAnillo(p, pg.exterior)) return false;
  for (const h of pg.huecos) {
    // Sobre el borde de un hueco sigue habiendo contacto con el polígono.
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

/**
 * Distancia mínima en metros entre dos geometrías GeoJSON.
 * Devuelve `null` si alguna de las dos no tiene ninguna primitiva utilizable.
 *
 * @param {object} geomA GeoJSON
 * @param {object} geomB GeoJSON
 * @returns {{metros:number|null, intersecan:boolean, errores:string[]}}
 */
export function medir(geomA, geomB) {
  const errores = [];
  const dA = descomponer(geomA, errores);
  const dB = descomponer(geomB, errores);
  const cA = cajaDe(dA), cB = cajaDe(dB);
  if (!cA || !cB) return { metros: null, intersecan: false, errores };

  // El origen del plano se calcula con las dos geometrías que se comparan, de
  // modo que siempre queda a unos cientos de metros de los datos medidos.
  const plano = planoParaCajas([cA, cB]);
  const A = proyectar(dA, plano);
  const B = proyectar(dB, plano);

  let min = Infinity;
  const bajar = (d) => { if (d < min) min = d; return min === 0; };

  for (const pa of A.puntos) {
    for (const pb of B.puntos) if (bajar(ajustarACero(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])))) return fin(min, errores);
    for (const lb of B.lineas) if (bajar(distLineaLinea([pa], lb))) return fin(min, errores);
    for (const gb of B.poligonos) if (bajar(distPuntoPoligono(pa, gb))) return fin(min, errores);
  }
  for (const la of A.lineas) {
    for (const pb of B.puntos) if (bajar(distLineaLinea(la, [pb]))) return fin(min, errores);
    for (const lb of B.lineas) if (bajar(distLineaLinea(la, lb))) return fin(min, errores);
    for (const gb of B.poligonos) if (bajar(distLineaPoligono(la, gb))) return fin(min, errores);
  }
  for (const ga of A.poligonos) {
    for (const pb of B.puntos) if (bajar(distPuntoPoligono(pb, ga))) return fin(min, errores);
    for (const lb of B.lineas) if (bajar(distLineaPoligono(lb, ga))) return fin(min, errores);
    for (const gb of B.poligonos) if (bajar(distPoligonoPoligono(ga, gb))) return fin(min, errores);
  }
  return fin(min, errores);
}

function fin(min, errores) {
  if (!Number.isFinite(min)) return { metros: null, intersecan: false, errores };
  // La tolerancia numerica se aplica una ultima vez aqui, de modo que
  // `intersecan` nunca sea falso por culpa del redondeo de la coma flotante.
  // Es una tolerancia de ARITMETICA (1 nm), no el umbral operacional de 120 m.
  const metros = ajustarACero(min);
  return { metros, intersecan: metros === 0, errores };
}

/** Caja envolvente geográfica de una geometría GeoJSON sin descomponer antes. */
export function caja(geom) {
  return cajaDe(descomponer(geom, []));
}
