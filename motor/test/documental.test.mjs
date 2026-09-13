/**
 * SEGUIMIENTO DOCUMENTAL — de la descripción del KMZ al estado que se muestra.
 *
 * La regla que se prueba aquí una y otra vez es una sola: **«Pendiente» no es
 * un código de resolución**. El valor es el código o es nada; el estado es
 * derivado y no se guarda en ninguna parte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCodigoDocumental, estadoDocumental, resumenDocumental,
  DOCUMENTOS, ESTADO_DOC } from '../src/modelo/documental.js';
import { leerDescripcion, CAMPOS, OPCIONALES } from '../src/io/descripcion.js';
import { aRegistro } from '../src/modelo/registro.js';
import * as F from '../fixtures/index.mjs';
import { leerKml } from '../src/io/kml.js';

test('un código de resolución de verdad se conserva tal cual', () => {
  for (const v of ['RES-1234-2026', 'RES 0012', '2026-00457', 'R.240/26', 'AMVA-1234']) {
    assert.equal(normalizarCodigoDocumental(v).codigo, v, v);
  }
});

test('los textos de relleno NO son códigos: se registran como ausencia, y se avisa', () => {
  for (const v of ['Pendiente', 'PENDIENTE', '  pendiente ', 'N/A', 'n.a.', 'No aplica',
    '-', '--', 'sin dato', 'ninguno', 'en trámite', '0', 'null', 'none', '.']) {
    const r = normalizarCodigoDocumental(v, 'Resolución PMT');
    assert.equal(r.codigo, null, `«${v}» no puede pasar por un código`);
    assert.ok(r.aviso && /no es un codigo/.test(r.aviso), `«${v}» debe dejar constancia`);
  }
});

test('el vacío NO genera aviso: no tener el documento todavía es lo normal', () => {
  for (const v of [null, undefined, '', '   ']) {
    const r = normalizarCodigoDocumental(v);
    assert.equal(r.codigo, null);
    assert.equal(r.aviso, null, 'un PMT recién creado no tiene ninguno, y eso no es un problema');
  }
});

test('el estado documental es 0/3, 2/3 o 3/3, y dice qué falta', () => {
  const vacio = estadoDocumental({});
  assert.equal(vacio.resumen, '0/3');
  assert.equal(vacio.sinNinguno, true);
  assert.equal(vacio.completo, false);
  assert.deepEqual(vacio.pendientes, ['resolucionPmt', 'permisoRotura', 'cierrePermisoRotura']);

  const dos = estadoDocumental({ resolucionPmt: 'R-1', permisoRotura: 'P-2' });
  assert.equal(dos.resumen, '2/3');
  assert.equal(dos.sinNinguno, false);
  assert.deepEqual(dos.pendientes, ['cierrePermisoRotura']);

  const tres = estadoDocumental({ resolucionPmt: 'R-1', permisoRotura: 'P-2', cierrePermisoRotura: 'C-3' });
  assert.equal(tres.resumen, '3/3');
  assert.equal(tres.completo, true);
  assert.deepEqual(tres.pendientes, []);
});

test('«ninguno» y «le falta el último» son estados DISTINTOS', () => {
  // Un PMT recién creado no es un PMT con la documentación a medias.
  assert.equal(estadoDocumental({}).sinNinguno, true);
  assert.equal(estadoDocumental({ resolucionPmt: 'R-1' }).sinNinguno, false);
});

test('el detalle lleva etiqueta legible, no el nombre técnico del campo', () => {
  for (const d of estadoDocumental({}).detalle) {
    assert.ok(d.etiqueta && /[A-ZÁÉÍÓÚ]/.test(d.etiqueta[0]), d.etiqueta);
    assert.ok([ESTADO_DOC.REGISTRADO, ESTADO_DOC.PENDIENTE].includes(d.estado));
  }
});

/* ═══════════ LA CADENA COMPLETA, DESDE EL KMZ ═══════════ */

