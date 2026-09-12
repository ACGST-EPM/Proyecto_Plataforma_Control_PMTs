/**
 * MODELO DE FUENTES, VERSIONES Y ACTUALIZACIÓN INCREMENTAL.
 *
 * Todo esto es independiente del proveedor: se prueba con un origen simulado,
 * sin ningún servicio corporativo. Ese es justamente el objetivo — que el día
 * que exista un origen real, lo único nuevo sea el adaptador.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as H from '../fuentes/huella.js';
import * as I from '../fuentes/inventario.js';
import * as P from '../fuentes/proveedores.js';
import * as S from '../fuentes/sincronizacion.js';
import * as A from '../fuentes/auditoria.js';

const obs = (ruta, txt, extra = {}) => I.observarFuente({
  proveedor: 'test', ruta, datos: new TextEncoder().encode(txt), ...extra });

/* ═══════════════ HUELLAS ═══════════════ */

test('la huella distingue contenidos y declara con qué se calculó', async () => {
  const a = await H.huellaDe('contenido');
  const b = await H.huellaDe('contenido');
  const c = await H.huellaDe('contenidos');
  assert.equal(H.mismaHuella(a, b), true);
  assert.equal(H.mismaHuella(a, c), false);
  assert.ok(a.algoritmo, 'la huella siempre dice cómo se calculó');
  assert.equal(typeof a.criptografica, 'boolean');
  assert.equal(a.bytes, 9);
});

test('dos huellas de algoritmos distintos NO se comparan: se dice que no se sabe', async () => {
  const a = await H.huellaDe('x');
  assert.equal(H.mismaHuella(a, { ...a, algoritmo: 'otro' }), null,
    'decir «son distintas» sería tan falso como decir «son iguales»');
  assert.equal(H.mismaHuella(a, null), null);
});

test('la huella tiene en cuenta la longitud: ceros al final no se pierden', async () => {
  const a = await H.huellaDe(new Uint8Array([1, 2, 3]));
  const b = await H.huellaDe(new Uint8Array([1, 2, 3, 0, 0]));
  assert.equal(H.mismaHuella(a, b), false);
});

/* ═══════════════ LAS TRES PREGUNTAS QUE NO SON LA MISMA ═══════════════ */

test('DEDUPLICACIÓN TÉCNICA: mismo contenido, otro nombre, en el mismo lote', async () => {
  const lote = [await obs('a.kmz', 'IGUAL'), await obs('copia_de_a.kmz', 'IGUAL')];
  const c = I.compararInventarios(null, lote);
  assert.equal(c.resumen.nueva, 1);
  assert.equal(c.resumen.duplicada, 1, 'la copia no es información nueva');
  const plan = I.planDeActualizacion(c);
  assert.equal(plan.aLeer, 1, 'y no se procesa dos veces');
  assert.ok(plan.avisos.some((x) => /mismo contenido/.test(x)), plan.avisos.join(' | '));
});

test('VERSIONADO: mismo sitio, otro contenido', async () => {
  const v1 = [await obs('a.kmz', 'v1')];
  const inv = I.crearInventario(v1, new Map([[v1[0].id, ['p1']]]));
  const c = I.compararInventarios(inv, [await obs('a.kmz', 'v2')]);
  assert.equal(c.resumen.modificada, 1);
  assert.equal(c.resumen.nueva, 0, 'no es un archivo nuevo: es el mismo, más nuevo');
  assert.equal(c.resumen.eliminada, 0);
});

test('MOVER NO ES DAR DE BAJA Y DE ALTA', async () => {
  const v1 = [await obs('entrada/a.kmz', 'MISMO')];
  const inv = I.crearInventario(v1, new Map([[v1[0].id, ['p1', 'p2']]]));
  const c = I.compararInventarios(inv, [await obs('archivo/2026/a.kmz', 'MISMO')]);
  assert.equal(c.resumen.movida, 1);
  assert.equal(c.resumen.nueva, 0);
  assert.equal(c.resumen.eliminada, 0, 'lo contrario haría desaparecer y reaparecer todos sus PMT');
  const plan = I.planDeActualizacion(c);
  assert.equal(plan.aLeer, 0, 'el contenido ya se conoce: no hay que volver a leerlo');
  assert.deepEqual(plan.registrosQueSeRetiran, []);
});

test('IDENTIDAD DE NEGOCIO: el mismo PMT en dos versiones sigue siendo el mismo', () => {
  const d = I.diferenciasDeRegistros(['pmt_a', 'pmt_b'], ['pmt_a', 'pmt_c']);
  assert.deepEqual(d.permanecen, ['pmt_a']);
  assert.deepEqual(d.altas, ['pmt_c']);
  assert.deepEqual(d.bajas, ['pmt_b']);
  assert.equal(d.hayCambios, true);
  const igual = I.diferenciasDeRegistros(['pmt_a'], ['pmt_a']);
  assert.equal(igual.hayCambios, false);
});

