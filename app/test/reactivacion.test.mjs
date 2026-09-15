/**
 * REACTIVACIONES, IDENTIDAD Y SEMÁNTICA OPERATIVO / HISTÓRICO.
 *
 * Las dos ideas que se prueban aquí una y otra vez:
 *
 *   1. REACTIVAR REUTILIZA EL TRAZADO, no lo vuelve a dibujar. Un trazado que
 *      se mueve solo no lo ve nadie y cambia todas las distancias medidas.
 *   2. «Vigente», «vencido» y «futuro» son propiedades RESPECTO DE UNA FECHA.
 *      Ocultar un histórico en la vista de hoy no puede borrar el hecho de que
 *      existió, y volver a mirar su fecha tiene que devolverlo entero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Id from '../nucleo/identidad-pmt.js';
import * as T from '../nucleo/temporalidad.js';
import { estadoDocumental, ESTADO_DOC } from '../../motor/src/modelo/documental.js';

const dia = (a, m, d) => Date.UTC(a, m - 1, d);
const txt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const pmt = (id, o = {}) => ({
  id, frente: 'F-' + id, contrato: 'CW1', contratista: 'X', proyecto: 'P',
  municipio: 'Medellín', direccion: 'Cra 1', tipoCierre: 'total',
  inicio: txt(dia(2025, 1, 10)), fin: txt(dia(2025, 2, 15)),
  inicioMs: dia(2025, 1, 10), finMs: dia(2025, 2, 15), vigenciaValida: true,
  geometria: { type: 'LineString', coordinates: [[-75.6, 6.2], [-75.599, 6.2001]] },
  tipoGeometria: 'LineString', tieneGeometria: true, analizable: true, avisos: [],
  ...o,
});

/* ═══════════════ A · IDENTIDAD ═══════════════ */

test('A · un trazado SIN identidad explícita es su propia base, con una activación', () => {
  const x = pmt('kmz_1');
  assert.equal(Id.baseDe(x), 'kmz_1', 'no se inventa un identificador nuevo');
  assert.equal(Id.esReactivacion(x), false);
  const bases = Id.agruparPorBase([x]);
  assert.equal(bases.size, 1);
  assert.equal(bases.get('kmz_1').veces, 1);
});

test('A · dos geometrías IDÉNTICAS no se dan por el mismo PMT', () => {
  // Puede haber dos cierres distintos exactamente en el mismo sitio. Afirmar
  // que son el mismo PMT reactivado sería inventar un parentesco.
  const a = pmt('kmz_1');
  const b = pmt('kmz_2', { contrato: 'CW2' });
  assert.equal(Id.mismaGeometria(a.geometria, b.geometria), true, 'la geometría SÍ es la misma');
  assert.notEqual(Id.baseDe(a), Id.baseDe(b), 'y aun así son bases distintas');
  assert.equal(Id.agruparPorBase([a, b]).size, 2);
});

/* ═══════════════ B · REACTIVAR ═══════════════ */

test('B · reactivar reutiliza la geometría EXACTAMENTE, coordenada a coordenada', () => {
  const origen = pmt('base_a');
  const r = Id.prepararReactivacion(origen, {
    inicio: txt(dia(2025, 5, 1)), fin: txt(dia(2025, 5, 20)),
  });
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.datos.geometria, origen.geometria);
  assert.equal(Id.mismaGeometria(r.datos.geometria, origen.geometria), true);
  // Y es una COPIA: editar la nueva no puede tocar la anterior.
  r.datos.geometria.coordinates[0][0] = -99;
  assert.equal(origen.geometria.coordinates[0][0], -75.6, 'la original quedó intacta');
});

test('B · reactivar hereda la identidad y NO DECIDE sobre los documentos', () => {
  const origen = pmt('base_a', { resolucionPmt: 'RES-1', permisoRotura: 'PR-1' });
  const r = Id.prepararReactivacion(origen, { inicio: txt(dia(2025, 5, 1)), fin: txt(dia(2025, 5, 20)) });
  for (const k of ['contrato', 'contratista', 'proyecto', 'frente', 'municipio', 'direccion', 'tipoCierre']) {
    assert.equal(r.datos[k], origen[k], `no heredó «${k}»`);
  }
  assert.equal(r.datos.idBase, 'base_a');

  // ══ CADA VIGENCIA LLEVA LOS SUYOS, Y LA ANTERIOR QUEDA COMO HISTORIA ══
  //
  // Regla dada por la responsable funcional del proceso: cada PMT y cada
  // reactivación tienen una resolución independiente, y lo mismo el permiso de
  // rotura. Así que no se copia —haría pasar por tramitado lo que no lo está—
  // y tampoco se borra: que la activación anterior tuviera ese número es un
  // hecho de la historia del PMT.
  assert.equal(r.datos.resolucionPmt, null, 'sin código PROPIO: nadie ha tramitado nada aquí');
  assert.equal(r.datos.permisoRotura, null);
  assert.deepEqual(r.datos.documentosPrevios,
    { resolucionPmt: 'RES-1', permisoRotura: 'PR-1', cierrePermisoRotura: null },
    'la historia de la activación anterior SE CONSERVA, en su propio sitio');

  // Y el estado derivado dice exactamente lo que hay que hacer: tramitarlos.
  const e = estadoDocumental(r.datos);
  const res = e.detalle.find((d) => d.clave === 'resolucionPmt');
  assert.equal(res.estado, ESTADO_DOC.PENDIENTE, 'esta vigencia necesita la suya');
  assert.equal(res.codigo, null, 'no tiene código propio');
  assert.equal(res.codigoPrevio, 'RES-1', 'y el anterior viaja con su propio nombre');
  assert.equal(e.registrados, 0, 'lo de la activación anterior NO cuenta como registrado');
  assert.equal(e.pendientes.length, 3, 'faltan los tres, no dos');
  assert.equal(e.conPrevio, 2, 'y la historia se cuenta aparte');
  assert.equal(e.resumen, '0/3');
  assert.equal(e.completo, false);
});

