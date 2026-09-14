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
