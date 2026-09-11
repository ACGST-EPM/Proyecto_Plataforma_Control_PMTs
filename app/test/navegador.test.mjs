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
  assert.ok((await txt(p, '#listaSeleccion')).includes('beta.kmz'));

  // Reemplazar el mismo nombre no duplica
  await p.setInputFiles('#entradaAnadir', [KMZ_B]);
  await p.waitForTimeout(1200);
  assert.equal(await txt(p, '#cuentaPmt'), '4', 'cargar dos veces el mismo archivo no duplica');

  // Quitar
  await p.click('[data-quitar="beta.kmz"]');
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '2', null, { timeout: 30000 });
  assert.ok(!(await txt(p, '#listaSeleccion')).includes('beta.kmz'));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('un archivo roto no impide analizar los buenos, y se dice cual fallo', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KMZ_A, KMZ_ROTO]);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'los buenos se procesan igual');
  const lista = await txt(p, '#listaSeleccion');
  assert.ok(lista.includes('roto.kmz') && /No se pudo leer/i.test(lista), lista);
  await p.click('.pestanas button[data-pest="cal"]');
  assert.ok((await txt(p, '#panelCalidad')).includes('roto.kmz'));
  await p.close();
});

test('un archivo parcial se marca PARCIAL, no completo ni fallido', saltar, async () => {
  const p = await abrir();
  await cargar(p, [KML_PARCIAL]);
  const lista = await txt(p, '#listaSeleccion');
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
  assert.ok(/vigentes ese día/.test(await txt(p, '#vigentesAhora')));

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
  assert.equal(guardado.esquema, 1);
  assert.equal(guardado.trazados.length, +pmtAntes);
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
  assert.ok(/no es un proyecto/i.test(await txt(p, '#progreso')), await txt(p, '#progreso'));

  await p.setInputFiles('#entradaProyecto', [futuro]);
  await p.waitForTimeout(700);
  assert.ok(/version mas reciente|versión más reciente/i.test(await txt(p, '#progreso')), await txt(p, '#progreso'));
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
  assert.equal(await txt(p, '#listaSeleccion'), '');
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
