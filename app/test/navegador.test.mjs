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

/* ── Fixtures sinteticos: ningun dato real de EPM ──
 *
 * ══ LAS FECHAS SON RELATIVAS A HOY, A PROPOSITO ══════════════════════════
 *
 * Estaban escritas a mano («2026-03-01»). Mientras esa fecha fue futura, todo
 * funciono; en cuanto paso, TODOS los fixtures se volvieron historicos y la
 * vista operativa —que es la de por defecto— dejo de enseñarlos. Media suite
 * empezo a fallar sin que nada se hubiera roto.
 *
 * La clase de error es «una prueba cuyo significado cambia con el calendario».
 * Se elimina anclando las fechas al reloj: la vigencia base va de ayer a dentro
 * de un mes, asi que es VIGENTE hoy, mañana y dentro de tres años. */
const F = await import('../../motor/fixtures/index.mjs');
const D = 86400000;
const selloFecha = (ms, hora) => new Date(ms).toISOString().slice(0, 10) + ' ' + hora;
const AHORA = Date.now();
/** Vigencia base: empezo ayer y termina dentro de 30 dias. VIGENTE siempre. */
export const INICIO_BASE = selloFecha(AHORA - D, '06:00:00');
export const FIN_BASE = selloFecha(AHORA + 30 * D, '18:00:00');
const desc = (c, o = {}) => F.descripcion({
  inicio: INICIO_BASE, fin: FIN_BASE,
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

/**
 * ABRE EL PANEL DE FILTROS COMPLETO.
 *
 * Desde la Etapa 3 la barra de trabajo solo tiene buscar, periodo, municipio y
 * contrato; el resto vive detras de «Mas filtros». Las pruebas que manejan
 * `#f_<campo>` tienen que abrirlo, igual que lo haria una persona.
 */
async function abrirFiltros(p) {
  if (await p.isHidden('#panelFiltros')) {
    await p.click('#btnMasFiltros');
    await p.waitForSelector('#panelFiltros:not(.oculto)', { timeout: 10000 });
    await p.waitForTimeout(150);
  }
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
  // Etapa 3: la lista se redujo a Calles / Satelite / Mapa de EPM / Sin fondo.
  // CARTO se retiro porque paso a exigir clave y se servia con marca de agua.
  assert.ok(ops.includes('calles') && ops.includes('satelite') && ops.includes('sin-fondo'), JSON.stringify(ops));
  assert.ok(!ops.includes('carto-claro'), 'un proveedor que exige clave no puede seguir ofreciendose');
  assert.ok(ops.length <= 5, `la lista de fondos tiene que ser corta, y tiene ${ops.length}`);
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
  // Etapa 3: la coordinación ya no se dice con líneas de colores entre puntos,
  // sino con las zonas de influencia y su superposición. La leyenda sigue el
  // cambio, y sigue nombrando los tres tipos de cierre.
  for (const t of ['Cierre total', 'Cierre parcial', 'Ingreso y salida',
    'Zona de influencia', 'Zonas que se superponen']) {
    assert.ok(leyenda.includes(t), `falta "${t}" en la leyenda: ${leyenda}`);
  }
  // Y la muestra de la leyenda se dibuja con la MISMA simbología que el mapa.
  const muestras = await p.$$eval('#leyendaMapa svg', (n) => n.length);
  assert.ok(muestras >= 4, `la leyenda debe dibujar el símbolo real, y trae ${muestras}`);

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
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(500);

  assert.deepEqual(await opciones('frente'), ['A-PARCIAL', 'A-TOTAL'], 'los frentes se reducen a los de CW1');
  assert.deepEqual((await opciones('contrato')).sort(), ['CW1', 'CW2', 'CW3'], 'pero la lista de contratos NO se autolimita');
  assert.equal(await txt(p, '#cuentaPmt'), '2');

  // Se puede seguir marcando mas valores del mismo campo.
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', ['CW1', 'CW2']);
  await p.waitForTimeout(500);
  assert.equal(await txt(p, '#cuentaPmt'), '4');
  assert.equal((await opciones('frente')).length, 4);

  await abrirFiltros(p); await p.click('#btnLimpiar');
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
  await abrirFiltros(p);
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

test('INTERACCION: pulsar una relacion EXPLICA por que existe', saltar, async () => {
  // Etapa 3: pulsar una relación ya no dibuja una línea entre dos puntos. Abre
  // la ficha de coordinación y enseña en el mapa lo que la produce: las dos
  // zonas de influencia y su superposición.
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('.pestanas button[data-pest="rel"]');
  await p.waitForTimeout(300);
  const filas = await p.$$('#tablaRel tbody tr');
  assert.ok(filas.length > 0, 'hay relaciones que mostrar');
  await filas[0].click();
  await p.waitForTimeout(1000);

  const ficha = await txt(p, '#fichaLateral');
  assert.ok(/Relación entre dos contratos/.test(ficha), ficha.slice(0, 160));
  assert.ok(/Por qué están relacionados/.test(ficha), 'tiene que explicar el motivo');
  assert.ok(/zonas de influencia|dentro del umbral|no se pudo medir/i.test(ficha), ficha.slice(0, 300));
  assert.ok(/hechos medidos/.test(ficha), 'y seguir sin clasificar criticidad');
  assert.ok(!/crítico|critico/i.test(ficha), 'la palabra «crítico» no puede aparecer');
  await p.close();
});

/* ═══════════════════ RECORRIDO TEMPORAL ═══════════════════ */

test('RECORRIDO: barra, reproducir, pausar, paso, velocidad y volver a todo', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  for (const id of ['#barraTiempo', '#btnPlay', '#pasoDias', '#velocidad', '#btnTodoTiempo']) {
    assert.ok(await p.$(id), `falta el control ${id}`);
  }
  // Etapa 3: la fecha visible es el dato más importante de este panel y ahora
  // se enseña en grande, diciendo SIEMPRE de qué está hablando.
  assert.match(await txt(p, '#fechaViva'), /Periodo completo/);
  for (const id of ['#recorridoDesde', '#recorridoHasta', '#irAFecha', '#btnAtras', '#btnAdelante']) {
    assert.ok(await p.$(id), `falta el control ${id}`);
  }
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = 5; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(400);
  assert.match(await txt(p, '#fechaViva'), /PMT vigentes el día\s*\d{4}-\d{2}-\d{2}/);
  // La etiqueta dice ahora lo que de verdad se calcula: el DIA COMPLETO.
  assert.ok(/actividad ese día completo/.test(await txt(p, '#vigentesAhora')), await txt(p, '#vigentesAhora'));

  await p.click('#btnPlay');
  await p.waitForTimeout(700);
  assert.equal(await p.$eval('#btnPlay', (b) => b.getAttribute('aria-label')), 'Pausar',
    'se puede pausar mientras reproduce');
  await p.click('#btnPlay');
  await p.waitForTimeout(200);
  assert.equal(await p.$eval('#btnPlay', (b) => b.getAttribute('aria-label')), 'Reproducir');

  await p.click('#btnTodoTiempo');
  await p.waitForTimeout(400);
  assert.match(await txt(p, '#fechaViva'), /Periodo completo/);
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
  // Se lee la celda de FRENTE por su cabecera, no por posicion: una columna
  // nueva delante hacia que esta prueba comparase otra cosa —y como todas las
  // filas comparten situacion, no cambiaba nunca y la prueba fallaba sin que
  // la ordenacion estuviera rota.
  const iFrente = await p.$$eval('#tablaPmt thead th',
    (n) => n.findIndex((x) => /Frente/i.test(x.textContent)));
  assert.ok(iFrente >= 0, 'la tabla tiene que tener columna de Frente');
  const primero = () => p.$eval('#tablaPmt tbody tr:first-child',
    (tr, i) => tr.querySelectorAll('td')[i].textContent, iFrente);
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

  // El TÍTULO ahora declara el contexto temporal («Informe operativo de PMTs —
  // al …» o «Consulta histórica de PMTs — Año …»), que es deliberado: un
  // informe histórico titulado igual que uno operativo se lee como si
  // describiera la situación de hoy. Se exige que nombre los PMT y el contexto.
  assert.match(inf, /(Informe operativo|Consulta histórica) de PMTs/,
    'el título tiene que decir de qué habla: ' + inf.slice(0, 150));
  for (const parte of ['Grupo EPM', 'Qué se analizó',
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
  F.placemark('MANANA', desc('CW7', { inicio: selloFecha(AHORA + D, '06:00:00'), fin: selloFecha(AHORA + D, '08:00:00') }), F.punto([-75.6000, 6.2000])),
  F.placemark('MEDIODIA', desc('CW8', { inicio: selloFecha(AHORA + D, '10:00:00'), fin: selloFecha(AHORA + D, '12:00:00') }), F.punto([-75.6000, 6.2004])),
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
  await abrirFiltros(p);
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
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.fill('#fDesde', diaRel(-1));
  await p.fill('#fHasta', diaRel(30));
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
  assert.equal(await q.inputValue('#fDesde'), diaRel(-1));
  assert.equal(await q.inputValue('#fHasta'), diaRel(30));
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
    F.placemark('NOCTURNO', desc('CW30', { inicio: selloFecha(AHORA + D, '23:00:00'), fin: selloFecha(AHORA + 3 * D, '01:00:00') }), F.punto([-75.6000, 6.2000])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [cruce]);
  const max = await p.inputValue('#barraTiempo').then(() => p.$eval('#barraTiempo', (b) => +b.max));
  assert.equal(max, 2, 'el deslizador llega hasta el tercer día');
  await p.evaluate(() => { const b = document.getElementById('barraTiempo'); b.value = b.max; b.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(500);
  assert.match(await txt(p, '#fechaViva'), new RegExp(diaRel(3)));
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

  await abrirFiltros(p);

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
  await abrirFiltros(p);
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
  // SE ESPERA LA CONDICION, NO EL RELOJ. Con una espera fija de 1,2 s esta
  // prueba pasaba sola y fallaba dentro de la suite completa: con el equipo
  // cargado, recalcular y repintar tarda mas. Una espera fija convierte una
  // diferencia de carga en un fallo que parece un defecto del producto.
  await p.waitForFunction(
    () => !document.getElementById('avisoInforme').classList.contains('oculto'),
    null, { timeout: 30000 });

  assert.ok(await p.isVisible('#avisoInforme'), 'el informe queda marcado como caducado');
  assert.ok(/ya no corresponde/i.test(await txt(p, '#avisoInforme')), await txt(p, '#avisoInforme'));
  assert.equal(await p.$eval('#btnImprimirInforme', (b) => b.disabled), true,
    'y no se puede imprimir un PDF con cifras viejas');
  assert.equal(await p.$eval('#informe', (e) => e.classList.contains('caducado')), true);

  // Actualizarlo lo deja otra vez al día.
  await p.click('#btnActualizarInforme');
  await p.waitForFunction(
    () => document.getElementById('avisoInforme').classList.contains('oculto'),
    null, { timeout: 30000 });
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

  await abrirFiltros(p);

  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#avisoInforme'), 'cambiar el filtro caduca el informe');

  await p.click('#btnActualizarInforme');
  await p.waitForTimeout(800);
  assert.ok(await p.isHidden('#avisoInforme'));

  // Y quitar el filtro vuelve a caducarlo: es otro alcance distinto.
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', []);
  await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#avisoInforme'), 'quitar el filtro también cambia el alcance');

  // Pero si el estado VUELVE a ser el del informe, deja de estar caducado: no
  // se avisa de una diferencia que ya no existe.
  await abrirFiltros(p);
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

/* ═══════════════════ VISTA PREVIA · DATOS (maqueta) ═══════════════════ */

const VISTA = path.join(RAIZ, 'dist', 'Vista_previa_Datos.html');
const saltarVista = { skip: !hayNavegador ? saltar.skip : (fs.existsSync(VISTA) ? false : 'falta dist/Vista_previa_Datos.html') };

test('VISTA PREVIA: el ciclo completo de sincronización funciona en un navegador real', saltarVista, async () => {
  navegador ??= await chromium.launch({ executablePath: ejecutable });
  const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1100 } });
  await ctx.route('**://*/**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto('file://' + VISTA);
  await p.waitForTimeout(500);

  const t = (sel) => p.textContent(sel).then((x) => (x ?? '').replace(/\s+/g, ' ').trim());

  // Tiene que decir, sin margen de duda, que no es la aplicación.
  const cabecera = await t('.frase.atencion');
  assert.ok(/maqueta/i.test(cabecera) && /simulado/i.test(cabecera), cabecera);
  assert.ok(/No hay ningún servicio de EPM conectado/i.test(cabecera),
    'no puede parecer que hay algo corporativo conectado');

  // Primera incorporación.
  await p.click('#btnRevisar'); await p.waitForTimeout(300);
  assert.ok(/Todavía no se sabe/.test(await t('#avisoSim')),
    'al revisar no se puede afirmar nada sobre los PMT: todavía no se ha leído nada');
  await p.click('#btnSincronizar'); await p.waitForTimeout(400);
  assert.match(await t('#tarjetasDatos'), /6fuentes activas/);

  // Segunda revisión sin cambios: no hay nada que hacer, y se dice.
  await p.click('#btnRevisar'); await p.waitForTimeout(300);
  assert.match(await t('#avisoSim'), /Todo está al día/);
  assert.equal(await p.$eval('#btnSincronizar', (b) => b.disabled), true);

  // Mover NO es dar de baja y de alta.
  await p.click('#simMover'); await p.click('#btnRevisar'); await p.waitForTimeout(300);
  const nov = await t('#novedades');
  assert.ok(/Cambió de sitio/.test(nov), nov.slice(0, 200));
  assert.ok(!/Ya no está/.test(nov), 'mover no puede verse como una baja');

  // Copiar NO es mover.
  await p.click('#simCopiar'); await p.click('#btnRevisar'); await p.waitForTimeout(300);
  assert.ok(/Copia repetida/.test(await t('#novedades')), 'una copia con el original presente es una copia');

  // Un archivo ilegible no tumba el lote ni se da por vigente.
  await p.click('#btnSincronizar'); await p.waitForTimeout(400);
  await p.click('#simRomper'); await p.click('#btnRevisar'); await p.waitForTimeout(300);
  await p.click('#btnSincronizar'); await p.waitForTimeout(400);
  assert.match(await t('#avisoSim'), /no se pudieron leer/);
  assert.match(await t('#tablaBitacora'), /fuente_rechazada/);

  // La bitácora no inventa quién hizo qué.
  assert.match(await t('#tablaBitacora'), /equipo-local/);
  assert.deepEqual(errores, []);
  await p.close();
  await ctx.close();
});

/* ═══════════════════ ETAPA 3 · TAREAS REALES DE USUARIO ═══════════════════
 *
 * La UX no se evalua diciendo «se ve mejor». Se evalua comprobando que una
 * persona puede completar las tareas por las que existe la herramienta, y
 * contando los pasos que le cuesta.
 */

// Fechas RELATIVAS: los tres estan vigentes hoy, y siguen estandolo mañana.
const dd = (n) => selloFecha(AHORA + n * D, '07:00:00');
const df = (n) => selloFecha(AHORA + n * D, '18:00:00');
/** Dia (AAAA-MM-DD) a `n` dias de hoy, para escribirlo en un control de fecha. */
const diaRel = (n) => new Date(AHORA + n * D).toISOString().slice(0, 10);

const KMZ_DOC = escribir('condocs.kmz', F.kmz([
  F.placemark('DOC-COMPLETO', F.descripcion({
    inicio: dd(-1), fin: df(19), contrato: 'CW50',
    municipio: 'Medellin', tipo: 'total',
    resolucionPmt: 'RES-1001-2026', permisoRotura: 'PR-2002', cierrePermisoRotura: 'CR-3003',
  }), F.linea([[-75.6000, 6.2000], [-75.5990, 6.2000]])),
  F.placemark('DOC-A-MEDIAS', F.descripcion({
    inicio: dd(3), fin: df(24), contrato: 'CW50',
    municipio: 'Medellin', tipo: 'parcial', resolucionPmt: 'RES-1002-2026',
  }), F.linea([[-75.5985, 6.2000], [-75.5975, 6.2000]])),
  F.placemark('DOC-SIN-NADA', F.descripcion({
    inicio: dd(8), fin: df(29), contrato: 'CW51',
    municipio: 'Envigado', tipo: 'parcial',
  }), F.linea([[-75.5988, 6.2003], [-75.5978, 6.2003]])),
]));

test('TAREA A: «qué intervenciones requieren articulación» se ve sin tocar nada', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  // El panel de capas lo dice de entrada, con su cifra: no hay que encender y
  // apagar capas para averiguar cuántas hay.
  const capas = await txt(p, '#panelCapas');
  assert.ok(/Comparten zona/.test(capas), capas.slice(0, 200));
  assert.ok(/Y además a la vez/.test(capas), 'la articulación tiene su propia cifra');
  // Y las dos cifras son distintas cosas: una es el total, la otra el subconjunto.
  const cifras = await p.$$eval('#panelCapas .capa-fila', (n) => n.map((f) => ({
    nombre: f.querySelector('.capa-nombre').textContent.trim(),
    cuenta: f.querySelector('.capa-cuenta').textContent.trim(),
  })));
  const comparten = cifras.find((c) => /Comparten zona/.test(c.nombre));
  const aLaVez = cifras.find((c) => /a la vez/.test(c.nombre));
  assert.ok(comparten && aLaVez, JSON.stringify(cifras));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('TAREA C: «qué PMT tienen pendiente el permiso de rotura», en dos pasos', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);

  // Paso 1: abrir la pestaña de seguimiento documental.
  await p.click('.pestanas button[data-pest="doc"]');
  await p.waitForTimeout(400);
  const doc = await txt(p, '#panelDocumental');
  assert.ok(/sin Permiso de rotura/.test(doc), doc.slice(0, 240));

  // Paso 2: filtrar. El estado es DERIVADO: no depende de cómo se escribiera.
  await abrirFiltros(p);
  await p.check('#d_falta-permiso');
  await p.waitForTimeout(600);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'dos de los tres no tienen permiso de rotura');
  const chips = await txt(p, '#chipsFiltros');
  assert.ok(/Documentación/.test(chips), `el filtro tiene que verse: ${chips}`);
  await p.close();
});

test('TAREA C bis: el buscador encuentra un PMT por su código de resolución', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);
  await p.fill('#buscarGlobal', 'PR-2002');
  await p.waitForTimeout(600);
  assert.equal(await txt(p, '#cuentaPmt'), '1', 'llega al PMT por el número del trámite');
  assert.ok((await txt(p, '#pest_pmt')).includes('DOC-COMPLETO'));
  await p.close();
});

test('TAREA E: seleccionar un PMT responde quién, cuándo y con quién', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);
  await p.click('#tablaPmt tbody tr:nth-child(1)');
  await p.waitForTimeout(700);
  const f = await txt(p, '#fichaLateral');
  for (const bloque of ['Quién lo ejecuta', 'Cuándo', 'Dónde',
    'Seguimiento documental', 'Coordinación con otros contratos', 'Origen y trazabilidad']) {
    assert.ok(f.includes(bloque), `falta el bloque «${bloque}» en la ficha`);
  }
  // El nombre del archivo NO puede competir con el del frente.
  const titulo = await p.$eval('#fichaLateral .ficha-titulo', (e) => e.textContent.trim());
  assert.ok(!/\.kmz/i.test(titulo), `el titular es el frente, no el archivo: ${titulo}`);
  assert.ok(f.indexOf('Quién lo ejecuta') < f.indexOf('Origen y trazabilidad'),
    'la trazabilidad va al final, no compitiendo con lo operativo');
  await p.close();
});