test('B · el documento de la activación anterior no se puede hacer pasar por tramitado', () => {
  // La historia va en `documentosPrevios`, nunca en el campo del código. Si
  // ocupara el campo, en la siguiente lectura sería indistinguible de uno
  // tramitado para esta vigencia, y bastaría pulsar «guardar» para dar por
  // amparada una vigencia que no lo está.
  const origen = pmt('base_a', { resolucionPmt: 'RES-1' });
  const r = Id.prepararReactivacion(origen, {});
  assert.ok(!('resolucionPmt' in r.datos) || r.datos.resolucionPmt === null);
  // Y cuando SÍ se tramita el de esta vigencia, manda el suyo y el anterior
  // deja de mostrarse: ya no hace falta la referencia.
  const conPropio = estadoDocumental({ ...r.datos, resolucionPmt: 'RES-2' });
  const d = conPropio.detalle.find((x) => x.clave === 'resolucionPmt');
  assert.equal(d.estado, ESTADO_DOC.REGISTRADO);
  assert.equal(d.codigo, 'RES-2');
  assert.equal(d.codigoPrevio, null);
});

test('B · el estado documental sin historia previa se comporta como siempre', () => {
  // Un PMT que viene de un KMZ no tiene `documentosPrevios`: nada cambia.
  const e = estadoDocumental({ resolucionPmt: 'RES-9' });
  assert.equal(e.registrados, 1);
  assert.equal(e.conPrevio, 0);
  assert.equal(e.resumen, '1/3');
  assert.deepEqual(e.pendientes, ['permisoRotura', 'cierrePermisoRotura']);
  assert.deepEqual(e.clavesConPrevio, []);
});

test('B · un PMT sin trazado NO se puede reactivar, y se dice por qué', () => {
  const r = Id.prepararReactivacion(pmt('x', { geometria: null }), {});
  assert.equal(r.ok, false);
  assert.match(r.motivo, /trazado/);
});

test('B · reactivar tres veces da UNA base y TRES activaciones', () => {
  const base = pmt('base_a', { idBase: 'base_a', activacion: { numero: 1 } });
  const a2 = pmt('act_2', {
    idBase: 'base_a', activacion: { numero: 2 },
    inicio: txt(dia(2025, 5, 1)), fin: txt(dia(2025, 5, 20)),
    inicioMs: dia(2025, 5, 1), finMs: dia(2025, 5, 20),
  });
  const a3 = pmt('act_3', {
    idBase: 'base_a', activacion: { numero: 3 },
    inicio: txt(dia(2026, 3, 4)), fin: txt(dia(2026, 4, 12)),
    inicioMs: dia(2026, 3, 4), finMs: dia(2026, 4, 12),
  });
  const bases = Id.agruparPorBase([a3, base, a2]);   // desordenadas a propósito
  assert.equal(bases.size, 1);
  const h = Id.historialDeBase(bases.get('base_a'));
  assert.equal(h.veces, 3);
  assert.deepEqual(h.activaciones.map((a) => a.id), ['base_a', 'act_2', 'act_3'],
    'el historial se ordena por cuándo OCURRIÓ, no por cómo se capturó');
  assert.deepEqual(h.anios, [2025, 2026]);
  assert.equal(h.activaciones[0].dias, 37, 'del 10 de enero al 15 de febrero, ambos incluidos');
  assert.equal(h.activaciones[1].dias, 20);
  assert.equal(h.activaciones[2].dias, 40);
  // Tiempo entre activaciones: del 15 de febrero al 1 de mayo.
  assert.equal(h.activaciones[1].diasDesdeLaAnterior, 75);
  assert.equal(h.activaciones[0].diasDesdeLaAnterior, undefined, 'la primera no tiene anterior');
});

test('B · editar una activación no toca a las otras', () => {
  const a1 = pmt('act_1', { idBase: 'base_a' });
  const r = Id.prepararReactivacion(a1, { inicio: txt(dia(2025, 5, 1)), fin: txt(dia(2025, 5, 20)) });
  const a2 = { ...pmt('act_2', { idBase: 'base_a' }), ...r.datos };
  a2.inicio = txt(dia(2025, 6, 1));
  a2.geometria.coordinates[1][1] = 6.3;
  assert.equal(a1.inicio, txt(dia(2025, 1, 10)), 'la primera conserva su vigencia');
  assert.equal(a1.geometria.coordinates[1][1], 6.2001, 'y su trazado');
});

test('B · la numeración cuenta las activaciones que ya hay, y editar no suma', () => {
  const filas = [pmt('a', { idBase: 'B' }), pmt('b', { idBase: 'B' }), pmt('c', { idBase: 'OTRA' })];
  assert.equal(Id.numeroDeActivacion('B', filas), 3);
  assert.equal(Id.numeroDeActivacion('B', filas, 'b'), 2, 'editar la «b» la deja donde estaba');
  assert.equal(Id.numeroDeActivacion('NUEVA', filas), 1);
});

test('B · el recuento de reactivaciones conserva el dato y NO lo interpreta', () => {
  const r = Id.resumenDeReactivaciones([
    pmt('a', { idBase: 'B1' }), pmt('b', { idBase: 'B1' }), pmt('c', { idBase: 'B1' }),
    pmt('d', { idBase: 'B2' }), pmt('e'),
  ]);
  assert.equal(r.bases, 3);
  assert.equal(r.activaciones, 5);
  assert.equal(r.basesReactivadas, 1);
  assert.equal(r.activacionesExtra, 2);
  assert.equal(r.maxActivaciones, 3);
  // Ni una sola palabra de juicio en el resultado.
  assert.ok(!JSON.stringify(r).match(/excesiv|malo|riesgo|incumpl/i));
});

/* ═══════════════ C · FECHA DE REFERENCIA ═══════════════ */

test('C · vigente, futuro e histórico son RESPECTO DE una fecha', () => {
  const x = pmt('x');   // 2025-01-10 → 2025-02-15
  assert.equal(T.situacionDe(x, T.referencia({ ahora: dia(2025, 1, 20) })), T.SITUACION.VIGENTE);
  assert.equal(T.situacionDe(x, T.referencia({ ahora: dia(2024, 12, 1) })), T.SITUACION.FUTURO);
  assert.equal(T.situacionDe(x, T.referencia({ ahora: dia(2026, 9, 14) })), T.SITUACION.HISTORICO);
  // Los bordes, en día calendario completo.
  assert.equal(T.situacionDe(x, T.referencia({ ahora: dia(2025, 2, 15) })), T.SITUACION.VIGENTE);
  assert.equal(T.situacionDe(x, T.referencia({ ahora: dia(2025, 1, 10) })), T.SITUACION.VIGENTE);
});

