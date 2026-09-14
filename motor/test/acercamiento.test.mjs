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

test('el desvio de la vuelta a coordenadas se mantiene acotado A CUALQUIER LARGO', () => {
  // ══ ESTA PRUEBA SUSTITUYE A UNA ANTERIOR, Y CONVIENE SABER POR QUE ════════
  //
  // La version de la Etapa 2.1 dejaba por escrito que el desvio de la vuelta a
  // coordenadas CRECIA con la longitud del tramo, y lo daba por bueno mientras
  // no pasara de unos milimetros al kilometro. Ese crecimiento era, en realidad,
  // el defecto: a 66 km llegaba a 9,4 m y producia un conector de longitud cero
  // rotulado con una distancia que no era cero.
  //
  // Ahora el desvio no crece: cuando la interpolacion en grados se separa de la
  // distancia canonica, la ubicacion se obtiene deshaciendo la proyeccion, que
  // es exacta. Lo que hay que dejar por escrito, por tanto, ya no es como crece
  // el error, sino que ESTA ACOTADO SIEMPRE.
  for (const largo of [0.001, 0.01, 0.1, 0.3, 0.6]) {   // de ~111 m a ~66 km
    const linea = L([[-75.60, 6.20], [-75.60 + largo, 6.20]]);
    const p = P([-75.60 + largo / 2, 6.2010]);
    const r = puntosMasCercanos(linea, p);
    assert.equal(r.ubicado, true, `a ${largo}° deberia poder situarse el acercamiento`);
    const desvio = Math.abs(medir(P(r.a), P(r.b)).metros - r.metros) * 1000;   // mm
    assert.ok(desvio <= 50, `a ${largo}° el desvio fue ${desvio} mm (maximo admitido: 50 mm)`);
  }
});

test('INVARIANTE: si esta ubicado, sus dos puntos distan lo que dice el motor', () => {
  // El caso exacto que encontro la auditoria: un punto que, en grados, cae
  // JUSTO sobre la linea, pero que el motor situa a 9,387513 m porque la recta
  // del plano —que es la que mide— pasa por encima. Antes se devolvia
  // `ubicado: true` con los dos extremos en la misma coordenada.
  const casos = [
    [P([-75.6, 6.2]), L([[-75.9, 6.2], [-75.3, 6.2]])],
    [L([[-75.9, 6.2], [-75.3, 6.2]]), P([-75.6, 6.2])],
    [P([-75.6, 6.2]), L([[-75.9, 6.2], [-75.3, 6.2001]])],
    [P([12.4, 41.9]), L([[12.1, 41.9], [12.7, 41.9]])],
    [P([-75.6, -6.2]), L([[-75.9, -6.2], [-75.3, -6.2]])],
  ];
  for (const [g1, g2] of casos) {
    const r = puntosMasCercanos(g1, g2);
    assert.equal(r.evaluable, true);
    if (!r.ubicado) { assert.equal(r.a, null); assert.equal(r.b, null); continue; }
    const separacion = medir(P(r.a), P(r.b)).metros;
    assert.ok(Math.abs(separacion - r.metros) <= 0.05,
      `dice ${r.metros} m y sus puntos distan ${separacion} m`);
    assert.ok(r.metros === 0 || separacion > 0,
      'una distancia positiva no puede dibujarse como un conector de longitud cero');
  }
});

/* ═══════════ PRUEBA DE PROPIEDAD DEL INVARIANTE DE UBICACION ═══════════
 *
 * El defecto de la Etapa 2.4 no lo habria cazado ningun caso escrito a mano:
 * hacia falta que la linea fuera larga y casi paralela a un paralelo. Por eso
 * aqui no se prueban ejemplos, sino la PROPIEDAD, sobre geometrias generadas:
 *
 *     ubicado === true   ⇒   distanciaGeodesica(a, b) ≈ distancia canonica
 *     ubicado === false  ⇒   a === null y b === null
 *
 * El generador es determinista (semilla fija) para que un fallo se pueda
 * reproducir tal cual, y cubre tramos de metros a decenas de kilometros en
 * varias latitudes, incluidas las dos que rompian el caso original.
 */
test('INVARIANTE (propiedad): la ubicacion dibujada corresponde SIEMPRE a la distancia medida', () => {
  let semilla = 20260912;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return semilla / 0x7fffffff;
  };
  const entre = (a, b) => a + azar() * (b - a);

  const centros = [[-75.6, 6.2], [12.4, 41.9], [-70.0, -33.4], [100.5, 13.7], [-3.7, 40.4]];
  let ubicados = 0, sinUbicar = 0, comprobados = 0;

  for (let i = 0; i < 900; i++) {
    const [lon0, lat0] = centros[i % centros.length];
    // Tramos de ~0,0005° (unos 55 m) a ~0,6° (unos 66 km): el rango donde el
    // efecto arco-cuerda pasa de invisible a decisivo.
    const largo = entre(0.0005, 0.6);
    const linea = L([
      [lon0 - largo / 2, lat0 + entre(-0.0002, 0.0002)],
      [lon0 + largo / 2, lat0 + entre(-0.0002, 0.0002)],
    ]);
    // El punto se coloca cerca del centro del tramo, que es donde mas se
    // separan la recta en grados y la recta del plano.
    const punto = P([lon0 + entre(-largo / 4, largo / 4), lat0 + entre(-0.002, 0.002)]);

    for (const [g1, g2] of [[punto, linea], [linea, punto]]) {   // A/B = B/A
      const r = puntosMasCercanos(g1, g2);
      if (!r.evaluable) continue;
      comprobados++;
      if (!r.ubicado) {
        sinUbicar++;
        assert.equal(r.a, null, 'sin ubicacion fiable no se devuelve ningun punto');
        assert.equal(r.b, null);
        assert.ok(r.metros !== null, 'pero la distancia canonica se conserva');
        continue;
      }
      ubicados++;
      const separacion = medir(P(r.a), P(r.b)).metros;
      assert.ok(Math.abs(separacion - r.metros) <= 0.05,
        `dice ${r.metros} m y sus puntos distan ${separacion} m (tramo ${largo}°)`);
      assert.ok(r.metros === 0 || separacion > 0,
        `distancia ${r.metros} m dibujada como un conector de longitud cero`);
    }
  }

  assert.ok(comprobados > 1500, `solo se comprobaron ${comprobados} casos`);
  assert.ok(ubicados > 0, 'el generador no llego a ubicar ningun acercamiento');
  // Nota: no se exige que `sinUbicar` sea cero. Que a veces no se pueda situar
  // el acercamiento es un resultado legitimo; lo que no se admite es situarlo mal.
  assert.ok(sinUbicar >= 0);
});
