/**
 * Fidelidad de la replica del motor legado.
 *
 * Dos niveles:
 *  1. Pruebas sinteticas que se ejecutan siempre: comprueban que la replica
 *     reproduce cada defecto conocido del motor QGIS, uno por uno.
 *  2. Prueba contra datos reales, que solo corre si se apuntan las variables
 *     de entorno a la carpeta de KMZ y al CSV publicado:
 *
 *        PMT_KMZ_DIR=/ruta/a/01_KMZ_Entrada \
 *        PMT_CSV_LEGADO=/ruta/a/reporte_dinamico.csv \
 *        npm test
 *
 *     Los KMZ reales NO estan en el repositorio a proposito: contienen
 *     informacion operativa de EPM y el repositorio es publico.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analizarLegado, determinarHorario, fechaLegado, ex } from '../src/legado/replica.js';
import { leerKml } from '../src/io/kml.js';
import { extraerKml } from '../src/io/zip.js';
import { leerCsv } from '../herramientas/comun.mjs';
import * as F from '../fixtures/index.mjs';

const SEP = String.fromCharCode(1);

// ---------------------------------------------- defectos replicados

test('replica el defecto del horario: 06:00-18:00 lo llamaba Nocturno', () => {
  assert.equal(determinarHorario('07:00', '17:00'), 'Diurno');
  assert.equal(determinarHorario('06:00', '18:00'), 'Nocturno'); // defecto conocido
  assert.equal(determinarHorario('08:00', '22:00'), 'Nocturno'); // defecto conocido
  assert.equal(determinarHorario('00:00', '23:59'), 'Nocturno'); // defecto conocido
  assert.equal(determinarHorario('', ''), '24 horas');
});

test('replica el trato de las fechas inexistentes: las ignora sin avisar', () => {
  assert.equal(fechaLegado('2026-02-29'), null);
  assert.ok(fechaLegado('2026-03-10') !== null);
  assert.equal(fechaLegado('N/A'), null);
});

test('replica la lectura por expresiones regulares del campo descripcion', () => {
  const d = F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW1' });
  assert.equal(ex('contrato', d), 'CW1');
  assert.equal(ex('municipio', d), 'No definido');
});

test('replica el umbral duplicado: marca pares a mas de 120 m', () => {
  // Dos puntos separados ~166 m: fuera de los 120 m que anuncia la capa, pero
  // dentro de los ~243 m que el motor legado usaba de verdad.
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', F.descripcion({ inicio: '2026-03-05 06:00:00', fin: '2026-03-20 18:00:00', contrato: 'CW2' }), F.punto([-75.6000, 6.2015])),
  ]), 'x.kml').placemarks;
  const r = analizarLegado(pms);
  assert.equal(r.resumen.Interferencia, 1, 'el legado si marcaba este par');
});

test('replica el defecto central: llama INTERFERENCIA REAL a lo que solo esta cerca', () => {
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', F.descripcion({ inicio: '2026-03-05 06:00:00', fin: '2026-03-20 18:00:00', contrato: 'CW2' }), F.punto([-75.6000, 6.2010])),
  ]), 'x.kml').placemarks;
  const r = analizarLegado(pms);
  assert.equal(r.resumen.Interferencia, 1);
  const fila = r.filas.find((f) => f[0] === 'Interferencia');
  assert.equal(fila[6], 'INTERFERENCIA REAL (CRÍTICA)');
  // Estan a ~111 m: no se tocan en absoluto.
});

test('replica el defecto temporal: mismo dia en jornadas opuestas cuenta como traslape', () => {
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-03-10 06:00:00', fin: '2026-03-10 12:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', F.descripcion({ inicio: '2026-03-10 18:00:00', fin: '2026-03-10 23:00:00', contrato: 'CW2' }), F.punto([-75.6000, 6.2005])),
  ]), 'x.kml').placemarks;
  assert.equal(analizarLegado(pms).resumen.Interferencia, 1);
});

test('replica la exclusion de frentes del mismo contrato', () => {
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', F.descripcion({ inicio: '2026-03-05 06:00:00', fin: '2026-03-20 18:00:00', contrato: 'CW1' }), F.punto([-75.6000, 6.2005])),
  ]), 'x.kml').placemarks;
  const r = analizarLegado(pms);
  assert.equal(r.resumen.Interferencia, 0);
  assert.equal(r.resumen['Cercanía'], 0);
});

test('replica la duracion sin sumar uno en los trazados normales', () => {
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-03-10 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW1' }), F.punto([-75.6, 6.2])),
  ]), 'x.kml').placemarks;
  assert.equal(analizarLegado(pms).filas[0][10], '0'); // un PMT de un dia son "0 dias"
});

test('replica las cercanias sin fechas y con municipio Varios', () => {
  const pms = leerKml(F.documentoKml([
    F.placemark('A', F.descripcion({ inicio: '2026-01-01 06:00:00', fin: '2026-01-30 18:00:00', contrato: 'CW1', municipio: 'Medellin' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', F.descripcion({ inicio: '2026-06-01 06:00:00', fin: '2026-06-30 18:00:00', contrato: 'CW2', municipio: 'Medellin' }), F.punto([-75.6000, 6.2005])),
  ]), 'x.kml').placemarks;
  const fila = analizarLegado(pms).filas.find((f) => f[0] === 'Cercanía');
  assert.equal(fila[3], 'Varios');
  assert.equal(fila[8], 'N/A');
  assert.equal(fila[9], 'N/A');
});

// ---------------------------------------------- contra datos reales

const DIR = process.env.PMT_KMZ_DIR;
const CSV = process.env.PMT_CSV_LEGADO;

test('la replica reproduce EXACTAMENTE el CSV publicado por QGIS', { skip: !DIR || !CSV ? 'defina PMT_KMZ_DIR y PMT_CSV_LEGADO para ejecutar esta prueba con datos reales' : false }, async () => {
  const nombres = (await readdir(DIR)).filter((n) => /\.kmz$/i.test(n)).sort();
  let placemarks = [];
  for (const n of nombres) {
    const { texto } = await extraerKml(new Uint8Array(await readFile(join(DIR, n))));
    placemarks = placemarks.concat(leerKml(texto, n).placemarks);
  }
  const r = analizarLegado(placemarks);
  const pub = leerCsv(await readFile(CSV, 'utf8')).slice(1);

  const A = new Map(), B = new Map();
  for (const f of r.filas) A.set(f.join(SEP), (A.get(f.join(SEP)) ?? 0) + 1);
  for (const f of pub) B.set(f.join(SEP), (B.get(f.join(SEP)) ?? 0) + 1);
  let soloA = 0, soloB = 0;
  for (const [k, v] of A) soloA += Math.max(0, v - (B.get(k) ?? 0));
  for (const [k, v] of B) soloB += Math.max(0, v - (A.get(k) ?? 0));

  assert.equal(r.filas.length, pub.length, 'distinto numero de filas');
  assert.equal(soloA, 0, `${soloA} filas que la replica produce y el CSV publicado no`);
  assert.equal(soloB, 0, `${soloB} filas del CSV publicado que la replica no produce`);
});
