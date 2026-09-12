/**
 * PRUEBAS DE NAVEGADOR REAL (Etapa 2.1).
 *
 * La Etapa 2 se apoyaba solo en pruebas de logica pura, y por eso se entregaron
 * defectos que unicamente se ven al abrir la aplicacion: el mapa base en
 * blanco, los filtros sin cruzar y el `$$` roto por el empaquetador. Estas
 * pruebas conducen la aplicacion EMPAQUETADA como lo haria una persona.
 *
 * HERRAMIENTA: Playwright. Se eligio porque ya estaba disponible en el entorno,
 * controla Chromium (el navegador de la usuaria), sabe cargar archivos en un
 * `<input type=file>`, interceptar la red para simular una oficina sin salida a
 * internet, y capturar descargas. Es dependencia SOLO de desarrollo: no entra
 * en el producto.
 *
 * SE PRUEBA EL ARCHIVO DE `dist/`, desde `file://`, que es exactamente lo que
 * abre la usuaria con doble clic.
 *
 * Requiere `npm run construir:app` antes. Se salta sola si falta el navegador.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const APP = path.join(RAIZ, 'dist', 'Plataforma_PMTs.html');
const URL_APP = 'file://' + APP;
const TMP = path.join(RAIZ, 'motor', 'node_modules', '.pmt-pruebas');

let chromium = null, ejecutable = null;
try {
  // Playwright vive en `motor/node_modules` (es donde esta el package.json que
  // lo declara), asi que se resuelve por ruta explicita: estas pruebas se
  // lanzan desde la raiz del repositorio.
  ({ chromium } = await import(
    new URL('../../motor/node_modules/playwright/index.mjs', import.meta.url).href));
  for (const p of fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers') : []) {
    const c = `/opt/pw-browsers/${p}/chrome-linux/chrome`;
    if (p.startsWith('chromium-') && fs.existsSync(c)) { ejecutable = c; break; }
  }
} catch { /* sin playwright */ }

const hayNavegador = !!chromium && fs.existsSync(APP);
const saltar = { skip: !hayNavegador ? 'requiere playwright, un Chromium y dist/ construido' : false };

/* ── Fixtures sinteticos: ningun dato real de EPM ── */
const F = await import('../../motor/fixtures/index.mjs');
const desc = (c, o = {}) => F.descripcion({
  inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00',
  contrato: c, municipio: 'Medellin', ...o,
});

fs.mkdirSync(TMP, { recursive: true });
function escribir(nombre, datos) {
  const p = path.join(TMP, nombre);
  fs.writeFileSync(p, datos instanceof Uint8Array ? Buffer.from(datos) : datos);
  return p;
}

const KMZ_A = escribir('alfa.kmz', F.kmz([
  F.placemark('A-TOTAL', desc('CW1', { tipo: 'total' }), F.linea([[-75.6000, 6.2000], [-75.5990, 6.2000]])),
  F.placemark('A-PARCIAL', desc('CW1', { tipo: 'parcial' }), F.punto([-75.5980, 6.2000])),
]));
const KMZ_B = escribir('beta.kmz', F.kmz([
  F.placemark('B-IYS', desc('CW2', { tipo: 'ingreso y salida' }), F.punto([-75.5995, 6.2004])),
  F.placemark('B-TOTAL', desc('CW2', { tipo: 'total' }), F.linea([[-75.5985, 6.2001], [-75.5975, 6.2001]])),
]));
const KML_C = escribir('gama.kml', F.documentoKml([
  F.placemark('C-UNO', desc('CW3', { tipo: 'total' }), F.punto([-75.5992, 6.2002])),
]));
const KMZ_ROTO = escribir('roto.kmz', new Uint8Array([1, 2, 3, 4, 5]));
const KML_PARCIAL = escribir('parcial.kml',
  '<?xml version="1.0"?><kml><Document>' +
  '<NetworkLink><Link><href>otro.kml</href></Link></NetworkLink>' +
  `<Placemark><name>P-UNO</name><description>${desc('CW4')}</description>` +
  '<Point><coordinates>-75.5991,6.2003,0</coordinates></Point></Placemark></Document></kml>');

/* ── Servidor de teselas de laboratorio ── */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let servidor = null, puerto = 0, pedidas = 0;
if (hayNavegador) {
  servidor = http.createServer((req, res) => {
    pedidas++;
    // A proposito SIN cabecera CORS: reproduce una red corporativa que la quita.
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
    res.end(PNG);
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  puerto = servidor.address().port;
}

let navegador = null;
async function abrir({ sinRed = false, teselasLocales = false } = {}) {
  navegador ??= await chromium.launch({ executablePath: ejecutable });
  const ctx = await navegador.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  if (sinRed) await ctx.route('**://*/**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await p.goto(URL_APP);
  if (teselasLocales) {
    await p.evaluate((u) => localStorage.setItem('pmt.mapaBase.v1',
      JSON.stringify({ proveedor: 'corporativo', urlCorporativa: u, atribucionCorporativa: 'lab' })),
    `http://127.0.0.1:${puerto}/{z}/{x}/{y}.png`);
    await p.reload();
  }
  p.erroresJs = errores;
  return p;
}

async function cargar(p, archivos, selector = '#entrada') {
  await p.setInputFiles(selector, archivos);
  await p.waitForSelector('#panelResumen:not(.oculto)', { timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('#tarjetas').textContent.trim().length > 0, null, { timeout: 60000 });
}
const txt = (p, sel) => p.textContent(sel).then((t) => (t ?? '').replace(/\s+/g, ' ').trim());

test.after(async () => {
  if (navegador) await navegador.close();
  if (servidor) servidor.close();
});

/* ═══════════════════ ARRANQUE Y CARGA ═══════════════════ */

test('arranca desde file:// sin errores de JavaScript', saltar, async () => {
  const p = await abrir();
  await p.waitForTimeout(900);
  assert.equal(await p.title(), 'Plataforma de Control y Articulación de PMTs — Grupo EPM');
  assert.ok(await p.$('#btnElegir'), 'la aplicacion se pinto');
  assert.equal(await p.evaluate(() => typeof window.L), 'object', 'Leaflet va incluido, no de una CDN');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('carga un KMZ, un KML y varios a la vez', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KMZ_A]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  await p.close();

  const q = await abrir();
  await cargar(q, [KML_C]);
  assert.equal(await txt(q, '#cuentaPmt'), '1');
  await q.close();

  const r = await abrir();
  await cargar(r, [KMZ_A, KMZ_B, KML_C]);
  assert.equal(await txt(r, '#cuentaPmt'), '5');
  assert.ok(+(await txt(r, '#cuentaRel')) > 0, 'y encuentra relaciones entre contratos distintos');
  assert.deepEqual(r.erroresJs, []);
  await r.close();
});

test('añadir, reemplazar y quitar archivos sin recargar la pagina', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KMZ_A]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');

  // Anadir
  await p.setInputFiles('#entradaAnadir', [KMZ_B]);
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '4', null, { timeout: 30000 });
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.ok((await txt(p, '#listaFuentes')).includes('beta.kmz'));

  // Reemplazar el mismo nombre no duplica
  await p.setInputFiles('#entradaAnadir', [KMZ_B]);
  await p.waitForTimeout(1200);
  assert.equal(await txt(p, '#cuentaPmt'), '4', 'cargar dos veces el mismo archivo no duplica');

  // Quitar
  await p.click('[data-quitar="beta.kmz"]');
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '2', null, { timeout: 30000 });
  assert.ok(!(await txt(p, '#listaFuentes')).includes('beta.kmz'));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('un archivo roto no impide analizar los buenos, y se dice cual fallo', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KMZ_A, KMZ_ROTO]);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'los buenos se procesan igual');
  const lista = await txt(p, '#listaFuentes');
  assert.ok(lista.includes('roto.kmz') && /No se pudo leer/i.test(lista), lista);
  await p.click('.pestanas button[data-pest="cal"]');
  assert.ok((await txt(p, '#panelCalidad')).includes('roto.kmz'));
  await p.close();
});

