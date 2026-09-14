/**
 * VOCABULARIO OPERATIVO (Etapa 3, §4).
 *
 * La lectura operativa es DERIVADA: nombra la consecuencia de dos hechos ya
 * medidos. Estas pruebas fijan lo que NO puede pasar nunca:
 *
 *   · que «no se pudo comprobar» se presente como «sin coincidencia»;
 *   · que aparezca «articulación requerida» sin las dos condiciones;
 *   · que el vocabulario introduzca criticidad por la puerta de atrás;
 *   · que el resumen cuente una cosa y la tabla otra.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lecturaOperativa, OPERATIVO, ETIQUETA_OPERATIVO, EXPLICACION_OPERATIVO }
  from '../nucleo/modelo.js';
import { resumir } from '../nucleo/resumen.js';

const rel = (o = {}) => ({
  idA: 'a', idB: 'b', contratoA: 'CW1', contratoB: 'CW2',
  distanciaMetros: 50, intersecanFisicamente: false, dentroDelUmbral: true,
  espacialEvaluable: true, traslapeEvaluable: true, hayTraslapeTemporal: false, ...o,
});

test('articulación requerida exige las DOS condiciones', () => {
  assert.equal(lecturaOperativa(rel({ hayTraslapeTemporal: true })),
    OPERATIVO.ARTICULACION_REQUERIDA);
  assert.equal(lecturaOperativa(rel({ hayTraslapeTemporal: false })),
    OPERATIVO.COINCIDENCIA_ESPACIAL);
  assert.equal(lecturaOperativa(rel({ dentroDelUmbral: false, hayTraslapeTemporal: true })),
    OPERATIVO.SIN_COINCIDENCIA, 'coincidir en el tiempo sin compartir espacio no articula nada');
});

test('tocarse cuenta como compartir espacio aunque el umbral diga lo contrario', () => {
  // `intersecanFisicamente` manda: dos trazados que se cruzan estan a 0 m.
  assert.equal(lecturaOperativa(rel({
    intersecanFisicamente: true, dentroDelUmbral: false, hayTraslapeTemporal: true,
  })), OPERATIVO.ARTICULACION_REQUERIDA);
});

test('«no se pudo comprobar» JAMÁS se convierte en «sin coincidencia»', () => {
  for (const sinSaber of [
    { espacialEvaluable: false },
    { distanciaMetros: null },
    { traslapeEvaluable: false },
    { traslapeEvaluable: false, hayTraslapeTemporal: true },
  ]) {
    const l = lecturaOperativa(rel(sinSaber));
    assert.equal(l, OPERATIVO.NO_EVALUABLE, JSON.stringify(sinSaber));
    assert.notEqual(l, OPERATIVO.SIN_COINCIDENCIA);
  }
});

test('no se puede decidir el tiempo sin poder decidir el espacio', () => {
  // Si no se sabe donde estan, saber que coinciden en el tiempo no basta.
  assert.equal(lecturaOperativa(rel({ espacialEvaluable: false, hayTraslapeTemporal: true })),
    OPERATIVO.NO_EVALUABLE);
});

test('el vocabulario no introduce criticidad por la puerta de atrás', () => {
  const textos = [...Object.values(ETIQUETA_OPERATIVO), ...Object.values(EXPLICACION_OPERATIVO)];
  for (const t of textos) {
    assert.ok(!/crític|critic|urgent|prioridad alta|nivel alto|grave|severo/i.test(t),
      `«${t}» insinúa una clasificación que EPM no ha aprobado`);
  }
});

test('las cuatro lecturas son excluyentes y cubren todos los casos', () => {
  const valores = new Set(Object.values(OPERATIVO));
  assert.equal(valores.size, 4);
  for (const v of valores) {
    assert.ok(ETIQUETA_OPERATIVO[v], `falta etiqueta para ${v}`);
    assert.ok(EXPLICACION_OPERATIVO[v], `falta explicación para ${v}`);
  }
});

test('el resumen cuenta exactamente lo mismo que la lectura fila a fila', () => {
  const relaciones = [
    rel({ hayTraslapeTemporal: true }),
    rel({ hayTraslapeTemporal: true }),
    rel({ hayTraslapeTemporal: false }),
    rel({ dentroDelUmbral: false }),
    rel({ espacialEvaluable: false }),
  ];
  const r = resumir(null, [], relaciones, []);
  const cuenta = (o) => relaciones.filter((x) => lecturaOperativa(x) === o).length;
  assert.equal(r.articulacion, cuenta(OPERATIVO.ARTICULACION_REQUERIDA));
  assert.equal(r.coincidenciaEspacial, cuenta(OPERATIVO.COINCIDENCIA_ESPACIAL));
  assert.equal(r.articulacion, 2);
  assert.equal(r.coincidenciaEspacial, 1);
  // Y la lectura NUNCA suma lo que no se pudo comprobar con lo que no coincide.
  assert.ok(r.articulacion + r.coincidenciaEspacial < relaciones.length);
});

test('el resumen trae el seguimiento documental con su alcance', () => {
  const filas = [
    { resolucionPmt: 'RES-1', permisoRotura: 'PR-1', cierrePermisoRotura: 'CPR-1' },
    { resolucionPmt: 'RES-2' },
    {},
  ];
  const r = resumir(null, filas, [], []);
  assert.equal(r.documental.total, 3);
  assert.equal(r.documental.completos, 1);
  assert.equal(r.documental.sinNinguno, 1);
  assert.equal(r.documental.pendientePorDocumento.resolucionPmt, 1);
  assert.equal(r.documental.pendientePorDocumento.permisoRotura, 2);
});

/* ═══════ ATAQUE: EL PMT CREADO DENTRO, DE IDA Y VUELTA (autorevisión §3.2) ═══════
 *
 * La ida y vuelta estaba probada para lo que llega en un KMZ. Para el PMT
 * creado en la plataforma NO, y es justo donde un identificador mal construido
 * o un estado documental que se guarda en vez de derivarse se notaría tarde:
 * al abrir el proyecto la semana siguiente.
 */
