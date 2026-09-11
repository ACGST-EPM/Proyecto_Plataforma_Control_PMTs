/**
 * Lectura de archivos: XML, KML, KMZ y comportamiento ante entradas rotas.
 *
 * Regla de oro que se comprueba aqui: un archivo invalido NUNCA tumba el
 * proceso. Produce un diagnostico identificable y los demas archivos siguen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarXml, buscarTodos, buscarUno, textoDe } from '../src/io/xml.js';
import { leerKml, leerCoordenadas } from '../src/io/kml.js';
import { leerZip, extraerKml } from '../src/io/zip.js';
import { leerDescripcion, aTextoPlano } from '../src/io/descripcion.js';
import { leerArchivo, analizar } from '../src/nucleo/index.js';
import * as F from '../fixtures/index.mjs';

// ------------------------------------------------------------------ XML

test('XML: espacios de nombres, atributos, CDATA y comentarios', () => {
  const x = `<?xml version="1.0"?><!-- comentario --><kml:kml xmlns:kml="x">
    <kml:Placemark id="p1"><kml:name>A &amp; B</kml:name>
    <kml:description><![CDATA[<b>hola</b> | contrato: CW1]]></kml:description></kml:Placemark></kml:kml>`;
  const r = analizarXml(x);
  const pm = buscarUno(r, 'Placemark');
  assert.equal(pm.atributos.id, 'p1');
  assert.equal(textoDe(buscarUno(pm, 'name')), 'A & B');
  assert.ok(textoDe(buscarUno(pm, 'description')).includes('<b>hola</b>'));
});

test('XML: etiquetas autocerradas y anidamiento profundo', () => {
  const r = analizarXml('<a><b/><c><d><e>x</e></d></c></a>');
  assert.equal(buscarTodos(r, 'b').length, 1);
  assert.equal(textoDe(buscarUno(r, 'e')), 'x');
});

test('XML: un documento mal formado da un error entendible', () => {
  for (const [malo, patron] of [
    ['<a><b></a>', /se esperaba cerrar/],
    ['', /vacio/],
    ['   ', /vacio/],
    ['sin etiquetas', /ningun elemento/],
    ['<a><![CDATA[sin cerrar', /CDATA/],
    ['<a>', /sin cerrar/],
  ]) {
    assert.throws(() => analizarXml(malo), patron, `no dio el error esperado para: ${malo}`);
  }
});

// ------------------------------------------------------------------ coordenadas

test('coordenadas: formatos habituales y basura', () => {
  // Formatos validos
  assert.deepEqual(leerCoordenadas('-75.1,6.1,0 -75.2,6.2,0').puntos, [[-75.1, 6.1], [-75.2, 6.2]]);
  assert.deepEqual(leerCoordenadas('-75.1,6.1 -75.2,6.2').puntos, [[-75.1, 6.1], [-75.2, 6.2]]);
  assert.deepEqual(leerCoordenadas('-75.1, 6.1, 0\n -75.2, 6.2, 0').puntos, [[-75.1, 6.1], [-75.2, 6.2]]);
  assert.equal(leerCoordenadas('-75.1,6.1,0 -75.2,6.2,0').valida, true);

  // Basura: la lista entera queda invalida, no se acepta a medias.
  const r = leerCoordenadas('-75.1,6.1 basura otra,cosa');
  assert.equal(r.valida, false);
  assert.ok(r.problemas.length > 0);

  const r2 = leerCoordenadas('500,600');
  assert.equal(r2.valida, false);
  assert.ok(r2.problemas.some((a) => a.includes('fuera del rango terrestre')));
});

// ------------------------------------------------------------------ descripcion

test('descripcion: formato invariante del proyecto', () => {
  const d = F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW1', municipio: 'Medellin' });
  const r = leerDescripcion(d);
  assert.equal(r.campos.contrato, 'CW1');
  assert.equal(r.campos.tipo_cierre, 'total');
  assert.equal(r.campos.municipio, 'Medellin');
  assert.deepEqual(r.avisos, []);
});

test('descripcion: municipio ausente no es error; los demas campos si avisan', () => {
  const sinMunicipio = leerDescripcion(F.descripcion({ inicio: '2026-03-01', fin: '2026-03-10', contrato: 'CW1' }));
  assert.deepEqual(sinMunicipio.avisos, []);
  const incompleta = leerDescripcion('contrato: CW1');
  assert.ok(incompleta.avisos.some((a) => a.includes('fecha_inicio')));
  assert.ok(incompleta.avisos.some((a) => a.includes('tipo_cierre')));
});

test('descripcion en HTML de Google Earth: se convierte y se lee igual', () => {
  const html = '<table><tr><td>fecha_inicio: 2026-03-01 06:00:00</td></tr>' +
               '<tr><td>tipo_cierre: parcial</td></tr><tr><td>contrato: CW9</td></tr></table>';
  const r = leerDescripcion(html);
  assert.equal(r.eraHtml, true);
  assert.equal(r.campos.contrato, 'CW9');
  assert.equal(r.campos.tipo_cierre, 'parcial');
  assert.ok(r.avisos.some((a) => a.includes('HTML')));
  assert.ok(!aTextoPlano(html).includes('<'));
});

test('descripcion: tipo_cierre fuera de la lista cerrada se avisa', () => {
  const r = leerDescripcion(F.descripcion({ inicio: '2026-03-01', fin: '2026-03-10', contrato: 'CW1', tipo: 'semitotal' }));
  assert.ok(r.avisos.some((a) => a.includes('lista cerrada')));
});

// ------------------------------------------------------------------ KML

const desc1 = F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW1' });

test('KML: lee punto, linea y poligono', () => {
  const kml = F.documentoKml([
    F.placemark('P', desc1, F.punto([-75.60, 6.20])),
    F.placemark('L', desc1, F.linea([[-75.60, 6.20], [-75.59, 6.21]])),
    F.placemark('G', desc1, F.poligono([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]])),
  ]);
  const r = leerKml(kml, 'prueba.kml');
  assert.equal(r.placemarks.length, 3);
  assert.deepEqual(r.placemarks.map((p) => p.geometria.type), ['Point', 'LineString', 'Polygon']);
});

test('KML: MultiGeometry no pierde partes (el motor legado si las perdia)', () => {
  const kml = F.documentoKml([
    F.placemark('M', desc1, F.multiGeometria(
      F.linea([[-75.60, 6.20], [-75.59, 6.20]]),
      F.linea([[-75.58, 6.20], [-75.57, 6.20]]),
      F.linea([[-75.56, 6.20], [-75.55, 6.20]])
    )),
  ]);
  const g = leerKml(kml, 'm.kml').placemarks[0].geometria;
  assert.equal(g.type, 'MultiLineString');
  assert.equal(g.coordinates.length, 3);
});

test('KML: MultiGeometry con tipos mezclados se vuelve GeometryCollection', () => {
  const kml = F.documentoKml([
    F.placemark('M', desc1, F.multiGeometria(F.punto([-75.60, 6.20]), F.linea([[-75.58, 6.20], [-75.57, 6.20]]))),
  ]);
  const pm = leerKml(kml, 'm.kml').placemarks[0];
  assert.equal(pm.geometria.type, 'GeometryCollection');
  assert.equal(pm.geometria.geometries.length, 2);
  assert.ok(pm.avisos.some((a) => a.includes('mezclados')));
});

test('KML: poligono con hueco', () => {
  const ext = [[-75.600, 6.200], [-75.596, 6.200], [-75.596, 6.204], [-75.600, 6.204]];
  const hue = [[-75.599, 6.201], [-75.597, 6.201], [-75.597, 6.203], [-75.599, 6.203]];
  const g = leerKml(F.documentoKml([F.placemark('H', desc1, F.poligono(ext, [hue]))]), 'h.kml').placemarks[0].geometria;
  assert.equal(g.type, 'Polygon');
  assert.equal(g.coordinates.length, 2);
  // GeoJSON exige anillos cerrados: el lector los cierra solo.
  for (const anillo of g.coordinates) {
    assert.deepEqual(anillo[0], anillo[anillo.length - 1]);
  }
});

test('KML: carpetas anidadas y descripcion en CDATA', () => {
  const kml = F.documentoKml([F.placemark('C', desc1, F.punto([-75.6, 6.2]), { cdata: true })], { carpeta: 'Frente Norte' });
  const pm = leerKml(kml, 'c.kml').placemarks[0];
  assert.ok(pm.carpeta.includes('Frente Norte'));
  assert.ok(pm.descripcion.includes('contrato: CW1'));
});

test('KML: identificador propio dentro de ExtendedData', () => {
  const kml = F.documentoKml([F.placemark('E', desc1, F.punto([-75.6, 6.2]), { extendedData: 'PMT-0001' })]);
  assert.equal(leerKml(kml, 'e.kml').placemarks[0].idExplicito, 'PMT-0001');
});

test('KML: un Placemark sin geometria se avisa y NO tumba a los demas', () => {
  const kml = F.documentoKml([
    F.placemark('sin geom', desc1, ''),
    F.placemark('con geom', desc1, F.punto([-75.6, 6.2])),
  ]);
  const r = leerKml(kml, 'x.kml');
  assert.equal(r.placemarks.length, 2);
  assert.equal(r.placemarks[0].geometria, null);
  assert.ok(r.placemarks[0].avisos.some((a) => a.includes('no tiene geometria')));
  assert.equal(r.placemarks[1].geometria.type, 'Point');
});

test('KML: documento sin Placemarks o ilegible devuelve error, no excepcion', () => {
  const a = leerKml('<kml><Document></Document></kml>', 'v.kml');
  assert.equal(a.placemarks.length, 0);
  assert.ok(a.errores[0].includes('Placemark'));
  const b = leerKml('<kml><Document>', 'r.kml');
  assert.equal(b.placemarks.length, 0);
  assert.ok(b.errores[0].includes('no se pudo leer'));
});

// ------------------------------------------------------------------ ZIP / KMZ

test('KMZ: se extrae el doc.kml', async () => {
  const bytes = F.kmz([F.placemark('A', desc1, F.punto([-75.6, 6.2]))]);
  const r = await extraerKml(bytes);
  assert.equal(r.nombre, 'doc.kml');
  assert.ok(r.texto.includes('Placemark'));
});

test('KMZ: con varios .kml se elige doc.kml y se avisa', async () => {
  const bytes = F.crearZip([
    { nombre: 'otro.kml', texto: F.documentoKml([]) },
    { nombre: 'doc.kml', texto: F.documentoKml([F.placemark('A', desc1, F.punto([-75.6, 6.2]))]) },
  ]);
  const r = await extraerKml(bytes);
  assert.equal(r.nombre, 'doc.kml');
  assert.ok(r.avisos.some((a) => a.includes('2 archivos')));
});

test('KMZ: tambien lee entradas comprimidas con deflate', async () => {
  // Se comprime con CompressionStream, que es la contraparte de la API usada
  // para descomprimir. Asi se prueba el camino real de un KMZ de Google Earth.
  const texto = F.documentoKml([F.placemark('A', desc1, F.punto([-75.6, 6.2]))]);
  const crudo = new TextEncoder().encode(texto);
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(crudo); w.close();
  const trozos = []; const rd = cs.readable.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; trozos.push(value); }
  const comprimido = new Uint8Array(trozos.reduce((a, t) => a + t.length, 0));
  let o = 0; for (const t of trozos) { comprimido.set(t, o); o += t.length; }

  // Se arma a mano un ZIP con metodo 8.
  const nom = new TextEncoder().encode('doc.kml');
  const crc = (() => { // mismo CRC32 que usa el fixture
    const z = F.crearZip([{ nombre: 'doc.kml', texto }]);
    return new DataView(z.buffer).getUint32(14, true);
  })();
  const local = new Uint8Array(30 + nom.length);
  const dl = new DataView(local.buffer);
  dl.setUint32(0, 0x04034b50, true); dl.setUint16(4, 20, true); dl.setUint16(8, 8, true);
  dl.setUint32(14, crc, true); dl.setUint32(18, comprimido.length, true);
  dl.setUint32(22, crudo.length, true); dl.setUint16(26, nom.length, true);
  local.set(nom, 30);
  const cen = new Uint8Array(46 + nom.length);
  const dc = new DataView(cen.buffer);
  dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true);
  dc.setUint16(10, 8, true); dc.setUint32(16, crc, true);
  dc.setUint32(20, comprimido.length, true); dc.setUint32(24, crudo.length, true);
  dc.setUint16(28, nom.length, true); dc.setUint32(42, 0, true);
  cen.set(nom, 46);
  const fin = new Uint8Array(22);
  const df = new DataView(fin.buffer);
  df.setUint32(0, 0x06054b50, true); df.setUint16(8, 1, true); df.setUint16(10, 1, true);
  df.setUint32(12, cen.length, true); df.setUint32(16, local.length + comprimido.length, true);
  const total = local.length + comprimido.length + cen.length + 22;
  const zip = new Uint8Array(total); let p = 0;
  for (const b of [local, comprimido, cen, fin]) { zip.set(b, p); p += b.length; }

  const r = await extraerKml(zip);
  assert.ok(r.texto.includes('Placemark'));
});

test('KMZ: archivos rotos dan un mensaje claro y no una excepcion oscura', async () => {
  await assert.rejects(() => leerZip(new Uint8Array(5)), /demasiado pequeno/);
  await assert.rejects(() => leerZip(new Uint8Array(200)), /directorio central/);
  const bueno = F.kmz([F.placemark('A', desc1, F.punto([-75.6, 6.2]))]);
  const truncado = bueno.slice(0, Math.floor(bueno.length / 2));
  await assert.rejects(() => leerZip(truncado), /directorio central|danad/);
  const sinKml = F.crearZip([{ nombre: 'leeme.txt', texto: 'hola' }]);
  await assert.rejects(() => extraerKml(sinKml), /ningun \.kml/);
});

// ------------------------------------------------------------------ robustez del conjunto

test('ROBUSTEZ: un archivo roto no impide procesar los buenos', async () => {
  const buenoA = { nombre: 'bueno_a.kmz', datos: F.kmz([F.placemark('A', F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2000]))]) };
  const roto = { nombre: 'roto.kmz', datos: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) };
  const vacio = { nombre: 'vacio.kmz', datos: F.crearZip([{ nombre: 'doc.kml', texto: '<kml><Document></Document></kml>' }]) };
  const basura = { nombre: 'basura.kml', datos: 'esto no es XML' };
  const buenoB = { nombre: 'bueno_b.kmz', datos: F.kmz([F.placemark('B', F.descripcion({ inicio: '2026-03-05 06:00:00', fin: '2026-03-20 18:00:00', contrato: 'CW2' }), F.punto([-75.6000, 6.2005]))]) };

  const r = await analizar([buenoA, roto, vacio, basura, buenoB]);
  assert.equal(r.archivos.length, 5);
  assert.equal(r.archivos.filter((a) => a.ok).length, 2);
  assert.equal(r.archivos.filter((a) => !a.ok).length, 3);
  for (const malo of r.archivos.filter((a) => !a.ok)) {
    assert.ok(malo.errores.length > 0, `${malo.nombre} deberia explicar que fallo`);
  }
  // Y el analisis sigue: los dos buenos estan a ~55 m y se relacionan.
  assert.equal(r.registros.length, 2);
  assert.equal(r.relaciones.length, 1);
  assert.ok(r.relaciones[0].distanciaMetros > 50 && r.relaciones[0].distanciaMetros < 60);
});

test('ROBUSTEZ: entradas absurdas no lanzan excepcion', async () => {
  for (const a of [
    { nombre: 'x.kmz', datos: null },
    { nombre: 'x.txt', datos: 'hola' },
    { nombre: null, datos: 'hola' },
    {},
  ]) {
    const r = await leerArchivo(a);
    assert.equal(r.ok, false);
    assert.ok(r.errores.length > 0);
  }
});