test('ELIMINAR: se retira, y se sabe qué PMT se van con ella', async () => {
  const v1 = [await obs('a.kmz', 'A'), await obs('b.kmz', 'B')];
  const inv = I.crearInventario(v1, new Map([[v1[0].id, ['p1']], [v1[1].id, ['p2', 'p3']]]));
  const c = I.compararInventarios(inv, [await obs('a.kmz', 'A')]);
  assert.equal(c.resumen.eliminada, 1);
  const plan = I.planDeActualizacion(c);
  assert.deepEqual(plan.registrosQueSeRetiran, ['p2', 'p3']);
});

test('HUELLAS NO COMPARABLES: se trata como modificada, y se explica', async () => {
  const v1 = [await obs('a.kmz', 'A')];
  const inv = I.crearInventario(v1, new Map());
  // Simula un inventario escrito por una versión con otro algoritmo.
  inv.fuentes[0].huella = { ...inv.fuentes[0].huella, algoritmo: 'sha-1-imaginario' };
  const c = I.compararInventarios(inv, [await obs('a.kmz', 'A')]);
  assert.equal(c.resumen.indeterminada, 1);
  assert.equal(I.planDeActualizacion(c).aLeer, 1, 'ante la duda, se vuelve a leer');
});

/* ═══════════════ INVENTARIO GUARDADO ═══════════════ */

test('un inventario corrupto no es fatal: significa «no sé qué había antes»', () => {
  for (const malo of ['{', '[]', '{"esquema":99,"fuentes":[]}', 'null']) {
    const r = I.leerInventario(malo);
    assert.equal(r.ok, false, malo);
    assert.ok(r.motivo.length > 0);
  }
  // Y entonces todo se trata como nuevo, que es lo seguro.
  const c = I.compararInventarios(null, []);
  assert.equal(c.hayCambios, false);
});

test('el inventario sobrevive a guardarse y volver a leerse', async () => {
  const v = [await obs('a.kmz', 'A'), await obs('b.kmz', 'B')];
  const inv = I.crearInventario(v, new Map([[v[0].id, ['p2', 'p1']]]));
  const r = I.leerInventario(I.serializarInventario(inv));
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.inventario.fuentes.length, 2);
  assert.deepEqual(r.inventario.fuentes[0].registros, ['p1', 'p2'], 'ordenados, para poder comparar');
  // Y comparar contra él no detecta ningún cambio inventado.
  const c = I.compararInventarios(r.inventario, v);
  assert.equal(c.hayCambios, false);
});

/* ═══════════════ PROVEEDORES ═══════════════ */

test('el contrato del proveedor se valida antes de usarlo', () => {
  assert.equal(P.validarProveedor(P.proveedorSimulado()).ok, true);
  assert.equal(P.validarProveedor({ nombre: 'x' }).ok, false);
  assert.equal(P.validarProveedor({ nombre: 'x', listar: 1, leer: 2 }).ok, false);
  assert.equal(P.validarProveedor(null).ok, false);
});

test('el proveedor local expone archivos elegidos con el MISMO contrato que uno remoto', async () => {
  const prov = P.proveedorLocal([{ nombre: 'a.kmz', datos: new TextEncoder().encode('A').buffer }]);
  const lista = await prov.listar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].ruta, 'a.kmz');
  const datos = await prov.leer('a.kmz');
  assert.equal(new TextDecoder().decode(datos), 'A');
  assert.equal(prov.admiteNotificaciones, false, 'y no promete avisar de cambios, porque no puede');
  assert.ok(prov.motivoSinNotificaciones.length > 0, 'y dice por qué');
});

test('un archivo que no se deja leer NO tumba el lote entero', async () => {
  const prov = P.proveedorSimulado();
  prov.poner('a.kmz', 'A').poner('b.kmz', 'B').romper('b.kmz', 'permiso denegado');
  const { observadas, rechazadas } = await P.observarTodo(prov);
  assert.equal(observadas.length, 1);
  assert.equal(rechazadas.length, 1);
  assert.match(rechazadas[0].motivo, /permiso denegado/);
});

/* ═══════════════ LA TUBERÍA ═══════════════ */

const procesarFalso = async (f) => [`${f.huella.valor.slice(0, 8)}#1`, `${f.huella.valor.slice(0, 8)}#2`];

test('PROPIEDAD: sincronizar dos veces sin cambios no produce ningún cambio', async () => {
  const prov = P.proveedorSimulado();
  prov.poner('a.kmz', 'A').poner('b.kmz', 'B');
  let inv = null;
  const r1 = await S.revisar(prov, inv);
  const a1 = await S.aplicar(prov, r1, procesarFalso, inv);
  inv = a1.inventario;
  assert.equal(a1.leidas, 2);

  const r2 = await S.revisar(prov, inv);
  const a2 = await S.aplicar(prov, r2, procesarFalso, inv);
  assert.equal(r2.comparacion.hayCambios, false, 'la segunda vez no puede haber cambios');
  assert.equal(a2.leidas, 0, 'ni hace falta leer nada');
  assert.equal(a2.difRegistros.hayCambios, false);
  assert.match(S.explicarSincronizacion(r2, a2), /No ha cambiado nada/);

  // Y una tercera no se desvía tampoco: el inventario es estable.
  const r3 = await S.revisar(prov, a2.inventario);
  assert.equal(r3.comparacion.hayCambios, false);
});