import * as Proyecto from '../nucleo/proyecto.js';
import { filaDePmtCreado } from '../nucleo/validacion-pmt.js';
import { leerCatalogo } from '../nucleo/catalogos.js';
import { normalizarVigencia } from '../nucleo/tiempo.js';
import { estadoDocumental } from '../../motor/src/modelo/documental.js';
import { VERSION_REGLAS } from '../../motor/src/nucleo/config.js';

const CAT = leerCatalogo([
  { contrato: 'CW-1', contratista: 'Consorcio Uno', proyecto: 'PROY UNO', municipios: ['Medellín'] },
]).catalogo;
const CONFIG_OK = {
  umbralMetros: 120, granularidadTemporal: 'instante', toleranciaMinutos: 0,
  excluirMismoContrato: true, modoDistancia: 'real',
};

const CAPTURADO = {
  contrato: 'CW-1', frente: 'FRENTE CREADO', municipio: 'Medellín', direccion: 'Cra 1',
  tipoCierre: 'total', inicio: '2026-06-01 07:00:00', fin: '2026-06-20 18:00:00',
  geometria: { type: 'LineString', coordinates: [[-75.6, 6.2], [-75.599, 6.2]] },
  resolucionPmt: 'RES-7', permisoRotura: 'Pendiente',
};

