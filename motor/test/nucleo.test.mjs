/**
 * El nucleo: regla de contratos, separacion hechos/clasificacion, y el
 * contrato de datos que el motor promete devolver.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analizar, aGeoJson } from '../src/nucleo/index.js';
import { combinacionDe, repartir, COMBINACIONES } from '../src/nucleo/provisional.js';
import * as F from '../fixtures/index.mjs';

const d = (contrato, inicio, fin, tipo = 'total') =>
  F.descripcion({ inicio, fin, contrato, tipo, municipio: 'Medellin' });

/** Dos puntos separados unos 55 m. */
const A = [-75.6000, 6.2000];
const B = [-75.6000, 6.2005];
const LEJOS = [-75.6000, 6.2100];

function archivo(nombre, placemarks) {
  return { nombre, datos: F.kmz(placemarks) };
}

// ------------------------------------------------- regla de contratos

test('REGLA DE CONTRATOS: dos frentes del MISMO contrato nunca se relacionan', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(B)),
  ])]);
  assert.equal(r.registros.length, 2);
  assert.equal(r.relaciones.length, 0, 'no deberia haber ninguna relacion dentro del mismo contrato');
  assert.equal(r.estadisticas.paresMismoContrato, 1);
});

test('REGLA DE CONTRATOS: los mismos frentes en contratos DISTINTOS si se relacionan', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW2', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(B)),
  ])]);
  assert.equal(r.relaciones.length, 1);
  assert.equal(r.relaciones[0].contratoA, 'CW1');
  assert.equal(r.relaciones[0].contratoB, 'CW2');
  assert.equal(r.relaciones[0].hayTraslapeTemporal, true);
});

test('REGLA DE CONTRATOS: tambien se aplica entre archivos distintos', async () => {
  const r = await analizar([
    archivo('a.kmz', [F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A))]),
    archivo('b.kmz', [F.placemark('F2', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(B))]),
  ]);
  assert.equal(r.relaciones.length, 0);
});

test('REGLA DE CONTRATOS: se puede desactivar para poder probarla', async () => {
  const archivos = [archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(B)),
  ])];
  assert.equal((await analizar(archivos, { excluirMismoContrato: true })).relaciones.length, 0);
  assert.equal((await analizar(archivos, { excluirMismoContrato: false })).relaciones.length, 1);
});

// ------------------------------------------------- hechos independientes

test('los hechos espaciales y temporales son INDEPENDIENTES entre si', async () => {
  const r = await analizar([archivo('a.kmz', [
    // cerca y con traslape
    F.placemark('A1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('A2', d('CW2', '2026-03-10 06:00:00', '2026-03-20 18:00:00'), F.punto(B)),
    // cerca y SIN traslape
    F.placemark('B1', d('CW3', '2026-08-01 06:00:00', '2026-08-30 18:00:00'), F.punto([-75.5900, 6.2000])),
    F.placemark('B2', d('CW4', '2026-09-01 06:00:00', '2026-09-30 18:00:00'), F.punto([-75.5900, 6.2005])),
  ])]);
  const conT = r.relaciones.filter((x) => x.hayTraslapeTemporal);
  const sinT = r.relaciones.filter((x) => !x.hayTraslapeTemporal);
  assert.equal(conT.length, 1);
  assert.equal(sinT.length, 1);
  // Ambas estan igual de cerca: la distancia no depende del tiempo.
  assert.ok(Math.abs(conT[0].distanciaMetros - sinT[0].distanciaMetros) < 0.5);
});

test('el motor entrega TODOS los hechos que exige la etapa', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW2', '2026-03-10 06:00:00', '2026-03-20 18:00:00'), F.punto(B)),
  ])]);
  const h = r.relaciones[0];
  for (const campo of [
    'distanciaMetros', 'intersecanFisicamente', 'dentroDelUmbral', 'umbralAplicadoMetros',
    'vigenciaA', 'vigenciaB', 'hayTraslapeTemporal', 'traslapeInicio', 'traslapeFin',
    'traslapeDias', 'traslapeHoras', 'contratoA', 'contratoB', 'idA', 'idB',
    'geometriaA', 'geometriaB', 'avisos',
  ]) {
    assert.ok(campo in h, `falta el hecho "${campo}"`);
  }
  assert.equal(typeof h.distanciaMetros, 'number');
  assert.equal(typeof h.intersecanFisicamente, 'boolean');
  assert.equal(h.vigenciaA.inicio, '2026-03-01 06:00:00');
  assert.equal(h.traslapeInicio, '2026-03-10 06:00:00');
  assert.equal(h.traslapeFin, '2026-03-20 18:00:00');
});