test('solo se lee lo que cambió, y el ahorro se dice con su cifra', async () => {
  const prov = P.proveedorSimulado();
  for (let i = 0; i < 8; i++) prov.poner(`k${i}.kmz`, `contenido ${i}`);
  let inv = (await S.aplicar(prov, await S.revisar(prov, null), procesarFalso, null)).inventario;

  prov.poner('k3.kmz', 'contenido 3 corregido');
  const rev = await S.revisar(prov, inv);
  const res = await S.aplicar(prov, rev, procesarFalso, inv);
  assert.equal(res.leidas, 1, 'de ocho archivos solo se vuelve a leer uno');
  assert.equal(res.ahorradas, 7);
  assert.equal(res.porcentajeEvitado, 88);
  assert.equal(res.inventario.fuentes.length, 8, 'y el inventario sigue completo');
});

test('el ciclo completo: alta, cambio, movimiento y baja', async () => {
  const prov = P.proveedorSimulado();
  prov.poner('a.kmz', 'A').poner('b.kmz', 'B');
  let bit = A.crearBitacora();
  let inv = null;
  let res = await S.aplicar(prov, await S.revisar(prov, inv), procesarFalso, inv, bit);
  inv = res.inventario; bit = res.bitacora;
  const pmtInicial = inv.fuentes.flatMap((f) => f.registros);
  assert.equal(pmtInicial.length, 4);

  prov.poner('c.kmz', 'C');                 // alta
  prov.poner('b.kmz', 'B corregido');       // cambio
  prov.mover('a.kmz', 'historico/a.kmz');   // movimiento
  let rev = await S.revisar(prov, inv);
  res = await S.aplicar(prov, rev, procesarFalso, inv, bit);
  inv = res.inventario; bit = res.bitacora;
  assert.equal(rev.comparacion.resumen.nueva, 1);
  assert.equal(rev.comparacion.resumen.modificada, 1);
  assert.equal(rev.comparacion.resumen.movida, 1);
  assert.equal(rev.comparacion.resumen.eliminada, 0, 'mover no es eliminar');
  assert.equal(res.leidas, 2, 'la movida no se relee');

  prov.quitar('c.kmz');                      // baja
  rev = await S.revisar(prov, inv);
  res = await S.aplicar(prov, rev, procesarFalso, inv, bit);
  assert.equal(rev.comparacion.resumen.eliminada, 1);
  assert.equal(res.difRegistros.bajas.length, 2, 'sus dos PMT se van con ella');
  assert.equal(res.inventario.fuentes.length, 2);
});

test('una fuente que falla al leerse NO se da por vigente con su versión anterior', async () => {
  const prov = P.proveedorSimulado();
  prov.poner('a.kmz', 'A').poner('b.kmz', 'B');
  let inv = (await S.aplicar(prov, await S.revisar(prov, null), procesarFalso, null)).inventario;

  prov.poner('b.kmz', 'B v2').romper('b.kmz', 'el origen cortó la conexión');
  const rev = await S.revisar(prov, inv);
  const res = await S.aplicar(prov, rev, procesarFalso, inv);
  assert.equal(res.errores.length, 1);
  assert.match(res.errores[0].motivo, /cortó la conexión/);
  const b = res.inventario.fuentes.find((f) => f.ruta === 'b.kmz');
  assert.equal(b, undefined,
    'dar por buena la versión anterior haría pasar por vigente algo que no se pudo confirmar');
});

/* ═══════════════ BITÁCORA ═══════════════ */

test('la bitácora solo añade, y no inventa quién hizo qué', async () => {
  const prov = P.proveedorSimulado();
  prov.poner('a.kmz', 'A');
  let bit = A.crearBitacora();
  const antes = bit.anotaciones.length;
  const res = await S.aplicar(prov, await S.revisar(prov, null), procesarFalso, null, bit);
  assert.ok(res.bitacora.anotaciones.length > antes);
  assert.equal(bit.anotaciones.length, antes, 'la bitácora anterior no se muta');
  for (const x of res.bitacora.anotaciones) {
    assert.equal(x.actor, 'equipo-local',
      'sin identidad, no se atribuye a nadie: inventarlo sería peor que no tenerlo');
    assert.ok(x.momento && x.hecho && x.resumen);
  }
});

test('un hecho desconocido se anota como error, no se pierde en silencio', () => {
  const b = A.anotar(A.crearBitacora(), { hecho: 'inventado', resumen: 'algo' });
  assert.equal(b.anotaciones[0].hecho, A.HECHO.ERROR);
  assert.match(b.anotaciones[0].resumen, /no reconocido/);
});

test('la bitácora se guarda y se vuelve a leer, y una corrupta empieza vacía', () => {
  const b = A.anotar(A.crearBitacora(), { hecho: A.HECHO.ANALISIS, resumen: 'x' });
  const l = A.leerBitacora(A.serializarBitacora(b));
  assert.equal(l.anotaciones.length, 1);
  assert.equal(A.leerBitacora('{{{').anotaciones.length, 0);
  assert.equal(A.leerBitacora('{"esquema":9}').anotaciones.length, 0);
});
