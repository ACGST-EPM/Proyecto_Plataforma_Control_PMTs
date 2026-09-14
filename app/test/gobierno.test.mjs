/**
 * GOBIERNO DE DATOS MAESTROS Y VALIDACIÓN EN LA CAPTURA.
 *
 * La regla que se prueba una y otra vez: **si un dato se puede derivar, no se
 * pide**. Elegir el contrato determina contratista y proyecto, y eso elimina la
 * clase entera de error «la misma organización escrita de cuatro maneras», no
 * un caso concreto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Cat from '../nucleo/catalogos.js';
import { validarPmt, aplicarCatalogo, NIVEL } from '../nucleo/validacion-pmt.js';
import { CATALOGO_EMBEBIDO } from '../nucleo/catalogo-embebido.js';

const CATALOGO = Cat.leerCatalogo([
  { contrato: 'CW-1', contratista: 'Consorcio Uno', proyecto: 'PROY UNO', municipios: ['Medellín', 'Bello'] },
  { contrato: 'CW-2', contratista: 'Dos S.A.S', proyecto: 'PROY DOS', municipios: ['Itagüí'] },
]).catalogo;

const VALIDO = {
  contrato: 'CW-1', frente: 'F1', municipio: 'Medellín', direccion: 'Cra 1',
  tipoCierre: 'total', inicio: '2026-06-01 07:00:00', fin: '2026-06-20 18:00:00',
  geometria: { type: 'LineString', coordinates: [[-75.6, 6.2], [-75.599, 6.2]] },
};

/* ═══════════════ CATÁLOGO ═══════════════ */

test('el catálogo embebido es el que EPM mantiene, y se lee', () => {
  const r = Cat.leerCatalogo(CATALOGO_EMBEBIDO);
  assert.equal(r.ok, true, r.motivo);
  assert.ok(r.catalogo.contratos.length > 0);
  for (const c of r.catalogo.contratos) {
    assert.ok(c.contrato, 'todo contrato necesita su código');
    assert.ok(Array.isArray(c.municipios));
  }
});

test('elegir el contrato DETERMINA contratista y proyecto', () => {
  const d = Cat.derivarDeContrato(CATALOGO, 'CW-1');
  assert.equal(d.contratista, 'Consorcio Uno');
  assert.equal(d.proyecto, 'PROY UNO');
  assert.deepEqual(d.municipios, ['Medellín', 'Bello']);
  // En minúsculas también: el código se normaliza.
  assert.equal(Cat.derivarDeContrato(CATALOGO, 'cw-1').contratista, 'Consorcio Uno');
  assert.equal(Cat.derivarDeContrato(CATALOGO, 'NO-EXISTE'), null);
});

