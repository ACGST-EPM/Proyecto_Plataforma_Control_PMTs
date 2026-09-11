/**
 * ORQUESTADOR DE LA APLICACION
 *
 * Une el motor aprobado en la Etapa 1 con la interfaz. Aqui no hay ni un
 * calculo geoespacial ni temporal: todos viven en `motor/`, intactos y con sus
 * 218 pruebas. Este archivo solo decide QUE se muestra y CUANDO.
 *
 * Flujo: elegir archivos → procesar → resumen → explorar → exportar.
 */
import { $, $$, esc, num, crear, mostrar, descargar, fechaLegible } from './ui/dom.js';
import * as Mapa from './ui/mapa.js';
import * as Tablas from './ui/tablas.js';
import * as Controles from './ui/controles.js';
import * as Ingesta from './nucleo/ingesta.js';
import * as Filtro from './nucleo/filtrado.js';
import * as Export from './nucleo/exportar.js';
import { resumir, frasePrincipal } from './nucleo/resumen.js';
import { LECTURA } from './nucleo/modelo.js';

/** Parametros aprobados en la Etapa 1. El umbral es configurable; 120 m es el valor funcional. */
const CONFIG = Object.freeze({
  umbralMetros: 120,
  granularidadTemporal: 'instante',   // fecha + hora reales
  toleranciaMinutos: 0,
  excluirMismoContrato: true,         // invariante del proyecto
  modoDistancia: 'real',
});

const estado = {
  filas: [], relaciones: [], porId: new Map(), archivos: [], analisis: null,
  visibles: [], relVisibles: [], seleccionado: null, instanteRecorrido: null,
};

/* ───────────────────────── Carga de archivos ───────────────────────── */

function conectarCarga() {
  const zona = $('zona'), entrada = $('entrada');
  $('btnElegir').onclick = () => entrada.click();
  zona.onclick = (e) => { if (e.target === zona || e.target.tagName === 'P') entrada.click(); };
  entrada.onchange = () => { if (entrada.files.length) cargar([...entrada.files]); };

  for (const ev of ['dragenter', 'dragover']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); });
  }
  zona.addEventListener('drop', (e) => {
    const f = [...(e.dataTransfer?.files ?? [])];
    if (f.length) cargar(f);
  });

  $('btnEmpezarDeNuevo').onclick = () => reiniciar();
}