test('C · «vigencia no determinada» no es vencido NI accionable: es desconocido', () => {
  const x = pmt('x', { vigenciaValida: false, inicioMs: null, finMs: null });
  const ref = T.referencia({ ahora: dia(2026, 9, 14) });
  assert.equal(T.situacionDe(x, ref), T.SITUACION.SIN_VIGENCIA);
  // NO EVALUABLE ≠ VERDADERO ≠ FALSO. Esconderlo afirma que terminó; contarlo
  // como accionable afirma que no ha terminado. Las dos son afirmaciones sobre
  // algo que no se sabe, y la respuesta correcta es no responder que sí.
  assert.equal(T.esAccionable(x, ref), false, 'no se puede afirmar que se pueda atender');
  assert.equal(T.seSitua(x, ref), false, 'y no se puede situar en el tiempo');
  assert.notEqual(T.situacionDe(x, ref), T.SITUACION.HISTORICO, 'tampoco es «vencido»');
  // Pero se CONSERVA: sigue en el conjunto y sale en «Todo».
  assert.equal(enAlcance(x, { alcance: T.ALCANCE.TODO }, ref), true);
});

test('C · el origen de la fecha de referencia es siempre explícito', () => {
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  assert.equal(hoy.origen, T.ORIGEN.HOY);
  const elegida = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: dia(2025, 3, 15) });
  assert.equal(elegida.origen, T.ORIGEN.ELEGIDA);
  assert.equal(new Date(elegida.desde).toISOString().slice(0, 10), '2025-03-15');
  const periodo = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) });
  assert.equal(periodo.origen, T.ORIGEN.PERIODO);
  assert.equal(new Date(periodo.hasta).toISOString().slice(0, 10), '2025-12-31');
});

/* ═══════════════ D · AÑOS ═══════════════ */

test('D · un PMT que cruza el 31 de diciembre pertenece a LOS DOS años', () => {
  const x = pmt('cruza', {
    inicio: txt(dia(2025, 12, 20)), fin: txt(dia(2026, 1, 15)),
    inicioMs: dia(2025, 12, 20), finMs: dia(2026, 1, 15),
  });
  assert.deepEqual(T.aniosDe(x), [2025, 2026]);
  assert.equal(T.tocaAnio(x, 2025), true);
  assert.equal(T.tocaAnio(x, 2026), true);
  assert.equal(T.tocaAnio(x, 2024), false);
  assert.equal(T.tocaAnio(x, 2027), false);
});

test('D · un PMT de varios años pertenece a todos los del medio', () => {
  const x = pmt('largo', {
    inicioMs: dia(2024, 6, 1), finMs: dia(2027, 2, 1),
    inicio: txt(dia(2024, 6, 1)), fin: txt(dia(2027, 2, 1)),
  });
  assert.deepEqual(T.aniosDe(x), [2024, 2025, 2026, 2027]);
  assert.equal(T.tocaAnio(x, 2025), true, 'estuvo cerrado todo 2025');
});

test('D · el inventario de años sale de los datos, nunca de una lista fija', () => {
  const inv = T.inventarioDeAnios([
    pmt('a'),                                                  // 2025
    pmt('b', { inicioMs: dia(2026, 3, 1), finMs: dia(2026, 4, 1) }),
    pmt('c', { inicioMs: dia(2025, 12, 20), finMs: dia(2026, 1, 15) }),  // los dos
    pmt('d', { vigenciaValida: false, inicioMs: null, finMs: null }),
  ]);
  assert.deepEqual(inv.anios, [{ anio: 2026, pmts: 2 }, { anio: 2025, pmts: 2 }],
    'del más reciente al más antiguo');
  assert.equal(inv.sinAnio, 1, 'y los que no se pueden situar se cuentan aparte');
});

/* ═══════════════ E · SEMÁNTICA OPERATIVA ═══════════════ */

const rel = (idA, idB, o = {}) => ({
  idA, idB, contratoA: 'CW1', contratoB: 'CW2', distanciaMetros: 50,
  dentroDelUmbral: true, intersecanFisicamente: false,
  espacialEvaluable: true, traslapeEvaluable: true, hayTraslapeTemporal: false, ...o,
});

test('E · una coincidencia SOLO entre vencidos no es alerta operativa hoy', () => {
  const a = pmt('A'), b = pmt('B', { contrato: 'CW2' });          // los dos de 2025
  const porId = new Map([['A', a], ['B', b]]);
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  assert.equal(T.coincidenciaAccionable(rel('A', 'B'), porId, hoy), false);

  // Pero volver a mirar su fecha la devuelve entera: el hecho nunca se borró.
  const entonces = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: dia(2025, 1, 20) });
  assert.equal(T.coincidenciaAccionable(rel('A', 'B'), porId, entonces), true);
});

test('E · una coincidencia con UN extremo vencido NO es accionable hoy', () => {
  // Para coordinar hacen falta DOS partes. Con un contrato cuya obra terminó
  // hace meses no hay nada que acordar: presentarlo como algo sobre lo que
  // actuar promete una acción que no existe. El contexto histórico del lugar
  // es otra pregunta, y para eso está el histórico.
  const a = pmt('A');                                             // 2025, vencido
  const c = pmt('C', { contrato: 'CW2', inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1) });
  const porId = new Map([['A', a], ['C', c]]);
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  assert.equal(T.relevanciaDeRelacion(rel('A', 'C'), porId, hoy), T.RELEVANCIA.NO_ACCIONABLE);
  assert.equal(T.coincidenciaAccionable(rel('A', 'C'), porId, hoy), false);

  // Y la relación NO se ha borrado. En enero de 2025, A estaba en obra y C era
  // una intervención PROGRAMADA en el mismo sitio: eso sí se podía coordinar,
  // y por eso desde aquella fecha vuelve a ser accionable. La regla compone
  // sola: vigente + futuro = SÍ, se mire desde donde se mire.
  const entonces = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: dia(2025, 1, 20) });
  assert.equal(T.situacionDe(a, entonces), T.SITUACION.VIGENTE);
  assert.equal(T.situacionDe(c, entonces), T.SITUACION.FUTURO);
  assert.equal(T.relevanciaDeRelacion(rel('A', 'C'), porId, entonces), T.RELEVANCIA.ACCIONABLE,
    'la relación nunca se borró: vuelve entera al mirar la fecha pertinente');
});

