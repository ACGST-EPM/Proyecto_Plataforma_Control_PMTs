/**
 * Distancia en metros. Se valida contra DOS referencias independientes:
 *   1. Vincenty inverso (algoritmo distinto, implementado aparte).
 *   2. Turf.js 7.4.0 (libreria de terceros, solo dependencia de pruebas).
 * Ademas contra valores publicados de referencia geodesica.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { medir } from '../src/geo/geometria.js';
import { distanciaGeodesica } from '../src/geo/geodesica.js';
import { planoLocal } from '../src/geo/plano-local.js';

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (c) => ({ type: 'LineString', coordinates: c });
const dist = (a, b) => medir(a, b).metros;

test('Vincenty reproduce distancias de referencia publicadas', () => {
  // Caso clasico de las pruebas de Vincenty (Flinders Peak -> Buninyong,
  // Australia). Coordenadas en grados-minutos-segundos convertidas a decimal:
  //   Flinders Peak  37 57 03.72030 S  144 25 29.52440 E
  //   Buninyong      37 39 10.15610 S  143 55 35.38390 E
  // Distancia geodesica publicada: 54972.271 m.
  const flinders = [144 + 25 / 60 + 29.52440 / 3600, -(37 + 57 / 60 + 3.72030 / 3600)];
  const buninyong = [143 + 55 / 60 + 35.38390 / 3600, -(37 + 39 / 60 + 10.15610 / 3600)];
  const d = distanciaGeodesica(flinders, buninyong);
  assert.ok(Math.abs(d - 54972.271) < 0.01, `esperado 54972.271 m, obtenido ${d}`);

  // Un grado de latitud en el ecuador segun WGS84: 110574.389 m.
  const dLat = distanciaGeodesica([0, 0], [0, 1]);
  assert.ok(Math.abs(dLat - 110574.389) < 0.5, `esperado ~110574.4 m, obtenido ${dLat}`);

  // Un grado de longitud en el ecuador: 111319.491 m.
  const dLon = distanciaGeodesica([0, 0], [1, 0]);
  assert.ok(Math.abs(dLon - 111319.491) < 0.5, `esperado ~111319.5 m, obtenido ${dLon}`);
});

test('punto a punto coincide con Vincenty y con Turf en cuatro continentes', () => {
  const casos = [
    ['Medellin',  [-75.5722, 6.2612],  [-75.5710, 6.2612]],
    ['Medellin N',[-75.5722, 6.2612],  [-75.5722, 6.2628]],
    ['Oslo',      [10.7522, 59.9139],  [10.7600, 59.9139]],
    ['Quito',     [-78.4678, -0.1807], [-78.4678, -0.1700]],
    ['Sidney',    [151.2093, -33.8688],[151.2150, -33.8700]],
    ['Svalbard',  [15.6469, 78.2232],  [15.6600, 78.2232]],
  ];
  for (const [nombre, a, b] of casos) {
    const mio = dist(P(a), P(b));
    const vinc = distanciaGeodesica(a, b);
    const tf = turf.distance(turf.point(a), turf.point(b), { units: 'meters' });
    // Se compara en ABSOLUTO, en milimetros: es lo que importa fisicamente y
    // no se distorsiona cuando la distancia es corta.
    const difMm = Math.abs(mio - vinc) * 1000;
    const relTurf = Math.abs(mio - tf) / tf;
    assert.ok(difMm < 1, `${nombre}: plano local ${mio} vs Vincenty ${vinc} (${difMm} mm)`);
    // Turf usa esfera, no elipsoide: se admite el 0,6 % de diferencia del modelo.
    assert.ok(relTurf < 0.006, `${nombre}: plano local ${mio} vs Turf ${tf} (rel ${relTurf})`);
  }
});

test('el antimeridiano no rompe la medida', () => {
  const d = dist(P([179.9995, 10]), P([-179.9995, 10]));
  const v = distanciaGeodesica([179.9995, 10], [-179.9995, 10]);
  assert.ok(Math.abs(d - v) < 0.01, `plano local ${d} vs Vincenty ${v}`);
  assert.ok(d < 120, `deberian estar a ~110 m, no a media vuelta al mundo (${d})`);
});

test('el motor no esta calibrado a una region: mismo error en todo el planeta', () => {
  // Se mide el mismo desplazamiento angular en latitudes muy distintas y se
  // comprueba que el error relativo frente a Vincenty se mantiene minusculo.
  for (const lat of [-80, -45, -10, 0, 6.26, 25, 45, 60, 80]) {
    const a = [0, lat], b = [0.001, lat];
    const mio = dist(P(a), P(b));
    const v = distanciaGeodesica(a, b);
    assert.ok(Math.abs(mio - v) / v < 1e-6, `latitud ${lat}: ${mio} vs ${v}`);
  }
});

test('punto a linea coincide con Turf', () => {
  const linea = L([[-75.5722, 6.2612], [-75.5700, 6.2612], [-75.5700, 6.2630]]);
  for (const p of [[-75.5711, 6.2620], [-75.5750, 6.2612], [-75.5700, 6.2640], [-75.5690, 6.2621]]) {
    const mio = dist(P(p), linea);
    const tf = turf.pointToLineDistance(turf.point(p), turf.lineString(linea.coordinates), { units: 'meters', method: 'geodesic' });
    assert.ok(Math.abs(mio - tf) / Math.max(tf, 1) < 0.01, `punto ${p}: propio ${mio} vs Turf ${tf}`);
  }
});

test('la distancia es simetrica y no negativa', () => {
  const a = L([[-75.57, 6.26], [-75.56, 6.26]]);
  const b = L([[-75.57, 6.262], [-75.56, 6.262]]);
  const ab = dist(a, b), ba = dist(b, a);
  assert.equal(ab, ba);
  assert.ok(ab > 0);
});

test('geometria consigo misma da 0', () => {
  const a = L([[-75.57, 6.26], [-75.56, 6.26]]);
  assert.equal(dist(a, a), 0);
});

test('el error del plano local crece como d^3 y es despreciable en el rango de uso', () => {
  // El motor solo mide distancias por debajo del umbral (120 m por defecto),
  // asi que lo que importa es el error a corta distancia. Aqui se documenta
  // con numeros como se comporta al alejarse, para que el limite sea explicito
  // y no una suposicion.
  const filas = [];
  for (const grados of [0.001, 0.01, 0.1, 0.3, 1]) {
    const a = [-75.5, 6.25], b = [-75.5 + grados, 6.25];
    const pl = planoLocal((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const [ax, ay] = pl.proyectar(a), [bx, by] = pl.proyectar(b);
    const plano = Math.hypot(bx - ax, by - ay);
    const v = distanciaGeodesica(a, b);
    filas.push({ metros: Math.round(v), errorMm: Math.abs(plano - v) * 1000 });
  }
  // Cotas comprobadas empiricamente y documentadas a proposito:
  const cotas = [
    [200, 0.01],        // hasta 200 m  -> menos de 0,01 mm
    [1500, 0.01],       // hasta 1,5 km -> menos de 0,01 mm
    [15000, 2],         // hasta 15 km  -> menos de 2 mm
    [40000, 50],        // hasta 40 km  -> menos de 5 cm
    [120000, 2000],     // hasta 120 km -> menos de 2 m
  ];
  for (const f of filas) {
    const cota = cotas.find(([m]) => f.metros <= m);
    assert.ok(cota, `distancia fuera de las cotas documentadas: ${f.metros} m`);
    assert.ok(f.errorMm < cota[1], `a ${f.metros} m el error es ${f.errorMm} mm (cota ${cota[1]} mm)`);
  }
  // El umbral de trabajo del motor es 120 m: ahi el error es despreciable.
  assert.ok(filas[0].errorMm < 0.01, `en el rango de uso el error debe ser < 0,01 mm`);
  // Y crece con la distancia, que es el comportamiento esperado del modelo.
  assert.ok(filas[filas.length - 1].errorMm > filas[0].errorMm);
});