function reiniciar() {
  Controles.parar();
  estado.filas = []; estado.relaciones = []; estado.porId = new Map();
  estado.archivos = []; estado.analisis = null; estado.seleccionado = null;
  estado.instanteRecorrido = null;
  $('entrada').value = '';
  $('listaSeleccion').innerHTML = '';
  for (const p of ['panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar']) mostrar(p, false);
  mostrar('panelCarga', true);
  mostrar('btnEmpezarDeNuevo', false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function avisarProgreso(texto, clase = '') {
  const n = $('progreso');
  n.className = 'frase ' + clase;
  n.innerHTML = texto;
  mostrar('progreso', true);
}

async function cargar(files) {
  avisarProgreso(`Leyendo ${num(files.length)} archivo(s)…`);
  $('listaSeleccion').innerHTML = files.map((f) =>
    `<div style="font-size:.84rem;color:#44474b">· ${esc(f.name)} <small style="color:#6b7075">(${(f.size / 1024).toFixed(0)} KB)</small></div>`).join('');

  try {
    const preparados = await Ingesta.prepararArchivos(files);
    avisarProgreso('Analizando trazados, distancias y fechas…');
    // Cede el hilo para que el navegador pinte el mensaje antes de calcular.
    await new Promise((r) => setTimeout(r, 30));

    const t0 = performance.now();
    const r = await Ingesta.procesar(preparados, CONFIG);
    const ms = Math.round(performance.now() - t0);

    Object.assign(estado, r);
    if (r.error && !r.filas.length) {
      avisarProgreso(`<b>No se pudo analizar nada.</b> ${esc(r.error)} Revise el detalle más abajo.`, 'error');
      pintarSoloCalidad();
      return;
    }
    mostrar('progreso', false);
    pintarTodo(ms);
  } catch (e) {
    // Un fallo inesperado NUNCA puede presentarse como "0 resultados".
    avisarProgreso(`<b>Ocurrió un error inesperado al procesar los archivos.</b><br>` +
      `<small style="font-family:monospace">${esc(e?.message ?? e)}</small><br>` +
      `Los archivos no se modificaron. Puede intentarlo de nuevo o probar con menos archivos a la vez.`, 'error');
  }
}

/** Si todo falló, al menos se enseña por qué: nunca una pantalla vacía. */
function pintarSoloCalidad() {
  const diag = Ingesta.diagnosticoArchivos(estado.archivos);
  const res = resumir(null, [], []);
  mostrar('panelDetalle', true);
  Tablas.pintarCalidad(diag, res, []);
  irAPestana('cal');
  mostrar('btnEmpezarDeNuevo', true);
}

/* ───────────────────────── Pintado ───────────────────────── */

function pintarTodo(ms) {
  for (const p of ['panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar']) mostrar(p, true);
  mostrar('btnEmpezarDeNuevo', true);

  Mapa.iniciar('mapa', { onSeleccion: (id) => seleccionar(id) });
  Controles.montarFiltros(estado.filas, aplicarFiltros);
  Controles.montarRecorrido(estado.filas, (instante) => {
    estado.instanteRecorrido = instante;
    aplicarFiltros();
  });

  aplicarFiltros();
  Mapa.encuadrar();

  const res = resumir(estado.analisis, estado.filas, estado.relaciones);
  pintarResumen(res, ms);
  Tablas.pintarCalidad(
    Ingesta.diagnosticoArchivos(estado.archivos), res,
    estado.filas.filter((x) => (x.avisos ?? []).length));

  $('panelResumen').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pintarResumen(res, ms) {
  const hayDudas = res.espacialNoEval || res.temporalNoEval || res.archivosParciales || res.archivosFallidos;
  const caja = $('fraseResumen');
  caja.className = 'frase ' + (res.archivosFallidos ? 'error' : hayDudas ? 'atencion' : '');
  caja.textContent = frasePrincipal(res);

  const t = (n, txt, clase = '') => `<div class="tarjeta ${clase}"><div class="n">${num(n)}</div><div class="t">${txt}</div></div>`;
  $('tarjetas').innerHTML =
    t(res.pmts, 'PMT encontrados', 'verde') +
    t(res.contratos, 'contratos') +
    t(res.relaciones, 'relaciones entre contratos', res.relaciones ? 'azul' : '') +
    t(res.contacto, 'llegan a tocarse', res.contacto ? 'nar' : '') +
    t(res.aLaVez, 'coinciden en el tiempo', res.aLaVez ? 'nar' : '') +
    t(res.espacialNoEval + res.temporalNoEval, 'no se pudieron analizar', (res.espacialNoEval + res.temporalNoEval) ? 'rojo' : 'gris') +
    t(res.archivosCompletos, 'archivos completos', 'verde') +
    (res.archivosParciales ? t(res.archivosParciales, 'archivos leídos a medias', 'nar') : '') +
    (res.archivosFallidos ? t(res.archivosFallidos, 'archivos que fallaron', 'rojo') : '');

  const pasos = [];
  pasos.push('Use el <b>mapa</b> y los <b>filtros</b> para mirar lo que le interese.');
  if (res.relaciones) pasos.push('Abra la pestaña <b>Relaciones</b> para ver pareja por pareja.');
  if (hayDudas) pasos.push('Revise la pestaña <b>Calidad de los datos</b>: hay cosas que no se pudieron comprobar.');
  pasos.push('Cuando tenga lo que busca, <b>guárdelo</b> en Excel, GeoJSON, KML o como informe.');
  $('siguientePaso').innerHTML = `<b>¿Y ahora qué?</b> ${pasos.join(' ')} ` +
    `<small style="color:var(--tenue)">(análisis completado en ${num(ms)} ms)</small>`;
}

/* ───────────────────────── Filtrado y sincronía ───────────────────────── */

function aplicarFiltros() {
  const f = Controles.actuales();
  let visibles = Filtro.filtrarPmts(estado.filas, f);
  if (estado.instanteRecorrido !== null) visibles = Filtro.vigentesEn(visibles, estado.instanteRecorrido);

  const ids = new Set(visibles.map((x) => x.id));
  const relVisibles = Filtro.filtrarRelaciones(estado.relaciones, f, ids);

  estado.visibles = visibles;
  estado.relVisibles = relVisibles;

  Mapa.pintarPmts(estado.filas, estado.porId, ids);
  Mapa.pintarRelaciones(relVisibles, $('verRelaciones').checked);

  Tablas.pintarPmts(visibles, { onFila: seleccionar, seleccionado: estado.seleccionado });
  Tablas.pintarRelaciones(relVisibles, { onFila: (r) => Mapa.irARelacion(r) });

  $('cuentaPmt').textContent = num(visibles.length);
  $('cuentaRel').textContent = num(relVisibles.length);
  $('cuentaCal').textContent = num(estado.archivos.length);
}

function seleccionar(id) {
  estado.seleccionado = id;
  Mapa.irA(id);
  Tablas.pintarPmts(estado.visibles, { onFila: seleccionar, seleccionado: id });
}

/* ───────────────────────── Pestañas ───────────────────────── */

function irAPestana(cual) {
  for (const b of $$('.pestanas button')) b.setAttribute('aria-selected', String(b.dataset.pest === cual));
  for (const p of ['pmt', 'rel', 'cal']) mostrar('pest_' + p, p === cual);
}

/* ───────────────────────── Exportaciones ───────────────────────── */

const marca = () => new Date().toISOString().slice(0, 10);

function conectarExportaciones() {
  $('expPmtCsv').onclick = () =>
    descargar(`PMT_${marca()}.csv`, Export.pmtsACsv(estado.visibles), 'text/csv;charset=utf-8');
  $('expRelCsv').onclick = () =>
    descargar(`Relaciones_PMT_${marca()}.csv`, Export.relacionesACsv(estado.relVisibles, estado.porId), 'text/csv;charset=utf-8');
  $('expGeoJson').onclick = () =>
    descargar(`PMT_${marca()}.geojson`, JSON.stringify(Export.aGeoJson(estado.visibles), null, 1), 'application/geo+json');
  $('expKml').onclick = () =>
    descargar(`PMT_${marca()}.kml`, Export.aKml(estado.visibles), 'application/vnd.google-earth.kml+xml');
  $('expLegado').onclick = () =>
    descargar(`reporte_dinamico_${marca()}.csv`, Export.csvCompatibleLegado(estado.visibles, estado.relVisibles), 'text/csv;charset=utf-8');
  $('expImprimir').onclick = () => imprimir();
}

/**
 * Informe imprimible. Se usa la impresión del navegador en vez de html2pdf:
 * es una dependencia menos, respeta los saltos de página y desde el diálogo se
 * puede guardar como PDF igual. El encabezado se rellena al vuelo.
 */
function imprimir() {
  const res = resumir(estado.analisis, estado.visibles, estado.relVisibles);
  const f = Controles.actuales();
  const filtrosTexto = Filtro.hayFiltrosActivos(f)
    ? Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : v))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')
    : 'ninguno (se muestran todos los datos cargados)';

  $('piePdf').innerHTML = `
    <hr>
    <h2 style="color:#009300;margin:0 0 6px">Informe de control y articulación de PMTs</h2>
    <div style="font-size:11px;color:#44474b">
      <div><b>Generado:</b> ${esc(new Date().toLocaleString('es-CO'))}</div>
      <div><b>Archivos analizados:</b> ${estado.archivos.map((a) => esc(a.nombre)).join(', ')}</div>
      <div><b>Criterio:</b> distancia mínima real de ${CONFIG.umbralMetros} m · comparación por fecha y hora · tolerancia ${CONFIG.toleranciaMinutos} min · frentes del mismo contrato excluidos</div>
      <div><b>Filtros aplicados:</b> ${esc(filtrosTexto)}</div>
      <div style="margin-top:6px">${esc(frasePrincipal(res))}</div>
      <div style="margin-top:6px;color:#6b7075">Este informe presenta hechos medidos. No asigna niveles de criticidad: esa clasificación operativa aún no está definida.</div>
    </div>`;
  window.print();
}

/* ───────────────────────── Arranque ───────────────────────── */

function conectarResto() {
  $('verRelaciones').onchange = () => Mapa.pintarRelaciones(estado.relVisibles, $('verRelaciones').checked);
  $('verFondo').onchange = (e) => Mapa.alternarFondo(e.target.checked);
  $('btnEncuadrar').onclick = () => Mapa.encuadrar();
  for (const b of $$('.pestanas button')) b.onclick = () => irAPestana(b.dataset.pest);
}

conectarCarga();
conectarExportaciones();
conectarResto();
