/**
 * ETAPA 2.3 — DEFECTOS REPRODUCIDOS E INVARIANTES DE APLICACIÓN.
 *
 * La primera mitad fija los siete defectos que reprodujo la auditoría. La
 * segunda los generaliza: en vez de comprobar el ejemplo concreto, comprueba la
 * PROPIEDAD que ese ejemplo violaba, sobre un abanico amplio de casos generados.
 * Un parche cierra un caso; un invariante cierra la familia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Geo from '../nucleo/geojson.js';
import * as T from '../nucleo/tiempo.js';
import * as Proyecto from '../nucleo/proyecto.js';
import * as Filtro from '../nucleo/filtrado.js';
import { resumir } from '../nucleo/resumen.js';
import { puntosMasCercanos } from '../../motor/src/geo/acercamiento.js';
import { medir } from '../../motor/src/geo/geometria.js';
import { calcularRelaciones, VERSION_REGLAS } from '../../motor/src/nucleo/index.js';
import { caja as cajaDe } from '../../motor/src/geo/geometria.js';

const CONFIG = Object.freeze({
  umbralMetros: 120, granularidadTemporal: 'instante', toleranciaMinutos: 0,
  excluirMismoContrato: true, modoDistancia: 'real',
});

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (cs) => ({ type: 'LineString', coordinates: cs });
const PG = (a, h = []) => ({ type: 'Polygon', coordinates: [a, ...h] });
const anillo = (lon, lat, d) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];

const trazado = (id, o = {}) => ({
  id, frente: 'F' + id, contrato: 'CW' + id, contratista: 'X', proyecto: 'P', municipio: 'M',
  direccion: 'Calle 1', tipoCierre: 'total',
  inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
  inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 10, 18), vigenciaValida: true,
  tipoGeometria: 'Point', tieneGeometria: true, analizable: true, origenArchivo: 'a.kmz',
  carpeta: null, avisos: [], geometria: P([-75.6, 6.2]), ...o,
});

const guardarYAbrir = (filas, extra = {}) => {
  const p = Proyecto.crearProyecto({
    filas, relaciones: [], noEvaluables: [], archivos: [], config: CONFIG,
    filtros: null, nombre: 'ida y vuelta', versionReglas: VERSION_REGLAS, ...extra,
  });
  return Proyecto.leerProyecto(JSON.stringify(p));
};

const conRelaciones = (filas) => calcularRelaciones(filas.map((x) => ({
  ...x, caja: x.geometria ? cajaDe(x.geometria) : null, tieneGeometria: !!x.geometria,
  vigencia: { inicioMs: x.inicioMs, finMs: x.finMs, valida: x.vigenciaValida, avisos: [] },
})), CONFIG);

/* ═════════ D1 · GEOMETRÍAS VÁLIDAS NO PUEDEN CAMBIAR AL GUARDAR/ABRIR ═════════ */

const GEOMETRIAS_VALIDAS = [
  ['Point', P([-75.6, 6.2])],
  ['Point 3D', P([-75.6, 6.2, 1500])],
  ['MultiPoint de uno', { type: 'MultiPoint', coordinates: [[-75.6, 6.2]] }],
  ['MultiPoint de varios', { type: 'MultiPoint', coordinates: [[-75.6, 6.2], [-75.5, 6.3]] }],
  ['LineString', L([[-75.6, 6.2], [-75.5, 6.3]])],
  ['MultiLineString de UNA', { type: 'MultiLineString', coordinates: [[[-75.6, 6.2], [-75.5, 6.3]]] }],
  ['MultiLineString de varias', { type: 'MultiLineString', coordinates: [[[-75.6, 6.2], [-75.5, 6.3]], [[-75.4, 6.1], [-75.3, 6.0]]] }],
  ['Polygon de UN anillo', PG(anillo(-75.60, 6.20, 0.01))],
  ['Polygon con hueco', PG(anillo(-75.60, 6.20, 0.02), [anillo(-75.595, 6.205, 0.005)])],
  ['MultiPolygon de UNO', { type: 'MultiPolygon', coordinates: [[anillo(-75.60, 6.20, 0.01)]] }],
  ['MultiPolygon de varios', { type: 'MultiPolygon', coordinates: [[anillo(-75.60, 6.20, 0.01)], [anillo(-75.50, 6.30, 0.01)]] }],
  ['GeometryCollection', { type: 'GeometryCollection', geometries: [P([-75.6, 6.2]), L([[-75.6, 6.2], [-75.5, 6.3]])] }],
];