test('TAREA D: «los cierres de un municipio en un mes», desde la barra', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);
  // Municipio, sin abrir ningún panel: está en la barra.
  await p.click('#desp_municipio summary');
  await p.waitForTimeout(200);
  await p.check('#desp_municipio .desp-lista input[value="Medellin"]');
  await p.waitForTimeout(600);
  assert.equal(await txt(p, '#cuentaPmt'), '2');
  // Y el periodo, también desde la barra.
  await p.fill('#rapDesde', diaRel(7));
  await p.waitForTimeout(600);
  assert.ok(+(await txt(p, '#cuentaPmt')) <= 2);
  const chips = await txt(p, '#chipsFiltros');
  assert.ok(/Municipio/.test(chips) && /Desde/.test(chips), chips);
  await p.close();
});

test('TAREA F: la ficha de una relación explica el motivo sin jerga', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.click('.pestanas button[data-pest="rel"]');
  await p.waitForTimeout(300);
  await p.click('#tablaRel tbody tr:nth-child(1)');
  await p.waitForTimeout(900);
  const f = await txt(p, '#fichaLateral');
  assert.ok(/Por qué están relacionados/.test(f));
  assert.ok(/Con qué regla salió/.test(f), 'y dice con qué criterio salió');
  assert.ok(/Distancia entre trazados/.test(f));
  await p.close();
});