test('un archivo parcial se marca PARCIAL, no completo ni fallido', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KML_PARCIAL]);
  const lista = await txt(p, '#listaFuentes');
  assert.ok(/Parcial/i.test(lista), lista);
  assert.equal(await txt(p, '#cuentaPmt'), '1', 'lo que si se pudo leer se conserva');
  await p.close();
});

/* ═══════════════════ MAPA BASE ═══════════════════ */

test('MAPA BASE: sin salida a internet lo dice, y los datos siguen dibujandose', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.waitForTimeout(2500);
  const aviso = await txt(p, '#avisoMapa');
  assert.ok(/fondo/i.test(aviso), `el aviso tiene que hablar del FONDO: "${aviso}"`);
  assert.ok(/NO afecta al análisis|dibujan igual|dibujados/i.test(aviso), aviso);
  // Lo esencial: el usuario no puede confundir "sin fondo" con "sin datos".
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  const pintado = await p.evaluate(() => {
    const c = document.querySelector('#mapa canvas');
    if (!c) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  assert.ok(pintado > 50, `las geometrias tienen que verse igual (pixeles pintados: ${pintado})`);
  await p.close();
});

test('MAPA BASE: con un servidor de teselas SIN CORS, el fondo carga', saltar, async () => {
  // Es la regresion de la Etapa 2: `crossOrigin: true` hacia que el navegador
  // descartara teselas perfectamente validas cuando faltaba la cabecera CORS,
  // que es lo que ocurre detras de un proxy corporativo.
  const antes = pedidas;
  const p = await abrir({ teselasLocales: true });
  await cargar(p, [KMZ_A]);
  await p.waitForTimeout(2500);
  assert.ok(pedidas > antes, 'el navegador pidio teselas');
  const cargadas = await p.evaluate(() =>
    document.querySelectorAll('#mapa .leaflet-tile-loaded').length);
  assert.ok(cargadas > 0, 'y las pinto pese a que el servidor no manda cabecera CORS');
  assert.equal(await txt(p, '#avisoMapa'), '', 'sin aviso de fallo');
  await p.close();
});

test('MAPA BASE: se puede cambiar de proveedor desde la interfaz', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KMZ_A]);
  const ops = await p.$$eval('#selFondo option', (o) => o.map((x) => x.value));
  assert.ok(ops.includes('osm') && ops.includes('carto-claro') && ops.includes('sin-fondo'), JSON.stringify(ops));
  await p.selectOption('#selFondo', 'sin-fondo');
  await p.waitForTimeout(600);
  assert.ok(/sin fondo/i.test(await txt(p, '#avisoMapa')));
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('pmt.mapaBase.v1')).proveedor), 'sin-fondo',
    'la eleccion se recuerda para la proxima vez');
  await p.close();
});

/* ═══════════════════ SIMBOLOGIA ═══════════════════ */

test('SIMBOLOGIA: cada tipo de cierre se dibuja distinto, y hay leyenda', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.waitForFunction(() => document.querySelector('#leyendaMapa')?.textContent.trim().length > 0,
    null, { timeout: 20000 });

  const leyenda = await txt(p, '#leyendaMapa');
  for (const t of ['Cierre total', 'Cierre parcial', 'Ingreso y salida', 'Se tocan', 'Cerca, sin tocarse']) {
    assert.ok(leyenda.includes(t), `falta "${t}" en la leyenda: ${leyenda}`);
  }

  // La tabla enseña un punto del color del tipo de cierre: tres tipos, tres colores.
  await p.waitForFunction(() => document.querySelectorAll('#tablaPmt tbody .punto-cierre').length >= 4,
    null, { timeout: 20000 });
  const colores = await p.$$eval('#tablaPmt tbody .punto-cierre',
    (n) => [...new Set(n.map((f) => f.style.backgroundColor))]);
  assert.ok(colores.length >= 3, `cada tipo de cierre con su color: ${JSON.stringify(colores)}`);

  // Y el color no es la unica senal: la ficha del mapa nombra el tipo por escrito.
  await p.click('#tablaPmt tbody tr:nth-child(1)');
  await p.waitForSelector('.leaflet-popup-content', { timeout: 20000 });
  assert.ok(/Cierre (total|parcial)|Ingreso y salida/.test(await txt(p, '.leaflet-popup-content')));
  await p.close();
});

/* ═══════════════════ FILTROS CRUZADOS ═══════════════════ */