test('E · la matriz completa de accionabilidad, combinación por combinación', () => {
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  const HIST = pmt('H', { inicioMs: dia(2025, 3, 1), finMs: dia(2025, 3, 20),
    inicio: txt(dia(2025, 3, 1)), fin: txt(dia(2025, 3, 20)) });
  const VIG = pmt('V', { contrato: 'CW2', inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1),
    inicio: txt(dia(2026, 9, 1)), fin: txt(dia(2026, 12, 1)) });
  const FUT = pmt('F', { contrato: 'CW3', inicioMs: dia(2027, 1, 10), finMs: dia(2027, 2, 10),
    inicio: txt(dia(2027, 1, 10)), fin: txt(dia(2027, 2, 10)) });
  const SINV = pmt('S', { contrato: 'CW4', vigenciaValida: false, inicioMs: null, finMs: null });
  const porId = new Map([['H', HIST], ['V', VIG], ['F', FUT], ['S', SINV]]);

  const casos = [
    ['H', 'F', T.RELEVANCIA.NO_ACCIONABLE, 'histórico + futuro → NO alerta operativa'],
    ['H', 'V', T.RELEVANCIA.NO_ACCIONABLE, 'histórico + vigente → NO'],
    ['H', 'H', T.RELEVANCIA.NO_ACCIONABLE, 'histórico + histórico → NO'],
    ['V', 'F', T.RELEVANCIA.ACCIONABLE, 'vigente + futuro → SÍ'],
    ['F', 'F', T.RELEVANCIA.ACCIONABLE, 'futuro + futuro → SÍ'],
    ['V', 'V', T.RELEVANCIA.ACCIONABLE, 'vigente + vigente → SÍ'],
    // Lo desconocido no se convierte en ninguna de las dos respuestas.
    ['V', 'S', T.RELEVANCIA.NO_EVALUABLE, 'vigente + no determinada → no se sabe'],
    ['H', 'S', T.RELEVANCIA.NO_EVALUABLE, 'histórico + no determinada → no se sabe'],
  ];
  for (const [a, b, esperado, porQue] of casos) {
    assert.equal(T.relevanciaDeRelacion(rel(a, b), porId, hoy), esperado, porQue);
    // Y es simétrica: A/B = B/A.
    assert.equal(T.relevanciaDeRelacion(rel(b, a), porId, hoy), esperado, porQue + ' (al revés)');
  }
});

test('E · lo NO EVALUABLE se conserva en la vista operativa, con su etiqueta', () => {
  const v = pmt('V', { inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1) });
  const s = pmt('S', { contrato: 'CW4', vigenciaValida: false, inicioMs: null, finMs: null });
  const porId = new Map([['V', v], ['S', s]]);
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  const r = rel('V', 'S', { hayTraslapeTemporal: false });

  // No se esconde: esconder lo desconocido es la misma afirmación sin
  // fundamento, del otro lado.
  assert.equal(T.coincidenciaAccionable(r, porId, hoy), true);
  const [marcada] = marcarVigenciaDeRelaciones([r], hoy, porId);
  assert.equal(marcada.relevanciaTemporal, T.RELEVANCIA.NO_EVALUABLE);
  assert.equal(lecturaOperativaEnContexto(marcada), OPERATIVO.NO_EVALUABLE,
    'ni «articulación requerida» ni «sin coincidencia»: no se pudo comprobar');
});

test('E · una articulación cuyo traslape YA PASÓ no se puede coordinar', () => {
  // A: enero–marzo. B: febrero–diciembre. Hoy: junio. Se solaparon feb–mar, y
  // ese solape ya ocurrió: no queda nada que acordar sobre él.
  const r = rel('A', 'B', {
    hayTraslapeTemporal: true,
    traslapeInicio: txt(dia(2026, 2, 1)), traslapeFin: txt(dia(2026, 3, 31)),
  });
  const junio = T.referencia({ ahora: dia(2026, 6, 15) });
  assert.equal(T.articulacionCoordinable(r, junio), false);

  const febrero = T.referencia({ ahora: dia(2026, 2, 10) });
  assert.equal(T.articulacionCoordinable(r, febrero), true, 'en febrero sí había qué coordinar');
});

test('E · si el traslape no se puede situar, NO se esconde', () => {
  const r = rel('A', 'B', { hayTraslapeTemporal: true, traslapeFin: null });
  assert.equal(T.articulacionCoordinable(r, T.referencia({ ahora: dia(2030, 1, 1) })), true,
    'no poder comprobarlo nunca puede convertirse en ocultarlo');
});

test('E · los contadores CUADRAN y «operativo» se explica desde sus sumandos', () => {
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  const r = T.repartirPorSituacion([
    pmt('A'),                                                               // histórico
    pmt('C', { inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1) }),        // vigente
    pmt('D', { inicioMs: dia(2027, 1, 1), finMs: dia(2027, 2, 1) }),         // futuro
    pmt('E', { vigenciaValida: false, inicioMs: null, finMs: null }),        // no determinada
  ], hoy);
  assert.deepEqual(r, {
    vigentes: 1, futuros: 1, historicos: 1, sinVigencia: 1,
    // 1 + 1 = 2. NO 3: «vigencia no determinada» no entra en «operativo».
    operativos: 2, total: 4, cuadra: true,
  });
  // Las cuatro categorías son excluyentes y cubren el total.
  assert.equal(r.vigentes + r.futuros + r.historicos + r.sinVigencia, r.total);
  // Y «operativo» se reconstruye exactamente desde dos de ellas.
  assert.equal(r.operativos, r.vigentes + r.futuros);
});

test('E · los contadores cuadran con cualquier mezcla, en cantidad', () => {
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  const filas = [];
  for (let i = 0; i < 40; i++) filas.push(pmt('h' + i));                     // históricos
  for (let i = 0; i < 17; i++) {
    filas.push(pmt('v' + i, { inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1) }));
  }
  for (let i = 0; i < 5; i++) {
    filas.push(pmt('f' + i, { inicioMs: dia(2027, 1, 1), finMs: dia(2027, 2, 1) }));
  }
  for (let i = 0; i < 3; i++) {
    filas.push(pmt('s' + i, { vigenciaValida: false, inicioMs: null, finMs: null }));
  }
  const r = T.repartirPorSituacion(filas, hoy);
  assert.equal(r.total, 65);
  assert.deepEqual([r.historicos, r.vigentes, r.futuros, r.sinVigencia], [40, 17, 5, 3]);
  assert.equal(r.operativos, 22);
  assert.equal(r.cuadra, true);
  // Y el alcance operativo enseña EXACTAMENTE esos 22.
  const vistos = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO }, hoy);
  assert.equal(vistos.length, r.operativos,
    'lo que se cuenta como operativo y lo que se enseña tiene que ser lo mismo');
});

test('E · el contexto se describe con palabras, no con un color', () => {
  const hoy = T.referencia({ ahora: dia(2026, 9, 14) });
  const c1 = T.describirContexto(hoy, T.ALCANCE.OPERATIVO);
  assert.equal(c1.etiqueta, 'Operativo');
  assert.match(c1.detalle, /2026-09-14/);
  assert.equal(c1.retrospectivo, false);

  const c2 = T.describirContexto(T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) }),
    T.ALCANCE.HISTORICO, 2025);
  assert.equal(c2.detalle, 'Año 2025');
  assert.equal(c2.retrospectivo, true, 'un informe histórico tiene que hablar en pasado');
});

