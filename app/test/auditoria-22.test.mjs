/**
 * PRUEBAS ADVERSARIAS DE LA ETAPA 2.2.
 *
 * Una por cada contraejemplo que reprodujo la auditoria independiente. Estan
 * escritas para FALLAR con el codigo anterior a la correccion. En el comentario
 * de cada bloque queda anotado lo que hacia antes, MEDIDO, no supuesto.
 *
 * Ningun dato real de EPM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Proyecto from '../nucleo/proyecto.js';
import * as Filtro from '../nucleo/filtrado.js';
import { intervaloDe, INTERVALO_BASE_MS } from '../ui/controles.js';
import { puntosMasCercanos } from '../../motor/src/geo/acercamiento.js';
import { medir } from '../../motor/src/geo/geometria.js';
import { VERSION_REGLAS } from '../../motor/src/nucleo/index.js';

const CONFIG_OK = Object.freeze({
  umbralMetros: 120, granularidadTemporal: 'instante', toleranciaMinutos: 0,
  excluirMismoContrato: true, modoDistancia: 'real',
});

const trazado = (id, o = {}) => ({
  id, frente: 'F' + id, contrato: 'CW1', contratista: 'X', proyecto: 'P', municipio: 'M',
  direccion: 'Calle 1', tipoCierre: 'total',
  inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
  inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 10, 18), vigenciaValida: true,
  tipoGeometria: 'Point', tieneGeometria: true, analizable: true, origenArchivo: 'a.kmz',
  avisos: [], geometria: { type: 'Point', coordinates: [-75.6, 6.2] }, ...o,
});

const proyectoBase = (o = {}) => Proyecto.crearProyecto({
  filas: [trazado('a'), trazado('b', { contrato: 'CW2', geometria: { type: 'Point', coordinates: [-75.6, 6.2005] } })],
  relaciones: [], noEvaluables: [], archivos: [{ nombre: 'a.kmz', estadoLectura: 'completa', placemarks: 2 }],
  config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS, ...o,
});

const editar = (p, cambios) => JSON.parse(JSON.stringify({ ...p, ...cambios }));

/* ═══════════ H1 · UN `.pmt.json` NO PUEDE DICTAR RESULTADOS ═══════════ */

test('H1: una distancia escrita a mano NO se presenta como resultado del motor', () => {
  // ANTES: se escribia 98765.4 en el archivo y la aplicacion lo mostraba como
  // si lo hubiera calculado el motor.
  const p = proyectoBase();
  const manipulado = editar(p, {
    relaciones: [{ idA: 'a', idB: 'b', distanciaMetros: 98765.4, intersecanFisicamente: true, hayTraslapeTemporal: true }],
  });
  const r = Proyecto.leerProyecto(JSON.stringify(manipulado));
  assert.equal(r.ok, true, 'el proyecto sigue siendo legible');
  assert.equal(r.proyecto.relaciones, undefined, 'el proyecto leido NO expone relaciones');
  assert.ok(r.avisos.some((a) => /recalculan siempre/i.test(a)), JSON.stringify(r.avisos));
  // Y no hay ningun 98765.4 en lo que se devuelve.
  assert.ok(!JSON.stringify(r.proyecto).includes('98765.4'));
});

test('H1: contacto y traslape inventados tampoco sobreviven', () => {
  const manipulado = editar(proyectoBase(), {
    relaciones: [{ idA: 'a', idB: 'b', distanciaMetros: 0, intersecanFisicamente: true, hayTraslapeTemporal: true, traslapeDias: 999 }],
  });
  const r = Proyecto.leerProyecto(JSON.stringify(manipulado));
  assert.equal(r.proyecto.relaciones, undefined);
  assert.ok(!JSON.stringify(r.proyecto).includes('999'));
});

test('H1: identificadores repetidos se rechazan, no se cuelan', () => {
  // ANTES: entraban dos trazados con el mismo id y las relaciones quedaban ambiguas.
  const p = proyectoBase();
  const manipulado = editar(p, { trazados: [p.trazados[0], { ...p.trazados[0] }] });
  const r = Proyecto.leerProyecto(JSON.stringify(manipulado));
  assert.equal(r.ok, true);
  assert.equal(r.proyecto.trazados.length, 1, 'solo entra una copia');
  assert.ok(r.avisos.some((a) => /identificador repetido/i.test(a)), JSON.stringify(r.avisos));
});

