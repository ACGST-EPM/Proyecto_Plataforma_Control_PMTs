/**
 * Todos los tipos de geometria del modelo GeoJSON, incluidos los que el motor
 * legado descartaba en silencio. Cada combinacion se comprueba en distancia y
 * en interseccion, que son hechos independientes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { medir, descomponer, TIPOS_SOPORTADOS } from '../src/geo/geometria.js';

const P = (c) => ({ type: 'Point', coordinates: c });
const MP = (c) => ({ type: 'MultiPoint', coordinates: c });
const L = (c) => ({ type: 'LineString', coordinates: c });
const ML = (c) => ({ type: 'MultiLineString', coordinates: c });
const PG = (c) => ({ type: 'Polygon', coordinates: c });
const MPG = (c) => ({ type: 'MultiPolygon', coordinates: c });
const GC = (g) => ({ type: 'GeometryCollection', geometries: g });

// Cuadrado de ~0,002 grados (~220 m) con esquina en (-75.60, 6.20)
const cuadro = [[[-75.600, 6.200], [-75.598, 6.200], [-75.598, 6.202], [-75.600, 6.202], [-75.600, 6.200]]];

test('punto a punto', () => {
  const r = medir(P([-75.60, 6.20]), P([-75.60, 6.20]));
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
  const s = medir(P([-75.6000, 6.2000]), P([-75.6000, 6.2010]));
  assert.ok(s.metros > 110 && s.metros < 112, `esperado ~111 m, obtenido ${s.metros}`);
  assert.equal(s.intersecan, false);
});

test('punto que coincide con un vertice da distancia 0 e interseccion', () => {
  const l = L([[-75.60, 6.20], [-75.58, 6.20]]);
  const r = medir(P([-75.60, 6.20]), l);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('un paralelo no es una recta: el punto medio queda a ~1 cm de la cuerda', () => {
  // Caracteristica real de la geometria terrestre, no un defecto: el tramo
  // recto entre dos puntos de la misma latitud pasa ligeramente al sur del
  // paralelo. A 2,2 km de vano la separacion es de un centimetro.
  // Se documenta con una prueba para que nadie lo confunda con un error y para
  // dejar claro que `intersecan` es una condicion ESTRICTA de distancia cero.
  const l = L([[-75.60, 6.20], [-75.58, 6.20]]);
  const r = medir(P([-75.59, 6.20]), l);
  assert.ok(r.metros > 0 && r.metros < 0.05, `esperado ~0,01 m, obtenido ${r.metros}`);
  assert.equal(r.intersecan, false);
  // Irrelevante frente al umbral de trabajo: un centimetro sobre 120 metros.
  assert.ok(r.metros / 120 < 1e-4);
});

test('punto fuera del extremo de la linea mide hasta el extremo', () => {
  const l = L([[-75.60, 6.20], [-75.59, 6.20]]);
  const r = medir(P([-75.58, 6.20]), l);
  const esperado = turf.distance(turf.point([-75.58, 6.20]), turf.point([-75.59, 6.20]), { units: 'meters' });
  assert.ok(Math.abs(r.metros - esperado) / esperado < 0.006);
});

test('lineas que se cruzan dan 0 e interseccion', () => {
  const a = L([[-75.60, 6.20], [-75.58, 6.22]]);
  const b = L([[-75.60, 6.22], [-75.58, 6.20]]);
  const r = medir(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
  // Turf confirma el cruce de forma independiente.
  assert.equal(turf.booleanIntersects(turf.lineString(a.coordinates), turf.lineString(b.coordinates)), true);
});

test('lineas paralelas: distancia constante, sin interseccion', () => {
  const a = L([[-75.60, 6.2000], [-75.58, 6.2000]]);
  const b = L([[-75.60, 6.2009], [-75.58, 6.2009]]);
  const r = medir(a, b);
  assert.ok(r.metros > 99 && r.metros < 101, `esperado ~99,5 m, obtenido ${r.metros}`);
  assert.equal(r.intersecan, false);
});

test('lineas que solo se tocan en un extremo', () => {
  const a = L([[-75.60, 6.20], [-75.59, 6.20]]);
  const b = L([[-75.59, 6.20], [-75.58, 6.21]]);
  const r = medir(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('MultiPoint: se toma el punto mas cercano, no el primero', () => {
  // El motor legado se quedaba con la primera geometria; aqui deben contar todas.
  const mp = MP([[-75.70, 6.30], [-75.6001, 6.2000]]);
  const r = medir(mp, P([-75.6000, 6.2000]));
  assert.ok(r.metros < 12, `deberia medir contra el punto cercano, obtenido ${r.metros}`);
});

test('MultiLineString: cuenta cualquiera de sus partes', () => {
  const ml = ML([
    [[-75.80, 6.40], [-75.79, 6.40]],       // lejos
    [[-75.6000, 6.2005], [-75.5980, 6.2005]], // cerca
  ]);
  const r = medir(ml, L([[-75.6000, 6.2000], [-75.5980, 6.2000]]));
  assert.ok(r.metros > 54 && r.metros < 57, `esperado ~55 m, obtenido ${r.metros}`);
});

test('poligono: un punto dentro esta a distancia 0', () => {
  const r = medir(P([-75.599, 6.201]), PG(cuadro));
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
  assert.equal(turf.booleanPointInPolygon(turf.point([-75.599, 6.201]), turf.polygon(cuadro)), true);
});

test('poligono: un punto fuera mide hasta el borde', () => {
  const r = medir(P([-75.6010, 6.2010]), PG(cuadro));
  assert.ok(r.metros > 108 && r.metros < 114, `esperado ~111 m, obtenido ${r.metros}`);
  assert.equal(r.intersecan, false);
});

test('poligono con hueco: dentro del hueco NO esta dentro del poligono', () => {
  const hueco = [[-75.5996, 6.2004], [-75.5984, 6.2004], [-75.5984, 6.2016], [-75.5996, 6.2016], [-75.5996, 6.2004]];
  const grande = [[-75.600, 6.200], [-75.598, 6.200], [-75.598, 6.202], [-75.600, 6.202], [-75.600, 6.200]];
  const conHueco = PG([grande, hueco]);
  const dentroDelHueco = P([-75.5990, 6.2010]);
  const r = medir(dentroDelHueco, conHueco);
  assert.ok(r.metros > 0, 'un punto en el hueco no deberia estar dentro del poligono');
  assert.equal(
    turf.booleanPointInPolygon(turf.point([-75.5990, 6.2010]), turf.polygon([grande, hueco])),
    false
  );
});

test('linea que atraviesa un poligono', () => {
  const l = L([[-75.6100, 6.2010], [-75.5900, 6.2010]]);
  const r = medir(l, PG(cuadro));
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('poligono contenido en otro poligono', () => {
  const chico = [[[-75.5995, 6.2005], [-75.5990, 6.2005], [-75.5990, 6.2010], [-75.5995, 6.2010], [-75.5995, 6.2005]]];
  const r = medir(PG(chico), PG(cuadro));
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('MultiPolygon y GeometryCollection funcionan', () => {
  const mpg = MPG([cuadro, [[[-75.50, 6.10], [-75.49, 6.10], [-75.49, 6.11], [-75.50, 6.11], [-75.50, 6.10]]]]);
  assert.equal(medir(P([-75.599, 6.201]), mpg).metros, 0);
  const gc = GC([P([-75.70, 6.30]), L([[-75.6000, 6.2003], [-75.5980, 6.2003]])]);
  const r = medir(gc, L([[-75.6000, 6.2000], [-75.5980, 6.2000]]));
  assert.ok(r.metros > 32 && r.metros < 35, `esperado ~33 m, obtenido ${r.metros}`);
});

test('el modelo declara los seis tipos GeoJSON mas la coleccion', () => {
  for (const t of ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']) {
    assert.ok(TIPOS_SOPORTADOS.has(t), `falta ${t}`);
  }
});

test('una geometria desconocida se reporta, nunca se descarta en silencio', () => {
  const errores = [];
  descomponer({ type: 'Elipse', coordinates: [] }, errores);
  assert.ok(errores.some((e) => e.includes('Elipse')), `se esperaba un error nombrando el tipo, hubo: ${errores}`);
  const r = medir({ type: 'Elipse', coordinates: [] }, P([-75.6, 6.2]));
  assert.equal(r.metros, null);
  assert.ok(r.errores.length > 0);
});

test('geometria ausente o vacia no rompe nada', () => {
  assert.equal(medir(null, P([-75.6, 6.2])).metros, null);
  assert.equal(medir({ type: 'LineString', coordinates: [] }, P([-75.6, 6.2])).metros, null);
  assert.equal(medir(undefined, undefined).metros, null);
});