test('D1: el validador acepta TODOS los tipos válidos, incluidos los de un solo elemento', () => {
  // ANTES: MultiLineString, Polygon y MultiPolygon de UN elemento se rechazaban
  // con «1 coordenada(s) que no son números», porque la heurística confundía
  // una colección de un elemento con una posición.
  for (const [etq, g] of GEOMETRIAS_VALIDAS) {
    const r = Geo.validarGeometria(g);
    assert.equal(r.ok, true, `${etq}: rechazado — ${r.motivo}`);
  }
});

test('D1: INVARIANTE — guardar y abrir conserva la geometría exacta', () => {
  const filas = GEOMETRIAS_VALIDAS.map(([etq, g], i) => trazado(String(i), { geometria: g, frente: etq }));
  const r = guardarYAbrir(filas);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.proyecto.trazados.length, filas.length, 'no se pierde ningún trazado');
  for (const original of filas) {
    const vuelta = r.proyecto.trazados.find((x) => x.id === original.id);
    assert.ok(vuelta, `${original.frente}: desapareció`);
    assert.ok(vuelta.geometria, `${original.frente}: perdió la geometría`);
    assert.ok(Geo.mismaGeometria(original.geometria, vuelta.geometria), `${original.frente}: la geometría cambió`);
  }
});

test('D1: el contraejemplo exacto — Polygon + Point interior conserva su relación', () => {
  // ANTES: 1 relación antes de guardar, 0 después de abrir.
  const filas = [
    trazado('1', { contrato: 'CW1', geometria: PG(anillo(-75.60, 6.20, 0.01)) }),
    trazado('2', { contrato: 'CW2', geometria: P([-75.595, 6.205]) }),
  ];
  const antes = conRelaciones(filas);
  assert.equal(antes.relaciones.length, 1, 'el punto está dentro del polígono');
  assert.equal(antes.relaciones[0].distanciaMetros, 0);

  const r = guardarYAbrir(filas);
  const despues = conRelaciones(r.proyecto.trazados);
  assert.equal(despues.relaciones.length, antes.relaciones.length, 'guardar y abrir cambió el resultado');
  assert.equal(despues.relaciones[0].distanciaMetros, antes.relaciones[0].distanciaMetros);
});

test('D1: INVARIANTE — el análisis es el mismo antes y después del viaje', () => {
  const filas = [
    trazado('a', { contrato: 'CW1', geometria: L([[-75.6000, 6.2000], [-75.5990, 6.2000]]) }),
    trazado('b', { contrato: 'CW2', geometria: P([-75.5995, 6.2004]) }),
    trazado('c', { contrato: 'CW3', geometria: PG(anillo(-75.599, 6.200, 0.001)) }),
    trazado('d', { contrato: 'CW4', geometria: { type: 'MultiLineString', coordinates: [[[-75.5980, 6.2000], [-75.5970, 6.2000]]] } }),
  ];
  const antes = conRelaciones(filas);
  const r = guardarYAbrir(filas);
  const despues = conRelaciones(r.proyecto.trazados);
  const clave = (x) => x.relaciones.map((rel) => [rel.idA, rel.idB, rel.distanciaMetros].join('|')).sort();
  assert.deepEqual(clave(despues), clave(antes), 'las relaciones cambiaron al pasar por el archivo');
  assert.equal(despues.estadisticas.paresNoEvaluablesEspacialmente, antes.estadisticas.paresNoEvaluablesEspacialmente);
});