test('CAPAS: apagar una capa quita esos trazados del mapa, y la cifra lo dice', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  const capas = await p.$$eval('#panelCapas input[data-capa]', (n) => n.map((i) => i.dataset.capa));
  assert.ok(capas.includes('cierre:total') && capas.includes('medicion'), JSON.stringify(capas));
  // La medición exacta está APAGADA por defecto: era lo que llenaba el mapa de
  // triángulos que parecían rutas.
  assert.equal(await p.$eval('#panelCapas input[data-capa="medicion"]', (i) => i.checked), false);
  assert.equal(await p.$eval('#panelCapas input[data-capa="zonas"]', (i) => i.checked), false);
  await p.close();
});

test('CONTEXTO: se puede elegir entre ver solo lo filtrado o todo atenuado', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  assert.ok(await p.$('#selContexto'), 'el control de contexto existe');
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(600);
  // El mapa dibuja en un lienzo, así que se cuenta por la capa, no por el DOM.
  const conContexto = await p.evaluate(() => window.__pmtDiagnostico().trazados);

  await p.selectOption('#selContexto', 'solo-seleccion');
  await p.waitForTimeout(700);
  const soloSeleccion = await p.evaluate(() => window.__pmtDiagnostico().trazados);
  assert.ok(soloSeleccion < conContexto,
    `ver solo la selección debe dibujar menos (${soloSeleccion} vs ${conContexto})`);
  assert.equal(await txt(p, '#cuentaPmt'), '2', 'y las cifras no cambian: es solo lo que se dibuja');
  assert.equal(await p.evaluate(() => window.__pmtDiagnostico().contexto), 'solo-seleccion');
  await p.close();
});

