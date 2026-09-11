/**
 * Etapa 1.1 — comportamientos endurecidos que antes estaban mal definidos.
 *
 *  · Registros sin contrato: se conservan como dato con problema de calidad,
 *    pero no participan en ninguna relacion.
 *  · Antimeridiano: el pipeline COMPLETO, prefiltro incluido, tiene que
 *    funcionar a los dos lados de +-180.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analizar } from '../src/nucleo/index.js';
import { separacionLongitud } from '../src/nucleo/relaciones.js';
import * as F from '../fixtures/index.mjs';

const archivo = (nombre, placemarks) => ({ nombre, datos: F.kmz(placemarks) });
const VIG = { inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00' };

/** Descripcion completa, salvo los campos que se pidan omitir. */
function desc({ contrato, inicio = VIG.inicio, fin = VIG.fin, sinContrato = false }) {
  const p = [`fecha_inicio: ${inicio}`, `fecha_fin: ${fin}`, 'tipo_cierre: total',
    'direccion: Calle 1', 'municipio: Medellin'];
  if (!sinContrato) p.push(`contrato: ${contrato}`);
  p.push('contratista: CONTRATISTA X', 'proyecto: PROYECTO X');
  return p.join(' | ');
}

// ───────────────────────────────── registros sin contrato

test('SIN CONTRATO: el registro se conserva y se marca como problema de calidad', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('SIN_CONTRATO', desc({ sinContrato: true }), F.punto([-75.6000, 6.2000])),
    F.placemark('CON_CONTRATO', desc({ contrato: 'CW1' }), F.punto([-75.6000, 6.2005])),
  ])]);

  assert.equal(r.registros.length, 2, 'el trazado sin contrato NO se descarta');
  const huerfano = r.registros.find((x) => x.frente === 'SIN_CONTRATO');
  assert.equal(huerfano.contrato, null);
  assert.equal(huerfano.tieneGeometria, true, 'conserva su geometria para poder dibujarlo');
  assert.equal(huerfano.analizable, false, 'pero no es analizable');
  assert.ok(huerfano.avisos.some((a) => a.includes('contrato')),
    `deberia decir que le falta el contrato; dijo: ${huerfano.avisos.join('; ')}`);
  assert.equal(r.calidad.sinContrato, 1);
});

test('SIN CONTRATO: no genera relacion, aunque este a 55 m de otro trazado', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('SIN_CONTRATO', desc({ sinContrato: true }), F.punto([-75.6000, 6.2000])),
    F.placemark('CON_CONTRATO', desc({ contrato: 'CW1' }), F.punto([-75.6000, 6.2005])),
  ])]);
  assert.equal(r.relaciones.length, 0, 'un trazado sin contrato no puede interferir con nadie');
  assert.equal(r.estadisticas.paresSinContrato, 1);
});

test('SIN CONTRATO: dos huerfanos tampoco se relacionan entre si', async () => {
  // Este era el fallo concreto: al no tener contrato ninguno de los dos, la
  // comprobacion de "mismo contrato" se saltaba y el par se evaluaba como si
  // fueran contratos distintos.
  const r = await analizar([archivo('a.kmz', [
    F.placemark('HUERFANO_1', desc({ sinContrato: true }), F.punto([-75.6000, 6.2000])),
    F.placemark('HUERFANO_2', desc({ sinContrato: true }), F.punto([-75.6000, 6.2005])),
  ])]);
  assert.equal(r.registros.length, 2);
  assert.equal(r.relaciones.length, 0);
  assert.equal(r.estadisticas.paresSinContrato, 1);
});

test('SIN CONTRATO: no contamina el recuento de pares del mismo contrato', async () => {
  const r = await analizar([archivo('a.kmz', [
    F.placemark('HUERFANO', desc({ sinContrato: true }), F.punto([-75.6000, 6.2000])),
    F.placemark('A', desc({ contrato: 'CW1' }), F.punto([-75.6000, 6.2005])),
    F.placemark('B', desc({ contrato: 'CW1' }), F.punto([-75.6000, 6.2010])),
    F.placemark('C', desc({ contrato: 'CW2' }), F.punto([-75.6000, 6.2003])),
  ])]);
  // 6 pares en total: 3 con el huerfano, 1 del mismo contrato (A-B),
  // 2 entre contratos distintos (A-C y B-C).
  assert.equal(r.estadisticas.paresSinContrato, 3);
  assert.equal(r.estadisticas.paresMismoContrato, 1);
  assert.equal(r.relaciones.length, 2);
  for (const rel of r.relaciones) {
    assert.ok(rel.contratoA && rel.contratoB, 'toda relacion debe tener los dos contratos');
    assert.notEqual(rel.contratoA, rel.contratoB);
  }
});

test('SIN CONTRATO: el trazado sigue exportandose al mapa', async () => {
  const { aGeoJson } = await import('../src/nucleo/index.js');
  const r = await analizar([archivo('a.kmz', [
    F.placemark('HUERFANO', desc({ sinContrato: true }), F.punto([-75.6000, 6.2000])),
  ])]);
  const gj = aGeoJson(r.registros);
  assert.equal(gj.features.length, 1, 'se puede ver en el mapa aunque no se analice');
  assert.equal(gj.features[0].properties.contrato, null);
  assert.ok(gj.features[0].properties.avisos > 0);
});

// ───────────────────────────────── antimeridiano