test('las etiquetas PROVISIONALES no tocan el calculo y se ven las 4 combinaciones', async () => {
  const r = await analizar([archivo('a.kmz', [
    // interseccion + traslape
    F.placemark('X1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.linea([[-75.60, 6.20], [-75.58, 6.22]])),
    F.placemark('X2', d('CW2', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.linea([[-75.60, 6.22], [-75.58, 6.20]])),
    // interseccion sin traslape
    F.placemark('Y1', d('CW3', '2026-01-01 06:00:00', '2026-01-30 18:00:00'), F.linea([[-75.50, 6.10], [-75.48, 6.12]])),
    F.placemark('Y2', d('CW4', '2026-06-01 06:00:00', '2026-06-30 18:00:00'), F.linea([[-75.50, 6.12], [-75.48, 6.10]])),
    // proximidad + traslape
    F.placemark('Z1', d('CW5', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto([-75.40, 6.30])),
    F.placemark('Z2', d('CW6', '2026-03-05 06:00:00', '2026-03-25 18:00:00'), F.punto([-75.40, 6.3005])),
    // proximidad sin traslape
    F.placemark('W1', d('CW7', '2026-01-01 06:00:00', '2026-01-30 18:00:00'), F.punto([-75.30, 6.40])),
    F.placemark('W2', d('CW8', '2026-06-01 06:00:00', '2026-06-30 18:00:00'), F.punto([-75.30, 6.4005])),
  ])]);
  const rep = repartir(r.relaciones);
  assert.equal(rep.A, 1, 'interseccion con traslape');
  assert.equal(rep.B, 1, 'interseccion sin traslape');
  assert.equal(rep.C, 1, 'proximidad con traslape');
  assert.equal(rep.D, 1, 'proximidad sin traslape');
  // Y ninguna relacion trae una categoria dentro de los hechos.
  for (const h of r.relaciones) {
    assert.ok(!('categoria' in h) && !('nivel' in h) && !('criticidad' in h),
      'los hechos no deben traer clasificacion de negocio');
    assert.ok(combinacionDe(h).startsWith('PROVISIONAL:'));
  }
  assert.ok(Object.values(COMBINACIONES).every((v) => v.startsWith('PROVISIONAL:')));
});

// ------------------------------------------------- calidad y salidas

test('un registro sin fechas utilizables no bloquea el analisis espacial', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-02-29 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW2', '2026-03-10 06:00:00', '2026-03-20 18:00:00'), F.punto(B)),
  ])]);
  assert.equal(r.relaciones.length, 1);
  const h = r.relaciones[0];
  assert.ok(h.distanciaMetros > 50, 'la distancia si se puede medir');
  assert.equal(h.traslapeEvaluable, false);
  assert.equal(h.hayTraslapeTemporal, false);
  assert.ok(r.registros.some((x) => x.avisos.some((a) => a.includes('inexistente'))));
});

test('un registro lejano no genera relacion', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW2', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(LEJOS)),
  ])]);
  assert.equal(r.relaciones.length, 0);
});

test('el resumen de calidad cuenta lo que hay', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', F.descripcion({ inicio: '2026-03-01', fin: '2026-03-30', contrato: 'CW2' }), F.punto(B)),
    F.placemark('F3', d('CW3', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), ''),
  ])]);
  assert.equal(r.calidad.total, 3);
  assert.equal(r.calidad.sinGeometria, 1);
  assert.equal(r.calidad.sinMunicipio, 1);
  assert.equal(r.calidad.porTipoGeometria.Point, 2);
});

test('la exportacion a GeoJSON es valida y lleva el identificador', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
  ])]);
  const gj = aGeoJson(r.registros);
  assert.equal(gj.type, 'FeatureCollection');
  assert.equal(gj.features.length, 1);
  assert.equal(gj.features[0].id, r.registros[0].id);
  assert.equal(gj.features[0].properties.contrato, 'CW1');
  assert.ok(JSON.parse(JSON.stringify(gj)));
});

test('el resultado es reproducible: dos ejecuciones identicas dan lo mismo', async () => {
  const archivos = [archivo('a.kmz', [
    F.placemark('F1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto(A)),
    F.placemark('F2', d('CW2', '2026-03-10 06:00:00', '2026-03-20 18:00:00'), F.punto(B)),
  ])];
  const a = await analizar(archivos);
  const b = await analizar(archivos);
  const limpiar = (x) => JSON.stringify(x.relaciones);
  assert.equal(limpiar(a), limpiar(b));
  assert.deepEqual(a.registros.map((r) => r.id), b.registros.map((r) => r.id));
});