test('los tres campos son OPCIONALES en la descripción: los KMZ de antes siguen valiendo', () => {
  for (const c of ['resolucion_pmt', 'permiso_rotura', 'cierre_permiso_rotura']) {
    assert.ok(CAMPOS.includes(c), `${c} tiene que ser un campo reconocido`);
    assert.ok(OPCIONALES.has(c), `${c} tiene que ser opcional`);
  }
  // Una descripción SIN los campos nuevos: se lee igual que siempre.
  const vieja = F.descripcion({ inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
    contrato: 'CW-1', municipio: 'Medellin' });
  const d = leerDescripcion(vieja);
  assert.equal(d.campos.contrato, 'CW-1');
  // Ausente es ausente: da igual que el lector lo represente con `null` o sin
  // la clave. Lo que NO puede pasar es que traiga un texto.
  assert.ok(!d.campos.resolucion_pmt, JSON.stringify(d.campos.resolucion_pmt));
  assert.ok(!d.avisos.some((a) => /resolucion_pmt/.test(a)),
    'que falte un campo opcional no puede producir un aviso');
});

const leerUno = (desc) => {
  const kml = F.documentoKml([F.placemark('F1', desc, F.punto([-75.6, 6.2]))]);
  const r = leerKml(kml, 'x.kml');
  return aRegistro(r.placemarks[0]);
};

test('KMZ → registro: los códigos llegan y su estado se deriva', () => {
  const reg = leerUno(F.descripcion({
    inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
    contrato: 'CW-1', municipio: 'Medellin',
    resolucionPmt: 'RES-1234-2026', permisoRotura: 'PR-88',
  }));
  assert.equal(reg.resolucionPmt, 'RES-1234-2026');
  assert.equal(reg.permisoRotura, 'PR-88');
  assert.equal(reg.cierrePermisoRotura, null);
  assert.equal(reg.documental.resumen, '2/3');
  assert.deepEqual(reg.documental.pendientes, ['cierrePermisoRotura']);
});

test('KMZ con «Pendiente» escrito: el motor lo convierte en ausencia y lo dice', () => {
  const reg = leerUno(F.descripcion({
    inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW-1',
    resolucionPmt: 'Pendiente',
  }));
  assert.equal(reg.resolucionPmt, null);
  assert.equal(reg.documental.resumen, '0/3');
  assert.ok(reg.avisos.some((a) => /no es un codigo/.test(a)), JSON.stringify(reg.avisos));
});

test('un KMZ sin ningún campo documental no produce avisos por ello', () => {
  const reg = leerUno(F.descripcion({
    inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00', contrato: 'CW-1' }));
  assert.equal(reg.documental.resumen, '0/3');
  assert.equal(reg.documental.sinNinguno, true);
  assert.ok(!reg.avisos.some((a) => /codigo|resolucion|rotura/i.test(a)),
    'los 8 KMZ reales no traen estos campos y no pueden llenarse de avisos');
});

test('el recuento del conjunto distingue completos, sin ninguno y pendientes por documento', () => {
  const r = resumenDocumental([
    { documental: estadoDocumental({ resolucionPmt: 'R', permisoRotura: 'P', cierrePermisoRotura: 'C' }) },
    { documental: estadoDocumental({ resolucionPmt: 'R' }) },
    { documental: estadoDocumental({}) },
    { documental: estadoDocumental({}) },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.completos, 1);
  assert.equal(r.sinNinguno, 2);
  assert.equal(r.pendientePorDocumento.resolucionPmt, 2);
  assert.equal(r.pendientePorDocumento.permisoRotura, 3);
  assert.equal(r.pendientePorDocumento.cierrePermisoRotura, 3);
});

test('DOCUMENTOS declara los tres, en el orden en que ocurren', () => {
  assert.deepEqual(DOCUMENTOS.map((d) => d.clave),
    ['resolucionPmt', 'permisoRotura', 'cierrePermisoRotura']);
  for (const d of DOCUMENTOS) {
    assert.ok(d.campo && d.etiqueta && d.ayuda, `${d.clave} necesita campo, etiqueta y ayuda`);
  }
});