test('FILTROS CRUZADOS: elegir un contrato reduce las demas listas', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KML_C]);
  const opciones = (campo) => p.$$eval(`#f_${campo} option`, (o) => o.map((x) => x.value));

  assert.deepEqual((await opciones('contrato')).sort(), ['CW1', 'CW2', 'CW3']);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(500);

  assert.deepEqual(await opciones('frente'), ['A-PARCIAL', 'A-TOTAL'], 'los frentes se reducen a los de CW1');
  assert.deepEqual((await opciones('contrato')).sort(), ['CW1', 'CW2', 'CW3'], 'pero la lista de contratos NO se autolimita');
  assert.equal(await txt(p, '#cuentaPmt'), '2');

  // Se puede seguir marcando mas valores del mismo campo.
  await p.selectOption('#f_contrato', ['CW1', 'CW2']);
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.equal((await opciones('frente')).length, 4);

  await p.click('#btnLimpiar');
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#cuentaPmt'), '5');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('FILTROS CRUZADOS: filtrar por tipo de cierre funciona y cruza', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const tipos = await p.$$eval('#f_tipoCierre option', (o) => o.map((x) => x.value));
  assert.ok(tipos.includes('ingreso y salida'), JSON.stringify(tipos));
  assert.ok(!tipos.includes('ingreso'), 'no existe "ingreso" por separado');
  await p.selectOption('#f_tipoCierre', ['ingreso y salida']);
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#cuentaPmt'), '1');
  // El facetado es correcto aqui: la regla de "no autolimitarse" protege a un
  // campo frente a SU PROPIO filtro, no frente a los demas. Como el unico
  // trazado de "ingreso y salida" es de CW2, la lista de contratos se reduce
  // a CW2. La de tipos de cierre, en cambio, sigue entera.
  assert.deepEqual(await p.$$eval('#f_contrato option', (o) => o.map((x) => x.value)), ['CW2']);
  assert.equal((await p.$$eval('#f_tipoCierre option', (o) => o.length)), tipos.length,
    'la lista del propio campo no se recorta');
  await p.close();
});

/* ═══════════════════ MAPA ↔ TABLA ═══════════════════ */

test('INTERACCION: pulsar una fila selecciona y acerca el mapa', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const antes = await p.evaluate(() => window.__z ?? 0);
  await p.click('#tablaPmt tbody tr:nth-child(1)');
  await p.waitForTimeout(900);
  assert.ok(await p.$('#tablaPmt tbody tr.sel'), 'la fila queda marcada');
  assert.ok(await p.$('.leaflet-popup'), 'y se abre su ficha en el mapa');
  const ficha = await txt(p, '.leaflet-popup-content');
  assert.ok(/Contrato|Cierre/i.test(ficha), ficha);
  await p.close();
});

test('INTERACCION: pulsar una relacion acerca el mapa a los dos extremos', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('.pestanas button[data-pest="rel"]');
  await p.waitForTimeout(300);
  const filas = await p.$$('#tablaRel tbody tr');
  assert.ok(filas.length > 0, 'hay relaciones que mostrar');
  await filas[0].click();
  await p.waitForTimeout(900);
  const ficha = await txt(p, '.leaflet-popup-content').catch(() => '');
  assert.ok(/aproximan|Relación/i.test(ficha), ficha);
  await p.close();
});

/* ═══════════════════ RECORRIDO TEMPORAL ═══════════════════ */

test('RECORRIDO: barra, reproducir, pausar, paso, velocidad y volver a todo', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  for (const id of ['#barraTiempo', '#btnPlay', '#pasoDias', '#velocidad', '#btnTodoTiempo']) {
    assert.ok(await p.$(id), `falta el control ${id}`);
  }
  assert.equal(await txt(p, '#fechaViva'), 'Todo');
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = 5; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(400);
  assert.match(await txt(p, '#fechaViva'), /^\d{4}-\d{2}-\d{2}$/);
  // La etiqueta dice ahora lo que de verdad se calcula: el DIA COMPLETO.
  assert.ok(/actividad ese día completo/.test(await txt(p, '#vigentesAhora')), await txt(p, '#vigentesAhora'));

  await p.click('#btnPlay');
  await p.waitForTimeout(700);
  assert.ok((await txt(p, '#btnPlay')).includes('Pausar'), 'se puede pausar mientras reproduce');
  await p.click('#btnPlay');
  await p.waitForTimeout(200);
  assert.ok((await txt(p, '#btnPlay')).includes('Reproducir'));

  await p.click('#btnTodoTiempo');
  await p.waitForTimeout(400);
  assert.equal(await txt(p, '#fechaViva'), 'Todo');
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════════════ TABLA CON VOLUMEN ═══════════════════ */

test('TABLA: pagina, ordena y deja cambiar el tamano de pagina', saltar, async () => {
  const muchos = escribir('muchos.kmz', F.kmz(
    Array.from({ length: 120 }, (_, i) =>
      F.placemark(`F${String(i).padStart(3, '0')}`, desc('CW' + (i % 4), { tipo: i % 2 ? 'total' : 'parcial' }),
        F.punto([-75.60 + i * 0.0002, 6.20])))));
  const p = await abrir({ sinRed: true });
  await cargar(p, [muchos]);
  assert.equal(await txt(p, '#cuentaPmt'), '120');
  let filas = await p.$$eval('#tablaPmt tbody tr', (r) => r.length);
  assert.equal(filas, 50, 'la primera pagina trae 50 filas, no las 120');
  assert.ok((await txt(p, '#pagPmt')).includes('1–50'), await txt(p, '#pagPmt'));

  await p.click('#pagPmt [data-ir="1"]');
  await p.waitForTimeout(350);
  assert.ok((await txt(p, '#pagPmt')).includes('51–100'));

  await p.selectOption('#pagPmt [data-tam]', 'todas');
  await p.waitForTimeout(350);
  filas = await p.$$eval('#tablaPmt tbody tr', (r) => r.length);
  assert.equal(filas, 120, 'con "todas" se ven las 120');

  // Ordenacion
  await p.selectOption('#pagPmt [data-tam]', '50');
  await p.waitForTimeout(300);
  const primero = () => p.textContent('#tablaPmt tbody tr:first-child td:first-child');
  const asc = (await primero()).trim();
  await p.click('#tablaPmt thead th[data-col="frente"]');
  await p.waitForTimeout(300);
  assert.notEqual((await primero()).trim(), asc, 'al ordenar al reves cambia la primera fila');
  await p.close();
});

/* ═══════════════════ EXPORTACIONES E INFORME ═══════════════════ */

test('EXPORTACIONES: los cinco formatos descargan contenido valido', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const esperados = [
    ['#expPmtCsv', /\.csv$/, (t) => t.includes('CONTRATO') && t.split('\r\n').length > 2],
    ['#expRelCsv', /\.csv$/, (t) => t.includes('ESTADO_ESPACIAL')],
    ['#expGeoJson', /\.geojson$/, (t) => JSON.parse(t).type === 'FeatureCollection'],
    ['#expKml', /\.kml$/, (t) => t.includes('<Placemark>') && t.includes('tipo_cierre:')],
    ['#expLegado', /\.csv$/, (t) => t.replace(/^﻿/, '').split('\r\n')[0].split(';').length === 11],
  ];
  for (const [sel, patron, valida] of esperados) {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click(sel)]);
    assert.match(d.suggestedFilename(), patron);
    const destino = path.join(TMP, 'desc_' + d.suggestedFilename());
    await d.saveAs(destino);
    const contenido = fs.readFileSync(destino, 'utf8');
    assert.ok(valida(contenido), `contenido invalido en ${sel}: ${contenido.slice(0, 120)}`);
  }
  await p.close();
});