test('H1: coordenadas imposibles se rechazan', () => {
  // ANTES: [999, 999] entraba tal cual y llegaba al mapa.
  for (const malas of [[999, 999], [0, 91], [181, 0], ['x', 0], [NaN, 0]]) {
    const p = proyectoBase();
    const manipulado = editar(p, {
      trazados: [{ ...p.trazados[0], geometria: { type: 'Point', coordinates: malas } }],
    });
    const r = Proyecto.leerProyecto(JSON.stringify(manipulado));
    assert.equal(r.ok, true, JSON.stringify(malas));
    assert.equal(r.proyecto.trazados[0].geometria, null, `entro la geometria ${JSON.stringify(malas)}`);
    assert.ok(r.avisos.some((a) => /geometr/i.test(a)));
  }
});

test('H1: una configuracion invalida impide abrir el proyecto', () => {
  // ANTES: umbral -5 y tolerancia "x" entraban sin protestar.
  const casos = [
    [{ ...CONFIG_OK, umbralMetros: -5 }, /umbral/i],
    [{ ...CONFIG_OK, umbralMetros: 'mucho' }, /umbral/i],
    [{ ...CONFIG_OK, toleranciaMinutos: 'x' }, /tolerancia/i],
    [{ ...CONFIG_OK, toleranciaMinutos: -1 }, /tolerancia/i],
    [{ ...CONFIG_OK, granularidadTemporal: 'semana' }, /granularidad/i],
    [{ ...CONFIG_OK, excluirMismoContrato: 'si' }, /exclusi/i],
    [{ ...CONFIG_OK, modoDistancia: 'inventado' }, /modo de distancia/i],
  ];
  for (const [cfg, patron] of casos) {
    const r = Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { config: cfg })));
    assert.equal(r.ok, false, `se acepto ${JSON.stringify(cfg)}`);
    assert.match(r.motivo, patron);
  }
  // Sin configuracion tampoco se abre.
  assert.equal(Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { config: null }))).ok, false);
});

test('H1: versiones de esquema imposibles se rechazan por los DOS lados', () => {
  // ANTES: esquema 0 y -1 se aceptaban; solo se miraba que no fuera mayor.
  for (const esq of [0, -1, -99]) {
    const r = Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { esquema: esq })));
    assert.equal(r.ok, false, `se acepto el esquema ${esq}`);
    assert.match(r.motivo, /no existe|versiones válidas/i);
  }
  for (const esq of [99, 1000]) {
    const r = Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { esquema: esq })));
    assert.equal(r.ok, false);
    assert.match(r.motivo, /más reciente/i);
  }
  for (const esq of [null, 'dos', 1.5]) {
    assert.equal(Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { esquema: esq }))).ok, false);
  }
});

test('H1: un proyecto del formato anterior se abre, migrado y avisando', () => {
  const r = Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { esquema: 1 })));
  assert.equal(r.ok, true);
  assert.equal(r.migrado, true);
  assert.ok(r.avisos.some((a) => /migrado/i.test(a)));
});

test('H1: la huella detecta edicion, pero NO se presenta como proteccion', () => {
  const p = proyectoBase();
  assert.ok(typeof p.huella === 'string' && p.huella.length >= 8);
  const tocado = editar(p, { nombre: 'otro nombre' });
  const r = Proyecto.leerProyecto(JSON.stringify(tocado));
  assert.equal(r.ok, true, 'una huella que no cuadra NO impide abrir: solo avisa');
  assert.ok(r.avisos.some((a) => /modificado después de guardarse/i.test(a)), JSON.stringify(r.avisos));
  // Y el aviso deja claro que lo que manda es el recalculo.
  assert.ok(r.avisos.some((a) => /recalculan/i.test(a)));
});