/* ═══════ F · IDA Y VUELTA: EL HISTORIAL SOBREVIVE AL PROYECTO ═══════ */

import * as Proyecto from '../nucleo/proyecto.js';
import { VERSION_REGLAS } from '../../motor/src/nucleo/config.js';
import { filtrosVacios, filtrarPmts, filtrarRelaciones, enAlcance,
  marcarVigenciaDeRelaciones } from '../nucleo/filtrado.js';
import { lecturaOperativa, lecturaOperativaEnContexto, OPERATIVO } from '../nucleo/modelo.js';

const CONFIG_OK = {
  umbralMetros: 120, granularidadTemporal: 'instante', toleranciaMinutos: 0,
  excluirMismoContrato: true, modoDistancia: 'real',
};

const tresActivaciones = () => [
  pmt('act_1', { idBase: 'base_a',
    inicio: txt(dia(2024, 3, 1)), fin: txt(dia(2024, 3, 20)),
    inicioMs: dia(2024, 3, 1), finMs: dia(2024, 3, 20) }),
  pmt('act_2', { idBase: 'base_a',
    inicio: txt(dia(2025, 5, 1)), fin: txt(dia(2025, 5, 31)),
    inicioMs: dia(2025, 5, 1), finMs: dia(2025, 5, 31) }),
  pmt('act_3', { idBase: 'base_a',
    inicio: txt(dia(2026, 3, 4)), fin: txt(dia(2026, 3, 20)),
    inicioMs: dia(2026, 3, 4), finMs: dia(2026, 3, 20),
    activacion: { motivo: 'ampliación de plazo', creada: '2026-02-01T00:00:00.000Z' } }),
];

test('F · guardar y abrir conserva el historial COMPLETO e intacto', () => {
  const filas = tresActivaciones();
  const p = Proyecto.crearProyecto({
    filas, relaciones: [], noEvaluables: [],
    archivos: [{ nombre: 'x', estadoLectura: 'completa', placemarks: 3 }],
    config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS,
  });
  const leido = Proyecto.leerProyecto(Proyecto.serializar(p));
  assert.equal(leido.ok, true, leido.motivo);

  const bases = Id.agruparPorBase(leido.proyecto.trazados);
  assert.equal(bases.size, 1, 'las tres siguen siendo UN solo PMT base');
  const h = Id.historialDeBase(bases.get('base_a'));
  assert.equal(h.veces, 3);
  assert.deepEqual(h.anios, [2024, 2025, 2026]);
  assert.deepEqual(h.activaciones.map((a) => a.numero), [1, 2, 3],
    'el número se DERIVA al abrir y sale en orden de ocurrencia');
  assert.equal(h.activaciones[2].motivo, 'ampliación de plazo', 'el motivo sí se guarda');

  // Y la GEOMETRÍA vuelve idéntica en las tres.
  for (const t of leido.proyecto.trazados) {
    assert.equal(Id.mismaGeometria(t.geometria, filas[0].geometria), true,
      'el trazado compartido no puede cambiar al guardar y abrir');
  }
});

test('F · un archivo editado NO puede inventarse un número de activación', () => {
  const filas = [pmt('solo', { idBase: 'base_z' })];
  const p = Proyecto.crearProyecto({
    filas, relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS,
  });
  const texto = Proyecto.serializar(p);
  const manipulado = JSON.parse(texto);
  manipulado.trazados[0].activacion = { numero: 7, de: 9, motivo: 'inventado' };
  delete manipulado.huella;
  const leido = Proyecto.leerProyecto(JSON.stringify(manipulado));
  assert.equal(leido.ok, true);
  assert.equal(leido.proyecto.trazados[0].activacion.numero, 1,
    'el número se deriva de lo que hay, no de lo que dice el archivo');
  assert.equal(leido.proyecto.trazados[0].activacion.de, 1);
});

test('F · un `idBase` que no es texto no agrupa nada en silencio', () => {
  const filas = [pmt('a'), pmt('b')];
  const p = Proyecto.crearProyecto({
    filas, relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS,
  });
  const m = JSON.parse(Proyecto.serializar(p));
  m.trazados[0].idBase = 42;
  m.trazados[1].idBase = { raro: true };
  delete m.huella;
  const leido = Proyecto.leerProyecto(JSON.stringify(m));
  assert.equal(Id.agruparPorBase(leido.proyecto.trazados).size, 2,
    'cada uno vuelve a ser su propia base, que es lo seguro');
});

test('F · numerar sobre el conjunto COMPLETO, no fuente a fuente', () => {
  // Dos fuentes que traen activaciones de la misma base: si cada una numerase
  // lo suyo habría dos «activación 1» del mismo PMT.
  const fuenteA = [tresActivaciones()[0]];
  const fuenteB = [tresActivaciones()[1], tresActivaciones()[2]];
  const juntas = Id.numerarActivaciones([...fuenteA, ...fuenteB]);
  assert.deepEqual(juntas.map((f) => f.activacion.numero).sort(), [1, 2, 3]);
  assert.ok(juntas.every((f) => f.activacion.de === 3));
});

/* ═══════ G · VISTA OPERATIVA vs HISTÓRICA, EN EL FILTRADO REAL ═══════ */

const escenario = () => [
  // A y B: históricos, los dos de 2025, de contratos distintos.
  pmt('A', { contrato: 'CW1', inicioMs: dia(2025, 3, 1), finMs: dia(2025, 3, 20),
    inicio: txt(dia(2025, 3, 1)), fin: txt(dia(2025, 3, 20)) }),
  pmt('B', { contrato: 'CW2', inicioMs: dia(2025, 3, 5), finMs: dia(2025, 3, 25),
    inicio: txt(dia(2025, 3, 5)), fin: txt(dia(2025, 3, 25)) }),
  // C: vigente hoy (referencia 2026-09-14).
  pmt('C', { contrato: 'CW3', inicioMs: dia(2026, 9, 1), finMs: dia(2026, 12, 1),
    inicio: txt(dia(2026, 9, 1)), fin: txt(dia(2026, 12, 1)) }),
  // D: futuro.
  pmt('D', { contrato: 'CW4', inicioMs: dia(2027, 1, 10), finMs: dia(2027, 2, 10),
    inicio: txt(dia(2027, 1, 10)), fin: txt(dia(2027, 2, 10)) }),
];

