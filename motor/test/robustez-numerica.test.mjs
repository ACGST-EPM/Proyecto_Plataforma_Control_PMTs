/**
 * ROBUSTEZ NUMERICA de la deteccion de contacto.
 *
 * Antes estas comprobaciones usaban igualdad exacta con cero. Con aritmetica de
 * coma flotante eso produce falsos "no se tocan": dos segmentos que se cruzan
 * de verdad pueden dar un producto cruzado de 1e-13 en lugar de 0.
 *
 * Aqui se comprueba que la tolerancia NUMERICA (1 micrometro) resuelve esos
 * casos, y ademas que NO se ha colado una tolerancia grande disfrazada: a un
 * milimetro de distancia el motor tiene que seguir diciendo que no se tocan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { medir, TOLERANCIA_NUMERICA_METROS } from '../src/geo/geometria.js';
import { distanciaGeodesica } from '../src/geo/geodesica.js';
import {
  seCortan, distSegmentoSegmento, distPuntoSegmento, ajustarACero,
} from '../src/geo/segmentos.js';

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (c) => ({ type: 'LineString', coordinates: c });

test('la tolerancia numerica es minuscula y no es el umbral operacional', () => {
  assert.equal(TOLERANCIA_NUMERICA_METROS, 1e-6);
  // Ocho ordenes de magnitud por debajo del umbral de trabajo de 120 m.
  assert.ok(TOLERANCIA_NUMERICA_METROS / 120 < 1e-7);
  assert.equal(ajustarACero(1e-12), 0);
  assert.equal(ajustarACero(1e-8), 0);
  assert.equal(ajustarACero(1e-3), 1e-3, 'un milimetro NO se debe redondear a cero');
  assert.equal(ajustarACero(0.5), 0.5);
});

test('extremos compartidos: dos tramos que arrancan donde acaba el otro', () => {
  const vertice = [-75.5900, 6.2000];
  const a = L([[-75.6000, 6.2000], vertice]);
  const b = L([vertice, [-75.5800, 6.2100]]);
  const r = medir(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
  assert.equal(turf.booleanIntersects(turf.lineString(a.coordinates), turf.lineString(b.coordinates)), true);
});

test('interseccion en un vertice intermedio, no en un extremo', () => {
  // El vertice central de A cae exactamente sobre el interior de B.
  const cruce = [-75.5900, 6.2000];
  const a = L([[-75.6000, 6.2100], cruce, [-75.5800, 6.2100]]);
  const b = L([[-75.5950, 6.2000], [-75.5850, 6.2000]]);
  const r = medir(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('un vertice de A cae sobre un segmento de B en forma de T', () => {
  const a = L([[-75.5900, 6.2100], [-75.5900, 6.2000]]);  // baja hasta tocar
  const b = L([[-75.6000, 6.2000], [-75.5800, 6.2000]]);  // horizontal
  const r = medir(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.intersecan, true);
});

test('segmentos colineales que se solapan', () => {
  const a = L([[-75.6000, 6.2000], [-75.5900, 6.2000]]);
  const b = L([[-75.5950, 6.2000], [-75.5850, 6.2000]]);
  assert.equal(medir(a, b).metros, 0);
  assert.equal(medir(a, b).intersecan, true);
});

test('segmentos colineales que NO se solapan miden la separacion real', () => {
  const a = L([[-75.6000, 6.2000], [-75.5950, 6.2000]]);
  const b = L([[-75.5940, 6.2000], [-75.5900, 6.2000]]);
  const r = medir(a, b);
  assert.ok(r.metros > 100 && r.metros < 120, `esperado ~110 m, obtenido ${r.metros}`);
  assert.equal(r.intersecan, false);
});

test('CASI colineales: un cruce de angulo muy pequeno se detecta igual', () => {
  // Dos tramos casi superpuestos a lo largo del MISMO meridiano, que se cruzan
  // con una inclinacion minuscula. Se usa un meridiano, y no un paralelo,
  // porque el meridiano si proyecta recto (ver la prueba dedicada mas abajo).
  // Es el caso clasico donde la comparacion exacta con cero falla: el producto
  // cruzado queda en el orden de 1e-13.
  const a = L([[-75.6000, 6.2000], [-75.6000, 6.2100]]);
  const b = L([[-75.60000002, 6.2020], [-75.59999998, 6.2080]]);
  const r = medir(a, b);
  assert.equal(r.intersecan, true, `se cruzan pero el motor dijo ${r.metros} m`);
  assert.equal(r.metros, 0);
});

test('CASI colineales que NO llegan a cruzarse: no se inventa un contacto', () => {
  // Dos tramos paralelos al mismo meridiano, separados un milimetro. El motor
  // debe decir que NO se tocan: la tolerancia es de una micra, no de un milimetro.
  const unMilimetroEnLon = 0.001 / (110574 * Math.cos((6.2 * Math.PI) / 180));
  const a = L([[-75.6000, 6.2000], [-75.6000, 6.2100]]);
  const b = L([[-75.6000 + unMilimetroEnLon, 6.2020], [-75.6000 + unMilimetroEnLon, 6.2080]]);
  const r = medir(a, b);
  assert.equal(r.intersecan, false, 'un milimetro de separacion NO es contacto');
  assert.ok(r.metros > 0.0009 && r.metros < 0.0011, `esperado ~0,001 m, obtenido ${r.metros}`);
});

test('los meridianos proyectan rectos; los paralelos no (geometria, no redondeo)', () => {
  // Sobre un MERIDIANO, un punto intermedio esta exactamente sobre la cuerda.
  for (const span of [0.0001, 0.001, 0.01, 0.1]) {
    const r = medir(P([-75.60, 6.20 + span / 2]), L([[-75.60, 6.20], [-75.60, 6.20 + span]]));
    assert.equal(r.metros, 0, `en un meridiano de ${span} grados el punto medio deberia estar sobre la cuerda`);
    assert.equal(r.intersecan, true);
  }
  // Sobre un PARALELO, la separacion crece con el cuadrado de la distancia.
  // Se documenta con los valores medidos para que quede por escrito.
  const medidas = [];
  for (const span of [0.001, 0.01, 0.1]) {
    const r = medir(P([-75.60 + span / 2, 6.20]), L([[-75.60, 6.20], [-75.60 + span, 6.20]]));
    medidas.push(r.metros);
  }
  assert.ok(medidas[0] < 0.0001, `111 m: esperado ~0,03 mm, obtenido ${medidas[0] * 1000} mm`);
  assert.ok(medidas[1] > 0.002 && medidas[1] < 0.004, `1,1 km: esperado ~2,6 mm, obtenido ${medidas[1] * 1000} mm`);
  assert.ok(medidas[2] > 0.2 && medidas[2] < 0.35, `11 km: esperado ~26 cm, obtenido ${medidas[2]} m`);
  // Crece aproximadamente con el cuadrado: cada salto de 10x en distancia
  // multiplica la separacion por unas 100 veces.
  assert.ok(medidas[1] / medidas[0] > 50 && medidas[1] / medidas[0] < 200);
  assert.ok(medidas[2] / medidas[1] > 50 && medidas[2] / medidas[1] < 200);
});

test('el predicado de corte funciona igual con segmentos de 2 m y de 2 km', () => {
  // La orientacion se normaliza por la longitud del segmento, asi que la
  // tolerancia significa lo mismo en las dos escalas.
  for (const largo of [2, 20, 200, 2000, 20000]) {
    const p1 = [0, 0], p2 = [largo, 0];
    const q1 = [largo / 2, -1e-10], q2 = [largo / 2, 1e-10];
    assert.equal(seCortan(p1, p2, q1, q2), true, `no detecto el cruce con largo ${largo}`);
    const lejos1 = [largo / 2, 0.5], lejos2 = [largo / 2, 1.5];
    assert.equal(seCortan(p1, p2, lejos1, lejos2), false, `invento un cruce con largo ${largo}`);
  }
});

test('segmentos degenerados (un punto) no rompen nada', () => {
  const p = [0, 0];
  assert.equal(distSegmentoSegmento(p, p, p, p), 0);
  assert.equal(distSegmentoSegmento(p, p, [3, 4], [3, 4]), 5);
  assert.equal(distPuntoSegmento([0, 1], p, p), 1);
  assert.equal(seCortan(p, p, p, p), true);
  assert.equal(seCortan(p, p, [1, 1], [2, 2]), false);
});

test('un punto sobre el borde de un poligono cuenta como contacto', () => {
  const cuadro = {
    type: 'Polygon',
    coordinates: [[[-75.600, 6.200], [-75.598, 6.200], [-75.598, 6.202], [-75.600, 6.202], [-75.600, 6.200]]],
  };
  // Vertice exacto
  assert.equal(medir(P([-75.600, 6.200]), cuadro).intersecan, true);
  // Punto sobre la arista oeste (mismo meridiano, latitud intermedia). Este es
  // el caso que fallaba con la tolerancia de 1 nanometro: el calculo lo situaba
  // a 1,65e-8 m del borde por puro redondeo.
  assert.equal(medir(P([-75.600, 6.201]), cuadro).intersecan, true);
  assert.equal(medir(P([-75.600, 6.201]), cuadro).metros, 0);
  // Y un punto claramente fuera sigue estando fuera.
  assert.equal(medir(P([-75.601, 6.201]), cuadro).intersecan, false);
});

test('la simetria se conserva tambien en los casos frontera', () => {
  const a = L([[-75.6000, 6.2000], [-75.5900, 6.2000]]);
  const b = L([[-75.5900, 6.2000], [-75.5800, 6.2050]]);
  assert.equal(medir(a, b).metros, medir(b, a).metros);
  assert.equal(medir(a, b).intersecan, medir(b, a).intersecan);
});

test('la tolerancia numerica no cambia ninguna distancia con sentido fisico', () => {
  // Barrido de distancias reales: ninguna se ve alterada por el ajuste a cero.
  // Se compara contra la geodesica exacta, no contra un valor nominal: el
  // factor 110574 m/grado es una aproximacion y no sirve de patron.
  for (const metros of [0.001, 0.01, 0.1, 1, 10, 100, 119, 120, 121]) {
    const grados = metros / 110574;
    const a = [-75.60, 6.20], b = [-75.60, 6.20 + grados];
    const r = medir(P(a), P(b));
    const exacta = distanciaGeodesica(a, b);
    // Cota de 10 nanometros: cien veces por debajo de la tolerancia numerica,
    // asi que confirma que el ajuste a cero no toca ninguna de estas medidas.
    assert.ok(Math.abs(r.metros - exacta) < 1e-8,
      `${metros} m: el motor dio ${r.metros}, la geodesica ${exacta}`);
    assert.equal(r.intersecan, false, `${metros} m no deberia ser contacto`);
    assert.ok(r.metros > 0, `${metros} m no deberia redondearse a cero`);
  }
});