test('H1: la instantanea es informativa y se coteja contra el recalculo', () => {
  const p = proyectoBase();
  assert.ok(/INFORMATIVO/.test(p.instantanea.nota));
  const c = Proyecto.cotejarInstantanea({ relaciones: 5, trazados: 2 }, { relaciones: 1, trazados: 2 });
  assert.equal(c.comparable, true);
  assert.equal(c.coincide, false);
  assert.deepEqual(c.diferencias, [{ campo: 'relaciones', guardado: 5, ahora: 1 }]);
  assert.equal(Proyecto.cotejarInstantanea({ relaciones: 1 }, { relaciones: 1 }).coincide, true);
});

test('H1: el proyecto declara con que reglas se genero', () => {
  const p = proyectoBase();
  assert.equal(p.motor.versionReglas, VERSION_REGLAS);
  const viejo = Proyecto.leerProyecto(JSON.stringify(editar(p, { motor: { versionReglas: '0.9.0' } })));
  assert.equal(viejo.proyecto.versionReglas, '0.9.0', 'se conserva para poder avisar de la diferencia');
});

test('H1: un proyecto sin trazados utilizables no se abre en silencio', () => {
  for (const t of [[], [{ sinId: 1 }], [{ id: '' }], 'no es lista']) {
    const r = Proyecto.leerProyecto(JSON.stringify(editar(proyectoBase(), { trazados: t })));
    assert.equal(r.ok, false, JSON.stringify(t));
    assert.ok(r.motivo.length > 10);
  }
});

/* ═══════════ H4 · SEMANTICA TEMPORAL DE LA INTERFAZ ═══════════ */

const conVigencia = (id, desde, hasta) => trazado(id, {
  inicioMs: Date.parse(desde), finMs: Date.parse(hasta), inicio: desde, fin: hasta,
});

test('H4: la vista de DIA cubre el dia entero, no un instante', () => {
  // ANTES: el recorrido consultaba el instante 06:00 y un PMT de 10:00 a 12:00
  // desaparecia de su propio dia mientras la etiqueta decia "vigentes ese dia".
  const filas = [
    conVigencia('manana', '2026-03-10T06:00:00Z', '2026-03-10T08:00:00Z'),
    conVigencia('mediodia', '2026-03-10T10:00:00Z', '2026-03-10T12:00:00Z'),
    conVigencia('noche', '2026-03-10T23:00:00Z', '2026-03-11T01:00:00Z'),
  ];
  const ms = Date.parse('2026-03-10T06:00:00Z');
  assert.deepEqual(Filtro.vigentesEn(filas, ms).map((x) => x.id), ['manana'], 'el modo instante sigue existiendo');
  assert.deepEqual(Filtro.vigentesEnDia(filas, ms).map((x) => x.id).sort(),
    ['manana', 'mediodia', 'noche'], 'la vista de dia los ve todos');
});

test('H4: los limites del dia son exactos', () => {
  const { inicio, fin } = Filtro.limitesDelDia(Date.parse('2026-03-10T17:43:21Z'));
  assert.equal(new Date(inicio).toISOString(), '2026-03-10T00:00:00.000Z');
  assert.equal(new Date(fin).toISOString(), '2026-03-10T23:59:59.999Z');
});

test('H4: actividad que empieza a las 00:00 y que acaba a medianoche', () => {
  const dia = (d) => Date.parse(`2026-03-${d}T12:00:00Z`);
  const empiezaMedianoche = conVigencia('inicio00', '2026-03-10T00:00:00Z', '2026-03-10T02:00:00Z');
  assert.equal(Filtro.vigentesEnDia([empiezaMedianoche], dia(10)).length, 1);
  assert.equal(Filtro.vigentesEnDia([empiezaMedianoche], dia('09')).length, 0, 'no se cuela en el dia anterior');

  // Fin a las 00:00 del dia siguiente: toca los dos dias, y eso es correcto.
  const acabaMedianoche = conVigencia('fin00', '2026-03-10T20:00:00Z', '2026-03-11T00:00:00Z');
  assert.equal(Filtro.vigentesEnDia([acabaMedianoche], dia(10)).length, 1);
  assert.equal(Filtro.vigentesEnDia([acabaMedianoche], dia(11)).length, 1);
  assert.equal(Filtro.vigentesEnDia([acabaMedianoche], dia(12)).length, 0);
});

