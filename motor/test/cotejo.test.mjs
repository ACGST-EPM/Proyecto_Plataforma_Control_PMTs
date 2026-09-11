/**
 * El control de fidelidad del verificador.
 *
 * Lo que se comprueba aqui es, sobre todo, que el control SABE DECIR QUE NO.
 * Un control que siempre dice "superado" no sirve de nada, asi que la mitad de
 * estas pruebas le dan datos que no cuadran y exigen que lo detecte y lo diga.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cotejarFidelidad, resumirCotejo } from '../src/legado/cotejo.js';
import { analizar, ejecutarLegado, PERFIL_LEGADO } from '../src/nucleo/index.js';
import * as F from '../fixtures/index.mjs';

const d = (contrato, inicio, fin) =>
  F.descripcion({ inicio, fin, contrato, municipio: 'Medellin' });
const archivo = (nombre, pms) => ({ nombre, datos: F.kmz(pms) });

async function ambosCaminos(archivos) {
  const replica = await ejecutarLegado(archivos);
  const motor = await analizar(archivos, PERFIL_LEGADO);
  return { replica, motor };
}

test('con datos coherentes, el cotejo pasa y dice que comparo uno a uno', async () => {
  const archivos = [archivo('a.kmz', [
    F.placemark('A1', d('CW1', '2026-03-01 06:00:00', '2026-03-30 18:00:00'), F.punto([-75.6000, 6.2000])),
    F.placemark('A2', d('CW2', '2026-03-10 06:00:00', '2026-03-20 18:00:00'), F.punto([-75.6000, 6.2005])),
    F.placemark('B1', d('CW3', '2026-01-01 06:00:00', '2026-01-30 18:00:00'), F.punto([-75.5000, 6.3000])),
    F.placemark('B2', d('CW4', '2026-06-01 06:00:00', '2026-06-30 18:00:00'), F.punto([-75.5000, 6.3005])),
  ])];
  const { replica, motor } = await ambosCaminos(archivos);
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.completo, true);
  assert.equal(c.soloReplica.length, 0);
  assert.equal(c.soloMotor.length, 0);
  assert.equal(c.coincidentes, c.alertasReplica);
  assert.ok(c.coincidentes > 0, 'el cotejo tiene que haber comparado algo de verdad');
  assert.ok(resumirCotejo(c).includes('una a una'));
});

test('NO se conforma con que los totales cuadren', () => {
  // Mismo numero de alertas a cada lado, pero son parejas distintas.
  const replica = {
    filas: [
      ['Trazado Normal', 'CW1', 'X', 'M', 'A', 'd', 'TOTAL', 'Diurno', '2026-03-01', '2026-03-30', '29'],
      ['Trazado Normal', 'CW2', 'X', 'M', 'B', 'd', 'TOTAL', 'Diurno', '2026-03-01', '2026-03-30', '29'],
      ['Interferencia', 'CW1 vs CW2', 'X vs X', 'Varios', 'A / B', 'Ver Mapa', 'INTERFERENCIA REAL (CRÍTICA)', 'Varios', '2026-03-01', '2026-03-30', '30'],
    ],
    resumen: {},
  };
  const motor = {
    registros: [{}, {}],
    archivos: [{ nombre: 'x.kmz', ok: true, errores: [], placemarks: 2 }],
    relaciones: [{
      contratoA: 'CW1', contratoB: 'CW3',       // <- otro contrato
      frenteA: 'A', frenteB: 'C',
      hayTraslapeTemporal: true,
      traslapeInicio: '2026-03-01 00:00:00', traslapeFin: '2026-03-30 23:59:59',
    }],
  };
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.alertasReplica, 1);
  assert.equal(c.alertasMotor, 1, 'los totales coinciden…');
  assert.equal(c.completo, false, '…pero las parejas no, y el cotejo tiene que verlo');
  assert.equal(c.coincidentes, 0);
  assert.equal(c.soloReplica.length, 1);
  assert.equal(c.soloMotor.length, 1);
  const texto = resumirCotejo(c);
  assert.ok(texto.includes('NO se puede afirmar'), texto);
});

test('detecta una diferencia de categoria aunque el par sea el mismo', () => {
  const base = ['Interferencia', 'CW1 vs CW2', 'X vs X', 'Varios', 'A / B', 'Ver Mapa', 'x', 'Varios', '2026-03-01', '2026-03-30', '30'];
  const replica = { filas: [base], resumen: {} };
  const motor = {
    registros: [{ tieneGeometria: true }],
    archivos: [{ nombre: 'x.kmz', ok: true, errores: [], placemarks: 1 }],
    relaciones: [{
      contratoA: 'CW1', contratoB: 'CW2', frenteA: 'A', frenteB: 'B',
      hayTraslapeTemporal: false,           // <- el legado dijo Interferencia
      traslapeInicio: null, traslapeFin: null,
    }],
  };
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.completo, false);
  assert.equal(c.soloReplica[0].categoria, 'Interferencia');
  assert.equal(c.soloMotor[0].categoria, 'Cercanía');
});

test('detecta una diferencia en el periodo de traslape', () => {
  const replica = {
    filas: [['Interferencia', 'CW1 vs CW2', 'X vs X', 'Varios', 'A / B', 'Ver Mapa', 'x', 'Varios', '2026-03-01', '2026-03-30', '30']],
    resumen: {},
  };
  const motor = {
    registros: [{ tieneGeometria: true }],
    archivos: [{ nombre: 'x.kmz', ok: true, errores: [], placemarks: 1 }],
    relaciones: [{
      contratoA: 'CW1', contratoB: 'CW2', frenteA: 'A', frenteB: 'B',
      hayTraslapeTemporal: true,
      traslapeInicio: '2026-03-05 00:00:00',  // <- cinco dias mas tarde
      traslapeFin: '2026-03-30 23:59:59',
    }],
  };
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.completo, false);
  assert.equal(c.coincidentes, 0);
  assert.ok(c.soloReplica[0].periodo.startsWith('2026-03-01'));
  assert.ok(c.soloMotor[0].periodo.startsWith('2026-03-05'));
});

test('detecta que falte o sobre una alerta', () => {
  const fila = (frentes) => ['Cercanía', 'CW1 vs CW2', 'X vs X', 'Varios', frentes, 'Ver Mapa', 'x', 'Varios', 'N/A', 'N/A', '0'];
  const rel = (a, b) => ({
    contratoA: 'CW1', contratoB: 'CW2', frenteA: a, frenteB: b,
    hayTraslapeTemporal: false, traslapeInicio: null, traslapeFin: null,
  });
  const c = cotejarFidelidad(
    { filas: [fila('A / B'), fila('C / D')], resumen: {}, errores: [], noContrastables: [] },
    { registros: [{ tieneGeometria: true }], relaciones: [rel('A', 'B')],
      archivos: [{ nombre: 'x.kmz', ok: true, errores: [], placemarks: 1 }] }
  );
  assert.equal(c.completo, false);
  assert.equal(c.coincidentes, 1);
  assert.equal(c.soloReplica.length, 1);
  assert.equal(c.soloMotor.length, 0);
  assert.equal(c.lecturaLimpia, true, 'la lectura fue limpia: lo que falla es la comparacion');
  assert.ok(resumirCotejo(c).includes('solo en la reproducción de QGIS'), resumirCotejo(c));
});

test('detecta que no cuadre el numero de trazados leidos', () => {
  const c = cotejarFidelidad(
    { filas: [['Trazado Normal', 'CW1', 'X', 'M', 'A', 'd', 'TOTAL', 'Diurno', '2026-03-01', '2026-03-30', '29']], resumen: {} },
    { registros: [{}, {}, {}], relaciones: [] }   // <- tres, no uno
  );
  assert.equal(c.completo, false);
  assert.equal(c.trazadosCoinciden, false);
  assert.ok(resumirCotejo(c).includes('trazados leídos no cuadra'));
});

test('el informe dice explicitamente que criterios comprobo', () => {
  const c = cotejarFidelidad({ filas: [], resumen: {} }, { registros: [], relaciones: [] });
  assert.ok(Array.isArray(c.criterios) && c.criterios.length >= 4);
  assert.ok(c.criterios.some((x) => x.includes('contratos')));
  assert.ok(c.criterios.some((x) => x.includes('frentes')));
  assert.ok(c.criterios.some((x) => x.includes('periodo')));
});

test('el desglose por categoria es solo resumen, no la prueba', () => {
  // Los totales por categoria pueden cuadrar mientras el cotejo falla.
  const replica = {
    filas: [['Cercanía', 'CW1 vs CW2', 'X vs X', 'Varios', 'A / B', 'Ver Mapa', 'x', 'Varios', 'N/A', 'N/A', '0']],
    resumen: {},
  };
  const motor = {
    registros: [{ tieneGeometria: true }],
    archivos: [{ nombre: 'x.kmz', ok: true, errores: [], placemarks: 1 }],
    relaciones: [{
      contratoA: 'CW9', contratoB: 'CW8', frenteA: 'Z', frenteB: 'Y',
      hayTraslapeTemporal: false, traslapeInicio: null, traslapeFin: null,
    }],
  };
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.porCategoria.replica['Cercanía'], 1);
  assert.equal(c.porCategoria.motor['Cercanía'], 1);
  assert.equal(c.completo, false, 'los totales por categoria cuadran, el cotejo no');
});