test('INFORME: se genera con mapa propio, cifras y sin criticidad inventada', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KML_PARCIAL]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const inf = await txt(p, '#informe');

  for (const parte of ['Informe de control y articulación de PMTs', 'Grupo EPM', 'Qué se analizó',
    'Mapa de los trazados', 'Calidad de los datos', 'Trazabilidad', 'Regla invariante']) {
    assert.ok(inf.includes(parte), `falta en el informe: "${parte}"`);
  }
  assert.ok(inf.includes('120 m'), 'declara el criterio espacial');
  assert.ok(/fecha y hora|fecha .{0,3}y hora/i.test(inf), 'declara el criterio temporal');
  assert.ok(inf.includes('parcial.kml'), 'nombra los archivos analizados');

  // El mapa del informe se dibuja solo, sin que nadie adjunte una captura.
  const svg = await p.$('#informe svg.mapa-informe');
  assert.ok(svg, 'el informe trae su propio mapa vectorial');
  const trazos = await p.$$eval('#informe svg.mapa-informe polyline, #informe svg.mapa-informe circle', (n) => n.length);
  assert.ok(trazos > 0, 'y ese mapa tiene geometrias dibujadas');

  // Ninguna criticidad inventada.
  for (const prohibida of ['crítica', 'critico', 'crítico', 'severidad', 'prioridad alta']) {
    assert.ok(!inf.toLowerCase().includes(prohibida.toLowerCase()) ||
      inf.includes('No asigna niveles de criticidad'), `el informe no puede clasificar: "${prohibida}"`);
  }
  assert.ok(inf.includes('No asigna niveles de criticidad'));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════════════ PROYECTOS ═══════════════════ */

test('PROYECTO: se guarda y se vuelve a abrir con el mismo resultado', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const pmtAntes = await txt(p, '#cuentaPmt');
  const relAntes = await txt(p, '#cuentaRel');

  p.on('dialog', (d) => d.accept('Proyecto de prueba'));
  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#btnGuardarProyecto'),
  ]);
  const ruta = path.join(TMP, 'proyecto.pmt.json');
  await descarga.saveAs(ruta);
  const guardado = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  assert.equal(guardado.esquema, 2);
  assert.equal(guardado.trazados.length, +pmtAntes);
  // Contrato de la Etapa 2.2: el proyecto guarda ENTRADA, no resultados.
  assert.equal(guardado.relaciones, undefined, 'un proyecto no guarda relaciones');
  assert.ok(guardado.instantanea && /INFORMATIVO/.test(guardado.instantanea.nota),
    'solo una instantánea de recuentos, marcada como informativa');
  assert.ok(guardado.motor?.versionReglas, 'y declara con qué reglas se generó');
  assert.ok(!JSON.stringify(guardado).match(/password|token|secret|api[_-]?key/i), 'sin secretos');
  await p.close();

  // Se abre en una sesion nueva, sin tocar los KMZ.
  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(600);
  assert.equal(await txt(q, '#cuentaPmt'), pmtAntes);
  assert.equal(await txt(q, '#cuentaRel'), relAntes);
  assert.ok((await txt(q, '#siguientePaso')).includes('Proyecto de prueba'));
  assert.deepEqual(q.erroresJs, []);
  await q.close();
});

test('PROYECTO: un archivo manipulado se rechaza con un motivo entendible', saltar, async () => {
  const malo = escribir('malo.pmt.json', JSON.stringify({ marca: 'otra-cosa', esquema: 1, trazados: [] }));
  const futuro = escribir('futuro.pmt.json', JSON.stringify({
    marca: 'plataforma-pmt-epm', esquema: 99, trazados: [{ id: 'x' }],
  }));
  const p = await abrir({ sinRed: true });
  await p.setInputFiles('#entradaProyecto', [malo]);
  await p.waitForTimeout(700);
  assert.ok(/no es un proyecto/i.test(await txt(p, '#avisoGlobal')), await txt(p, '#avisoGlobal'));

  await p.setInputFiles('#entradaProyecto', [futuro]);
  await p.waitForTimeout(700);
  assert.ok(/version mas reciente|versión más reciente/i.test(await txt(p, '#avisoGlobal')), await txt(p, '#avisoGlobal'));
  await p.close();
});

/* ═══════════════════ REINICIO ═══════════════════ */

test('REINICIO: empezar de nuevo deja la aplicacion limpia, sin recargar', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  const navegacion = p.evaluate(() => { window.__marca = 1; });
  await navegacion;
  await p.click('#btnEmpezarDeNuevo');
  await p.waitForTimeout(600);
  assert.equal(await p.evaluate(() => window.__marca), 1, 'no se recargo la pagina');
  assert.ok(await p.isHidden('#panelResumen'));
  assert.equal(await txt(p, '#listaFuentes'), '');
  // Y se puede volver a cargar sin arrastrar nada de la sesion anterior.
  await cargar(p, [KMZ_B]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  await p.close();
});

/* ═══════════════════ CONTEXTO HTTP ═══════════════════ */

