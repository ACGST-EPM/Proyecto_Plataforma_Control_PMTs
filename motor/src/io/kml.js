/**
 * KML -> registros del motor.
 *
 * Diferencias importantes frente al lector legado (`proceso_pmt_qgis.py` y el
 * importador de `Generador_KMZ.html`):
 *
 *  - El legado tomaba SOLO la primera geometria de cada Placemark
 *    (`getByLocal(pm,'LineString')[0]`), asi que un MultiGeometry perdia el
 *    resto sin decir nada. Aqui se convierten TODAS.
 *  - El legado descartaba los poligonos con un `return` mudo. Aqui se leen.
 *  - Aqui nada se descarta en silencio: lo que no se reconoce genera un aviso
 *    asociado al registro concreto.
 *  - Un Placemark con problemas no interrumpe la lectura de los demas.
 */

import { analizarXml, buscarTodos, hijos, buscarUno, textoDe } from './xml.js';

/** Lee una lista de coordenadas KML: "lon,lat[,alt]" separadas por espacios. */
export function leerCoordenadas(texto, avisos = []) {
  const t = String(texto ?? '').trim();
  if (!t) { avisos.push('bloque <coordinates> vacio'); return []; }
  // Google Earth a veces escribe "lon, lat, alt" con espacio tras la coma; se
  // normaliza antes de separar por espacios en blanco.
  const limpio = t.replace(/,\s+/g, ',');
  const puntos = [];
  let descartados = 0;
  for (const tok of limpio.split(/\s+/)) {
    if (!tok) continue;
    const p = tok.split(',');
    const lon = Number.parseFloat(p[0]);
    const lat = Number.parseFloat(p[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { descartados++; continue; }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      avisos.push(`coordenada fuera del rango terrestre: ${lon},${lat}`);
      descartados++; continue;
    }
    puntos.push([lon, lat]);
  }
  if (descartados) avisos.push(`${descartados} coordenada(s) ilegibles descartadas`);
  return puntos;
}

const anilloDe = (nodo, avisos) => {
  const c = leerCoordenadas(textoDe(buscarUno(nodo, 'coordinates')), avisos);
  if (c.length < 3) { avisos.push('anillo con menos de 3 vertices: se ignora'); return null; }
  // GeoJSON exige el anillo cerrado.
  const primero = c[0], ultimo = c[c.length - 1];
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) c.push([...primero]);
  return c;
};

/** Convierte un nodo de geometria KML en geometria GeoJSON. */
function geometriaDe(nodo, avisos) {
  switch (nodo.nombre) {
    case 'Point': {
      const c = leerCoordenadas(textoDe(buscarUno(nodo, 'coordinates')), avisos);
      return c.length ? { type: 'Point', coordinates: c[0] } : null;
    }
    case 'LineString': {
      const c = leerCoordenadas(textoDe(buscarUno(nodo, 'coordinates')), avisos);
      if (!c.length) return null;
      if (c.length === 1) {
        avisos.push('LineString con un solo vertice: se trata como punto');
        return { type: 'Point', coordinates: c[0] };
      }
      return { type: 'LineString', coordinates: c };
    }
    case 'LinearRing': {
      const a = anilloDe(nodo, avisos);
      return a ? { type: 'Polygon', coordinates: [a] } : null;
    }
    case 'Polygon': {
      const ext = buscarUno(nodo, 'outerBoundaryIs');
      const extAnillo = ext ? anilloDe(ext, avisos) : anilloDe(nodo, avisos);
      if (!extAnillo) return null;
      const huecos = [];
      for (const h of buscarTodos(nodo, 'innerBoundaryIs')) {
        const a = anilloDe(h, avisos);
        if (a) huecos.push(a);
      }
      return { type: 'Polygon', coordinates: [extAnillo, ...huecos] };
    }
    case 'MultiGeometry': {
      const partes = [];
      for (const h of nodo.hijos) {
        if (h.nombre === '#texto') continue;
        const g = geometriaDe(h, avisos);
        if (g) partes.push(g);
        else if (h.nombre !== 'coordinates') avisos.push(`dentro de MultiGeometry no se pudo leer <${h.nombre}>`);
      }
      return agruparMultiGeometria(partes, avisos);
    }
    case 'Model':
    case 'Track':
    case 'MultiTrack':
      avisos.push(`geometria <${nodo.nombre}> no soportada: el registro queda sin geometria`);
      return null;
    default:
      return null;
  }
}

/**
 * Agrupa varias geometrias en el tipo GeoJSON mas especifico posible.
 * Si son todas del mismo tipo se usa el Multi* correspondiente; si estan
 * mezcladas se usa GeometryCollection, que el motor tambien sabe medir.
 */
