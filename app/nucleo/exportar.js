/**
 * EXPORTACIONES — generacion pura de texto, sin DOM ni descargas.
 *
 * Formatos y por que cada uno:
 *  · CSV       lo que la usuaria abre en Excel. Se conserva ademas el formato
 *              EXACTO del `reporte_dinamico.csv` legado para no romper nada que
 *              hoy dependa de esas 11 columnas.
 *  · GeoJSON   estandar abierto: entra en QGIS, ArcGIS, Power BI y cualquier
 *              visor. Es el sustituto natural del paso por QGIS.
 *  · KML       para volver a Google Earth, que es donde trabajan en campo.
 *
 * No se anaden formatos sin uso demostrable.
 */
import { estadoEspacial, estadoTemporal, ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL } from './modelo.js';

const csvCampo = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvFilas = (filas) => filas.map((f) => f.map(csvCampo).join(';')).join('\r\n');

/** BOM para que Excel en Windows reconozca el UTF-8 sin destrozar las tildes. */
export const BOM = '﻿';

/** Listado de PMT, con todos los campos del modelo interno. */
export function pmtsACsv(filas) {
  const cab = ['ID', 'CONTRATO', 'CONTRATISTA', 'PROYECTO', 'MUNICIPIO', 'FRENTE', 'DIRECCION',
    'TIPO_CIERRE', 'FECHA_INICIO', 'FECHA_FIN', 'GEOMETRIA', 'ARCHIVO_ORIGEN', 'AVISOS'];
  const cuerpo = filas.map((x) => [x.id, x.contrato, x.contratista, x.proyecto, x.municipio,
    x.frente, x.direccion, x.tipoCierre, x.inicio, x.fin, x.tipoGeometria, x.origenArchivo,
    (x.avisos ?? []).join(' | ')]);
  return BOM + csvFilas([cab, ...cuerpo]);
}

/** Relaciones detectadas, con los hechos separados y sin criticidad inventada. */
export function relacionesACsv(relaciones, porId) {
  const cab = ['CONTRATO_A', 'FRENTE_A', 'CONTRATO_B', 'FRENTE_B', 'DISTANCIA_M',
    'ESTADO_ESPACIAL', 'ESTADO_TEMPORAL', 'TRASLAPE_INICIO', 'TRASLAPE_FIN', 'TRASLAPE_DIAS',
    'MUNICIPIO_A', 'MUNICIPIO_B', 'MOTIVO_NO_EVALUABLE'];
  const cuerpo = relaciones.map((r) => {
    const a = porId?.get(r.idA), b = porId?.get(r.idB);
    return [
      r.contratoA, r.frenteA, r.contratoB, r.frenteB,
      r.distanciaMetros === null || r.distanciaMetros === undefined ? '' : r.distanciaMetros.toFixed(2),
      ETIQUETA_ESPACIAL[estadoEspacial(r)], ETIQUETA_TEMPORAL[estadoTemporal(r)],
      r.traslapeInicio ?? '', r.traslapeFin ?? '', r.traslapeDias ?? '',
      a?.municipio ?? '', b?.municipio ?? '',
      (r.motivoNoEvaluable ?? r.avisos?.join(' | ') ?? ''),
    ];
  });
  return BOM + csvFilas([cab, ...cuerpo]);
}

/**
 * CSV con las 11 columnas EXACTAS del `reporte_dinamico.csv` que producia QGIS.
 * Existe solo por compatibilidad: si algo aguas abajo todavia espera ese
 * formato, sigue funcionando sin abrir QGIS.
 */
export const COLUMNAS_LEGADO = Object.freeze(['CATEGORIA', 'CONTRATO', 'CONTRATISTA', 'MUNICIPIO',
  'FRENTE', 'DIRECCION', 'ESTADO_CIERRE', 'HORARIO', 'FECHA_INICIO', 'FECHA_FIN', 'DURACION_DIAS']);

const soloFecha = (s) => (s ? String(s).slice(0, 10) : 'N/A');

function horarioDe(fila) {
  if (!fila.inicio || !fila.fin) return 'No definido';
  const h = Number(String(fila.inicio).slice(11, 13));
  return h >= 6 && h < 18 ? 'Diurno' : 'Nocturno';
}