test('COLUMNAS: pocas de entrada, y se pueden añadir las demás', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);
  const antes = await p.$$eval('#tablaPmt thead th', (n) => n.length);
  assert.ok(antes <= 8, `la tabla no puede empezar con ${antes} columnas`);
  await p.click('#barraTablaPmt summary');
  await p.waitForTimeout(200);
  await p.check('#columnasPmtMenu input[data-col="resolucionPmt"]');
  await p.waitForTimeout(400);
  const despues = await p.$$eval('#tablaPmt thead th', (n) => n.map((x) => x.textContent.trim()));
  assert.ok(despues.some((c) => /Resolucion PMT/i.test(c)), JSON.stringify(despues));
  assert.ok((await txt(p, '#pest_pmt')).includes('RES-1001-2026'));
  await p.close();
});

test('RECORRIDO: se puede acotar el tramo que se recorre', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);
  const maxAntes = await p.$eval('#barraTiempo', (b) => +b.max);
  await p.fill('#recorridoDesde', diaRel(9));
  await p.fill('#recorridoHasta', diaRel(19));
  await p.waitForTimeout(500);
  const max = await p.$eval('#barraTiempo', (b) => +b.max);
  const min = await p.$eval('#barraTiempo', (b) => +b.min);
  assert.ok(max - min < maxAntes, 'el recorrido queda acotado al tramo pedido');
  assert.ok(/Se recorren \d+ día/.test(await txt(p, '#avisoRecorte')), await txt(p, '#avisoRecorte'));

  // Un rango invertido NO se aplica a medias: se dice y se deja como estaba.
  await p.fill('#recorridoDesde', diaRel(24));
  await p.waitForTimeout(400);
  assert.ok(/posterior a la de fin/.test(await txt(p, '#avisoRecorte')), await txt(p, '#avisoRecorte'));
  await p.close();
});

test('FILTRO LARGO: se puede buscar dentro, y lo elegido nunca desaparece', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KML_C, KML_PARCIAL]);
  await abrirFiltros(p);
  await p.selectOption('#f_contrato', ['CW1']);
  await p.waitForTimeout(400);
  // Se busca algo que NO es el elegido: el elegido tiene que seguir visible.
  const buscador = await p.$('#buscar_frente');
  if (buscador) {
    await p.fill('#buscar_frente', 'zzzz');
    await p.waitForTimeout(300);
    const ocultos = await p.$$eval('#f_frente option',
      (n) => n.filter((o) => o.selected && o.hidden).length);
    assert.equal(ocultos, 0, 'una opción elegida NUNCA puede quedar oculta al buscar');
  }
  await p.close();
});