test('ANTIMERIDIANO: la separacion de longitudes se mide sobre el circulo', () => {
  // A los dos lados de +-180, separados 0,001 grados (~110 m).
  assert.ok(Math.abs(separacionLongitud(179.9995, 179.9995, -179.9995, -179.9995) - 0.001) < 1e-9);
  // Caso normal, sin vuelta de por medio.
  assert.ok(Math.abs(separacionLongitud(-75.60, -75.59, -75.58, -75.57) - 0.01) < 1e-9);
  // Intervalos que se solapan: separacion cero.
  assert.equal(separacionLongitud(-75.60, -75.58, -75.59, -75.57), 0);
  // Puntos de verdad lejanos: no se inventa cercania.
  assert.equal(separacionLongitud(0, 0, 90, 90), 90);
  assert.equal(separacionLongitud(0, 0, 180, 180), 180);
  // Simetrica.
  assert.equal(
    separacionLongitud(179.999, 179.999, -179.999, -179.999),
    separacionLongitud(-179.999, -179.999, 179.999, 179.999)
  );
});

test('ANTIMERIDIANO: de extremo a extremo, dos trazados a 110 m se relacionan', async () => {
  // Prueba del PIPELINE COMPLETO, no solo del calculo final: si el prefiltro
  // por cajas descartara el par, esta prueba fallaria aunque `medir` supiera
  // tratarlo. Era exactamente lo que ocurria antes.
  const r = await analizar([archivo('meridiano.kmz', [
    F.placemark('ESTE', desc({ contrato: 'CW1' }), F.punto([179.9995, 10.0])),
    F.placemark('OESTE', desc({ contrato: 'CW2' }), F.punto([-179.9995, 10.0])),
  ])]);
  assert.equal(r.registros.length, 2);
  assert.equal(r.relaciones.length, 1, 'el par debe llegar hasta el calculo, no morir en el prefiltro');
  const d = r.relaciones[0].distanciaMetros;
  assert.ok(d > 105 && d < 115, `esperado ~110 m, obtenido ${d}`);
  assert.equal(r.relaciones[0].hayTraslapeTemporal, true);
  assert.equal(r.estadisticas.paresDescartadosPorCaja, 0);
});

test('ANTIMERIDIANO: con lineas, no solo con puntos', async () => {
  const r = await analizar([archivo('m.kmz', [
    F.placemark('ESTE', desc({ contrato: 'CW1' }), F.linea([[179.9990, 10.0], [179.9998, 10.0]])),
    F.placemark('OESTE', desc({ contrato: 'CW2' }), F.linea([[-179.9998, 10.0], [-179.9990, 10.0]])),
  ])]);
  assert.equal(r.relaciones.length, 1);
  const d = r.relaciones[0].distanciaMetros;
  assert.ok(d > 40 && d < 50, `esperado ~44 m entre los extremos, obtenido ${d}`);
});

test('ANTIMERIDIANO: dos trazados realmente lejanos NO se relacionan', async () => {
  // Control negativo: el arreglo no puede consistir en dejar pasar todo.
  const r = await analizar([archivo('m.kmz', [
    F.placemark('ESTE', desc({ contrato: 'CW1' }), F.punto([179.0, 10.0])),
    F.placemark('OESTE', desc({ contrato: 'CW2' }), F.punto([-179.0, 10.0])),
  ])]);
  assert.equal(r.relaciones.length, 0, 'estan a ~220 km: no deben relacionarse');
  assert.equal(r.estadisticas.paresDescartadosPorCaja, 1);
});

test('ANTIMERIDIANO: tambien funciona cerca de los polos', async () => {
  const r = await analizar([archivo('m.kmz', [
    F.placemark('ESTE', desc({ contrato: 'CW1' }), F.punto([179.999, 78.0])),
    F.placemark('OESTE', desc({ contrato: 'CW2' }), F.punto([-179.999, 78.0])),
  ])]);
  assert.equal(r.relaciones.length, 1);
  const d = r.relaciones[0].distanciaMetros;
  assert.ok(d > 40 && d < 55, `a 78 grados de latitud, 0,002 grados son ~46 m; obtenido ${d}`);
});

test('ANTIMERIDIANO: el meridiano cero sigue comportandose igual', async () => {
  // Control de que el arreglo no ha roto el caso corriente de longitudes con
  // signos distintos alrededor de Greenwich.
  const r = await analizar([archivo('g.kmz', [
    F.placemark('ESTE', desc({ contrato: 'CW1' }), F.punto([0.0005, 10.0])),
    F.placemark('OESTE', desc({ contrato: 'CW2' }), F.punto([-0.0005, 10.0])),
  ])]);
  assert.equal(r.relaciones.length, 1);
  assert.ok(r.relaciones[0].distanciaMetros > 105 && r.relaciones[0].distanciaMetros < 115);
});

test('el prefiltro nunca descarta un par que el calculo aceptaria', async () => {
  // Barrido alrededor del umbral en varias longitudes criticas: para cada par,
  // si el calculo completo lo da por dentro del umbral, el prefiltro tuvo que
  // dejarlo pasar. Es la propiedad que garantiza que el prefiltro es seguro.
  const lonesBase = [-179.9999, -75.60, -0.0001, 0.0001, 179.9999];
  for (const lon of lonesBase) {
    for (const metros of [50, 110, 119, 121, 200]) {
      const dGrados = metros / 110574;
      let lonB = lon + dGrados;
      if (lonB > 180) lonB -= 360;
      const r = await analizar([archivo('x.kmz', [
        F.placemark('A', desc({ contrato: 'CW1' }), F.punto([lon, 6.0])),
        F.placemark('B', desc({ contrato: 'CW2' }), F.punto([lonB, 6.0])),
      ])]);
      const deberia = metros <= 119;
      if (deberia) {
        assert.equal(r.relaciones.length, 1,
          `lon ${lon}, ${metros} m: el par se perdio (descartados por caja: ${r.estadisticas.paresDescartadosPorCaja})`);
      }
    }
  }
});