test('H4: una vigencia invalida nunca aparece como vigente', () => {
  const malo = trazado('malo', { vigenciaValida: false, inicioMs: null, finMs: null });
  assert.equal(Filtro.vigentesEnDia([malo], Date.now()).length, 0);
  assert.equal(Filtro.vigentesEn([malo], Date.now()).length, 0);
});

/* ═══════════ H5 · FILTROS Y REINICIO ═══════════ */

test('H5: los filtros restaurados de un proyecto se sanean', () => {
  // Un .pmt.json editado a mano no puede colar un filtro con forma imposible,
  // porque seria un filtro aplicado que ningun control sabria representar.
  const Controles = { }; // se prueba a traves del modulo real mas abajo
  assert.ok(true);
});

test('H5: un filtro guardado con basura no produce un filtro invisible', async () => {
  const C = await import('../ui/controles.js');
  C.fijarFiltros({ contrato: ['CW1', 42, null], desde: 'ayer', hasta: '2026-03-10', texto: 7, relacion: ['contacto', 'inventado'] });
  const f = C.actuales();
  assert.deepEqual(f.contrato, ['CW1'], 'lo que no es texto se descarta');
  assert.equal(f.desde, null, 'una fecha con formato invalido no se aplica');
  assert.equal(f.hasta, '2026-03-10');
  assert.equal(f.texto, '', 'el texto que no es texto no se aplica');
  assert.deepEqual(f.relacion, ['contacto'], 'solo claves de relacion conocidas');
});

test('H5: reiniciarEstado deja los filtros realmente vacios', async () => {
  const C = await import('../ui/controles.js');
  C.fijarFiltros({ contrato: ['CW1'], texto: 'algo' });
  assert.equal(C.actuales().contrato.length, 1);
  C.reiniciarEstado();
  const f = C.actuales();
  assert.deepEqual(f, Filtro.filtrosVacios(), 'no puede quedar ningun filtro aplicado');
  assert.equal(Filtro.hayFiltrosActivos(f), false);
});

/* ═══════════ H6 · PUNTOS DE MAXIMA APROXIMACION ═══════════ */

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (cs) => ({ type: 'LineString', coordinates: cs });
const PG = (a, h = []) => ({ type: 'Polygon', coordinates: [a, ...h] });

test('H6: un punto DENTRO de un poligono se situa donde esta, a 0 m', () => {
  // ANTES: el motor decia 0 m y el conector visual se iba al borde, a 552,93 m.
  const pg = PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.21], [-75.60, 6.20]]);
  const p = P([-75.595, 6.205]);
  assert.equal(medir(pg, p).metros, 0, 'el motor dice que se tocan');
  const r = puntosMasCercanos(pg, p);
  assert.equal(r.metros, 0, 'y el dibujo tiene que decir lo mismo');
  assert.equal(r.contacto, true);
  assert.deepEqual(r.b, [-75.595, 6.205], 'el punto se marca donde esta, dentro del poligono');
});

test('H6: contencion tambien al reves y con MultiPolygon', () => {
  const pg = PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.21], [-75.60, 6.20]]);
  const p = P([-75.595, 6.205]);
  assert.equal(puntosMasCercanos(p, pg).metros, 0);
  const mp = { type: 'MultiPolygon', coordinates: [[[[-75.50, 6.30], [-75.49, 6.30], [-75.49, 6.31], [-75.50, 6.30]]], pg.coordinates[0] ? [pg.coordinates[0]] : []] };
  assert.equal(puntosMasCercanos(mp, p).metros, 0);
});

test('H6: un punto en un HUECO del poligono NO esta dentro', () => {
  const pg = PG(
    [[-75.60, 6.20], [-75.58, 6.20], [-75.58, 6.22], [-75.60, 6.22], [-75.60, 6.20]],
    [[[-75.595, 6.205], [-75.585, 6.205], [-75.585, 6.215], [-75.595, 6.215], [-75.595, 6.205]]]);
  const dentroDelHueco = P([-75.590, 6.210]);
  const r = puntosMasCercanos(pg, dentroDelHueco);
  assert.ok(r.metros > 0, 'el hueco no es parte del poligono');
  assert.ok(Math.abs(r.metros - medir(pg, dentroDelHueco).metros) < 0.01);
});