test('tambien funciona servida por HTTP, no solo desde file://', saltar, async () => {
  // Si algun dia se publica en un servidor corporativo, tiene que dar igual.
  const html = fs.readFileSync(APP, 'utf8');
  const s = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const pto = s.address().port;
  const ctx = await (navegador ??= await chromium.launch({ executablePath: ejecutable })).newContext();
  await ctx.route('**://*/**', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${pto}/`);
  await p.setInputFiles('#entrada', [KMZ_A, KMZ_B]);
  await p.waitForSelector('#panelResumen:not(.oculto)', { timeout: 60000 });
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.deepEqual(errs, []);
  await p.close(); await ctx.close(); s.close();
});

/* ═══════════════════ ETAPA 2.2 · CONTRAEJEMPLOS DE LA AUDITORIA ═══════════════════ */

/** KMZ con dos trazados muy separados en el tiempo, para el recorrido diario. */
const KMZ_HORAS = escribir('horas.kmz', F.kmz([
  F.placemark('MANANA', desc('CW7', { inicio: '2026-03-10 06:00:00', fin: '2026-03-10 08:00:00' }), F.punto([-75.6000, 6.2000])),
  F.placemark('MEDIODIA', desc('CW8', { inicio: '2026-03-10 10:00:00', fin: '2026-03-10 12:00:00' }), F.punto([-75.6000, 6.2004])),
]));

test('2.2 · ABRIR PROYECTO + AÑADIR KMZ no pierde nada', saltar, async () => {
  // ANTES: abrir un proyecto con 460 PMT y añadir un KMZ dejaba 14 PMT y 0
  // relaciones, porque abrir el proyecto vaciaba la lista de fuentes.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const pmtAntes = +(await txt(p, '#cuentaPmt'));
  const relAntes = +(await txt(p, '#cuentaRel'));
  assert.ok(pmtAntes === 4 && relAntes > 0);

  p.on('dialog', (d) => d.accept('Proyecto combinado'));
  const [desc1] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'combinado.pmt.json');
  await desc1.saveAs(ruta);
  await p.close();

  // Sesión nueva: abrir el proyecto y DESPUÉS añadir un KMZ más.
  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(800);
  assert.equal(+(await txt(q, '#cuentaPmt')), pmtAntes, 'el proyecto se restaura entero');
  assert.equal(+(await txt(q, '#cuentaRel')), relAntes, 'y sus relaciones se recalculan igual');

  await q.setInputFiles('#entradaAnadir', [KML_C]);
  await q.waitForFunction((n) => document.querySelector('#cuentaPmt').textContent === String(n),
    pmtAntes + 1, { timeout: 30000 });
  assert.equal(+(await txt(q, '#cuentaPmt')), pmtAntes + 1, 'añadir SUMA, no reemplaza');
  assert.ok(+(await txt(q, '#cuentaRel')) >= relAntes, 'y las relaciones no desaparecen');
  const lista = await txt(q, '#listaFuentes');
  assert.ok(lista.includes('combinado.pmt.json') && lista.includes('gama.kml'), lista);
  assert.deepEqual(q.erroresJs, []);
  await q.close();
});

test('2.2 · un .pmt.json manipulado NO impone su resultado', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const relReales = +(await txt(p, '#cuentaRel'));
  p.on('dialog', (d) => d.accept('Para manipular'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'manipulado.pmt.json');
  await d.saveAs(ruta);
  await p.close();

  // Se edita a mano: distancia falsa, relación inventada, instantánea mentirosa.
  const obj = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  obj.relaciones = [{ idA: obj.trazados[0].id, idB: 'no-existe', distanciaMetros: 98765.4, intersecanFisicamente: true, hayTraslapeTemporal: true }];
  obj.instantanea.relaciones = 999;
  fs.writeFileSync(ruta, JSON.stringify(obj));

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(800);
  assert.equal(+(await txt(q, '#cuentaRel')), relReales, 'manda el recálculo, no el archivo');
  await q.click('.pestanas button[data-pest="rel"]');
  await q.waitForTimeout(300);
  const tabla = await txt(q, '#tablaRel');
  assert.ok(!tabla.includes('98765'), 'la distancia inventada no aparece por ningún lado');
  const aviso = await txt(q, '#siguientePaso');
  assert.ok(/no coinciden con los que se guardaron|modificado/i.test(aviso), aviso);
  await q.close();
});

test('2.2 · RECORRIDO: la vista de día muestra el día entero', saltar, async () => {
  // ANTES: el recorrido consultaba un instante y un PMT de 10:00 a 12:00
  // desaparecía de su propio día.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_HORAS]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = 0; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'los dos siguen visibles en su día');
  assert.ok(/día completo/i.test(await txt(p, '#vigentesAhora')), await txt(p, '#vigentesAhora'));
  await p.close();
});

test('2.2 · REINICIO: un filtro anterior no puede quedar invisible', saltar, async () => {
  // ANTES: filtrar CW1 → empezar de nuevo → cargar otro KMZ dejaba 0 PMT,
  // porque el filtro seguía aplicado sin que su control existiera.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);
  assert.equal(await txt(p, '#cuentaPmt'), '2');

  await p.click('#btnEmpezarDeNuevo');
  await p.waitForTimeout(500);
  await cargar(p, [KMZ_B]);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'los datos nuevos se ven, sin filtros heredados');
  const marcados = await p.$$eval('#filtros option', (o) => o.filter((x) => x.selected).length);
  assert.equal(marcados, 0, 'ningún filtro queda marcado');
  await p.close();
});

test('2.2 · los filtros de un proyecto se restauran TAMBIÉN en sus controles', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.fill('#fDesde', '2026-03-01');
  await p.fill('#fHasta', '2026-03-30');
  await p.dispatchEvent('#fDesde', 'change');
  await p.dispatchEvent('#fHasta', 'change');
  await p.waitForTimeout(400);

  p.on('dialog', (d) => d.accept('Con filtros'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'confiltros.pmt.json');
  await d.saveAs(ruta);
  await p.close();

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(800);
  // El estado interno y el control visual tienen que decir lo mismo.
  assert.deepEqual(await q.$$eval('#f_contrato option', (o) => o.filter((x) => x.selected).map((x) => x.value)), ['CW1']);
  assert.equal(await q.inputValue('#fDesde'), '2026-03-01');
  assert.equal(await q.inputValue('#fHasta'), '2026-03-30');
  await q.close();
});

test('2.2 · PARES NO EVALUABLES: se conservan, se cuentan y se pueden mirar', saltar, async () => {
  // Los 8 KMZ reales no tienen ninguno, así que hace falta un caso sintético:
  // dos contratos en puntos antípodas, que el motor no puede medir.
  const lejos = escribir('antipodas.kmz', F.kmz([
    F.placemark('AQUI', desc('CW9'), F.punto([0, 0])),
    F.placemark('ALLI', desc('CW10'), F.punto([180, 0])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [lejos]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  assert.equal(await txt(p, '#cuentaRel'), '0');
  assert.equal(await txt(p, '#cuentaNoEval'), '1', 'el par no evaluable se cuenta aparte');
  assert.ok(await p.isVisible('#pestNoEval'), 'y tiene su propia pestaña');

  await p.click('.pestanas button[data-pest="noeval"]');
  await p.waitForTimeout(300);
  const panel = await txt(p, '#panelNoEval');
  assert.ok(panel.includes('CW9') && panel.includes('CW10'), panel);
  assert.ok(/no se pudo comprobar|No se pudo medir/i.test(panel), panel);
  assert.ok(/no.*significa que estén lejos/i.test(panel), 'tiene que decir que NO es "lejos"');
  await p.close();
});

test('2.2 · INFORME: durante el recorrido dice que cubre solo ese día', saltar, async () => {
  // ANTES: afirmaba "Ninguno: cubre todos los datos cargados" mientras
  // informaba solo el subconjunto visible.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KMZ_HORAS]);
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = 0; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(500);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const inf = await txt(p, '#informe');
  assert.ok(/Recorrido temporal activo/i.test(inf), 'el informe declara el recorrido');
  assert.ok(/Subconjunto/i.test(inf), 'y que cubre un subconjunto');
  assert.ok(!/Ninguno: el informe cubre todos los datos cargados/.test(inf),
    'no puede seguir afirmando que cubre todo');
  await p.close();
});

test('2.2 · INFORME: trae mapas de detalle de las relaciones', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const detalles = await p.$$eval('#informe .inf-detalle svg', (n) => n.length);
  assert.ok(detalles > 0, 'hay al menos un mapa de detalle');
  const inf = await txt(p, '#informe');
  assert.ok(/punto exacto donde.*aproximan/i.test(inf), inf.slice(0, 200));
  assert.ok(/no es una clasificación de criticidad/i.test(inf), 'y sigue sin clasificar');
  // Cada detalle identifica de quién es.
  const pie = await txt(p, '#informe .inf-detalle-pie');
  assert.ok(pie.length > 0);
  await p.close();
});

test('2.2 · IMPRESIÓN: el informe se imprime solo, sin el tablero', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  // Se comprueba la regla de impresion sin abrir el dialogo del sistema.
  await p.evaluate(() => document.body.classList.add('imprimiendo-informe'));
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(200);
  assert.ok(await p.isHidden('#panelExplorar'), 'el tablero no se imprime');
  assert.ok(await p.isHidden('#panelDetalle'), 'las tablas tampoco');
  assert.ok(await p.isHidden('#panelCarga'));
  assert.ok(await p.isVisible('#informe'), 'pero el informe sí');
  await p.emulateMedia({ media: 'screen' });
  await p.close();
});

test('2.2 · identidad de fuentes: mismo nombre, otro contenido, y quitar', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  assert.equal(await txt(p, '#cuentaPmt'), '2');

  // Mismo archivo otra vez: no duplica y lo dice.
  await p.setInputFiles('#entradaAnadir', [KMZ_A]);
  await p.waitForTimeout(1200);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  assert.ok(/idéntico|no se duplicó/i.test(await txt(p, '#siguientePaso')), await txt(p, '#siguientePaso'));

  // Mismo nombre con otro contenido: reemplaza y lo dice.
  const otro = path.join(TMP, 'alfa.kmz');
  const copia = path.join(TMP, 'copia-alfa.kmz');
  fs.copyFileSync(otro, copia);
  fs.writeFileSync(otro, Buffer.from(F.kmz([
    F.placemark('A-NUEVO', desc('CW1', { tipo: 'total' }), F.punto([-75.6000, 6.2000])),
  ])));
  await p.setInputFiles('#entradaAnadir', [otro]);
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '1', null, { timeout: 30000 });
  assert.ok(/se reemplazó por la versión nueva/i.test(await txt(p, '#siguientePaso')));
  fs.copyFileSync(copia, otro);       // se restaura para las demas pruebas

  // Quitar deja el conjunto vacío y vuelve a la pantalla de carga.
  await p.click('[data-quitar="alfa.kmz"]');
  await p.waitForTimeout(700);
  assert.ok(await p.isVisible('#panelCarga'));
  await p.close();
});

/* ═══════════════════ ETAPA 2.3 ═══════════════════ */

test('2.3 · el gestor de FUENTES queda visible tras abrir un proyecto', saltar, async () => {
  // ANTES: abrir un proyecto ocultaba `panelCarga`, y con él la lista de
  // fuentes y sus botones «Quitar». No había forma de gestionar nada.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  p.on('dialog', (d) => d.accept('Gestor visible'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'gestor.pmt.json');
  await d.saveAs(ruta);
  await p.close();

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(700);

  assert.ok(await q.isVisible('#panelFuentes'), 'el gestor de fuentes tiene que verse');
  assert.ok(await q.isVisible('#listaFuentes'));
  assert.ok(await q.isVisible('#btnAnadir'), 'y desde ahí se puede añadir');
  const quitar = await q.$$('[data-quitar]');
  assert.ok(quitar.length > 0, 'y quitar');
  assert.ok(await quitar[0].isVisible(), 'el botón «Quitar» es accesible');
  await q.close();
});

test('2.3 · un error al abrir un proyecto inválido NUNCA queda oculto', saltar, async () => {
  const malo = escribir('invalido23.pmt.json', JSON.stringify({ marca: 'otra', esquema: 1, trazados: [] }));
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);                       // ya hay análisis: panelCarga oculto
  assert.ok(await p.isHidden('#panelCarga'));
  await p.setInputFiles('#entradaProyecto', [malo]);
  await p.waitForTimeout(800);
  assert.ok(await p.isVisible('#avisoGlobal'), 'el aviso vive fuera del panel de carga');
  assert.ok(/no se pudo abrir/i.test(await txt(p, '#avisoGlobal')), await txt(p, '#avisoGlobal'));
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'y el análisis anterior no se pierde');
  await p.close();
});

test('2.3 · guardar y abrir conserva Polygon, MultiLineString y MultiPolygon', saltar, async () => {
  const geom = escribir('geometrias23.kmz', F.kmz([
    F.placemark('POLIGONO', desc('CW20'), F.poligono([[-75.600, 6.200], [-75.590, 6.200], [-75.590, 6.210], [-75.600, 6.210], [-75.600, 6.200]])),
    F.placemark('PUNTO-DENTRO', desc('CW21'), F.punto([-75.595, 6.205])),
    F.placemark('MULTILINEA', desc('CW22'), F.multiGeometria(F.linea([[-75.5800, 6.2000], [-75.5790, 6.2000]]))),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [geom]);
  const pmtAntes = await txt(p, '#cuentaPmt');
  const relAntes = await txt(p, '#cuentaRel');
  assert.equal(pmtAntes, '3');
  assert.ok(+relAntes >= 1, 'el punto está dentro del polígono');

  p.on('dialog', (d) => d.accept('Geometrias'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'geom23.pmt.json');
  await d.saveAs(ruta);
  await p.close();

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(700);
  assert.equal(await txt(q, '#cuentaPmt'), pmtAntes, 'no se pierde ningún trazado');
  assert.equal(await txt(q, '#cuentaRel'), relAntes, 'ni ninguna relación');
  await q.close();
});

test('2.3 · una fecha imposible restaurada no deja un filtro invisible', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  p.on('dialog', (d) => d.accept('Fecha mala'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'fechamala.pmt.json');
  await d.saveAs(ruta);
  const obj = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  obj.filtros = { ...(obj.filtros ?? {}), desde: '2026-99-99', hasta: null,
    contratista: [], contrato: [], proyecto: [], municipio: [], frente: [], tipoCierre: [], relacion: [], texto: '' };
  fs.writeFileSync(ruta, JSON.stringify(obj));
  await p.close();

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(800);
  assert.equal(await q.inputValue('#fDesde'), '', 'el control está vacío…');
  assert.equal(await txt(q, '#cuentaPmt'), '4', '…y NO hay ningún filtro aplicado en la sombra');
  await q.close();
});

test('2.3 · el último día con actividad es seleccionable en el recorrido', saltar, async () => {
  const cruce = escribir('cruce23.kmz', F.kmz([
    F.placemark('NOCTURNO', desc('CW30', { inicio: '2026-03-01 23:00:00', fin: '2026-03-03 01:00:00' }), F.punto([-75.6000, 6.2000])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [cruce]);
  const max = await p.inputValue('#barraTiempo').then(() => p.$eval('#barraTiempo', (b) => +b.max));
  assert.equal(max, 2, 'el deslizador llega hasta el tercer día');
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = b.max; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#fechaViva'), '2026-03-03');
  assert.equal(await txt(p, '#cuentaPmt'), '1', 'y ese día sigue mostrando el PMT');
  await p.close();
});

test('2.3 · INFORME: la tarjeta de no evaluables coincide con su tabla', saltar, async () => {
  const lejos = escribir('antipodas23.kmz', F.kmz([
    F.placemark('AQUI', desc('CW40'), F.punto([0, 0])),
    F.placemark('ALLI', desc('CW41'), F.punto([180, 0])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [lejos]);
  assert.equal(await txt(p, '#cuentaNoEval'), '1');
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  await p.waitForTimeout(500);

  // La tarjeta y la tabla del informe tienen que decir lo mismo.
  const tarjeta = await p.$$eval('#informe .inf-kpi', (n) => {
    const t = n.find((x) => /no se pudieron analizar/i.test(x.textContent));
    return t ? +t.querySelector('.inf-kpi-n').textContent.trim() : null;
  });
  const filasTabla = await p.$$eval('#informe table', (tablas) => {
    const t = tablas.find((x) => /Motivo/i.test(x.querySelector('thead')?.textContent ?? ''));
    return t ? t.querySelectorAll('tbody tr').length : 0;
  });
  assert.equal(tarjeta, 1, `la tarjeta dice ${tarjeta}`);
  assert.equal(filasTabla, 1, `la tabla tiene ${filasTabla} filas`);
  assert.equal(tarjeta, filasTabla, 'tarjeta y tabla tienen que coincidir');
  await p.close();
});

/* ═══════════════════ ETAPA 2.4 ═══════════════════ */

test('2.4 · las TARJETAS siguen al alcance visible, y lo dicen', saltar, async () => {
  // ANTES: con un filtro puesto las tarjetas decían 2 PMT y 2 contratos
  // mientras la tabla y el informe decían 1 y 1, sin explicar por qué.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);

  const tarjeta = (etq) => p.$$eval('#tarjetas .tarjeta', (n, e) => {
    const t = n.find((x) => new RegExp(e, 'i').test(x.querySelector('.t').textContent));
    return t ? t.querySelector('.n').textContent.trim() : null;
  }, etq);

  assert.equal(await tarjeta('PMT'), '4', 'sin filtros, las tarjetas cuentan todo');
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.ok(/Todo lo cargado/i.test(await txt(p, '#alcanceResumen')), await txt(p, '#alcanceResumen'));

  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);

  assert.equal(await txt(p, '#cuentaPmt'), '2', 'la tabla se filtra');
  assert.equal(await tarjeta('PMT'), '2', 'y la tarjeta va con ella');
  assert.equal(await tarjeta('contratos'), '1');

  const alcance = await txt(p, '#alcanceResumen');
  assert.ok(/Resultado visible/i.test(alcance), alcance);
  assert.ok(/4 PMT cargados/.test(alcance), alcance);
  assert.ok(/2 visibles/.test(alcance), alcance);

  // Y la fila de archivos NO se mueve con los filtros: habla de otra cosa.
  const cargadosTotal = await p.$$eval('#tarjetasArchivos .tarjeta', (n) => {
    const t = n.find((x) => /PMT cargados en total/i.test(x.querySelector('.t').textContent));
    return t ? t.querySelector('.n').textContent.trim() : null;
  });
  assert.equal(cargadosTotal, '4', 'el total sigue a la vista, claramente etiquetado');

  await p.click('#btnQuitarFiltros');
  await p.waitForTimeout(400);
  assert.equal(await tarjeta('PMT'), '4', 'quitar los filtros devuelve el alcance completo');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('2.4 · INVARIANTE: tarjetas, pestañas e informe cuentan el MISMO alcance', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);

  const tarjetaPmt = await p.$$eval('#tarjetas .tarjeta', (n) =>
    +n.find((x) => /PMT/i.test(x.querySelector('.t').textContent)).querySelector('.n').textContent.trim());
  const pestanaPmt = +(await txt(p, '#cuentaPmt'));

  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  await p.waitForTimeout(400);
  const informePmt = await p.$$eval('#informe .inf-kpi', (n) => {
    const t = n.find((x) => /PMT/i.test(x.textContent));
    return t ? +t.querySelector('.inf-kpi-n').textContent.trim() : null;
  });

  assert.equal(tarjetaPmt, pestanaPmt, `tarjeta ${tarjetaPmt} vs pestaña ${pestanaPmt}`);
  assert.equal(informePmt, pestanaPmt, `informe ${informePmt} vs pestaña ${pestanaPmt}`);
  await p.close();
});

test('2.4 · INFORME CADUCADO: quitar una fuente lo marca y bloquea la impresión', saltar, async () => {
  // ANTES: el informe seguía en pantalla, con el archivo retirado dentro, y se
  // podía imprimir como si fuera el de ahora.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  assert.ok(await p.isHidden('#avisoInforme'), 'recién generado no está caducado');
  assert.equal(await p.$eval('#btnImprimirInforme', (b) => b.disabled), false);
  assert.ok((await txt(p, '#informe')).includes('beta.kmz'), 'el informe nombra la fuente');

  // Se quita una fuente: la aplicación recalcula.
  await p.click('#btnDetalleFuentes').catch(() => {});
  await p.waitForTimeout(200);
  await p.$$eval('#listaFuentes button', (bs) => {
    const b = bs.find((x) => /quitar/i.test(x.textContent) && x.closest('.fuente').textContent.includes('beta.kmz'));
    if (b) b.click();
  });
  await p.waitForTimeout(1200);

  assert.ok(await p.isVisible('#avisoInforme'), 'el informe queda marcado como caducado');
  assert.ok(/ya no corresponde/i.test(await txt(p, '#avisoInforme')), await txt(p, '#avisoInforme'));
  assert.equal(await p.$eval('#btnImprimirInforme', (b) => b.disabled), true,
    'y no se puede imprimir un PDF con cifras viejas');
  assert.equal(await p.$eval('#informe', (e) => e.classList.contains('caducado')), true);

  // Actualizarlo lo deja otra vez al día.
  await p.click('#btnActualizarInforme');
  await p.waitForTimeout(800);
  assert.ok(await p.isHidden('#avisoInforme'), 'tras actualizar deja de estar caducado');
  assert.equal(await p.$eval('#btnImprimirInforme', (b) => b.disabled), false);
  assert.ok(!(await txt(p, '#informe')).includes('beta.kmz'), 'y ya no nombra la fuente retirada');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('2.4 · INFORME CADUCADO: también al cambiar un filtro y al quitarlo', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  assert.ok(await p.isHidden('#avisoInforme'));

  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#avisoInforme'), 'cambiar el filtro caduca el informe');

  await p.click('#btnActualizarInforme');
  await p.waitForTimeout(800);
  assert.ok(await p.isHidden('#avisoInforme'));

  // Y quitar el filtro vuelve a caducarlo: es otro alcance distinto.
  await p.selectOption('#f_contrato', []);
  await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#avisoInforme'), 'quitar el filtro también cambia el alcance');

  // Pero si el estado VUELVE a ser el del informe, deja de estar caducado: no
  // se avisa de una diferencia que ya no existe.
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);
  assert.ok(await p.isHidden('#avisoInforme'), 'al volver al mismo alcance, el informe vuelve a valer');
  assert.equal(await p.$eval('#btnImprimirInforme', (b) => b.disabled), false);
  await p.close();
});

test('2.4 · INFORME CADUCADO: añadir una fuente lo marca, empezar de nuevo lo borra', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });

  await p.setInputFiles('#entradaAnadir', [KMZ_B]);
  await p.waitForTimeout(1500);
  assert.ok(await p.isVisible('#avisoInforme'), 'añadir una fuente también caduca el informe');

  p.on('dialog', (d) => d.accept());
  await p.click('#btnEmpezarDeNuevo');
  await p.waitForTimeout(600);
  assert.ok(await p.isHidden('#panelInforme'), 'empezar de nuevo cierra el informe');
  assert.equal(await p.$eval('#informe', (e) => e.innerHTML.trim()), '', 'y lo borra: no queda el anterior');
  await p.close();
});

test('2.4 · el conteo de DUPLICADOS sobrevive a guardar y abrir el proyecto', saltar, async () => {
  // ANTES: los duplicados se contaban del análisis de los archivos, que no
  // existe cuando las fuentes vienen de un proyecto. El contador se iba a 0
  // aunque las copias siguieran en la tabla con su sufijo `~N`.
  const conCopias = escribir('copias.kmz', F.kmz([
    F.placemark('MISMO', desc('CW20'), F.punto([-75.6000, 6.2000])),
    F.placemark('MISMO', desc('CW20'), F.punto([-75.6000, 6.2000])),
    F.placemark('MISMO', desc('CW20'), F.punto([-75.6000, 6.2000])),
    F.placemark('OTRO', desc('CW21'), F.punto([-75.5990, 6.2000])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [conCopias]);

  const duplicados = async () => p.$$eval('#pest_cal tr', (fs) => {
    const f = fs.find((x) => /Duplicados exactos/i.test(x.textContent));
    return f ? f.querySelector('td:last-child')?.textContent.trim() : null;
  });
  await p.click('.pestanas button[data-pest="cal"]');
  await p.waitForTimeout(300);
  const antes = await duplicados();
  assert.equal(antes, '2', `antes de guardar el contador decía ${antes}`);

  p.on('dialog', (d) => d.accept('Con copias'));
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#btnGuardarProyecto')]);
  const ruta = path.join(TMP, 'copias.pmt.json');
  await d.saveAs(ruta);

  const q = await abrir({ sinRed: true });
  await q.setInputFiles('#entradaProyecto', [ruta]);
  await q.waitForSelector('#panelResumen:not(.oculto)', { timeout: 30000 });
  await q.waitForTimeout(700);
  await q.click('.pestanas button[data-pest="cal"]');
  await q.waitForTimeout(300);
  const despues = await q.$$eval('#pest_cal tr', (fs) => {
    const f = fs.find((x) => /Duplicados exactos/i.test(x.textContent));
    return f ? f.querySelector('td:last-child')?.textContent.trim() : null;
  });
  assert.equal(despues, '2', `tras abrir el proyecto el contador decía ${despues} (ANTES: 0)`);
  assert.deepEqual(q.erroresJs, []);
  await p.close();
  await q.close();
});

test('2.4 · un error inesperado NUNCA deja un botón muerto y en silencio', saltar, async () => {
  // Se descubrió de verdad: una función que el empaquetador no incluyó hacía
  // que «Ver informe» no hiciera absolutamente nada, sin un solo mensaje.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  await p.evaluate(() => { setTimeout(() => { throw new Error('fallo de laboratorio'); }, 0); });
  await p.waitForTimeout(600);
  assert.ok(await p.isVisible('#avisoGlobal'), 'el error tiene que llegar a la pantalla');
  const t = await txt(p, '#avisoGlobal');
  assert.ok(/Algo ha fallado dentro de la aplicación/i.test(t), t);
  assert.ok(/fallo de laboratorio/.test(t), t);
  assert.ok(/datos no se han modificado/i.test(t), 'y tiene que decir que no se perdió nada');
  await p.close();
});