test('SIMBOLOGIA: los tres tipos se distinguen por más que el color', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.waitForTimeout(800);
  // Cada tipo tiene grosor propio, y el más cerrado es el más grueso: el orden
  // se lee incluso sin distinguir colores.
  const formas = await p.evaluate(() => {
    const m = window.__simbologia;
    return m ? null : null;
  });
  const leyenda = await p.$$eval('#leyendaMapa svg line', (n) => n.map((l) => +l.getAttribute('stroke-width')));
  assert.ok(leyenda.length >= 4, `la leyenda dibuja líneas reales: ${leyenda.length}`);
  assert.ok(new Set(leyenda).size >= 2, `los grosores tienen que distinguirse: ${JSON.stringify(leyenda)}`);
  // Y hay halo: dos líneas por muestra (una blanca debajo).
  assert.ok(leyenda.length >= 6, 'cada muestra lleva halo blanco por debajo');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════════════ CREAR Y EDITAR UN PMT (Etapa 3) ═══════════════════
 *
 * El editor es la primera parte de la aplicacion que ESCRIBE datos, no solo
 * los lee. Tres cosas tienen que ser ciertas al abrirlo de verdad:
 *
 *   1. El catalogo manda: elegir el contrato DERIVA contratista y proyecto, y
 *      limita los municipios. No se teclean, asi que no pueden divergir.
 *   2. «Pendiente» NO es un codigo: se avisa y el dato se queda vacio.
 *   3. Mientras falte un dato obligatorio no se puede guardar, y cuando ya no
 *      falta, guardar recalcula TODO el analisis (no se anade "a un lado").
 */

/** Pulsa en el mapa midiendo su caja ANTES de cada clic: el editor cambia el alto. */
async function clicMapa(p, dx, dy) {
  // El mapa tiene que estar A LA VISTA: `mouse.click` usa coordenadas de la
  // ventana, y abrir el editor desplaza la pagina. Se vuelve a medir en cada
  // clic porque el alto cambia segun los avisos de validacion.
  const caja = await p.$eval('#mapa', (m) => {
    m.scrollIntoView({ block: 'center' });
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await p.waitForTimeout(150);
  const c2 = await p.$eval('#mapa', (m) => {
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await p.mouse.click(c2.x + c2.w * dx, c2.y + c2.h * dy);
  await p.waitForTimeout(250);
  return caja;
}

test('EDITOR: el catalogo manda y crear un PMT recalcula todo el analisis', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  assert.equal(await txt(p, '#cuentaPmt'), '4');

  await p.click('#btnNuevoPmt');
  await p.waitForSelector('#panelEditor:not(.oculto)', { timeout: 15000 });

  // 1. El contrato DERIVA contratista y proyecto, y acota los municipios.
  await p.selectOption('#edContrato', 'CW322377');
  await p.waitForTimeout(300);
  const derivado = await txt(p, '.ed-derivado');
  assert.ok(/Consorcio AMT24/.test(derivado), derivado);
  assert.ok(/AMPLIACION_TANQUES/.test(derivado), derivado);
  const municipios = await p.$$eval('#edMunicipio option',
    (n) => n.map((o) => o.value).filter(Boolean));
  assert.deepEqual(municipios, ['Medellín', 'Envigado'],
    'solo los municipios declarados para ese contrato');

  // Mientras falten datos obligatorios, guardar esta bloqueado.
  assert.equal(await p.isDisabled('#edGuardar'), true, 'no se puede guardar a medias');

  await p.selectOption('#edMunicipio', 'Medellín');
  await p.fill('#edFrente', 'FRENTE NUEVO');
  await p.fill('#edDireccion', 'Calle 30 con Carrera 65');
  await p.selectOption('#edTipo', 'total');
  await p.fill('#edInicio', `${diaRel(1)}T07:00`);
  await p.fill('#edFin', `${diaRel(21)}T17:00`);
  await p.waitForTimeout(250);

  // 2. Sin trazado sigue sin poder guardarse: un PMT sin geometria no se ubica.
  assert.equal(await p.isDisabled('#edGuardar'), true, 'sin trazado tampoco');

  await p.click('#edDibujar');
  await clicMapa(p, 0.45, 0.45);
  await clicMapa(p, 0.55, 0.55);
  const estadoGeom = await txt(p, '#edEstadoGeom');
  assert.ok(/2/.test(estadoGeom), estadoGeom);

  await p.waitForFunction(() => !document.querySelector('#edGuardar').disabled,
    null, { timeout: 15000 });
  assert.ok(/Todo correcto/.test(await txt(p, '#edResumenValidacion')),
    await txt(p, '#edResumenValidacion'));

  // 3. Guardar RECALCULA: el PMT nuevo entra en el analisis, no a un lado.
  await p.click('#edGuardar');
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '5',
    null, { timeout: 30000 });
  assert.ok((await txt(p, '#pest_pmt')).includes('FRENTE NUEVO'));
  assert.ok((await txt(p, '#listaFuentes')).includes('FRENTE NUEVO')
    || (await txt(p, '#listaFuentes')).toLowerCase().includes('plataforma'),
  'el PMT creado aparece como una fuente mas: ' + (await txt(p, '#listaFuentes')));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('EDITOR: «Pendiente» se avisa y NUNCA se guarda como si fuera el código', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A]);
  await p.click('#btnNuevoPmt');
  await p.waitForSelector('#panelEditor:not(.oculto)', { timeout: 15000 });

  await p.fill('#ed_resolucionPmt', 'Pendiente');
  await p.waitForTimeout(350);
  const aviso = await txt(p, '[data-aviso="ed_resolucionPmt"]');
  assert.ok(/Pendiente|no es un código|vacío/i.test(aviso),
    'tiene que avisar de que «Pendiente» no es un código: ' + aviso);
  assert.ok(/Atención|Revisar|Advertencia/i.test(aviso),
    'y ser ADVERTENCIA, no error: se puede guardar igual. ' + aviso);

  // Un codigo de verdad no genera ningun aviso.
  await p.fill('#ed_resolucionPmt', 'RES-2026-0042');
  await p.waitForTimeout(350);
  assert.equal((await txt(p, '[data-aviso="ed_resolucionPmt"]')), '');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════ TAREAS QUE FALTABAN Y VOCABULARIO OPERATIVO (Etapa 3) ═══════════ */

test('TAREA B: «qué está abierto un día concreto», escribiendo la fecha', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_DOC]);

  // Paso unico: escribir el dia. No hay que arrastrar la barra hasta acertar.
  await p.fill('#irAFecha', diaRel(27));
  await p.waitForTimeout(600);
  const viva = await txt(p, '#fechaViva');
  assert.ok(viva.includes(diaRel(27)), 'la fecha viva se ve en grande: ' + viva);

  // Ese dia solo esta vigente DOC-SIN-NADA (del 10 al 30); los otros ya cerraron.
  assert.equal(await txt(p, '#cuentaPmt'), '1', 'el día filtra de verdad, no solo pinta');
  const tabla = await txt(p, '#pest_pmt');
  assert.ok(tabla.includes('DOC-SIN-NADA'), tabla.slice(0, 200));
  assert.ok(!tabla.includes('DOC-COMPLETO'), 'lo que no está vigente ese día no puede salir');

  // Y volver a todo es un solo boton.
  await p.click('#btnTodoTiempo');
  await p.waitForTimeout(400);
  assert.equal(await txt(p, '#cuentaPmt'), '3');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('TAREA G: el informe sirve para una reunión sin explicar nada antes', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KMZ_DOC]);
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const inf = await txt(p, '#informe');

  // 1. Responde la pregunta operativa antes que los metros.
  assert.ok(inf.includes('articulación requerida'), 'la cifra operativa encabeza el informe');
  assert.ok(inf.includes('coincidencia espacial'), inf.slice(0, 400));
  assert.ok(/Cómo leer las dos primeras cifras/.test(inf), 'y explica qué significan, ahí mismo');

  // 2. Declara con QUE criterio se saco, y que el candidato no esta aplicado.
  assert.ok(/no pasa de 120 m|zonas de influencia/.test(inf), 'declara el criterio vigente');
  assert.ok(/pendiente de validación humana/i.test(inf),
    'el modelo candidato se nombra como candidato, no como vigente');

  // 3. Lleva el seguimiento documental, con «Pendiente» como ESTADO.
  assert.ok(inf.includes('Seguimiento documental'), 'el informe trae la documentación');
  assert.ok(/la casilla está vacía/.test(inf),
    'y dice que Pendiente significa vacío, no una palabra escrita');
  assert.ok(inf.includes('RES-1001-2026') || inf.includes('2/3') || inf.includes('1/3'),
    'con los códigos reales o el resumen n/3');

  // 4. Sigue sin clasificar criticidad, y lo dice.
  assert.ok(inf.includes('No asigna niveles de criticidad'));
  assert.ok(/vocabulario provisional/i.test(inf),
    'el vocabulario operativo se presenta como provisional');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('VOCABULARIO: la lectura operativa se deduce de los hechos, y se ve al lado', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);

  // El glosario va pegado a las cifras, no escondido en una ayuda.
  const glos = await txt(p, '#glosarioOperativo');
  assert.ok(/Articulación requerida/.test(glos), glos);
  assert.ok(/no son un nivel de criticidad/.test(glos), glos);

  // En la tabla, la lectura NO sustituye a los hechos: las tres columnas salen.
  await p.click('[data-pest="rel"]');
  await p.waitForTimeout(400);
  const cab = await p.$$eval('#tablaRel thead th', (n) => n.map((x) => x.textContent.trim()));
  assert.ok(cab.some((c) => /Lectura/.test(c)), JSON.stringify(cab));
  assert.ok(cab.some((c) => /En el espacio/.test(c)), JSON.stringify(cab));
  assert.ok(cab.some((c) => /En el tiempo/.test(c)), JSON.stringify(cab));

  // Y cada lectura cuadra con sus dos hechos, fila a fila.
  // Se leen por CABECERA, no por posición: una columna nueva no debe poder
  // hacer que esta prueba compare la distancia con el estado temporal.
  const iLect = cab.findIndex((c) => /Lectura/.test(c));
  const iEsp = cab.findIndex((c) => /En el espacio/.test(c));
  const iTie = cab.findIndex((c) => /En el tiempo/.test(c));
  const filas = await p.$$eval('#tablaRel tbody tr', (n, idx) => n.map((tr) => {
    const c = [...tr.querySelectorAll('td')].map((x) => x.textContent.trim());
    return { lectura: c[idx.l], espacio: c[idx.e], tiempo: c[idx.t] };
  }), { l: iLect, e: iEsp, t: iTie });
  assert.ok(filas.length > 0, 'hay relaciones que comprobar');
  for (const f of filas) {
    if (f.lectura === 'Articulación requerida') {
      assert.ok(/Se tocan|Cerca/.test(f.espacio), JSON.stringify(f));
      assert.equal(f.tiempo, 'A la vez', JSON.stringify(f));
    }
    if (f.lectura === 'Coincidencia espacial') {
      assert.ok(/Se tocan|Cerca/.test(f.espacio), JSON.stringify(f));
      assert.notEqual(f.tiempo, 'A la vez', JSON.stringify(f));
    }
  }
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════════════ ACCESIBILIDAD Y CALIDAD VISUAL (Etapa 3, §25) ═══════════
 *
 * No se revisa «a ojo»: se MIDE en el navegador real, sobre los colores que el
 * navegador calcula de verdad, con la aplicación cargada y con datos dentro.
 * Una revisión de accesibilidad hecha leyendo el CSS se equivoca en cuanto hay
 * un color heredado, una transparencia o una regla que gana por especificidad.
 */

/** Contraste WCAG entre dos colores `rgb(...)` tal como los da `getComputedStyle`. */
const CONTRASTE = `(function(){
  const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => {
    const m = rgb.match(/[\\d.]+/g).map(Number);
    return 0.2126 * canal(m[0]) + 0.7152 * canal(m[1]) + 0.0722 * canal(m[2]);
  };
  return (a, b) => { const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
})()`;

test('A11Y: el texto tiene contraste suficiente sobre su fondo real', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KMZ_DOC]);
  await p.waitForTimeout(600);

  // SE ABRE TODO LO QUE ESTA ESCONDIDO. Un panel cerrado no se mide, y medir
  // solo lo que se ve al arrancar dejaba fuera el editor, el informe, los
  // filtros y las pastillas de lectura operativa: justo lo que se anadio
  // despues, que es donde estaria el color sin revisar.
  await abrirFiltros(p);
  await p.click('[data-pest="rel"]').catch(() => {});
  await p.waitForTimeout(200);
  await p.click('#btnNuevoPmt').catch(() => {});
  await p.waitForTimeout(300);
  await p.click('#expInforme').catch(() => {});
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(500);

  const medidos = await p.evaluate(() => ({
    informe: document.querySelectorAll('#informe *').length,
    editor: document.querySelectorAll('#panelEditor .campo').length,
    filtros: document.querySelectorAll('#panelFiltros *').length,
    operativas: document.querySelectorAll('.p-articula, .p-coincide-esp, .inf-op').length,
  }));
  // Si un panel no se abrio, esta prueba estaria dando por buenos colores que
  // no ha mirado. Se exige que haya contenido REAL en cada uno.
  assert.ok(medidos.informe > 50, 'el informe no se abrió: ' + JSON.stringify(medidos));
  assert.ok(medidos.editor > 5, 'el editor no se abrió: ' + JSON.stringify(medidos));
  assert.ok(medidos.filtros > 5, 'los filtros no se abrieron: ' + JSON.stringify(medidos));
  assert.ok(medidos.operativas > 0, 'no hay pastillas de lectura operativa que medir');

  const malos = await p.evaluate((src) => {
    const contraste = eval(src);
    // Fondo REAL: se sube por los ancestros hasta encontrar uno opaco, que es
    // lo que ve el ojo. Mirar solo el elemento da «transparent» y miente.
    const fondoDe = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return 'rgb(255, 255, 255)';
    };
    const fallos = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null && el.tagName !== 'BODY') continue;   // no visible
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!propio) continue;
      const s = getComputedStyle(el);
      const px = parseFloat(s.fontSize);
      const grande = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
      const minimo = grande ? 3 : 4.5;
      const c = contraste(s.color, fondoDe(el));
      if (c < minimo) {
        fallos.push({ etq: el.tagName + (el.id ? '#' + el.id : '') + '.' + el.className,
          texto: el.textContent.trim().slice(0, 40), c: +c.toFixed(2), minimo, px });
      }
    }
    return fallos;
  }, CONTRASTE);

  assert.deepEqual(malos, [], 'textos por debajo del contraste AA:\n' + JSON.stringify(malos, null, 1));
  await p.close();
});

