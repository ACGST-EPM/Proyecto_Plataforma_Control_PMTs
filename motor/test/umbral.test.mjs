/**
 * El umbral: exactamente en 120 m, justo por debajo y justo por encima.
 * Se construyen los casos con distancias geodesicas reales, no con grados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { medir } from '../src/geo/geometria.js';
import { distanciaGeodesica } from '../src/geo/geodesica.js';
import { hechosDelPar } from '../src/nucleo/relaciones.js';
import { resolverConfig, alcanceMetros, PERFIL_LEGADO } from '../src/nucleo/config.js';

/** Devuelve la latitud que queda exactamente a `metros` al norte de `base`. */
function latAdistancia(lon, lat, metros) {
  let lo = 0, hi = 0.01;
  for (let i = 0; i < 80; i++) {
    const med = (lo + hi) / 2;
    if (distanciaGeodesica([lon, lat], [lon, lat + med]) < metros) lo = med; else hi = med;
  }
  return lat + (lo + hi) / 2;
}

const LON = -75.5722, LAT = 6.2612;
const P = (c) => ({ type: 'Point', coordinates: c });

function registro(id, contrato, geometria, inicio = '2026-03-01 06:00:00', fin = '2026-03-30 18:00:00') {
  return {
    id, contrato, frente: id, contratista: 'X', municipio: 'M', tipoCierre: 'total',
    tipoGeometria: geometria.type, geometria, caja: null, avisos: [],
    vigencia: { inicio, fin, valida: true, inicioMs: Date.parse(inicio.replace(' ', 'T') + 'Z'), finMs: Date.parse(fin.replace(' ', 'T') + 'Z') },
  };
}

test('la distancia construida es la pedida (el propio banco de pruebas es exacto)', () => {
  for (const m of [50, 119.9, 120, 120.1, 243.2]) {
    const lat2 = latAdistancia(LON, LAT, m);
    const d = medir(P([LON, LAT]), P([LON, lat2])).metros;
    assert.ok(Math.abs(d - m) < 0.001, `pedido ${m} m, construido ${d} m`);
  }
});

test('umbral 120 m: justo por debajo entra, justo por encima no', () => {
  const cfg = { umbralMetros: 120 };
  for (const [m, esperado] of [[119.0, true], [119.999, true], [120.0, true], [120.001, false], [121, false]]) {
    const a = registro('A', 'C1', P([LON, LAT]));
    const b = registro('B', 'C2', P([LON, latAdistancia(LON, LAT, m)]));
    const h = hechosDelPar(a, b, cfg);
    assert.equal(h.dentroDelUmbral, esperado,
      `a ${m} m (medido ${h.distanciaMetros}) se esperaba dentroDelUmbral=${esperado}`);
  }
});

test('el umbral es inclusivo: exactamente 120 m cuenta como dentro', () => {
  const a = registro('A', 'C1', P([LON, LAT]));
  const b = registro('B', 'C2', P([LON, latAdistancia(LON, LAT, 120)]));
  const h = hechosDelPar(a, b, { umbralMetros: 120 });
  assert.equal(h.dentroDelUmbral, true);
  assert.ok(Math.abs(h.distanciaMetros - 120) < 0.01);
});

test('el umbral se puede cambiar y el motor lo obedece', () => {
  const a = registro('A', 'C1', P([LON, LAT]));
  const b = registro('B', 'C2', P([LON, latAdistancia(LON, LAT, 200)]));
  assert.equal(hechosDelPar(a, b, { umbralMetros: 120 }).dentroDelUmbral, false);
  assert.equal(hechosDelPar(a, b, { umbralMetros: 250 }).dentroDelUmbral, true);
  assert.equal(hechosDelPar(a, b, { umbralMetros: 0 }).dentroDelUmbral, false);
});

test('el modo legado duplica el alcance, que es justo el defecto que se corrige', () => {
  assert.equal(alcanceMetros(resolverConfig({ umbralMetros: 120, modoDistancia: 'real' })), 120);
  assert.equal(alcanceMetros(resolverConfig({ umbralMetros: 120, modoDistancia: 'legado' })), 240);
  assert.ok(Math.abs(alcanceMetros(resolverConfig(PERFIL_LEGADO)) - 243.2) < 0.01);
});

test('una configuracion invalida se rechaza con un mensaje claro', () => {
  assert.throws(() => resolverConfig({ umbralMetros: -1 }), /umbralMetros/);
  assert.throws(() => resolverConfig({ umbralMetros: 'cien' }), /umbralMetros/);
  assert.throws(() => resolverConfig({ toleranciaMinutos: -5 }), /toleranciaMinutos/);
  assert.throws(() => resolverConfig({ modoDistancia: 'otro' }), /modoDistancia/);
  assert.throws(() => resolverConfig({ granularidadTemporal: 'semana' }), /granularidadTemporal/);
});

test('el umbral no esta enterrado: se lee del objeto de configuracion', () => {
  const h = hechosDelPar(
    registro('A', 'C1', P([LON, LAT])),
    registro('B', 'C2', P([LON, latAdistancia(LON, LAT, 50)])),
    { umbralMetros: 77 }
  );
  assert.equal(h.umbralAplicadoMetros, 77);
});
