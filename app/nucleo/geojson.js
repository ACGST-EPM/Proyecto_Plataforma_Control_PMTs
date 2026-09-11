/**
 * VALIDADOR ESTRUCTURAL DE GEOMETRÍAS — una regla explícita por tipo.
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * La versión anterior adivinaba la profundidad de los arrays con una
 * heurística: «si el primer elemento es un número, o el array tiene menos de
 * dos elementos, esto es una posición». Esa heurística rechazaba geometrías
 * perfectamente válidas:
 *
 *   · un `Polygon` de UN anillo         -> `coordinates.length === 1` y lo
 *                                          confundía con una posición;
 *   · un `MultiLineString` de UNA línea -> el mismo error;
 *   · un `MultiPolygon` de UN polígono  -> el mismo error.
 *
 * El resultado era grave: un proyecto con un polígono válido se guardaba bien,
 * y al abrirlo su geometría se descartaba. El análisis cambiaba solo por haber
 * pasado por un archivo.
 *
 * La clase entera de error es «deducir la estructura en vez de conocerla». Se
 * elimina describiendo cada tipo por su forma exacta: cuántos niveles de
 * anidamiento tiene, cuántos elementos mínimos necesita y qué es un anillo.
 * No queda ninguna ambigüedad que resolver por profundidad.
 */

/** Posición: [lon, lat] o [lon, lat, alt]. Nada más. */
function validarPosicion(v, ruta) {
  if (!Array.isArray(v)) return `${ruta}: se esperaba una coordenada [lon, lat] y no es una lista`;
  if (v.length < 2 || v.length > 3) return `${ruta}: una coordenada debe tener 2 o 3 valores, tiene ${v.length}`;
  const [lon, lat, alt] = v;
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return `${ruta}: la longitud no es un número finito`;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return `${ruta}: la latitud no es un número finito`;
  if (v.length === 3 && (typeof alt !== 'number' || !Number.isFinite(alt))) return `${ruta}: la altitud no es un número finito`;
  if (lon < -180 || lon > 180) return `${ruta}: longitud ${lon} fuera del planeta`;
  if (lat < -90 || lat > 90) return `${ruta}: latitud ${lat} fuera del planeta`;
  return null;
}

/** Lista de posiciones con un mínimo exigido. */
function validarLista(v, minimo, ruta) {
  if (!Array.isArray(v)) return `${ruta}: se esperaba una lista de coordenadas`;
  if (v.length < minimo) return `${ruta}: se necesitan al menos ${minimo} coordenada(s), hay ${v.length}`;
  for (let i = 0; i < v.length; i++) {
    const e = validarPosicion(v[i], `${ruta}[${i}]`);
    if (e) return e;
  }
  return null;
}

const mismaPosicion = (a, b) => a[0] === b[0] && a[1] === b[1];

/**
 * Anillo de polígono: al menos 4 posiciones y cerrado (la última igual que la
 * primera). Es lo que exige GeoJSON (RFC 7946) y lo que hace falta para que el
 * cálculo de «dentro del polígono» tenga sentido.
 */
function validarAnillo(v, ruta) {
  const e = validarLista(v, 4, ruta);
  if (e) return e;
  if (!mismaPosicion(v[0], v[v.length - 1])) return `${ruta}: el anillo no está cerrado (la última coordenada debe repetir la primera)`;
  return null;
}

function validarAnillos(v, ruta) {
  if (!Array.isArray(v) || v.length < 1) return `${ruta}: un polígono necesita al menos un anillo exterior`;
  for (let i = 0; i < v.length; i++) {
    const e = validarAnillo(v[i], `${ruta}[${i}]`);
    if (e) return e;
  }
  return null;
}

/**
 * Reglas por tipo. Cada entrada dice EXACTAMENTE qué forma tiene `coordinates`,
 * sin deducir nada. `minPartes` es el número mínimo de elementos de la
 * colección; una colección de un solo elemento es legítima.
 */
const REGLAS = {
  Point: (c) => validarPosicion(c, 'coordinates'),
  MultiPoint: (c) => validarLista(c, 1, 'coordinates'),
  LineString: (c) => validarLista(c, 2, 'coordinates'),
  MultiLineString: (c) => {
    if (!Array.isArray(c) || c.length < 1) return 'coordinates: se esperaba al menos una línea';
    for (let i = 0; i < c.length; i++) {
      const e = validarLista(c[i], 2, `coordinates[${i}]`);
      if (e) return e;
    }
    return null;
  },
  Polygon: (c) => validarAnillos(c, 'coordinates'),
  MultiPolygon: (c) => {
    if (!Array.isArray(c) || c.length < 1) return 'coordinates: se esperaba al menos un polígono';
    for (let i = 0; i < c.length; i++) {
      const e = validarAnillos(c[i], `coordinates[${i}]`);
      if (e) return e;
    }
    return null;
  },
};

export const TIPOS_GEOMETRIA = Object.freeze([...Object.keys(REGLAS), 'GeometryCollection']);

/** Profundidad máxima de anidamiento admitida, para cortar bombas de recursión. */
const MAX_PROFUNDIDAD_COLECCION = 5;

/**
 * Valida una geometría GeoJSON contra la regla de su tipo.
 *
 * @returns {{ok:true}|{ok:false, motivo:string}}
 */
export function validarGeometria(g, profundidad = 0) {
  if (g === null || g === undefined) return { ok: true, vacia: true };
  if (typeof g !== 'object' || Array.isArray(g)) return { ok: false, motivo: 'la geometría no es un objeto' };
  if (typeof g.type !== 'string') return { ok: false, motivo: 'la geometría no declara su tipo' };

  if (g.type === 'GeometryCollection') {
    if (profundidad >= MAX_PROFUNDIDAD_COLECCION) {
      return { ok: false, motivo: 'colecciones de geometrías anidadas más allá de lo razonable' };
    }
    if (!Array.isArray(g.geometries) || g.geometries.length < 1) {
      return { ok: false, motivo: 'GeometryCollection sin geometrías' };
    }
    for (let i = 0; i < g.geometries.length; i++) {
      const r = validarGeometria(g.geometries[i], profundidad + 1);
      if (!r.ok) return { ok: false, motivo: `geometries[${i}]: ${r.motivo}` };
      if (r.vacia) return { ok: false, motivo: `geometries[${i}]: geometría vacía dentro de una colección` };
    }
    return { ok: true };
  }

  const regla = REGLAS[g.type];
  if (!regla) return { ok: false, motivo: `tipo de geometría desconocido: "${g.type}"` };
  if (!('coordinates' in g)) return { ok: false, motivo: `${g.type} sin coordenadas` };

  const motivo = regla(g.coordinates);
  return motivo ? { ok: false, motivo } : { ok: true };
}

/**
 * Compara dos geometrías por su SIGNIFICADO, no por su serialización.
 * Sirve para exigir que guardar y abrir no cambie nada.
 */
export function mismaGeometria(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'GeometryCollection') {
    const ga = a.geometries ?? [], gb = b.geometries ?? [];
    return ga.length === gb.length && ga.every((x, i) => mismaGeometria(x, gb[i]));
  }
  const iguales = (x, y) => {
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    if (!Array.isArray(x)) return x === y;
    return x.length === y.length && x.every((v, i) => iguales(v, y[i]));
  };
  return iguales(a.coordinates, b.coordinates);
}
