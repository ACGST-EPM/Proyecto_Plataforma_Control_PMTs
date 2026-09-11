import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { medir, caja } from '../src/geo/geometria.js';
import { cotaInferiorMetros } from '../src/geo/cajas.js';
import { analizar, leerArchivo, ejecutarLegado, cotejarFidelidad, PERFIL_LEGADO } from '../src/nucleo/index.js';
import { extraerKml, leerZip } from '../src/io/zip.js';
import * as F from '../fixtures/index.mjs';

const punto = (coordinates) => ({ type: 'Point', coordinates });
const linea = (coordinates) => ({ type: 'LineString', coordinates });
const desc = (contrato) => F.descripcion({ contrato, inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00' });
const archivo = (a, b, extra = '') => ({ nombre: 'sintetico.kml', datos: F.documentoKml([
  F.placemark('A', desc('CW1'), a), F.placemark('B', desc('CW2'), b), extra,
]) });
const analizarPar = (a, b) => analizar([archivo(a, b)]);
const larga = [[0, 0], [0.001, 0], [2, 0]];
const exterior = [[-.01, -.01], [.01, -.01], [.01, .01], [-.01, .01], [-.01, -.01]];
const huecoMalo = [[-.005, -.005], [.005, -.005], ['MALFORMADO', .005], [-.005, .005], [-.005, -.005]];
const enlace = '<NetworkLink><Link><href>no-se-sigue.kml</href></Link></NetworkLink>';

test('1.3 dominio: linea extensa con contacto local, pipeline completo', async () => {
  const m = medir(linea(larga), punto([.0005, 0]));
  assert.equal(m.metros, 0); assert.equal(m.dominioValido, true);
  const r = await analizarPar(F.linea(larga), F.punto([.0005, 0]));
  assert.equal(r.relaciones.length, 1);
  assert.equal(r.relaciones[0].estadoEspacial, 'dentro_del_umbral');
  assert.equal(r.relaciones[0].intersecanFisicamente, true);
});
test('1.3 dominio: contacto local no depende del orden de vertices o de argumentos', () => {
  for (const coords of [larga, [...larga].reverse()]) for (const invertir of [false, true]) {
    const par = [linea(coords), punto([.0005, 0])];
    assert.equal(medir(...(invertir ? par.reverse() : par)).metros, 0);
  }
});
test('1.3 dominio: parte compacta lejana no altera minimo cercano positivo', () => {
  const b = punto([0, .0005]);
  const simple = medir(punto([0, 0]), b);
  for (const coordinates of [[[0, 0], [2, 0]], [[2, 0], [0, 0]]]) {
    const m = medir({ type: 'MultiPoint', coordinates }, b);
    assert.equal(m.dominioValido, true); assert.equal(m.metros, simple.metros);
  }
});
test('1.3 dominio: minimo positivo incompleto NO se devuelve como distancia definitiva', () => {
  const m = medir(linea(larga), punto([.0005, .0005]));
  assert.equal(m.metros, null); assert.equal(m.intersecan, null); assert.equal(m.dominioValido, false);
});
test('1.3 dominio: par no resoluble conserva identidad, motivo y contador', async () => {
  const r = await analizarPar(F.linea([[0, 0], [180, 0]]), F.punto([90, 1]));
  assert.equal(r.relaciones.length, 0);
  assert.equal(r.estadisticas.paresNoEvaluablesEspacialmente, 1);
  assert.equal(r.estadisticas.paresEvaluadosFueraDelUmbral, 0);
  assert.equal(r.calidad.paresNoEvaluablesEspacialmente, 1);
  const [h] = r.paresNoEvaluablesEspacialmente;
  assert.ok(h.idA && h.idB); assert.equal(h.contratoA, 'CW1'); assert.equal(h.frenteB, 'B');
  assert.equal(h.estadoEspacial, 'no_evaluable'); assert.equal(h.dentroDelUmbral, null);
  assert.equal(h.intersecanFisicamente, null); assert.equal(h.distanciaMetros, null);
  assert.match(h.motivoNoEvaluableEspacial, /50 km/); assert.ok(h.avisos.length);
});
test('1.3 prefiltro: cota conservadora para los puntos polares reportados', () => {
  const a = punto([0, 89.999]), b = punto([64, 89.999]);
  assert.ok(cotaInferiorMetros(caja(a), caja(b)) <= medir(a, b).metros);
});
test('1.3 prefiltro: 118.377583 m en el polo llegan a relaciones', async () => {
  const r = await analizarPar(F.punto([0, 89.999]), F.punto([64, 89.999]));
  assert.equal(r.relaciones.length, 1);
  assert.ok(Math.abs(r.relaciones[0].distanciaMetros - 118.378) < .001);
});
for (const m of [119.999999, 120, 120.001]) test(`1.3 prefiltro: ecuador ${m} m end-to-end`, async () => {
  const r = await analizarPar(F.punto([0, 0]), F.punto([m / 6378137 * 180 / Math.PI, 0]));
  assert.equal(r.relaciones.length, m <= 120 ? 1 : 0);
  assert.equal(r.estadisticas.paresEvaluadosFueraDelUmbral, m > 120 ? 1 : 0);
  assert.equal(r.paresNoEvaluablesEspacialmente.length, 0);
});
test('1.3 antimeridiano: caja propia de linea corta es circular', () => {
  const c = caja(linea([[179.999, 0], [-179.999, 0]]));
  assert.ok(c.maxLon - c.minLon < .003);
  assert.deepEqual(caja(linea([[1, 2], [3, 4]])), { minLon: 1, maxLon: 3, minLat: 2, maxLat: 4 });
});
for (const [nombre, geom] of [
  ['LineString', F.linea([[179.999, 0], [-179.999, 0]])],
  ['MultiLineString', F.multiGeometria(F.linea([[179.999, 0], [-179.999, 0]]), F.linea([[179.998, .001], [179.999, .001]]))],
  ['Polygon', F.poligono([[179.999, 0], [-179.999, 0], [-179.999, .001], [179.999, .001]])],
]) test(`1.3 antimeridiano: ${nombre} con punto en extremo`, async () => {
  const r = await analizarPar(geom, F.punto([179.999, 0]));
  assert.equal(r.relaciones.length, 1); assert.equal(r.relaciones[0].distanciaMetros, 0);
});
test('1.3 antimeridiano: interior de poligono local y control exterior', () => {
  const g = { type: 'Polygon', coordinates: [[[179.999, -.001], [-179.999, -.001], [-179.999, .001], [179.999, .001], [179.999, -.001]]] };
  assert.equal(medir(g, punto([180, 0])).metros, 0);
  assert.ok(medir(g, punto([179.998, 0])).metros > 100);
});
for (const [nombre, geom] of [
  ['Polygon', F.poligono(exterior, [huecoMalo])],
  ['MultiPolygon', F.multiGeometria(F.poligono(exterior), F.poligono(exterior, [huecoMalo]))],
  ['MultiGeometry', F.multiGeometria(F.punto([0, 0]), F.poligono(exterior, [huecoMalo]))],
  ['geometrias sueltas', F.punto([0, 0]) + F.poligono(exterior, [huecoMalo])],
]) test(`1.3 corrupcion: ${nombre} no se repara eliminando el hueco`, async () => {
  const r = await analizarPar(geom, F.punto([0, 0]));
  assert.equal(r.registros.length, 2); assert.equal(r.registros[0].geometria, null);
  assert.equal(r.registros[0].contrato, 'CW1'); assert.ok(r.registros[0].avisos.some((a) => /hueco/.test(a)));
  assert.equal(r.relaciones.length, 0); assert.equal(r.calidad.sinGeometria, 1);
});
test('1.3 corrupcion: API GeoJSON tambien rechaza Polygon/MultiPolygon parcialmente corruptos', () => {
  for (const g of [{ type: 'Polygon', coordinates: [exterior, huecoMalo] },
    { type: 'MultiPolygon', coordinates: [[exterior], [exterior, huecoMalo]] }]) {
    assert.equal(medir(g, punto([0, 0])).metros, null);
  }
});

function zipManipulable(texto = 'x'.repeat(429)) {
  const z = F.crearZip([{ nombre: 'doc.kml', texto }]);
  const d = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const cen = d.getUint32(z.length - 6, true);
  return { z, d, cen };
}
test('1.3 ZIP: CRC central/local cero no desactiva integridad', async () => {
  const { z, d, cen } = zipManipulable();
  d.setUint32(14, 0, true); d.setUint32(cen + 16, 0, true);
  await assert.rejects(() => extraerKml(z), /CRC/);
});
test('1.3 ZIP: CRC real cero sigue siendo valido (entrada vacia)', async () => {
  const { z } = zipManipulable('');
  const r = await leerZip(z); assert.equal(r[0].bytes.length, 0);
});
test('1.3 ZIP: 429 bytes no caben en limite 2 aunque ambas cabeceras declaren 1', async () => {
  const { z, d, cen } = zipManipulable();
  d.setUint32(22, 1, true); d.setUint32(cen + 24, 1, true);
  await assert.rejects(() => extraerKml(z, { limites: { bytesEntradaDescomprimida: 2, bytesTotalDescomprimido: 2 } }), /limite|tamano/);
});
test('1.3 ZIP: tamano real debe coincidir aun con limites generosos', async () => {
  const { z, d, cen } = zipManipulable();
  d.setUint32(22, 1, true); d.setUint32(cen + 24, 1, true);
  await assert.rejects(() => extraerKml(z), /tamano/);
});
test('1.3 ZIP: cabeceras local y central deben ser coherentes', async () => {
  const { z, d, cen } = zipManipulable(); d.setUint32(cen + 24, 1, true);
  await assert.rejects(() => extraerKml(z), /cabeceras/);
});
test('1.3 ZIP: limite total real en multiples entradas almacenadas', async () => {
  const z = F.crearZip([{ nombre: 'a', texto: '1234' }, { nombre: 'b', texto: '1234' }]);
  await assert.rejects(() => leerZip(z, { limites: { bytesTotalDescomprimido: 7 } }), /limite/);
});
function zipDeflate(texto, tamDeclarado) {
  const { z, d, cen } = zipManipulable(texto);
  const crudo = deflateRawSync(new TextEncoder().encode(texto));
  const inicio = 37;
  const salida = new Uint8Array(inicio + crudo.length + z.length - cen);
  salida.set(z.subarray(0, inicio)); salida.set(crudo, inicio); salida.set(z.subarray(cen), inicio + crudo.length);
  const v = new DataView(salida.buffer), nuevoCen = inicio + crudo.length;
  v.setUint16(8, 8, true); v.setUint16(nuevoCen + 10, 8, true);
  v.setUint32(18, crudo.length, true); v.setUint32(nuevoCen + 20, crudo.length, true);
  v.setUint32(22, tamDeclarado, true); v.setUint32(nuevoCen + 24, tamDeclarado, true);
  v.setUint32(salida.length - 6, nuevoCen, true);
  return salida;
}
test('1.3 ZIP: deflate no elude limite real mintiendo sobre salida', async () => {
  await assert.rejects(() => extraerKml(zipDeflate('x'.repeat(10000), 1), { limites: { bytesEntradaDescomprimida: 100 } }), /limite/);
});
test('1.3 ZIP: factor de expansion se comprueba sobre salida real', async () => {
  await assert.rejects(() => extraerKml(zipDeflate('x'.repeat(10000), 1), { limites: { factorExpansion: 2 } }), /limite/);
});
test('1.3 ZIP: deflate con salida distinta de declarada se rechaza', async () => {
  await assert.rejects(() => extraerKml(zipDeflate('abcd'.repeat(100), 1)), /tamano/);
});
test('1.3 cobertura: NetworkLink mixto conserva registros y declara parcial', async () => {
  const a = archivo(F.punto([0, 0]), F.punto([.0005, 0]), enlace);
  const r = await leerArchivo(a);
  assert.equal(r.registros.length, 2); assert.equal(r.estadoLectura, 'parcial');
  assert.equal(r.ok, false); assert.equal(r.coberturaCompleta, false);
  assert.match(r.motivosCobertura.join(' '), /NetworkLink/);
});
test('1.3 cobertura: parcial impide fidelidad aunque alertas coincidan', async () => {
  const archivos = [archivo(F.punto([0, 0]), F.punto([.0005, 0]), enlace)];
  const r = await analizar(archivos, PERFIL_LEGADO), legado = await ejecutarLegado(archivos);
  assert.equal(r.calidad.archivosParciales, 1); assert.equal(r.coberturaCompleta, false);
  assert.equal(legado.coberturaCompleta, false);
  const c = cotejarFidelidad(legado, r);
  assert.equal(c.coinciden, true); assert.equal(c.completo, false); assert.equal(c.coberturaCompleta, false);
});
test('1.3 cobertura: contadores separan completo, parcial y fallido', async () => {
  const r = await analizar([
    { ...archivo(F.punto([0, 0]), F.punto([.0005, 0])), nombre: 'completo.kml' },
    { ...archivo(F.punto([0, 0]), F.punto([.0005, 0]), enlace), nombre: 'parcial.kml' },
    { nombre: 'fallido.kml', datos: '<kml>' },
  ]);
  assert.deepEqual(r.archivos.map((a) => a.estadoLectura), ['completa', 'parcial', 'fallida']);
  assert.equal(r.calidad.archivosCompletos, 1); assert.equal(r.calidad.archivosParciales, 1); assert.equal(r.calidad.archivosFallidos, 1);
});
test('1.3 cobertura: KMZ con otro KML omitido tambien es parcial', async () => {
  const datos = F.crearZip([{ nombre: 'doc.kml', texto: archivo(F.punto([0, 0]), F.punto([.0005, 0])).datos },
    { nombre: 'otro.kml', texto: '<kml/>' }]);
  const r = await leerArchivo({ nombre: 'multiple.kmz', datos });
  assert.equal(r.estadoLectura, 'parcial'); assert.equal(r.ok, false);
});