test('D1: lo inválido sigue rechazándose, con un motivo concreto', () => {
  const malas = [
    ['posición de un solo número', { type: 'Point', coordinates: [-75.6] }],
    ['longitud imposible', P([999, 6.2])],
    ['latitud imposible', P([-75.6, 91])],
    ['línea de un punto', { type: 'LineString', coordinates: [[-75.6, 6.2]] }],
    ['anillo abierto', { type: 'Polygon', coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3]]] }],
    ['anillo de 3 puntos', { type: 'Polygon', coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.6, 6.2]]] }],
    ['MultiPolygon vacío', { type: 'MultiPolygon', coordinates: [] }],
    ['colección vacía', { type: 'GeometryCollection', geometries: [] }],
    ['tipo desconocido', { type: 'Toro', coordinates: [0, 0] }],
    ['coordenada de texto', P(['x', 6.2])],
    ['NaN', P([NaN, 6.2])],
  ];
  for (const [etq, g] of malas) {
    const r = Geo.validarGeometria(g);
    assert.equal(r.ok, false, `${etq}: se aceptó`);
    assert.ok(r.motivo && r.motivo.length > 5, `${etq}: sin motivo`);
  }
});

/* ═════════ D2 · UNA SOLA VERDAD PARA CADA FECHA ═════════ */

test('D2: el ataque exacto — milisegundos de 2030 con texto de 2026', () => {
  // ANTES: la tabla mostraba 2026 y el motor calculaba con 2030.
  //
  // El ataque se hace sobre el ARCHIVO, editándolo a mano, que es como lo hizo
  // la auditoría: `crearProyecto` ya no escribe los milisegundos, así que
  // inyectarlos es exactamente lo que haría alguien con un editor de texto.
  const p = Proyecto.crearProyecto({
    filas: [trazado('a')], relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG, filtros: null, nombre: 'x', versionReglas: VERSION_REGLAS,
  });
  p.trazados[0].inicioMs = Date.UTC(2030, 2, 1, 6);
  p.trazados[0].finMs = Date.UTC(2030, 2, 10, 18);
  const r = Proyecto.leerProyecto(JSON.stringify(p));
  const x = r.proyecto.trazados[0];
  assert.equal(x.inicio, '2026-03-01 06:00:00', 'el texto canónico se conserva');
  assert.equal(x.vigenciaValida, false, 'una vigencia contradictoria no se da por buena');
  assert.equal(x.inicioMs, null, 'y no se calcula con la fecha inventada');
  assert.ok(x.avisos.some((a) => /contradice|contradictorias/i.test(a)), JSON.stringify(x.avisos));
});

test('D2: INVARIANTE — el dato mostrado es el dato con el que se calcula', () => {
  // Se recorre un abanico de fechas: lo que se muestra y lo que se usa para
  // calcular tienen que salir siempre del mismo texto.
  const fechas = [
    '2026-01-01 00:00:00', '2026-03-10 06:30:45', '2026-12-31 23:59:59',
    '2024-02-29 12:00:00', '2026-06-15 24:00:00', '2026-03-01 00:00:00',
  ];
  for (const f of fechas) {
    const filas = [trazado('a', { inicio: f, fin: '2027-01-01 00:00:00', inicioMs: undefined, finMs: undefined })];
    const r = guardarYAbrir(filas);
    const x = r.proyecto.trazados[0];
    assert.ok(x.vigenciaValida, `${f}: se rechazó una fecha válida — ${JSON.stringify(x.avisos)}`);
    // El ms tiene que derivarse EXACTAMENTE del texto que se muestra.
    const derivado = T.normalizarInstante(x.inicio);
    assert.equal(x.inicioMs, derivado.ms, `${f}: el ms no corresponde al texto mostrado`);
  }
});

test('D2: el proyecto NO guarda los milisegundos, para que no haya dos verdades', () => {
  const p = Proyecto.crearProyecto({
    filas: [trazado('a')], relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG, filtros: null, nombre: 'x', versionReglas: VERSION_REGLAS,
  });
  assert.equal(p.trazados[0].inicioMs, undefined, 'los milisegundos son derivados: no se persisten');
  assert.equal(p.trazados[0].finMs, undefined);
  assert.equal(p.trazados[0].inicio, '2026-03-01 06:00:00', 'se persiste el texto canónico');
});

