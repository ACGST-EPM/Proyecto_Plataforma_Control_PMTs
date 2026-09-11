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

/**
 * Lee una lista de coordenadas KML: "lon,lat[,alt]" separadas por espacios.
 *
 * PRINCIPIO: no hay aceptacion parcial de numeros ni reparacion silenciosa.
 *
 * Antes se usaba `parseFloat`, que lee "0.002oops" como 0.002 y sigue adelante;
 * y los vertices ilegibles se descartaban, con lo que los que quedaban se unian
 * entre si y salia una geometria DISTINTA de la que habia en el archivo. Una
 * linea de tres tramos podia convertirse en una recta que no existe.
 *
 * Ahora basta un vertice malo para marcar la lista entera como invalida. El
 * registro se conserva para poder diagnosticarlo, pero su geometria queda fuera
 * del calculo hasta que se corrija en origen.
 *
 * @returns {{puntos:Array<[number,number]>, valida:boolean, problemas:string[]}}
 */
export function leerCoordenadas(texto) {
  const problemas = [];
  const t = String(texto ?? '').trim();
  if (!t) return { puntos: [], valida: false, problemas: ['bloque <coordinates> vacio'] };

  // Google Earth a veces escribe "lon, lat, alt" con espacio tras la coma; se
  // normaliza antes de separar por espacios en blanco.
  const limpio = t.replace(/,[ \t]+/g, ',');
  const puntos = [];
  for (const tok of limpio.split(/\s+/)) {
    if (!tok) continue;
    const partes = tok.split(',');
    if (partes.length < 2 || partes.length > 3) {
      problemas.push(`coordenada mal formada: "${recorte(tok)}" (se esperaba lon,lat[,alt])`);
      continue;
    }
    const lon = numeroEstricto(partes[0]);
    const lat = numeroEstricto(partes[1]);
    const alt = partes.length === 3 ? numeroEstricto(partes[2]) : 0;
    if (lon === null || lat === null || alt === null) {
      problemas.push(`coordenada con un numero ilegible: "${recorte(tok)}"`);
      continue;
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      problemas.push(`coordenada fuera del rango terrestre: ${lon},${lat}`);
      continue;
    }
    puntos.push([lon, lat]);
  }
  if (!puntos.length && !problemas.length) problemas.push('bloque <coordinates> sin ningun vertice');
  return { puntos, valida: problemas.length === 0 && puntos.length > 0, problemas };
}

/**
 * Convierte a numero SOLO si el texto entero es un numero. `parseFloat` acepta
 * basura al final; `Number` no, y eso es justo lo que hace falta aqui.
 */
function numeroEstricto(s) {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const recorte = (s) => (s.length > 30 ? s.slice(0, 30) + '…' : s);

/** Lee las coordenadas de un nodo y propaga el fallo si algo no cuadra. */
function coordenadasDe(nodo, avisos) {
  const r = leerCoordenadas(textoDe(buscarUno(nodo, 'coordinates')));
  for (const p of r.problemas) avisos.push(p);
  return r;
}

/**
 * Lee un anillo (LinearRing) y devuelve sus vertices, o null si no es valido.
 * No hay reparacion silenciosa: si alguna coordenada falla, el anillo entero se
 * descarta, porque un anillo "a medias" seria una figura distinta.
 */
function anilloDe(nodo, avisos) {
  const r = coordenadasDe(nodo, avisos);
  if (!r.valida) { avisos.push('anillo descartado: sus coordenadas no son validas'); return null; }
  const c = r.puntos;
  if (c.length < 3) { avisos.push('anillo con menos de 3 vertices: geometria invalida'); return null; }
  // GeoJSON exige el anillo cerrado. Cerrarlo no cambia el trazado: solo repite
  // el primer vertice al final, que es lo que el formato pide.
  const primero = c[0], ultimo = c[c.length - 1];
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) c.push([...primero]);
  return c;
}

/** Convierte un nodo de geometria KML en geometria GeoJSON. */
function geometriaDe(nodo, avisos) {
  switch (nodo.nombre) {
    case 'Point': {
      const r = coordenadasDe(nodo, avisos);
      if (!r.valida) { avisos.push('Point descartado: sus coordenadas no son validas'); return null; }
      return { type: 'Point', coordinates: r.puntos[0] };
    }
    case 'LineString': {
      const r = coordenadasDe(nodo, avisos);
      if (!r.valida) { avisos.push('LineString descartada: sus coordenadas no son validas'); return null; }
      const c = r.puntos;
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
      let algunaFallo = false;
      for (const h of nodo.hijos) {
        if (h.nombre === '#texto') continue;
        if (!GEOMETRIAS_KML.has(h.nombre)) continue;   // Style, ExtendedData, etc.
        const g = geometriaDe(h, avisos);
        if (g) partes.push(g);
        else { algunaFallo = true; avisos.push(`dentro de MultiGeometry no se pudo leer <${h.nombre}>`); }
      }
      if (algunaFallo) {
        // No se entrega una geometria "a medias": seria una figura distinta de
        // la del archivo. Se descarta entera y se conserva el aviso.
        avisos.push('MultiGeometry descartada: alguna de sus partes no es valida');
        return null;
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
  // Se recorren TODOS los SimpleData, no solo el primero: el identificador
  // puede venir en cualquier posicion dentro del esquema.
  for (const s of buscarTodos(placemark, 'SimpleData')) {
    const n = (s.atributos.name ?? '').toLowerCase();
    if (n === 'pmt:id' || n === 'pmt_id') return textoDe(s) || null;
  }
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

  // Un KML puede delegar su contenido en otros documentos mediante NetworkLink.
  // Este motor NO los sigue, y decirlo es importante: si no, un archivo con
  // 50 enlaces se leeria como "0 frentes" y pareceria un exito.
  const enlaces = buscarTodos(raiz, 'NetworkLink');
  if (enlaces.length) {
    const m = `el documento tiene ${enlaces.length} <NetworkLink>: este motor no sigue enlaces a ` +
      `otros documentos, asi que su contenido NO entra en el analisis`;
    if (!buscarTodos(raiz, 'Placemark').length) errores.push(m); else avisosDocumento.push(m);
  }

  const nodos = buscarTodos(raiz, 'Placemark');
  if (!nodos.length) {
    if (!enlaces.length) errores.push('el KML no contiene ningun <Placemark>');
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