export function csvCompatibleLegado(filas, relaciones) {
  const cuerpo = [];
  for (const x of filas) {
    const dias = x.inicioMs !== null && x.finMs !== null
      ? String(Math.round((x.finMs - x.inicioMs) / 86400000)) : '0';
    cuerpo.push(['Trazado Normal', x.contrato ?? '', x.contratista ?? '', x.municipio ?? '',
      x.frente ?? '', x.direccion ?? '', (x.tipoCierre ?? '').toUpperCase(), horarioDe(x),
      soloFecha(x.inicio), soloFecha(x.fin), dias]);
  }
  for (const r of relaciones) {
    const e = estadoEspacial(r), t = estadoTemporal(r);
    const categoria = t === 'coincide' ? 'Interferencia' : 'Cercanía';
    cuerpo.push([categoria, `${r.contratoA} vs ${r.contratoB}`, '', 'Varios',
      `${r.frenteA} / ${r.frenteB}`, 'Ver Mapa',
      `${ETIQUETA_ESPACIAL[e]} · ${ETIQUETA_TEMPORAL[t]}`, 'Varios',
      soloFecha(r.traslapeInicio), soloFecha(r.traslapeFin), String(r.traslapeDias ?? 0)]);
  }
  return BOM + csvFilas([[...COLUMNAS_LEGADO], ...cuerpo]);
}

/** GeoJSON estandar: cada PMT es una Feature con todas sus propiedades. */
export function aGeoJson(filas) {
  return {
    type: 'FeatureCollection',
    features: filas.filter((x) => x.geometria).map((x) => ({
      type: 'Feature',
      geometry: x.geometria,
      properties: {
        id: x.id, frente: x.frente, contrato: x.contrato, contratista: x.contratista,
        proyecto: x.proyecto, municipio: x.municipio, direccion: x.direccion,
        tipo_cierre: x.tipoCierre, fecha_inicio: x.inicio, fecha_fin: x.fin,
        archivo_origen: x.origenArchivo, avisos: x.avisos ?? [],
      },
    })),
  };
}

const xmlEsc = (s) => String(s ?? '').replace(/[<>&'"]/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** Coordenadas KML: lon,lat,0 separadas por espacio. */
function coordsKml(anillo) {
  return anillo.map(([x, y]) => `${x},${y},0`).join(' ');
}

function geomKml(g) {
  if (!g) return '';
  switch (g.type) {
    case 'Point': return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
    case 'MultiPoint': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'Point', coordinates: c })).join('')}</MultiGeometry>`;
    case 'LineString': return `<LineString><coordinates>${coordsKml(g.coordinates)}</coordinates></LineString>`;
    case 'MultiLineString': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'LineString', coordinates: c })).join('')}</MultiGeometry>`;
    case 'Polygon': return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsKml(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>` +
      g.coordinates.slice(1).map((h) => `<innerBoundaryIs><LinearRing><coordinates>${coordsKml(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('') + '</Polygon>';
    case 'MultiPolygon': return `<MultiGeometry>${g.coordinates.map((c) => geomKml({ type: 'Polygon', coordinates: c })).join('')}</MultiGeometry>`;
    case 'GeometryCollection': return `<MultiGeometry>${(g.geometries ?? []).map(geomKml).join('')}</MultiGeometry>`;
    default: return '';
  }
}

/**
 * KML de salida. La descripcion se escribe con el MISMO formato invariante del
 * proyecto, asi que el archivo exportado se puede volver a cargar tanto en esta
 * aplicacion como en el generador sin perder un solo campo.
 */
export function aKml(filas, nombreDoc = 'PMT exportados') {
  const pm = filas.filter((x) => x.geometria).map((x) => {
    const desc = ['fecha_inicio: ' + (x.inicio ?? ''), 'fecha_fin: ' + (x.fin ?? ''),
      'tipo_cierre: ' + (x.tipoCierre ?? ''), 'direccion: ' + (x.direccion ?? ''),
      'municipio: ' + (x.municipio ?? ''), 'contrato: ' + (x.contrato ?? ''),
      'contratista: ' + (x.contratista ?? ''), 'proyecto: ' + (x.proyecto ?? '')]
      .map((s) => s.replace(/\|/g, '')).join(' | ');
    return `<Placemark><name>${xmlEsc(x.frente ?? '')}</name>` +
      `<description>${xmlEsc(desc)}</description>` +
      `<ExtendedData><Data name="pmt:id"><value>${xmlEsc(x.id)}</value></Data></ExtendedData>` +
      geomKml(x.geometria) + '</Placemark>';
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">` +
    `<Document><name>${xmlEsc(nombreDoc)}</name>${pm}</Document></kml>`;
}