test('D2: fechas adversariales — calendario, 24:00 y zona horaria', () => {
  const casos = [
    ['2026-02-29 06:00:00', false, /inexistente|calendario/i],
    ['2024-02-29 06:00:00', true, null],
    ['2026-04-31 06:00:00', false, /inexistente|calendario/i],
    ['2026-13-01 06:00:00', false, /inexistente|calendario|no se reconoce/i],
    ['2026-03-01 25:00:00', false, /hora/i],
    ['2026-03-01 24:00:00', true, null],
    ['2026-03-01 24:00:01', false, /hora/i],
    ['2026-03-01 06:00:00Z', false, /zona horaria/i],
    ['2026-03-01 06:00:00-05:00', false, /zona horaria/i],
    ['', false, /ausente/i],
  ];
  for (const [texto, valido, patron] of casos) {
    const r = T.normalizarInstante(texto);
    assert.equal(r.ok, valido, `${texto}: se esperaba ${valido ? 'válida' : 'inválida'}`);
    if (patron) assert.match(r.motivo, patron, texto);
  }
});

test('D2: INVARIANTE — el resultado no depende del huso horario del equipo', () => {
  // Todo se interpreta con Date.UTC, que no tiene horario de verano. Se
  // comprueba que el número no dependa del desfase local del proceso.
  const r = T.normalizarInstante('2026-03-08 02:30:00');   // en EEUU ese día hay cambio de hora
  assert.equal(r.ok, true);
  assert.equal(new Date(r.ms).toISOString(), '2026-03-08T02:30:00.000Z');
  assert.equal(r.texto, '2026-03-08 02:30:00', 'ida y vuelta sin desplazamiento');
  // Y la vuelta desde el ms reproduce el mismo texto.
  assert.equal(T.normalizarInstante(r.texto).ms, r.ms);
});

/* ═════════ D4 · ÚLTIMO DÍA SIEMPRE ALCANZABLE ═════════ */

const vig = (desde, hasta) => ({ vigenciaValida: true, inicioMs: Date.parse(desde), finMs: Date.parse(hasta) });

test('D4: el contraejemplo — 1 mar 23:00 a 3 mar 01:00 llega al día 3', () => {
  // ANTES: la duración (26 h) redondeaba a 1 día y el 3 de marzo era inalcanzable.
  const d = Filtro.dominioRecorrido([vig('2026-03-01T23:00:00Z', '2026-03-03T01:00:00Z')]);
  assert.equal(d.dias, 2);
  assert.equal(T.diaDe(d.primerDia + d.dias * T.MS_DIA), '2026-03-03');
});

test('D4: INVARIANTE — el último día con actividad siempre es seleccionable', () => {
  const casos = [
    ['mismo día', '2026-03-10T08:00:00Z', '2026-03-10T17:00:00Z', '2026-03-10'],
    ['dos días', '2026-03-10T08:00:00Z', '2026-03-11T09:00:00Z', '2026-03-11'],
    ['tres días con pocas horas', '2026-03-01T23:00:00Z', '2026-03-03T01:00:00Z', '2026-03-03'],
    ['cruce de mes', '2026-03-30T22:00:00Z', '2026-04-01T02:00:00Z', '2026-04-01'],
    ['cruce de año', '2026-12-31T22:00:00Z', '2027-01-01T02:00:00Z', '2027-01-01'],
    ['febrero bisiesto', '2024-02-28T22:00:00Z', '2024-02-29T23:00:00Z', '2024-02-29'],
    ['acaba a las 00:00', '2026-03-10T20:00:00Z', '2026-03-11T00:00:00Z', '2026-03-11'],
    ['acaba dentro del último día', '2026-03-10T20:00:00Z', '2026-03-12T13:37:00Z', '2026-03-12'],
  ];
  for (const [etq, desde, hasta, ultimoEsperado] of casos) {
    const filas = [vig(desde, hasta)];
    const d = Filtro.dominioRecorrido(filas);
    assert.ok(d, `${etq}: sin dominio`);
    const ultimoMs = d.primerDia + d.dias * T.MS_DIA;
    assert.equal(T.diaDe(ultimoMs), ultimoEsperado, `${etq}: el último día alcanzable no es el correcto`);
    // Y ese día tiene que enseñar de verdad el PMT.
    assert.equal(Filtro.vigentesEnDia(filas, ultimoMs).length, 1, `${etq}: el último día sale vacío`);
  }
});

