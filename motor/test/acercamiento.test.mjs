/**
 * Puntos mas cercanos (Etapa 2.1) — extension ADITIVA, solo para dibujar.
 *
 * La prueba central es la ultima: la distancia que calcula este modulo tiene
 * que coincidir con `medir()` SIEMPRE. Si se desviara, el mapa estaria pintando
 * una distancia distinta de la que se analiza, y eso es peor que no pintarla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { puntosMasCercanos } from '../src/geo/acercamiento.js';
import { medir } from '../src/geo/geometria.js';

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (cs) => ({ type: 'LineString', coordinates: cs });
const PG = (a, h = []) => ({ type: 'Polygon', coordinates: [a, ...h] });

const cerca = (x, y, tol = 1e-9) => Math.abs(x - y) <= tol;

test('punto a punto: los puntos devueltos son los propios puntos', () => {
  const a = [-75.600, 6.200], b = [-75.600, 6.2005];
  const r = puntosMasCercanos(P(a), P(b));
  assert.deepEqual(r.a, a);
  assert.deepEqual(r.b, b);
  assert.equal(r.evaluable, true);
  assert.ok(cerca(r.metros, medir(P(a), P(b)).metros));
});

test('punto a linea: el punto de la linea NO es un vertice, es la perpendicular', () => {
  // El pie de la perpendicular cae en mitad del tramo: un conector de centro a
  // centro lo pintaria en otro sitio, y esa es justo la mentira que se corrige.
  const p = P([-75.5950, 6.2010]);
  const l = L([[-75.60, 6.20], [-75.59, 6.20]]);
  const r = puntosMasCercanos(p, l);
  assert.ok(cerca(r.b[1], 6.20, 1e-9), 'cae sobre la linea');
  assert.ok(r.b[0] > -75.60 && r.b[0] < -75.59, 'y entre los dos vertices, no en uno de ellos');
  assert.ok(cerca(r.metros, medir(p, l).metros));
});

test('lineas que se cruzan: el punto devuelto es el cruce, y la distancia es cero', () => {
  const a = L([[-75.60, 6.20], [-75.59, 6.20]]);
  const b = L([[-75.595, 6.199], [-75.595, 6.201]]);
  const r = puntosMasCercanos(a, b);
  assert.equal(r.metros, 0);
  assert.equal(r.contacto, true);
  assert.ok(cerca(r.a[0], -75.595, 1e-6) && cerca(r.a[1], 6.20, 1e-6), JSON.stringify(r.a));
  // Los dos extremos del conector caen practicamente en el mismo sitio.
  assert.ok(Math.hypot(r.a[0] - r.b[0], r.a[1] - r.b[1]) < 1e-6);
});

test('poligono: se mide contra su borde, y el punto cae en el borde', () => {
  const pg = PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.21], [-75.60, 6.20]]);
  const p = P([-75.61, 6.205]);
  const r = puntosMasCercanos(pg, p);
  assert.ok(cerca(r.a[0], -75.60, 1e-9), 'el punto del poligono esta en su lado oeste');
  assert.deepEqual(r.b, [-75.61, 6.205]);
  assert.ok(cerca(r.metros, medir(pg, p).metros));
});

test('es simetrico: invertir los argumentos intercambia los puntos', () => {
  const a = L([[-75.60, 6.20], [-75.59, 6.20]]);
  const b = P([-75.595, 6.201]);
  const x = puntosMasCercanos(a, b), y = puntosMasCercanos(b, a);
  assert.ok(cerca(x.metros, y.metros));
  assert.deepEqual(x.a, y.b);
  assert.deepEqual(x.b, y.a);
});

test('NO EVALUABLE: fuera del dominio no se inventa una ubicacion', () => {
  const r = puntosMasCercanos(P([0, 0]), P([180, 0]));
  assert.equal(r.evaluable, false);
  assert.equal(r.a, null);
  assert.equal(r.b, null);
  assert.equal(r.metros, null);
});

test('sin geometria util devuelve vacio, no lanza', () => {
  for (const g of [null, {}, { type: 'Point' }, { type: 'LineString', coordinates: [] }]) {
    const r = puntosMasCercanos(g, P([0, 0]));
    assert.equal(r.evaluable, false);
    assert.equal(r.a, null);
  }
});

test('MultiGeometry: gana la parte que de verdad esta mas cerca', () => {
  const multi = { type: 'MultiPoint', coordinates: [[-75.50, 6.20], [-75.6001, 6.2000]] };
  const p = P([-75.600, 6.200]);
  const r = puntosMasCercanos(multi, p);
  assert.deepEqual(r.a, [-75.6001, 6.2000], 'la parte lejana no puede ganar');
  assert.ok(cerca(r.metros, medir(multi, p).metros));
});

test('INVARIANTE: la distancia coincide con medir() en un barrido amplio', () => {
  // Esta es la prueba que impide que el dibujo se separe del analisis.
  let peor = 0, casos = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 600; i++) {
    const lon = rnd(-80, -70), lat = rnd(0, 10);
    const g1 = i % 3 === 0 ? P([lon, lat])
      : i % 3 === 1 ? L([[lon, lat], [lon + rnd(-0.01, 0.01), lat + rnd(-0.01, 0.01)]])
        : L([[lon, lat], [lon + 0.004, lat + 0.002], [lon + 0.008, lat - 0.001]]);
    const g2 = i % 2 === 0 ? P([lon + rnd(-0.01, 0.01), lat + rnd(-0.01, 0.01)])
      : L([[lon + rnd(-0.01, 0.01), lat + rnd(-0.01, 0.01)], [lon + rnd(-0.01, 0.01), lat + rnd(-0.01, 0.01)]]);
    const m = medir(g1, g2), c = puntosMasCercanos(g1, g2);
    if (m.metros === null) { assert.equal(c.evaluable, false); continue; }
    casos++;
    const dif = Math.abs(m.metros - c.metros);
    if (dif > peor) peor = dif;
  }
  assert.ok(casos > 500, `se probaron ${casos} casos`);
  assert.ok(peor < 1e-6, `la mayor diferencia con medir() fue ${peor} m`);
});

test('los puntos devueltos estan de verdad a esa distancia', () => {
  // Comprueba la vuelta a coordenadas: medir los dos puntos devueltos tiene que
  // dar practicamente la misma distancia que el propio calculo.
  //
  // TOLERANCIA DE 1 cm, Y POR QUE NO ES MENOR: no es redondeo, es el efecto
  // ARCO CONTRA CUERDA que el motor ya documenta en `segmentos.js`. Un tramo
  // entre dos puntos de la misma latitud es una RECTA en el plano metrico, pero
  // el paralelo es una CURVA; la separacion crece con el cuadrado de la
  // longitud del tramo: 0,03 mm en 111 m, 2,6 mm en 1,1 km, 26 cm en 11 km.
  // Al devolver el punto interpolando sobre el segmento geografico original se
  // hereda exactamente esa diferencia. Solo afecta a DONDE se pinta el extremo
  // de una linea, unos milimetros sobre un trazado de cientos de metros, y no
  // entra en ningun calculo. La distancia analizada sigue siendo la de medir(),
  // que la prueba anterior comprueba con tolerancia de 1 micrometro.
  const casos = [
    [L([[-75.60, 6.20], [-75.59, 6.20]]), P([-75.595, 6.2010])],
    [L([[-75.60, 6.20], [-75.59, 6.205]]), L([[-75.598, 6.203], [-75.592, 6.199]])],
    [PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]]), P([-75.62, 6.22])],
  ];
  for (const [g1, g2] of casos) {
    const r = puntosMasCercanos(g1, g2);
    const comprobacion = medir(P(r.a), P(r.b)).metros;
    assert.ok(Math.abs(comprobacion - r.metros) < 0.01,
      `devuelve ${r.metros} m pero sus puntos distan ${comprobacion} m`);
  }
});

test('el desvio de la vuelta a coordenadas crece con el tramo, como manda la geometria', () => {
  // Deja por escrito que el efecto es el documentado y no una deriva nueva.
  const medidas = [];
  for (const largo of [0.001, 0.01, 0.1]) {           // ~111 m, ~1,1 km, ~11 km
    const linea = L([[-75.60, 6.20], [-75.60 + largo, 6.20]]);
    const p = P([-75.60 + largo / 2, 6.2010]);
    const r = puntosMasCercanos(linea, p);
    medidas.push(Math.abs(medir(P(r.a), P(r.b)).metros - r.metros) * 1000);   // mm
  }
  assert.ok(medidas[0] < 0.1, `a 111 m el desvio fue ${medidas[0]} mm`);
  assert.ok(medidas[1] < 10, `a 1,1 km el desvio fue ${medidas[1]} mm`);
  assert.ok(medidas[1] > medidas[0] && medidas[2] > medidas[1], 'crece con la longitud del tramo');
});