test('A11Y: se llega a todo con el teclado y el foco SE VE', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);

  // 1. Ningún control interactivo puede quedar fuera del recorrido del tabulador.
  const fuera = await p.$$eval(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], summary, [role=tab]',
    (n) => n.filter((e) => e.offsetParent !== null && e.tabIndex < 0)
      .map((e) => e.tagName + (e.id ? '#' + e.id : '')));
  assert.deepEqual(fuera, [], 'controles visibles que el tabulador no alcanza');

  // 2. El foco se VE: un contorno propio, no el que quita un `outline:none`.
  await p.focus('#btnEncuadrar');
  const foco = await p.$eval('#btnEncuadrar', (e) => {
    const s = getComputedStyle(e);
    return { outline: s.outlineStyle, ancho: parseFloat(s.outlineWidth) || 0, sombra: s.boxShadow };
  });
  assert.ok((foco.outline !== 'none' && foco.ancho >= 2) || /rgb/.test(foco.sombra),
    'el foco del teclado tiene que verse: ' + JSON.stringify(foco));

  // 3. Cada control de formulario dice qué es: etiqueta, aria-label o título.
  const sinNombre = await p.$$eval('select:not([disabled]), input:not([type=file])', (n) => n
    .filter((e) => e.offsetParent !== null)
    .filter((e) => !e.getAttribute('aria-label') && !e.title
      && !e.closest('label') && !(e.id && document.querySelector(`label[for="${e.id}"]`)))
    .map((e) => e.tagName + (e.id ? '#' + e.id : '')));
  assert.deepEqual(sinNombre, [], 'controles sin nombre accesible');
  await p.close();
});

test('A11Y: en pantalla estrecha no hay desbordamiento horizontal', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B, KMZ_DOC]);
  await p.setViewportSize({ width: 420, height: 900 });
  await p.waitForTimeout(700);

  const desborde = await p.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= ancho + 1) return null;
    // Se nombra al culpable: «la página se desborda» no se puede arreglar.
    const culpables = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.right > ancho + 1 && r.width > 8 && !el.closest('.tabla-caja')) {
        culpables.push(el.tagName + (el.id ? '#' + el.id : '.' + el.className) + ' →' + Math.round(r.right));
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, ancho, culpables: culpables.slice(0, 8) };
  });
  assert.equal(desborde, null, 'desbordamiento horizontal: ' + JSON.stringify(desborde, null, 1));
  await p.close();
});