function agruparMultiGeometria(partes, avisos) {
  if (!partes.length) return null;
  if (partes.length === 1) return partes[0];
  const tipos = new Set(partes.map((p) => p.type));
  if (tipos.size === 1) {
    const t = partes[0].type;
    if (t === 'Point') return { type: 'MultiPoint', coordinates: partes.map((p) => p.coordinates) };
    if (t === 'LineString') return { type: 'MultiLineString', coordinates: partes.map((p) => p.coordinates) };
    if (t === 'Polygon') return { type: 'MultiPolygon', coordinates: partes.map((p) => p.coordinates) };
  }
  avisos.push(`MultiGeometry con tipos mezclados (${[...tipos].join(', ')}): se representa como GeometryCollection`);
  return { type: 'GeometryCollection', geometries: partes };
}

const GEOMETRIAS_KML = new Set([
  'Point', 'LineString', 'LinearRing', 'Polygon', 'MultiGeometry', 'Model', 'Track', 'MultiTrack',
]);

/** Identificador propio del proyecto, si el KMZ lo trae en <ExtendedData>. */
function idExplicitoDe(placemark) {
  for (const d of buscarTodos(placemark, 'Data')) {
    const n = (d.atributos.name ?? '').toLowerCase();
    if (n === 'pmt:id' || n === 'pmt_id') return textoDe(buscarUno(d, 'value')) || null;
  }
  const s = buscarUno(placemark, 'SimpleData');
  if (s && (s.atributos.name ?? '').toLowerCase() === 'pmt:id') return textoDe(s) || null;
  return null;
}

/** Ruta de carpetas <Folder><name> que contiene a un Placemark, si la hay. */
function rutaDeCarpetas(raiz) {
  const mapa = new Map();
  const recorrer = (nodo, ruta) => {
    for (const h of nodo.hijos) {
      if (h.nombre === '#texto') continue;
      if (h.nombre === 'Placemark') { mapa.set(h, ruta); continue; }
      const nueva = (h.nombre === 'Folder' || h.nombre === 'Document')
        ? [...ruta, textoDe(buscarUno(h, 'name')) || h.nombre]
        : ruta;
      recorrer(h, nueva);
    }
  };
  recorrer(raiz, []);
  return mapa;
}

/**
 * Lee un documento KML completo.
 * NUNCA lanza por culpa de un Placemark concreto: los problemas quedan en
 * `avisos` del registro o en `errores` del documento.
 *
 * @param {string} textoKml
 * @param {string} origen nombre del archivo de procedencia, para trazabilidad
 * @returns {{placemarks:Array, errores:string[], avisosDocumento:string[]}}
 */
export function leerKml(textoKml, origen = '(sin nombre)') {
  const errores = [];
  const avisosDocumento = [];
  let raiz;
  try {
    raiz = analizarXml(textoKml);
  } catch (e) {
    return { placemarks: [], errores: [`no se pudo leer el KML: ${e.message}`], avisosDocumento };
  }

  const carpetas = rutaDeCarpetas(raiz);
  const nodos = buscarTodos(raiz, 'Placemark');
  if (!nodos.length) {
    errores.push('el KML no contiene ningun <Placemark>');
    return { placemarks: [], errores, avisosDocumento };
  }

  const placemarks = [];
  for (let i = 0; i < nodos.length; i++) {
    const pm = nodos[i];
    const avisos = [];
    let geometria = null;
    try {
      const nodosGeom = pm.hijos.filter((h) => GEOMETRIAS_KML.has(h.nombre));
      if (!nodosGeom.length) {
        avisos.push('el Placemark no tiene geometria');
      } else {
        if (nodosGeom.length > 1) {
          avisos.push(`el Placemark trae ${nodosGeom.length} geometrias sueltas; se combinan todas`);
        }
        const partes = nodosGeom.map((g) => geometriaDe(g, avisos)).filter(Boolean);
        geometria = agruparMultiGeometria(partes, avisos);
      }
    } catch (e) {
      avisos.push(`error leyendo la geometria: ${e.message}`);
      geometria = null;
    }
    placemarks.push({
      indice: i,
      origen,
      nombre: textoDe(buscarUno(pm, 'name')) || null,
      descripcion: textoDe(buscarUno(pm, 'description')) || '',
      carpeta: (carpetas.get(pm) ?? []).join(' / ') || null,
      idExplicito: idExplicitoDe(pm),
      geometria,
      avisos,
    });
  }
  return { placemarks, errores, avisosDocumento };
}
