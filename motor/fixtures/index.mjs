/**
 * Fixtures sinteticos para casos limite.
 *
 * IMPORTANTE: aqui no hay ni un solo dato real de EPM. Los KMZ reales de
 * `01_KMZ_Entrada` contienen informacion operativa y NO se copian al
 * repositorio. Las pruebas que los necesitan se activan con la variable de
 * entorno PMT_KMZ_DIR y se saltan solas si no esta definida.
 *
 * Estos fixtures cubren, a proposito, casos que los datos reales NO tienen:
 * MultiGeometry, poligonos, descripciones en CDATA/HTML, 24:00:00, fechas
 * inexistentes, archivos corruptos y coordenadas malformadas. Es la unica
 * forma de probar que esos caminos funcionan antes de que aparezcan en campo.
 */

/** Construye un ZIP minimo (metodo 0, sin comprimir). Suficiente para un KMZ. */
export function crearZip(entradas) {
  const cod = new TextEncoder();
  const partes = [];
  const central = [];
  let desplazamiento = 0;

  for (const { nombre, texto } of entradas) {
    const datos = cod.encode(texto);
    const nom = cod.encode(nombre);
    const crc = crc32(datos);

    const local = new Uint8Array(30 + nom.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);     // metodo 0 = almacenado
    dv.setUint32(14, crc, true);
    dv.setUint32(18, datos.length, true);
    dv.setUint32(22, datos.length, true);
    dv.setUint16(26, nom.length, true);
    local.set(nom, 30);
    partes.push(local, datos);

    const cen = new Uint8Array(46 + nom.length);
    const dc = new DataView(cen.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(10, 0, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, datos.length, true);
    dc.setUint32(24, datos.length, true);
    dc.setUint16(28, nom.length, true);
    dc.setUint32(42, desplazamiento, true);
    cen.set(nom, 46);
    central.push(cen);

    desplazamiento += local.length + datos.length;
  }

  const cenTam = central.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const df = new DataView(fin.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, entradas.length, true);
  df.setUint16(10, entradas.length, true);
  df.setUint32(12, cenTam, true);
  df.setUint32(16, desplazamiento, true);

  const total = desplazamiento + cenTam + 22;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of [...partes, ...central, fin]) { out.set(p, o); o += p.length; }
  return out;
}

let TABLA_CRC = null;
function crc32(bytes) {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Descripcion en el formato invariante del proyecto. */
export function descripcion({ inicio, fin, tipo = 'total', direccion = 'Calle 1', municipio, contrato, contratista = 'CONTRATISTA X', proyecto = 'PROYECTO X' }) {
  const p = [`fecha_inicio: ${inicio}`, `fecha_fin: ${fin}`, `tipo_cierre: ${tipo}`, `direccion: ${direccion}`];
  if (municipio) p.push(`municipio: ${municipio}`);
  p.push(`contrato: ${contrato}`, `contratista: ${contratista}`, `proyecto: ${proyecto}`);
  return p.join(' | ');
}

/** Placemark KML con geometria libre. */
export function placemark(nombre, desc, geometriaXml, { cdata = false, extendedData = null } = {}) {
  const d = cdata ? `<![CDATA[${desc}]]>` : esc(desc);
  const ed = extendedData
    ? `<ExtendedData><Data name="pmt:id"><value>${esc(extendedData)}</value></Data></ExtendedData>`
    : '';
  return `<Placemark><name>${esc(nombre)}</name><description>${d}</description>${ed}${geometriaXml}</Placemark>`;
}

export const linea = (pares) =>
  `<LineString><tessellate>1</tessellate><coordinates>${pares.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LineString>`;
export const punto = ([x, y]) => `<Point><coordinates>${x},${y},0</coordinates></Point>`;
export const poligono = (anillo, huecos = []) =>
  `<Polygon><outerBoundaryIs><LinearRing><coordinates>${anillo.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs>` +
  huecos.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${h.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('') +
  `</Polygon>`;
export const multiGeometria = (...geoms) => `<MultiGeometry>${geoms.join('')}</MultiGeometry>`;

export function documentoKml(placemarks, { nombre = 'prueba', carpeta = null } = {}) {
  const cuerpo = carpeta
    ? `<Folder><name>${esc(carpeta)}</name>${placemarks.join('')}</Folder>`
    : placemarks.join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(nombre)}</name>${cuerpo}</Document></kml>`;
}

export function kmz(placemarks, opciones) {
  return crearZip([{ nombre: 'doc.kml', texto: documentoKml(placemarks, opciones) }]);
}