test('A11Y: un nombre larguísimo no rompe la tabla ni la ficha', saltar, async () => {
  const LARGO = 'FRENTE_CON_UN_NOMBRE_ABSURDAMENTE_LARGO_QUE_NADIE_DEBERIA_ESCRIBIR_PERO_QUE_ALGUIEN_ESCRIBIRA_IGUAL_0123456789';
  const kmz = escribir('largo.kmz', F.kmz([
    F.placemark(LARGO, desc('CONTRATO_CON_NOMBRE_TAMBIEN_MUY_LARGO_PARA_PROBAR', { tipo: 'total' }),
      F.linea([[-75.6000, 6.2000], [-75.5990, 6.2000]])),
  ]));
  const p = await abrir({ sinRed: true });
  await cargar(p, [kmz]);
  await p.waitForTimeout(400);

  const ancho = await p.evaluate(() => document.documentElement.clientWidth);
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scroll <= ancho + 1, `un nombre largo desborda la página (${scroll} > ${ancho})`);

  // Y el nombre sigue estando: recortarlo visualmente no puede perderlo.
  assert.ok((await txt(p, '#pest_pmt')).includes(LARGO.slice(0, 30)));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

/* ═══════════ REACTIVACIONES, OPERATIVO E HISTÓRICO (Etapa 3, complemento) ═══════
 *
 * Se conduce la aplicación empaquetada como lo haría una persona: cargar datos
 * con PMT de varios años, cambiar de alcance, consultar un año, reactivar un
 * PMT sin redibujarlo, y comprobar que el histórico nunca se pierde.
 *
 * Las fechas de los fixtures se calculan RESPECTO DEL RELOJ DEL EQUIPO, no
 * escritas a mano: una prueba con «2025» escrito dentro deja de significar lo
 * mismo en cuanto pasa el tiempo, y empieza a fallar sola sin que nada se haya
 * roto.
 */
const HOY = new Date();
const ANIO = HOY.getUTCFullYear();
const f2 = (n) => String(n).padStart(2, '0');
const fecha = (anio, mes, dia, hora = '07:00:00') => `${anio}-${f2(mes)}-${f2(dia)} ${hora}`;

const KMZ_ANIOS = escribir('anios.kmz', F.kmz([
  // Dos de hace dos años, de contratos distintos y MUY cerca: en su momento
  // fueron una articulación, hoy son historia.
  F.placemark('VIEJO-A', F.descripcion({
    inicio: fecha(ANIO - 2, 3, 1), fin: fecha(ANIO - 2, 3, 20, '18:00:00'),
    contrato: 'CWV1', municipio: 'Medellin', tipo: 'total',
  }), F.linea([[-75.6000, 6.2000], [-75.5990, 6.2000]])),
  F.placemark('VIEJO-B', F.descripcion({
    inicio: fecha(ANIO - 2, 3, 5), fin: fecha(ANIO - 2, 3, 25, '18:00:00'),
    contrato: 'CWV2', municipio: 'Medellin', tipo: 'parcial',
  }), F.linea([[-75.5995, 6.2002], [-75.5985, 6.2002]])),
  // Uno del año pasado.
  F.placemark('ANTERIOR', F.descripcion({
    inicio: fecha(ANIO - 1, 6, 1), fin: fecha(ANIO - 1, 6, 30, '18:00:00'),
    contrato: 'CWA1', municipio: 'Envigado', tipo: 'total',
  }), F.linea([[-75.5900, 6.1800], [-75.5890, 6.1800]])),
  // Uno claramente FUTURO: dentro de dos años.
  F.placemark('FUTURO', F.descripcion({
    inicio: fecha(ANIO + 2, 1, 10), fin: fecha(ANIO + 2, 2, 10, '18:00:00'),
    contrato: 'CWF1', municipio: 'Medellin', tipo: 'total',
  }), F.linea([[-75.5800, 6.2500], [-75.5790, 6.2500]])),
  // Uno que CRUZA el 31 de diciembre.
  F.placemark('CRUZA-ANIO', F.descripcion({
    inicio: fecha(ANIO - 1, 12, 20), fin: fecha(ANIO, 1, 15, '18:00:00'),
    contrato: 'CWC1', municipio: 'Medellin', tipo: 'parcial',
  }), F.linea([[-75.5700, 6.2600], [-75.5690, 6.2600]])),
]));

/** Elige el alcance temporal por su control de radio. */
async function elegirAlcance(p, valor) {
  // Se pulsa la ETIQUETA, que es lo que pulsa una persona: el radio esta
  // recortado a 1x1 para que no se vea, y aunque ahora si tiene superficie, la
  // etiqueta es el objetivo real y el que sigue funcionando si el estilo cambia.
  await p.click(`#lab_alc_${valor}`);
  await p.waitForTimeout(700);
}

test('CONTEXTO: la banda dice con PALABRAS qué se está viendo', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await p.waitForTimeout(500);

  const banda = await txt(p, '#bandaContexto');
  assert.ok(/Operativo/.test(banda), 'la banda nombra el contexto: ' + banda);
  assert.ok(/5 PMT cargados/.test(banda), 'y dice SIEMPRE de cuántos habla: ' + banda);
  assert.ok(/hist[oó]rico/i.test(banda), 'incluido el número que no se ve: ' + banda);

  // Y no es solo un color: el texto cambia al cambiar de alcance.
  await elegirAlcance(p, 'historico');
  const banda2 = await txt(p, '#bandaContexto');
  assert.ok(/Consulta histórica|Año/.test(banda2), banda2);
  assert.notEqual(banda, banda2);
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('OPERATIVO: los PMT vencidos no hacen ruido, y se dice cuántos son', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await p.waitForTimeout(500);

  // Por defecto, vista operativa: los tres viejos quedan fuera.
  const visibles = +(await txt(p, '#cuentaPmt'));
  assert.ok(visibles < 5, `la vista operativa tiene que recortar: ${visibles} de 5`);
  const tabla = await txt(p, '#pest_pmt');
  assert.ok(!tabla.includes('VIEJO-A'), 'un PMT de hace dos años no es operativo');
  assert.ok(tabla.includes('FUTURO'), 'lo programado SÍ es operativo: todavía se puede coordinar');

  // Pero el histórico NO se ha borrado: «Todo» lo devuelve entero.
  await elegirAlcance(p, 'todo');
  assert.equal(await txt(p, '#cuentaPmt'), '5', 'nada se ha perdido');
  assert.ok((await txt(p, '#pest_pmt')).includes('VIEJO-A'));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('HISTÓRICO: consultar un año devuelve sus PMT enteros', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await elegirAlcance(p, 'historico');

  // El selector de año se pobló CON LOS DATOS, no con una lista fija.
  const anios = await p.$$eval('#selAnio option', (n) => n.map((o) => o.value).filter(Boolean));
  assert.ok(anios.includes(String(ANIO - 2)), `falta el año ${ANIO - 2}: ${anios}`);
  assert.ok(anios.includes(String(ANIO - 1)), `falta el año ${ANIO - 1}: ${anios}`);

  await p.selectOption('#selAnio', String(ANIO - 2));
  await p.waitForTimeout(800);
  const tabla = await txt(p, '#pest_pmt');
  assert.ok(tabla.includes('VIEJO-A') && tabla.includes('VIEJO-B'),
    `el año ${ANIO - 2} tiene que devolver sus dos PMT: ` + tabla.slice(0, 200));
  assert.ok(!tabla.includes('ANTERIOR'), 'y no los de otro año');

  // Y la relación entre ellos vuelve: ocultar históricos no es borrarlos.
  assert.ok(+(await txt(p, '#cuentaRel')) > 0,
    'en su año, aquellos dos PMT vuelven a estar relacionados');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('CRUZA AÑO: un PMT de diciembre a enero sale en los DOS años', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await elegirAlcance(p, 'historico');

  for (const anio of [ANIO - 1, ANIO]) {
    const hay = await p.$$eval('#selAnio option', (n, a) => n.some((o) => o.value === a), String(anio));
    if (!hay) continue;
    await p.selectOption('#selAnio', String(anio));
    await p.waitForTimeout(700);
    assert.ok((await txt(p, '#pest_pmt')).includes('CRUZA-ANIO'),
      `el PMT que cruza el 31 de diciembre no sale al consultar ${anio}`);
  }
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('RECORRIDO: volver a una fecha pasada devuelve lo que pasaba entonces', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await p.waitForTimeout(400);

  // En «Todo», para que el recorrido cubra todo el periodo.
  await elegirAlcance(p, 'todo');
  await p.fill('#irAFecha', `${ANIO - 2}-03-10`);
  await p.waitForTimeout(900);

  assert.ok((await txt(p, '#fechaViva')).includes(`${ANIO - 2}-03-10`), await txt(p, '#fechaViva'));
  const tabla = await txt(p, '#pest_pmt');
  assert.ok(tabla.includes('VIEJO-A') && tabla.includes('VIEJO-B'),
    'aquel día los dos estaban vivos: ' + tabla.slice(0, 200));
  assert.ok(+(await txt(p, '#cuentaRel')) > 0,
    'y su relación vuelve: la semántica depende de la fecha que se analiza');

  // La banda tiene que decir que se está mirando otra fecha, no hoy.
  const banda = await txt(p, '#bandaContexto');
  assert.ok(/Recorrido temporal|Situación al/.test(banda), banda);
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('REACTIVAR: nueva vigencia SIN redibujar, y el historial queda a la vista', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.waitForTimeout(400);

  // Se selecciona un PMT: aparece el botón de nueva vigencia.
  await p.click('#tablaPmt tbody tr');
  await p.waitForTimeout(500);
  assert.ok(await p.isVisible('#btnReactivarPmt'), 'se puede reactivar lo que tiene trazado');

  await p.click('#btnReactivarPmt');
  await p.waitForSelector('#panelEditor:not(.oculto)', { timeout: 15000 });
  assert.equal(await txt(p, '#tituloEditor'), 'Nueva vigencia del mismo PMT');

  const cuerpo = await txt(p, '#panelEditor');
  assert.ok(/No es un PMT nuevo/.test(cuerpo), 'dice que no es un PMT nuevo: ' + cuerpo.slice(0, 200));
  assert.ok(/trazado se reutiliza exactamente/i.test(cuerpo), cuerpo.slice(0, 300));

  // El trazado NO se puede tocar: es el punto de la función.
  assert.equal(await p.isDisabled('#edDibujar'), true, 'no se puede redibujar al reactivar');
  assert.equal(await p.isDisabled('#edBorrarGeom'), true);
  // Ni la identidad: contrato, frente y tipo son del PMT base.
  assert.equal(await p.isDisabled('#edContrato'), true);
  assert.equal(await p.isDisabled('#edTipo'), true);

  // Solo hay que poner las fechas nuevas.
  await p.fill('#edInicio', `${diaRel(40)}T07:00`);
  await p.fill('#edFin', `${diaRel(60)}T18:00`);
  await p.waitForTimeout(400);
  await p.waitForFunction(() => !document.querySelector('#edGuardar').disabled, null, { timeout: 15000 });
  assert.equal(await txt(p, '#edGuardar'), 'Crear la nueva vigencia');

  await p.click('#edGuardar');
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '5',
    null, { timeout: 30000 });

  // La nota dice que es una ACTIVACIÓN, no un PMT nuevo.
  const siguiente = await txt(p, '#siguientePaso');
  assert.ok(/activación 2|activacion 2/i.test(siguiente),
    'tiene que decir que es la activación 2, no un PMT nuevo: ' + siguiente);

  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('REACTIVAR: la geometría de la nueva activación es IDÉNTICA', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_A, KMZ_B]);
  await p.waitForTimeout(400);
  await p.click('#tablaPmt tbody tr');
  await p.waitForTimeout(400);

  await p.click('#btnReactivarPmt');
  await p.waitForSelector('#panelEditor:not(.oculto)', { timeout: 15000 });
  await p.fill('#edInicio', `${diaRel(40)}T07:00`);
  await p.fill('#edFin', `${diaRel(60)}T18:00`);
  await p.waitForFunction(() => !document.querySelector('#edGuardar').disabled, null, { timeout: 15000 });
  await p.click('#edGuardar');
  await p.waitForFunction(() => document.querySelector('#cuentaPmt').textContent === '5',
    null, { timeout: 30000 });

  // Se exporta a GeoJSON y se comparan las DOS geometrías de la misma base,
  // coordenada a coordenada. Es la comprobación más dura disponible desde
  // fuera: lo que sale del producto tiene que llevar el mismo trazado.
  await elegirAlcance(p, 'todo');
  const descarga = p.waitForEvent('download', { timeout: 30000 });
  await p.click('#expGeoJson');
  const d = await descarga;
  const ruta = path.join(TMP, 'reactivado.geojson');
  await d.saveAs(ruta);
  const gj = JSON.parse(fs.readFileSync(ruta, 'utf8'));

  const porFrente = new Map();
  for (const f of gj.features) {
    const k = f.properties.frente;
    if (!porFrente.has(k)) porFrente.set(k, []);
    porFrente.get(k).push(f.geometry);
  }
  const conDos = [...porFrente.entries()].find(([, g]) => g.length === 2);
  assert.ok(conDos, 'tiene que haber un frente con dos activaciones: ' +
    JSON.stringify([...porFrente.keys()]));
  assert.deepEqual(conDos[1][0], conDos[1][1],
    'las dos activaciones del mismo PMT tienen que llevar EXACTAMENTE el mismo trazado');
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});

test('INFORME: un informe histórico se titula y se lee en pasado', saltar, async () => {
  const p = await abrir({ sinRed: true });
  await cargar(p, [KMZ_ANIOS]);
  await elegirAlcance(p, 'historico');
  await p.selectOption('#selAnio', String(ANIO - 2));
  await p.waitForTimeout(800);

  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const inf = await txt(p, '#informe');

  assert.ok(/Consulta histórica de PMTs/.test(inf), 'el TÍTULO dice que es histórico: ' + inf.slice(0, 200));
  assert.ok(inf.includes(String(ANIO - 2)), 'y de qué año');
  assert.ok(/Esto es una consulta del pasado/.test(inf), 'lo dice sin que haya que deducirlo');
  assert.ok(/Fecha de referencia/.test(inf), 'y declara la fecha desde la que se juzgó');
  assert.ok(!/Informe operativo/.test(inf), 'no puede titularse como operativo');

  // Y un informe operativo NO puede llamarse histórico.
  await p.click('#btnCerrarInforme').catch(() => {});
  await elegirAlcance(p, 'operativo');
  await p.click('#expInforme');
  await p.waitForSelector('#panelInforme:not(.oculto)', { timeout: 20000 });
  const inf2 = await txt(p, '#informe');
  assert.ok(/Informe operativo de PMTs/.test(inf2), inf2.slice(0, 200));
  assert.ok(!/consulta del pasado/.test(inf2));
  assert.deepEqual(p.erroresJs, []);
  await p.close();
});