test('un PMT creado en la plataforma sobrevive a guardar y volver a abrir', () => {
  const fila = filaDePmtCreado(CAPTURADO, CAT, { normalizarVigencia, ahora: 1780000000000 });

  // El catálogo mandó, y «Pendiente» no entró como código.
  assert.equal(fila.contratista, 'Consorcio Uno');
  assert.equal(fila.proyecto, 'PROY UNO');
  assert.equal(fila.resolucionPmt, 'RES-7');
  assert.equal(fila.permisoRotura, null, '«Pendiente» no es un código, ni por esta vía');
  assert.equal(fila.analizable, true);

  const p = Proyecto.crearProyecto({
    filas: [fila], relaciones: [], noEvaluables: [],
    archivos: [{ nombre: 'creado en la plataforma', estadoLectura: 'completa', placemarks: 1 }],
    config: CONFIG_OK, filtros: null, nombre: 'P', versionReglas: VERSION_REGLAS,
  });
  const leido = Proyecto.leerProyecto(Proyecto.serializar(p));
  assert.equal(leido.ok, true, leido.motivo ?? JSON.stringify(leido.errores));

  const v = leido.proyecto.trazados[0];
  for (const k of ['id', 'frente', 'contrato', 'contratista', 'proyecto', 'municipio',
    'tipoCierre', 'inicio', 'fin', 'resolucionPmt', 'permisoRotura']) {
    assert.deepEqual(v[k] ?? null, fila[k] ?? null, `cambió «${k}» al guardar y abrir`);
  }
  assert.deepEqual(v.geometria, fila.geometria, 'el trazado dibujado tiene que volver igual');

  // El estado documental se DERIVA otra vez, y da lo mismo: es derivado, no guardado.
  assert.equal(estadoDocumental(v).resumen, estadoDocumental(fila).resumen);
  assert.equal(estadoDocumental(v).resumen, '1/3');
});

test('el identificador de un PMT creado no colisiona con los del KMZ', () => {
  const a = filaDePmtCreado(CAPTURADO, CAT, { normalizarVigencia, ahora: 1780000000000 });
  const b = filaDePmtCreado(CAPTURADO, CAT, { normalizarVigencia, ahora: 1780000000001 });
  assert.notEqual(a.id, b.id, 'dos capturas distintas no pueden compartir identificador');
  assert.match(a.id, /^pmt_local_/, 'y se distingue de un identificador venido de un KMZ');
  // Si el PMT ya tenía identificador (se está EDITANDO), se respeta.
  assert.equal(filaDePmtCreado({ ...CAPTURADO, id: 'ya_tenia' }, CAT,
    { normalizarVigencia }).id, 'ya_tenia');
});

test('una vigencia ilegible no hace analizable a un PMT creado', () => {
  const f = filaDePmtCreado({ ...CAPTURADO, fin: 'la semana que viene' }, CAT,
    { normalizarVigencia });
  assert.equal(f.analizable, false, 'sin poder comparar en el tiempo no se analiza');
  assert.equal(f.inicio, '2026-06-01 07:00:00', 'pero el extremo que SÍ se leyó se conserva');
  assert.ok(f.avisos.length > 0, 'y se dice por qué');
});

/* ═══════ ATAQUE: EL VOCABULARIO CON EL MODELO CANDIDATO (autorevisión §3.3) ═══════ */

test('la lectura operativa también funciona con el modelo de zonas activo', async () => {
  const { calcularRelaciones } = await import('../../motor/src/nucleo/relaciones.js');
  const reg = (id, contrato, lon) => ({
    id, contrato, frente: id, municipio: 'M', avisos: [], errores: [],
    tieneGeometria: true,
    geometria: { type: 'Point', coordinates: [lon, 6.2] },
    caja: { minLon: lon, maxLon: lon, minLat: 6.2, maxLat: 6.2 },
    vigencia: { inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
      inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 10, 18), valida: true },
  });
  // ~180 m de separación: FUERA de los 120 m del modelo vigente, DENTRO de los
  // 240 m del candidato. Es el caso que distingue los dos modelos.
  const registros = [reg('A', 'CW1', -75.6000), reg('B', 'CW2', -75.59838)];

  const vigente = calcularRelaciones(registros, { modeloEspacial: 'minima' });
  assert.equal(vigente.relaciones.length, 0, 'a 180 m el modelo vigente no ve relación');

  const candidato = calcularRelaciones(registros, { modeloEspacial: 'zonasDeInfluencia' });
  assert.equal(candidato.relaciones.length, 1, 'el candidato sí, porque las zonas se superponen');

  const r = candidato.relaciones[0];
  assert.equal(lecturaOperativa(r), OPERATIVO.ARTICULACION_REQUERIDA,
    'comparten espacio según el criterio vigente y coinciden en el tiempo');
  // Y el resumen cuenta lo mismo que la lectura fila a fila, con cualquier modelo.
  const res = resumir(null, [], candidato.relaciones, []);
  assert.equal(res.articulacion, 1);
  assert.equal(res.coincidenciaEspacial, 0);
});