const HOY = dia(2026, 9, 14);

test('G · la vista operativa de hoy deja fuera A y B, y conserva C y D', () => {
  const filas = escenario();
  const ref = T.referencia({ ahora: HOY });
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO };
  const vistos = filtrarPmts(filas, f, ref).map((x) => x.id);
  assert.deepEqual(vistos.sort(), ['C', 'D']);
  // Y no se ha borrado nada: siguen todos en el conjunto de origen.
  assert.equal(filas.length, 4);
});

test('G · la consulta histórica de 2025 devuelve A y B enteros', () => {
  const filas = escenario();
  const ref = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) });
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio: 2025 };
  assert.deepEqual(filtrarPmts(filas, f, ref).map((x) => x.id).sort(), ['A', 'B']);
});

test('G · «Todo» no recorta nada', () => {
  const filas = escenario();
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.TODO };
  assert.equal(filtrarPmts(filas, f, T.referencia({ ahora: HOY })).length, 4);
});

test('G · una relación solo entre históricos NO es alerta hoy, pero vuelve en 2025', () => {
  const filas = escenario();
  const porId = new Map(filas.map((x) => [x.id, x]));
  const relaciones = [rel('A', 'B', {
    hayTraslapeTemporal: true,
    traslapeInicio: txt(dia(2025, 3, 5)), traslapeFin: txt(dia(2025, 3, 20)),
  })];

  // HOY, vista operativa: no genera ruido.
  const hoy = T.referencia({ ahora: HOY });
  const fOp = { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO };
  const idsOp = new Set(filtrarPmts(filas, fOp, hoy).map((x) => x.id));
  assert.equal(filtrarRelaciones(marcarVigenciaDeRelaciones(relaciones, hoy), fOp, idsOp, hoy, porId).length, 0);

  // EN 2025: vuelve entera, y como ARTICULACIÓN, porque entonces lo era.
  const ref25 = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) });
  const f25 = { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio: 2025 };
  const ids25 = new Set(filtrarPmts(filas, f25, ref25).map((x) => x.id));
  const vistas = filtrarRelaciones(marcarVigenciaDeRelaciones(relaciones, ref25), f25, ids25, ref25, porId);
  assert.equal(vistas.length, 1);
  assert.equal(lecturaOperativa(vistas[0]), OPERATIVO.ARTICULACION_REQUERIDA);
});

test('G · el recorrido temporal sobre marzo de 2025 devuelve la articulación', () => {
  const filas = escenario();
  const porId = new Map(filas.map((x) => [x.id, x]));
  const relaciones = [rel('A', 'B', {
    hayTraslapeTemporal: true,
    traslapeInicio: txt(dia(2025, 3, 5)), traslapeFin: txt(dia(2025, 3, 20)),
  })];
  // El usuario mueve el recorrido al 10 de marzo de 2025.
  const ref = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: dia(2025, 3, 10) });
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO };
  const ids = new Set(filtrarPmts(filas, f, ref).map((x) => x.id));
  assert.ok(ids.has('A') && ids.has('B'), 'aquel día A y B estaban vivos');
  const vistas = filtrarRelaciones(marcarVigenciaDeRelaciones(relaciones, ref), f, ids, ref, porId);
  assert.equal(vistas.length, 1);
  assert.equal(lecturaOperativa(vistas[0]), OPERATIVO.ARTICULACION_REQUERIDA,
    'ocultar históricos NO puede significar borrar relaciones pasadas');
});

test('G · una articulación cuyo traslape ya pasó se degrada, NO desaparece', () => {
  // C (sep–dic 2026) y otro que fue de agosto a octubre: el traslape fue
  // sep–oct. Si hoy es diciembre, ya no hay nada que coordinar de ese solape,
  // pero los dos siguen compartiendo espacio y eso sigue siendo cierto.
  const r = rel('C', 'X', {
    hayTraslapeTemporal: true,
    traslapeInicio: txt(dia(2026, 9, 1)), traslapeFin: txt(dia(2026, 10, 15)),
  });
  const dic = T.referencia({ ahora: dia(2026, 12, 20) });
  const [marcada] = marcarVigenciaDeRelaciones([r], dic);
  assert.equal(marcada.articulacionVigente, false);
  assert.equal(lecturaOperativa(marcada), OPERATIVO.COINCIDENCIA_ESPACIAL,
    'sigue siendo coincidencia espacial: comparten sitio, y eso no ha caducado');
  // Y el HECHO está intacto.
  assert.equal(marcada.hayTraslapeTemporal, true);
  assert.equal(marcada.traslapeFin, txt(dia(2026, 10, 15)));
});

/* ═══════ H · PMT QUE CRUZA EL AÑO ═══════ */

test('H · un PMT que cruza el 31 de diciembre sale en los DOS años y en operativo', () => {
  const cruza = pmt('cruza', {
    inicio: txt(dia(2025, 12, 20)), fin: txt(dia(2026, 1, 15)),
    inicioMs: dia(2025, 12, 20), finMs: dia(2026, 1, 15),
  });
  const filas = [cruza];
  for (const anio of [2025, 2026]) {
    const ref = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(anio) });
    const f = { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio };
    assert.equal(filtrarPmts(filas, f, ref).length, 1, `no sale al consultar ${anio}`);
  }
  // En enero de 2026 sigue siendo operativo.
  const enero = T.referencia({ ahora: dia(2026, 1, 5) });
  assert.equal(enAlcance(cruza, { alcance: T.ALCANCE.OPERATIVO }, enero), true);
  // En septiembre de 2026 ya no.
  assert.equal(enAlcance(cruza, { alcance: T.ALCANCE.OPERATIVO }, T.referencia({ ahora: HOY })), false);
  // Pero nunca desaparece del histórico.
  assert.equal(enAlcance(cruza, { alcance: T.ALCANCE.TODO }, T.referencia({ ahora: HOY })), true);
});

test('H · cada año enseña SU activación del mismo PMT base', () => {
  const filas = tresActivaciones();
  for (const [anio, esperado] of [[2024, 'act_1'], [2025, 'act_2'], [2026, 'act_3']]) {
    const ref = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(anio) });
    const f = { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio };
    const v = filtrarPmts(filas, f, ref);
    assert.deepEqual(v.map((x) => x.id), [esperado], `el año ${anio} no enseña su activación`);
  }
  // Y consultando el PMT base se ven las tres, sin buscar tres geometrías.
  const h = Id.historialDeBase(Id.agruparPorBase(filas).get('base_a'));
  assert.equal(h.veces, 3);
  assert.deepEqual(h.activaciones.map((a) => a.dias), [20, 31, 17]);
});