test('D4: INVARIANTE — todo día del dominio es consultable sin huecos', () => {
  const filas = [vig('2026-02-26T23:00:00Z', '2026-03-02T01:00:00Z')];
  const d = Filtro.dominioRecorrido(filas);
  const dias = [];
  for (let i = 0; i <= d.dias; i++) dias.push(T.diaDe(d.primerDia + i * T.MS_DIA));
  assert.deepEqual(dias, ['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  for (let i = 0; i <= d.dias; i++) {
    assert.equal(Filtro.vigentesEnDia(filas, d.primerDia + i * T.MS_DIA).length, 1, `hueco en ${dias[i]}`);
  }
});

/* ═════════ D5 · SIMETRÍA DE LA APROXIMACIÓN ═════════ */

test('D5: el contraejemplo — polígono contenido en otro, en los dos órdenes', () => {
  const grande = PG(anillo(-75.61, 6.19, 0.03));
  const chico = PG(anillo(-75.60, 6.20, 0.005));
  assert.equal(medir(grande, chico).metros, 0, 'el motor dice que se tocan');
  assert.equal(puntosMasCercanos(grande, chico).metros, 0);
  assert.equal(puntosMasCercanos(chico, grande).metros, 0, 'y en el orden contrario también');
});

test('D5: INVARIANTE — aproximacion(A,B) == aproximacion(B,A), generado al azar', () => {
  // Prueba de propiedad: no un fixture, sino un abanico de geometrías generadas.
  //
  // Las dos geometrías de cada par se colocan cerca de un mismo centro, que es
  // el caso que la propiedad tiene que cubrir: dos PMT de la misma ciudad. Un
  // generador que las esparciera por todo el globo pasaría la mayor parte del
  // tiempo comprobando pares que el motor declara no evaluables por dominio, y
  // apenas ejercitaría la simetría de las distancias.
  const rnd = (a, b) => a + Math.random() * (b - a);
  const genera = (i, cx, cy) => {
    const lon = cx + rnd(-0.02, 0.02), lat = cy + rnd(-0.02, 0.02), d = rnd(0.0005, 0.01);
    switch (i % 6) {
      case 0: return P([lon, lat]);
      case 1: return L([[lon, lat], [lon + d, lat + d]]);
      case 2: return PG(anillo(lon, lat, d));
      case 3: return { type: 'MultiPoint', coordinates: [[lon, lat], [lon + d, lat]] };
      case 4: return { type: 'MultiPolygon', coordinates: [[anillo(lon, lat, d)]] };
      default: return { type: 'MultiLineString', coordinates: [[[lon, lat], [lon + d, lat]]] };
    }
  };

  let comprobados = 0, peor = 0, noEvaluables = 0;
  for (let i = 0; i < 900; i++) {
    const cx = rnd(-76, -75), cy = rnd(6, 7);
    const a = genera(i, cx, cy), b = genera(i + 3, cx, cy);
    const ab = puntosMasCercanos(a, b), ba = puntosMasCercanos(b, a);

    // La evaluabilidad tampoco puede depender del orden.
    assert.equal(ab.evaluable, ba.evaluable, `caso ${i}: evaluabilidad asimétrica`);
    if (!ab.evaluable) {
      noEvaluables++;
      assert.equal(ab.a, null, `caso ${i}: sin poder medir, no se puede inventar una ubicación`);
      assert.equal(ba.a, null);
      continue;
    }
    comprobados++;
    const dif = Math.abs(ab.metros - ba.metros);
    if (dif > peor) peor = dif;
    assert.equal(ab.metros, ba.metros, `caso ${i}: A,B=${ab.metros} pero B,A=${ab.metros}`);

    // Y la distancia es SIEMPRE la del motor, en los dos órdenes.
    const canonica = medir(a, b).metros;
    assert.equal(ab.metros, canonica, `caso ${i}: el dibujo se separó del motor`);
    assert.equal(ba.metros, medir(b, a).metros, `caso ${i}: idem en el orden contrario`);

    // Si se dibuja una ubicación, tiene que corresponderse con esa distancia.
    if (ab.ubicado) {
      const comprobacion = medir(P(ab.a), P(ab.b)).metros;
      assert.ok(Math.abs(comprobacion - ab.metros) < 0.05,
        `caso ${i}: dice ${ab.metros} m pero sus puntos distan ${comprobacion} m`);
    }
  }
  assert.ok(comprobados > 800, `solo se pudieron comprobar ${comprobados} de 900 casos`);
  assert.equal(peor, 0, `la peor asimetría fue ${peor} m`);
});

test('D5: INVARIANTE — lo no evaluable es no evaluable en los dos órdenes', () => {
  // El caso contrario del anterior: pares deliberadamente fuera del dominio.
  const lejanos = [
    [P([0, 0]), P([180, 0])],
    [P([-75.6, 6.2]), P([-75.6, 9.0])],
    [L([[0, 0], [0.001, 0]]), P([120, 45])],
    [PG(anillo(-75.60, 6.20, 0.01)), PG(anillo(20, 40, 0.01))],
  ];
  for (const [a, b] of lejanos) {
    const ab = puntosMasCercanos(a, b), ba = puntosMasCercanos(b, a);
    assert.equal(ab.evaluable, false, `${a.type} vs ${b.type}: debería ser no evaluable`);
    assert.equal(ba.evaluable, false, 'y también en el orden contrario');
    assert.equal(medir(a, b).metros, null, 'el motor dice lo mismo');
    assert.equal(ab.a, null);
    assert.equal(ab.metros, null);
  }
});

test('D5: contención en todas sus formas', () => {
  const grande = PG(anillo(-75.61, 6.19, 0.03));
  const chico = PG(anillo(-75.60, 6.20, 0.005));
  const conHueco = PG(anillo(-75.61, 6.19, 0.03), [anillo(-75.60, 6.20, 0.005)]);
  const multi = { type: 'MultiPolygon', coordinates: [[anillo(-75.60, 6.20, 0.005)]] };
  const casos = [
    ['A dentro de B', chico, grande],
    ['B dentro de A', grande, chico],
    ['solapamiento parcial', PG(anillo(-75.60, 6.20, 0.01)), PG(anillo(-75.595, 6.205, 0.01))],
    ['fronteras coincidentes', PG(anillo(-75.60, 6.20, 0.01)), PG(anillo(-75.60, 6.20, 0.01))],
    ['Polygon vs MultiPolygon', grande, multi],
    ['MultiPolygon vs Polygon', multi, grande],
  ];
  for (const [etq, a, b] of casos) {
    const ab = puntosMasCercanos(a, b), ba = puntosMasCercanos(b, a), m = medir(a, b).metros;
    assert.equal(ab.metros, ba.metros, `${etq}: asimétrico`);
    assert.ok(Math.abs(ab.metros - m) < 1e-6, `${etq}: motor ${m}, dibujo ${ab.metros}`);
    if (m === 0) {
      assert.equal(ab.contacto, true, `${etq}: hay contacto y no se marca`);
      assert.ok(ab.a && ab.b, `${etq}: contacto sin ubicación`);
    }
  }
  // El hueco NO es interior: un punto en el hueco está fuera del polígono.
  const enHueco = P([-75.6025, 6.2025]);
  const r = puntosMasCercanos(conHueco, enHueco);
  assert.ok(Math.abs(r.metros - medir(conHueco, enHueco).metros) < 1e-6);
});

/* ═════════ D6 · RESUMEN = DETALLE ═════════ */

const relFalsa = (o = {}) => ({ idA: 'a', idB: 'b', distanciaMetros: 50, intersecanFisicamente: false,
  dentroDelUmbral: true, traslapeEvaluable: true, hayTraslapeTemporal: false, ...o });

test('D6: el contraejemplo — la tarjeta de no evaluables coincide con su tabla', () => {
  // ANTES: detalle 1, tarjeta 0, porque la tarjeta solo miraba `relaciones` y
  // los no evaluables llegan en una colección aparte.
  const noEval = [{ idA: 'x', idB: 'y', contratoA: 'CW1', contratoB: 'CW2' }];
  const r = resumir({ calidad: {}, estadisticas: {} }, [trazado('a')], [], noEval);
  assert.equal(r.espacialNoEval, 1);
  assert.equal(r.noEvaluables.length, 1);
  assert.equal(r.espacialNoEval, r.noEvaluables.length, 'tarjeta y detalle tienen que salir del mismo sitio');
});

test('D6: INVARIANTE — resumen = detalle, con 0, 1 y varios', () => {
  for (const n of [0, 1, 2, 7]) {
    const noEval = Array.from({ length: n }, (_, i) => ({ idA: 'a' + i, idB: 'b' + i }));
    const r = resumir({ calidad: {}, estadisticas: {} }, [trazado('a')], [], noEval);
    assert.equal(r.espacialNoEval, n, `con ${n} no evaluables la tarjeta dice ${r.espacialNoEval}`);
    assert.equal(r.noEvaluables.length, n);
  }
});

test('D6: INVARIANTE — cada cifra del resumen cuadra con su colección', () => {
  const relaciones = [
    relFalsa({ intersecanFisicamente: true, distanciaMetros: 0 }),
    relFalsa({ hayTraslapeTemporal: true }),
    relFalsa({ intersecanFisicamente: true, distanciaMetros: 0, hayTraslapeTemporal: true }),
    relFalsa({ traslapeEvaluable: false }),
  ];
  const noEval = [{ idA: 'p', idB: 'q' }, { idA: 'r', idB: 's' }];
  const filas = [trazado('1'), trazado('2', { contrato: 'CW2', municipio: 'Otro' })];
  const r = resumir({ calidad: {}, estadisticas: {} }, filas, relaciones, noEval);

  assert.equal(r.pmts, filas.length);
  assert.equal(r.relaciones, relaciones.length);
  assert.equal(r.contacto, relaciones.filter((x) => x.intersecanFisicamente).length);
  assert.equal(r.aLaVez, relaciones.filter((x) => x.hayTraslapeTemporal).length);
  assert.equal(r.temporalNoEval, relaciones.filter((x) => x.traslapeEvaluable === false).length);
  assert.equal(r.espacialNoEval, noEval.length);
  assert.equal(r.contratos, new Set(filas.map((x) => x.contrato)).size);
  assert.equal(r.municipios, new Set(filas.map((x) => x.municipio)).size);
});

test('D6: INVARIANTE — el resumen respeta el alcance que se le pasa', () => {
  // Es lo que garantiza que el informe filtrado no muestre las cifras globales.
  const todas = [relFalsa(), relFalsa({ intersecanFisicamente: true, distanciaMetros: 0 })];
  const completo = resumir({ calidad: {}, estadisticas: {} }, [trazado('a'), trazado('b')], todas, [{ idA: 'x', idB: 'y' }]);
  const parcial = resumir({ calidad: {}, estadisticas: {} }, [trazado('a')], [todas[0]], []);
  assert.equal(completo.relaciones, 2);
  assert.equal(parcial.relaciones, 1);
  assert.equal(completo.espacialNoEval, 1);
  assert.equal(parcial.espacialNoEval, 0, 'el alcance reducido no arrastra cifras globales');
});

/* ═════════ D7 · NINGÚN FILTRO INVISIBLE ═════════ */

test('D7: el contraejemplo — 2026-99-99 no puede quedar aplicado', async () => {
  const C = await import('../ui/controles.js');
  C.fijarFiltros({ desde: '2026-99-99' });
  assert.equal(C.actuales().desde, null, 'una fecha imposible no puede filtrar');
  assert.ok(C.filtrosRechazados().some((m) => /no existe en el calendario/i.test(m)), JSON.stringify(C.filtrosRechazados()));
});

test('D7: INVARIANTE — solo pasan fechas que existen de verdad', async () => {
  const C = await import('../ui/controles.js');
  const casos = [
    ['2026-99-99', false], ['2026-02-29', false], ['2024-02-29', true],
    ['2026-04-31', false], ['2026-13-01', false], ['2026-00-10', false],
    ['2026-03-32', false], ['2026-3-1', false], ['ayer', false],
    ['2026-03-10', true], ['2000-02-29', true], ['1900-02-29', false],
  ];
  for (const [f, valido] of casos) {
    C.fijarFiltros({ desde: f });
    assert.equal(C.actuales().desde, valido ? f : null, `${f}: se esperaba ${valido ? 'aceptada' : 'rechazada'}`);
  }
});

test('D7: un rango invertido no se aplica a medias', async () => {
  const C = await import('../ui/controles.js');
  C.fijarFiltros({ desde: '2026-05-10', hasta: '2026-05-01' });
  assert.equal(C.actuales().desde, null);
  assert.equal(C.actuales().hasta, null, 'o se aplican los dos extremos o ninguno');
  assert.ok(C.filtrosRechazados().some((m) => /invertido/i.test(m)));
});

test('D7: INVARIANTE — todo filtro restaurado es representable', async () => {
  const C = await import('../ui/controles.js');
  C.fijarFiltros({
    contrato: ['CW1', 42, null, {}], contratista: 'no es lista',
    relacion: ['contacto', 'inventado'], desde: '2026-99-99', hasta: '2026-03-10',
    texto: { objeto: true },
  });
  const f = C.actuales();
  assert.deepEqual(f.contrato, ['CW1']);
  assert.deepEqual(f.contratista, []);
  assert.deepEqual(f.relacion, ['contacto']);
  assert.equal(f.desde, null);
  assert.equal(f.hasta, '2026-03-10');
  assert.equal(f.texto, '');
  // Y todo lo descartado se puede contar al usuario.
  assert.ok(C.filtrosRechazados().length > 0);
});

/* ═════════ INVARIANTES TRANSVERSALES ═════════ */

test('INVARIANTE: un dato derivado nunca sustituye al motor', () => {
  const filas = [
    trazado('1', { contrato: 'CW1', geometria: P([-75.6000, 6.2000]) }),
    trazado('2', { contrato: 'CW2', geometria: P([-75.6000, 6.2005]) }),
  ];
  const p = Proyecto.crearProyecto({
    filas, relaciones: [{ idA: '1', idB: '2', distanciaMetros: 12345 }], noEvaluables: [],
    archivos: [], config: CONFIG, filtros: null, nombre: 'x', versionReglas: VERSION_REGLAS,
  });
  assert.equal(p.relaciones, undefined, 'el proyecto no persiste relaciones');
  const r = Proyecto.leerProyecto(JSON.stringify({ ...p, relaciones: [{ idA: '1', idB: '2', distanciaMetros: 12345 }] }));
  assert.equal(r.proyecto.relaciones, undefined, 'y al leerlo tampoco las expone');
  const recalculado = conRelaciones(r.proyecto.trazados);
  assert.ok(Math.abs(recalculado.relaciones[0].distanciaMetros - 55.29) < 1, 'manda el motor');
});

test('INVARIANTE: guardar y abrir no cambia la semántica de ningún campo', () => {
  const original = trazado('a', {
    frente: 'Frente con acentos áéí', contratista: 'CONSORCIO X', proyecto: 'PRY',
    municipio: 'Medellín', direccion: 'Cra 80 # 30-15', tipoCierre: 'ingreso y salida',
    carpeta: 'Etapa 3', geometria: PG(anillo(-75.60, 6.20, 0.01)),
  });
  const r = guardarYAbrir([original]);
  const vuelta = r.proyecto.trazados[0];
  for (const campo of ['id', 'frente', 'contrato', 'contratista', 'proyecto', 'municipio',
    'direccion', 'tipoCierre', 'inicio', 'fin', 'origenArchivo', 'carpeta']) {
    assert.equal(vuelta[campo], original[campo], `el campo ${campo} cambió`);
  }
  assert.equal(vuelta.inicioMs, original.inicioMs, 'los milisegundos derivados coinciden');
  assert.equal(vuelta.vigenciaValida, true);
  assert.ok(Geo.mismaGeometria(vuelta.geometria, original.geometria));
});