test('LA CLASE DE ERROR: cuatro formas de escribir la misma organización', () => {
  const r = Cat.leerCatalogo([
    { contrato: 'A', contratista: 'MEXICHEM', proyecto: 'P', municipios: ['M'] },
    { contrato: 'B', contratista: 'Mexichem', proyecto: 'P', municipios: ['M'] },
    { contrato: 'C', contratista: 'MEXICHEM S.A.', proyecto: 'P', municipios: ['M'] },
    { contrato: 'D', contratista: 'MEXICHEM SAS', proyecto: 'P', municipios: ['M'] },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.posiblesDuplicados.length, 1, 'las cuatro son la misma clave');
  assert.equal(r.posiblesDuplicados[0].formas.length, 4);
  assert.ok(r.avisos.some((a) => /misma organización/.test(a)), JSON.stringify(r.avisos));
  // AVISO, NO CORRECCIÓN: unificarlas por nuestra cuenta sería decidir por EPM.
  assert.equal(r.catalogo.contratos.length, 4, 'no se fusiona nada');
  assert.equal(r.catalogo.contratos[2].contratista, 'MEXICHEM S.A.',
    'se conserva exactamente lo que EPM escribió');
});

test('la clave de comparación ignora forma societaria, acentos y puntuación', () => {
  const k = Cat.claveDeNombre;
  assert.equal(k('MEXICHEM S.A.'), k('Mexichem sas'));
  assert.equal(k('Consorcio AMT24'), k('AMT24'));
  assert.equal(k('SANEAR S.A.S'), k('Sanear'));
  assert.notEqual(k('SANEAR'), k('SANEAR NORTE'), 'no puede juntar lo que es distinto');
});

test('un catálogo con filas malas no se rechaza entero: se dice qué se descartó', () => {
  const r = Cat.leerCatalogo([
    { contrato: 'A', contratista: 'X', proyecto: 'P', municipios: ['M'] },
    { contratista: 'sin contrato' },
    { contrato: 'A', contratista: 'repetido' },
    { contrato: 'B' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.catalogo.contratos.length, 2, 'se conserva lo utilizable');
  assert.ok(r.avisos.some((a) => /sin código de contrato/.test(a)));
  assert.ok(r.avisos.some((a) => /más de una vez/.test(a)));
  assert.ok(r.avisos.some((a) => /sin contratista/.test(a)));
});

test('un catálogo ilegible se rechaza con un motivo entendible', () => {
  for (const malo of ['{{{', '{"algo":1}', '[]', 'null']) {
    const r = Cat.leerCatalogo(malo);
    assert.equal(r.ok, false, malo);
    assert.ok(r.motivo.length > 10, r.motivo);
  }
});

/* ═══════════════ VALIDACIÓN EN LA CAPTURA ═══════════════ */

test('los TRES NIVELES hacen cosas distintas', () => {
  const r = validarPmt({}, CATALOGO);
  assert.equal(r.sePuedeGuardar, false, 'un ERROR impide guardar');
  const niveles = new Set(r.avisos.map((a) => a.nivel));
  assert.ok(niveles.has(NIVEL.ERROR));
  // Una ADVERTENCIA sola no impide guardar.
  const conAdvertencia = validarPmt({ ...VALIDO, direccion: '' }, CATALOGO);
  assert.equal(conAdvertencia.sePuedeGuardar, true);
  assert.ok(conAdvertencia.advertencias > 0);
  // Y la INFORMACION no pide nada.
  const info = validarPmt(VALIDO, CATALOGO);
  assert.equal(info.errores, 0);
  assert.equal(info.advertencias, 0);
  assert.ok(info.avisos.some((a) => a.nivel === NIVEL.INFORMACION));
});

test('lo que impide guardar es lo que hace que el PMT no signifique nada', () => {
  const falta = (campo) => validarPmt({ ...VALIDO, [campo]: campo === 'geometria' ? null : '' }, CATALOGO)
    .avisos.filter((a) => a.nivel === NIVEL.ERROR).map((a) => a.campo);
  assert.ok(falta('contrato').includes('contrato'));
  assert.ok(falta('frente').includes('frente'));
  assert.ok(falta('tipoCierre').includes('tipoCierre'));
  assert.ok(falta('inicio').includes('inicio'));
  assert.ok(falta('geometria').includes('geometria'));
  // La direccion NO impide guardar: el PMT sigue significando algo sin ella.
  assert.ok(!falta('direccion').includes('direccion'));
});

test('un contrato que no está en el catálogo se rechaza, y se explica por qué', () => {
  const r = validarPmt({ ...VALIDO, contrato: 'CW-INVENTADO' }, CATALOGO);
  assert.equal(r.sePuedeGuardar, false);
  const a = r.avisos.find((x) => x.campo === 'contrato');
  assert.match(a.texto, /no está en el catálogo/);
  assert.match(a.ayuda, /EPM/, 'y dice quién lo mantiene');
});

test('un municipio fuera de los declarados es ADVERTENCIA, no error', () => {
  // Puede ser correcto: una obra se amplía. No nos corresponde impedirlo.
  const r = validarPmt({ ...VALIDO, municipio: 'Envigado' }, CATALOGO);
  assert.equal(r.sePuedeGuardar, true);
  const a = r.avisos.find((x) => x.campo === 'municipio');
  assert.equal(a.nivel, NIVEL.ADVERTENCIA);
  assert.match(a.ayuda, /Medellín, Bello/);
});

test('el catálogo MANDA sobre lo que se escriba en contratista o proyecto', () => {
  const r = validarPmt({ ...VALIDO, contratista: 'Otro Nombre' }, CATALOGO);
  const a = r.avisos.find((x) => x.campo === 'contratista');
  assert.equal(a.nivel, NIVEL.ADVERTENCIA);
  assert.match(a.ayuda, /Manda el catálogo/);
  // Y al guardar se impone el del catálogo.
  const guardado = aplicarCatalogo({ ...VALIDO, contratista: 'Otro Nombre' }, CATALOGO);
  assert.equal(guardado.contratista, 'Consorcio Uno');
  assert.equal(guardado.proyecto, 'PROY UNO');
});

test('fin anterior al inicio es ERROR; igual al inicio es ADVERTENCIA', () => {
  const invertida = validarPmt({ ...VALIDO, fin: '2026-05-01 07:00:00' }, CATALOGO);
  assert.equal(invertida.sePuedeGuardar, false);
  const cero = validarPmt({ ...VALIDO, fin: VALIDO.inicio }, CATALOGO);
  assert.equal(cero.sePuedeGuardar, true);
  assert.ok(cero.avisos.some((a) => a.nivel === NIVEL.ADVERTENCIA && /mismo instante/.test(a.texto)));
});

test('un tipo de cierre fuera de la lista cerrada no pasa', () => {
  const r = validarPmt({ ...VALIDO, tipoCierre: 'ingreso' }, CATALOGO);
  assert.equal(r.sePuedeGuardar, false);
  assert.ok(r.avisos.some((a) => /exactamente tres/.test(a.ayuda ?? '')));
});

test('un punto con cierre total es ADVERTENCIA: puede ser legítimo', () => {
  const r = validarPmt({ ...VALIDO, geometria: { type: 'Point', coordinates: [-75.6, 6.2] } }, CATALOGO);
  assert.equal(r.sePuedeGuardar, true);
  const a = r.avisos.find((x) => x.campo === 'geometria');
  assert.equal(a.nivel, NIVEL.ADVERTENCIA);
  // Y con «ingreso y salida» no dice nada: es lo habitual.
  const iys = validarPmt({ ...VALIDO, tipoCierre: 'ingreso y salida',
    geometria: { type: 'Point', coordinates: [-75.6, 6.2] } }, CATALOGO);
  assert.ok(!iys.avisos.some((x) => x.campo === 'geometria'));
});

test('escribir «Pendiente» en un código documental avisa y explica qué hacer', () => {
  const r = validarPmt({ ...VALIDO, resolucionPmt: 'Pendiente' }, CATALOGO);
  assert.equal(r.sePuedeGuardar, true, 'no impide guardar: el PMT sigue siendo válido');
  const a = r.avisos.find((x) => x.campo === 'resolucionPmt');
  assert.equal(a.nivel, NIVEL.ADVERTENCIA);
  assert.match(a.ayuda, /Deje la casilla vacía/);
});

test('un PMT duplicado es ADVERTENCIA: puede ser una revigencia', () => {
  const existentes = [{ id: 'otro', contrato: 'CW-1', frente: 'F1', inicio: '2026-06-01 07:00:00' }];
  const r = validarPmt(VALIDO, CATALOGO, { existentes });
  assert.equal(r.sePuedeGuardar, true);
  const a = r.avisos.find((x) => /Ya hay un PMT/.test(x.texto));
  assert.equal(a.nivel, NIVEL.ADVERTENCIA);
  assert.match(a.ayuda, /revigencia/);
  // Y no se avisa contra uno mismo al editar.
  const editando = validarPmt({ ...VALIDO, id: 'otro' }, CATALOGO, { existentes });
  assert.ok(!editando.avisos.some((x) => /Ya hay un PMT/.test(x.texto)));
});

test('NO se inventan restricciones: una vigencia larga es INFORMACIÓN', () => {
  const r = validarPmt({ ...VALIDO, inicio: '2026-01-01 00:00:00', fin: '2027-06-01 00:00:00' }, CATALOGO);
  assert.equal(r.sePuedeGuardar, true);
  const a = r.avisos.find((x) => /más de un año/.test(x.texto));
  assert.equal(a.nivel, NIVEL.INFORMACION, 'no sabemos cuánto puede durar un PMT');
});

test('cada aviso dice QUÉ pasa y, cuando ayuda, QUÉ hacer', () => {
  const r = validarPmt({}, CATALOGO);
  for (const a of r.avisos) {
    assert.ok(a.campo, 'todo aviso tiene que señalar un campo');
    assert.ok(a.texto && a.texto.length > 5, JSON.stringify(a));
    assert.ok(!/undefined|null/.test(a.texto), a.texto);
  }
});

/* ═══════════ ATAQUE: DATOS HOSTILES EN LA CAPTURA (autorevisión §3.1) ═══════════
 *
 * El camino feliz ya estaba probado. Esto es lo contrario: lo que escribiría
 * alguien con prisa, alguien copiando y pegando, o un catálogo mal mantenido.
 * La regla que se comprueba es siempre la misma: **nunca se guarda algo que no
 * se pueda analizar, y nunca se descarta algo en silencio.**
 */

test('ATAQUE: coordenadas fuera del planeta no se pueden guardar', () => {
  for (const g of [
    { type: 'Point', coordinates: [-181, 6.2] },
    { type: 'Point', coordinates: [-75.6, 91] },
    { type: 'LineString', coordinates: [[-75.6, 6.2], [200, 6.2]] },
    { type: 'Point', coordinates: [NaN, 6.2] },
    { type: 'Point', coordinates: ['-75.6', '6.2'] },
  ]) {
    const r = validarPmt({ ...VALIDO, geometria: g }, CATALOGO);
    assert.equal(r.sePuedeGuardar, false, 'se guardó ' + JSON.stringify(g));
    assert.ok(r.avisos.some((a) => a.campo === 'geometria' && a.nivel === NIVEL.ERROR),
      'y el error tiene que señalar el trazado: ' + JSON.stringify(r.avisos));
  }
});

test('ATAQUE: una línea de un solo punto no es una línea', () => {
  const r = validarPmt({
    ...VALIDO, geometria: { type: 'LineString', coordinates: [[-75.6, 6.2]] },
  }, CATALOGO);
  assert.equal(r.sePuedeGuardar, false);
  assert.ok(r.avisos.some((a) => a.campo === 'geometria'));
});

test('ATAQUE: un contrato con la lista de municipios vacía no bloquea el alta', () => {
  // Es un defecto del CATÁLOGO, no del PMT. No se puede castigar a quien
  // captura por un dato maestro incompleto: se avisa y se deja seguir.
  const cat = Cat.leerCatalogo([
    { contrato: 'CW-9', contratista: 'Nueve', proyecto: 'P9', municipios: [] },
  ]).catalogo;
  const r = validarPmt({ ...VALIDO, contrato: 'CW-9', municipio: 'Medellín' }, cat);
  const delMunicipio = r.avisos.filter((a) => a.campo === 'municipio');
  assert.ok(!delMunicipio.some((a) => a.nivel === NIVEL.ERROR),
    'un catálogo incompleto no puede impedir capturar: ' + JSON.stringify(delMunicipio));
});

test('ATAQUE: un catálogo corrupto se rechaza ENTERO, no a medias', () => {
  for (const malo of [
    null, 'no soy json', 42, [{ sinContrato: true }],
    { contratos: 'esto no es una lista' },
  ]) {
    const r = Cat.leerCatalogo(malo);
    assert.equal(r.ok, false, 'aceptó ' + JSON.stringify(malo));
    assert.ok(r.motivo && r.motivo.length > 5, 'y dice por qué: ' + JSON.stringify(r));
  }
});

test('ATAQUE: un contrato que no está en el catálogo no se acepta en silencio', () => {
  const r = validarPmt({ ...VALIDO, contrato: 'CW-INVENTADO' }, CATALOGO);
  assert.ok(r.avisos.some((a) => a.campo === 'contrato'),
    'un contrato desconocido tiene que decirse: ' + JSON.stringify(r.avisos));
  // Y al aplicar el catálogo no se puede inventar un contratista.
  const p = aplicarCatalogo({ ...VALIDO, contrato: 'CW-INVENTADO' }, CATALOGO);
  assert.ok(!p.contratista, 'no hay contratista que derivar, así que no se pone ninguno');
});

test('ATAQUE: el catálogo MANDA aunque el formulario traiga otra cosa', () => {
  const p = aplicarCatalogo({ ...VALIDO, contratista: 'LO QUE YO ESCRIBA', proyecto: 'MÍO' }, CATALOGO);
  assert.equal(p.contratista, 'Consorcio Uno');
  assert.equal(p.proyecto, 'PROY UNO');
});