/* ═══════ I · BÚSQUEDA HISTÓRICA TERRITORIAL ═══════ */

test('I · se puede responder «quién intervenía aquí en marzo de 2025»', () => {
  const filas = escenario();
  const ref = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) });
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio: 2025, municipio: ['Medellín'] };
  const v = filtrarPmts(filas, f, ref);
  assert.deepEqual([...new Set(v.map((x) => x.contrato))].sort(), ['CW1', 'CW2']);
  // Y con su geometría, que es lo que permite situarlo en el punto exacto.
  assert.ok(v.every((x) => x.geometria), 'el histórico conserva la geometría');
});

/* ═══════ J · RETIRAR UNA ACTIVACIÓN NO BORRA EL PMT BASE ═══════ */

test('J · quitar una activación deja intactas las demás y su geometría', () => {
  const filas = tresActivaciones();
  const quedan = Id.numerarActivaciones(filas.filter((x) => x.id !== 'act_2'));
  const bases = Id.agruparPorBase(quedan);
  assert.equal(bases.size, 1, 'el PMT base sigue existiendo');
  const h = Id.historialDeBase(bases.get('base_a'));
  assert.equal(h.veces, 2);
  assert.deepEqual(h.activaciones.map((a) => a.id), ['act_1', 'act_3']);
  assert.deepEqual(h.activaciones.map((a) => a.numero), [1, 2],
    'se renumera: no queda un hueco que nadie pueda explicar');
  assert.equal(Id.mismaGeometria(quedan[0].geometria, filas[0].geometria), true);
});

/* ═══════ K · COHERENCIA DE LAS BASES (autorevisión §9.3) ═══════ */

test('K · dos activaciones de la misma base con trazados DISTINTOS se avisan', () => {
  const a = pmt('a1', { idBase: 'B' });
  const b = pmt('b1', { idBase: 'B',
    geometria: { type: 'LineString', coordinates: [[-70, 5], [-70.001, 5]] } });
  const avisos = Id.revisarCoherenciaDeBases([a, b]);
  assert.equal(avisos.length, 1, JSON.stringify(avisos));
  assert.match(avisos[0], /TRAZADOS DISTINTOS/);
  assert.match(avisos[0], /No se ha modificado nada/,
    'se avisa, no se corrige: no sabemos cuál de las dos es la buena');
});

test('K · dos activaciones de la misma base con contratos distintos se avisan', () => {
  const a = pmt('a1', { idBase: 'B', contrato: 'CW1' });
  const b = pmt('b1', { idBase: 'B', contrato: 'CW9' });
  const avisos = Id.revisarCoherenciaDeBases([a, b]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /contratos distintos/);
});

test('K · una base coherente NO produce ningún aviso', () => {
  const a = pmt('a1', { idBase: 'B' });
  const b = pmt('b1', { idBase: 'B',
    inicioMs: dia(2026, 1, 1), finMs: dia(2026, 2, 1),
    inicio: txt(dia(2026, 1, 1)), fin: txt(dia(2026, 2, 1)) });
  assert.deepEqual(Id.revisarCoherenciaDeBases([a, b]), []);
});

test('K · un PMT con una sola activación nunca se revisa', () => {
  assert.deepEqual(Id.revisarCoherenciaDeBases([pmt('solo')]), []);
});

/* ═══════ L · ATAQUES (autorevisión de esta ronda) ═══════ */

test('L · una geometría que no se puede copiar devuelve FALLO, no revienta', () => {
  const circular = { type: 'Point', coordinates: [1, 2] };
  circular.yo = circular;
  const r = Id.prepararReactivacion({ id: 'x', geometria: circular }, {});
  assert.equal(r.ok, false);
  assert.match(r.motivo, /no se pudo copiar/);
});

test('L · una fecha de referencia rota NUNCA se usa: se cae a hoy y se dice', () => {
  // Con `ms` no finito los límites salen NaN y TODAS las comparaciones dan
  // false, así que todo pasaría por vigente. La pantalla no daría error:
  // mentiría entera, en silencio.
  for (const malo of [NaN, Infinity, -Infinity, 'ayer', {}]) {
    const r = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: malo, ahora: dia(2026, 9, 14) });
    assert.ok(Number.isFinite(r.ms), `${String(malo)} produjo una referencia rota`);
    assert.equal(r.origen, T.ORIGEN.HOY);
    assert.ok(r.degradada, 'y tiene que decirlo, no callarse');
  }
  // Y con una referencia válida, nada de eso aparece.
  assert.equal(T.referencia({ ahora: dia(2026, 9, 14) }).degradada, undefined);
});

test('L · un periodo sin fin utilizable se cae a hoy, no a NaN', () => {
  const r = T.referencia({ origen: T.ORIGEN.PERIODO, desde: dia(2025, 1, 1), hasta: NaN,
    ahora: dia(2026, 9, 14) });
  assert.ok(Number.isFinite(r.ms));
  assert.ok(Number.isFinite(r.hasta));
});

test('L · «no se puede situar el traslape» nunca oculta la articulación', () => {
  const lejos = T.referencia({ ahora: dia(2030, 1, 1) });
  for (const v of ['no es fecha', '', null, undefined, 12345, {}]) {
    assert.equal(T.articulacionCoordinable({ hayTraslapeTemporal: true, traslapeFin: v }, lejos), true,
      `traslapeFin ${JSON.stringify(v)} se ocultó`);
  }
});

test('L · agrupar y revisar 5.000 activaciones sigue siendo instantáneo', () => {
  const muchas = Array.from({ length: 5000 }, (_, i) => ({
    id: 'p' + i, idBase: 'b' + (i % 1200), contrato: 'C', vigenciaValida: true,
    inicioMs: Date.UTC(2020 + (i % 6), i % 12, 1), finMs: Date.UTC(2020 + (i % 6), i % 12, 28),
    geometria: { type: 'Point', coordinates: [-75.6, 6.2] },
  }));
  const t0 = Date.now();
  T.inventarioDeAnios(muchas);
  Id.agruparPorBase(muchas);
  Id.revisarCoherenciaDeBases(muchas);
  const ms = Date.now() - t0;
  // Se repintan en cada cambio de filtro, así que tienen que ser baratos. El
  // margen es amplio a propósito: esto vigila un derrumbe, no una décima.
  assert.ok(ms < 1500, `tardaron ${ms} ms con 5.000 activaciones`);
});