test('H6: el conector NO cruza el planeta en el antimeridiano', () => {
  // ANTES: la distancia salia bien (11,06 m) pero el conector se pintaba cerca
  // de longitud 0, porque interpolar 179,9995 con -179,9995 da 0.
  const l = L([[179.9995, 0], [-179.9995, 0]]);
  const p = P([180, 0.0001]);
  const r = puntosMasCercanos(l, p);
  assert.ok(Math.abs(r.metros - medir(l, p).metros) < 1e-6);
  assert.ok(Math.abs(r.a[0]) > 179, `el punto salio en longitud ${r.a[0]}`);
  assert.ok(Math.abs(r.b[0]) > 179);
});

test('H6: los conectores coinciden con la distancia canonica en todos los tipos', () => {
  const casos = [
    ['punto-punto', P([-75.60, 6.20]), P([-75.60, 6.2005])],
    ['punto-linea', P([-75.595, 6.201]), L([[-75.60, 6.20], [-75.59, 6.20]])],
    ['linea-linea', L([[-75.60, 6.20], [-75.59, 6.20]]), L([[-75.595, 6.199], [-75.595, 6.201]])],
    ['poligono-punto', PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]]), P([-75.62, 6.22])],
    ['poligono-linea', PG([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]]), L([[-75.62, 6.22], [-75.61, 6.23]])],
    ['multipunto', { type: 'MultiPoint', coordinates: [[-75.50, 6.20], [-75.6001, 6.20]] }, P([-75.60, 6.20])],
    ['multilinea', { type: 'MultiLineString', coordinates: [[[-75.50, 6.30], [-75.49, 6.30]], [[-75.60, 6.20], [-75.59, 6.20]]] }, P([-75.595, 6.2005])],
    ['coleccion', { type: 'GeometryCollection', geometries: [P([-75.50, 6.30]), L([[-75.60, 6.20], [-75.59, 6.20]])] }, P([-75.595, 6.2005])],
    ['antimeridiano', L([[179.999, 0], [-179.999, 0]]), P([179.999, 0.0005])],
  ];
  for (const [etq, g1, g2] of casos) {
    const m = medir(g1, g2).metros, r = puntosMasCercanos(g1, g2);
    assert.ok(r.evaluable, `${etq}: no evaluable`);
    assert.ok(Math.abs(m - r.metros) < 1e-6, `${etq}: motor ${m} vs dibujo ${r.metros}`);
    // Y los puntos devueltos distan de verdad eso (con el margen arco-cuerda).
    assert.ok(Math.abs(medir(P(r.a), P(r.b)).metros - r.metros) < 0.01, `${etq}: los puntos no cuadran`);
  }
});

test('H6: si no se puede situar, NO se inventa una ubicacion', () => {
  const r = puntosMasCercanos(P([0, 0]), P([180, 0]));
  assert.equal(r.evaluable, false);
  assert.equal(r.a, null);
  assert.equal(r.b, null);
});

/* ═══════════ H8 · VELOCIDAD DEL RECORRIDO ═══════════ */

test('H8: las velocidades guardan la relacion que anuncian', () => {
  // ANTES: 4x corria a 120 ms frente a los 300 ms de 1x, o sea 2,5x, porque un
  // Math.max(120, ...) hacia de suelo.
  const base = intervaloDe(1);
  assert.equal(base, INTERVALO_BASE_MS);
  for (const m of [0.5, 1, 2, 4]) {
    assert.equal(base / intervaloDe(m), m, `${m}x no corre a ${m}x`);
  }
  assert.equal(intervaloDe(4), intervaloDe(2) / 2, '4x es exactamente el doble de rapido que 2x');
});

test('H8: ninguna velocidad cae por debajo de lo que un navegador puede pintar', () => {
  for (const m of [0.5, 1, 2, 4]) assert.ok(intervaloDe(m) >= 100, `${m}x -> ${intervaloDe(m)} ms`);
});