/* ═══════ M · EL HISTÓRICO NO SE PIERDE NUNCA (corrección final) ═══════
 *
 * Siete afirmaciones que tienen que seguir siendo ciertas pase lo que pase.
 * No son variaciones de una: cada una cierra una forma distinta de perder
 * información sin que nadie se entere.
 */

test('M1 · ocultar un vencido NO lo elimina', () => {
  const filas = escenario();
  const hoy = T.referencia({ ahora: HOY });
  const fuera = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO }, hoy);
  assert.ok(!fuera.some((x) => x.id === 'A'), 'A no sale en operativo');
  // El objeto sigue en el conjunto de origen, intacto, con su geometría.
  const a = filas.find((x) => x.id === 'A');
  assert.ok(a && a.geometria && a.inicioMs && a.finMs);
  assert.equal(filas.length, 4, 'nada se ha quitado del conjunto');
});

test('M2 · cambiar de año lo recupera', () => {
  const filas = escenario();
  const ref = T.referencia({ origen: T.ORIGEN.PERIODO, ...T.limitesDelAnio(2025) });
  const v = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.HISTORICO, anio: 2025 }, ref);
  assert.deepEqual(v.map((x) => x.id).sort(), ['A', 'B']);
});

test('M3 · mover la referencia al pasado recupera PMT Y relaciones', () => {
  const filas = escenario();
  const porId = new Map(filas.map((x) => [x.id, x]));
  const r = rel('A', 'B', {
    hayTraslapeTemporal: true,
    traslapeInicio: txt(dia(2025, 3, 5)), traslapeFin: txt(dia(2025, 3, 20)),
  });
  const ref = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: dia(2025, 3, 10) });
  const f = { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO };
  const ids = new Set(filtrarPmts(filas, f, ref).map((x) => x.id));
  assert.ok(ids.has('A') && ids.has('B'));
  const vistas = filtrarRelaciones(marcarVigenciaDeRelaciones([r], ref, porId), f, ids, ref, porId);
  assert.equal(vistas.length, 1);
  assert.equal(lecturaOperativaEnContexto(vistas[0]), OPERATIVO.ARTICULACION_REQUERIDA);
});

test('M4 · una reactivación nueva NO sobrescribe la anterior', () => {
  const [a1] = tresActivaciones();
  const r = Id.prepararReactivacion(a1, { inicio: txt(dia(2027, 1, 1)), fin: txt(dia(2027, 2, 1)) });
  const nueva = { ...a1, ...r.datos, id: 'act_nueva',
    inicioMs: dia(2027, 1, 1), finMs: dia(2027, 2, 1) };
  const juntas = Id.numerarActivaciones([a1, nueva]);
  assert.equal(juntas.length, 2, 'las DOS existen');
  const vieja = juntas.find((x) => x.id === a1.id);
  assert.equal(vieja.inicio, a1.inicio, 'la anterior conserva su vigencia');
  assert.equal(vieja.activacion.numero, 1);
  assert.equal(juntas.find((x) => x.id === 'act_nueva').activacion.numero, 2);
});

test('M5 · editar la activación 3 no modifica la 1 ni la 2', () => {
  const [a1, a2, a3] = tresActivaciones();
  const editada = { ...a3, inicio: txt(dia(2026, 6, 1)), inicioMs: dia(2026, 6, 1),
    resolucionPmt: 'RES-NUEVA' };
  const juntas = Id.numerarActivaciones([a1, a2, editada]);
  const v1 = juntas.find((x) => x.id === 'act_1'), v2 = juntas.find((x) => x.id === 'act_2');
  assert.equal(v1.inicio, txt(dia(2024, 3, 1)));
  assert.equal(v2.inicio, txt(dia(2025, 5, 1)));
  assert.equal(v1.resolucionPmt, undefined);
  assert.equal(v2.resolucionPmt, undefined);
  assert.equal(Id.mismaGeometria(v1.geometria, a1.geometria), true);
});

test('M6 · el PMT base mantiene TODAS sus activaciones', () => {
  const filas = tresActivaciones();
  const bases = Id.agruparPorBase(Id.numerarActivaciones(filas));
  assert.equal(bases.size, 1);
  assert.equal(Id.historialDeBase(bases.get('base_a')).veces, 3);
});

test('M7 · la geometría es IDÉNTICA en todas las activaciones', () => {
  const [a1] = tresActivaciones();
  let actual = a1;
  for (let i = 0; i < 5; i++) {
    const r = Id.prepararReactivacion(actual, { inicio: txt(dia(2027 + i, 1, 1)), fin: txt(dia(2027 + i, 2, 1)) });
    assert.equal(r.ok, true, r.motivo);
    // Cadena de cinco reactivaciones seguidas: el trazado no puede derivar ni
    // un decimal, ni siquiera acumulando copias de copias.
    assert.deepEqual(r.datos.geometria, a1.geometria, `derivó en la reactivación ${i + 1}`);
    actual = { ...actual, ...r.datos, id: 'act_' + i };
  }
});

test('M8 · el histórico sobrevive a guardar y abrir, con la evidencia documental', () => {
  const [a1] = tresActivaciones();
  const conDoc = { ...a1, resolucionPmt: 'RES-VIEJA' };
  const r = Id.prepararReactivacion(conDoc, { inicio: txt(dia(2027, 1, 1)), fin: txt(dia(2027, 2, 1)) });
  const nueva = { ...conDoc, ...r.datos, id: 'act_nueva',
    inicioMs: dia(2027, 1, 1), finMs: dia(2027, 2, 1),
    inicio: txt(dia(2027, 1, 1)), fin: txt(dia(2027, 2, 1)) };

  const p = Proyecto.crearProyecto({
    filas: [conDoc, nueva], relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS,
  });
  const leido = Proyecto.leerProyecto(Proyecto.serializar(p));
  assert.equal(leido.ok, true, leido.motivo);

  const v = leido.proyecto.trazados.find((x) => x.id === 'act_nueva');
  assert.equal(v.resolucionPmt, null, 'la nueva sigue sin código propio');
  assert.equal(v.documentosPrevios.resolucionPmt, 'RES-VIEJA',
    'y la EVIDENCIA de la anterior sobrevive a guardar y abrir');
  assert.equal(estadoDocumental(v).conPrevio, 1);
  // La anterior conserva el suyo, registrado de verdad.
  const vieja = leido.proyecto.trazados.find((x) => x.id === 'act_1');
  assert.equal(vieja.resolucionPmt, 'RES-VIEJA');
  assert.equal(estadoDocumental(vieja).registrados, 1);
});
