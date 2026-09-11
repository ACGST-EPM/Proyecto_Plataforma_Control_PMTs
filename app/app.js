/**
 * ORQUESTADOR DE LA APLICACION
 *
 * Une el motor aprobado en la Etapa 1 con la interfaz. Aqui no hay ni un
 * calculo geoespacial ni temporal: todos viven en `motor/`, con sus pruebas.
 * Este archivo decide QUE se muestra, CUANDO, y mantiene el estado de sesion.
 */
import { $, $$, esc, num, crear, mostrar, descargar, fechaLegible } from './ui/dom.js';
import * as Mapa from './ui/mapa.js';
import * as Tablas from './ui/tablas.js';
import * as Controles from './ui/controles.js';
import * as Informe from './ui/informe.js';
import * as Ingesta from './nucleo/ingesta.js';
import * as Filtro from './nucleo/filtrado.js';
import * as Export from './nucleo/exportar.js';
import * as Proyecto from './nucleo/proyecto.js';
import * as Base from './nucleo/mapas-base.js';
import { resumir, frasePrincipal } from './nucleo/resumen.js';
import { LECTURA, TIPOS_CIERRE, simbologiaDe } from './nucleo/modelo.js';

/** Parametros aprobados en la Etapa 1. */
const CONFIG = Object.freeze({
  umbralMetros: 120,
  granularidadTemporal: 'instante',
  toleranciaMinutos: 0,
  excluirMismoContrato: true,
  modoDistancia: 'real',
});

const estado = {
  fuentes: [],          // {nombre, datos} de los archivos vivos de la sesion
  filas: [], relaciones: [], porId: new Map(), archivos: [], analisis: null,
  visibles: [], relVisibles: [], seleccionado: null, instanteRecorrido: null,
  nombreProyecto: '',
};

/* ───────────────────────── Carga y gestion de archivos ───────────────────────── */

function conectarCarga() {
  const zona = $('zona'), entrada = $('entrada');
  $('btnElegir').onclick = () => entrada.click();
  entrada.onchange = () => { if (entrada.files.length) anadirArchivos([...entrada.files], false); entrada.value = ''; };

  const anadir = $('entradaAnadir');
  $('btnAnadir').onclick = () => anadir.click();
  anadir.onchange = () => { if (anadir.files.length) anadirArchivos([...anadir.files], true); anadir.value = ''; };

  const proy = $('entradaProyecto');
  $('btnAbrirProyecto').onclick = () => proy.click();
  $('btnAbrirProyecto2').onclick = () => proy.click();
  proy.onchange = async () => { if (proy.files.length) await abrirProyecto(proy.files[0]); proy.value = ''; };

  for (const ev of ['dragenter', 'dragover']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); });
  }
  zona.addEventListener('drop', (e) => {
    const f = [...(e.dataTransfer?.files ?? [])];
    if (!f.length) return;
    if (f.length === 1 && /\.pmt\.json$/i.test(f[0].name)) return abrirProyecto(f[0]);
    anadirArchivos(f, estado.fuentes.length > 0);
  });

  $('btnEmpezarDeNuevo').onclick = () => reiniciar();
  $('btnGuardarProyecto').onclick = () => guardarProyecto();
}

function reiniciar() {
  Controles.parar();
  Mapa.olvidarAcercamientos();
  Tablas.reiniciarPaginas();
  Object.assign(estado, {
    fuentes: [], filas: [], relaciones: [], porId: new Map(), archivos: [], analisis: null,
    visibles: [], relVisibles: [], seleccionado: null, instanteRecorrido: null, nombreProyecto: '',
  });
  $('listaSeleccion').innerHTML = '';
  mostrar('progreso', false);
  for (const p of ['panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar']) mostrar(p, false);
  mostrar('panelCarga', true);
  mostrar('btnEmpezarDeNuevo', false);
  mostrar('btnGuardarProyecto', false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function avisar(texto, clase = '') {
  const n = $('progreso');
  n.className = 'frase ' + clase;
  n.innerHTML = texto;
  mostrar('progreso', true);
}

/** Anade archivos al conjunto (o lo reemplaza) y vuelve a analizar. */
async function anadirArchivos(files, acumular) {
  const preparados = await Ingesta.prepararArchivos(files);
  const nuevos = acumular ? [...estado.fuentes] : [];
  for (const p of preparados) {
    const i = nuevos.findIndex((x) => x.nombre === p.nombre);
    if (i >= 0) nuevos[i] = p; else nuevos.push(p);       // mismo nombre = reemplazo
  }
  await reanalizar(nuevos);
}

/** Quita un archivo del conjunto y vuelve a analizar sin recargar la pagina. */
async function quitarArchivo(nombre) {
  const quedan = estado.fuentes.filter((x) => x.nombre !== nombre);
  if (!quedan.length) return reiniciar();
  await reanalizar(quedan);
}

async function reanalizar(fuentes) {
  estado.fuentes = fuentes;
  pintarListaFuentes();
  avisar(`Analizando ${num(fuentes.length)} archivo(s): trazados, distancias y fechas…`);
  await new Promise((r) => setTimeout(r, 30));
  try {
    const t0 = performance.now();
    const r = await Ingesta.procesar(fuentes, CONFIG);
    const ms = Math.round(performance.now() - t0);
    Mapa.olvidarAcercamientos();
    Tablas.reiniciarPaginas();
    Object.assign(estado, r);
    pintarListaFuentes();
    if (r.error && !r.filas.length) {
      avisar(`<b>No se pudo analizar nada.</b> ${esc(r.error)} Revise el detalle más abajo.`, 'error');
      return soloCalidad();
    }
    mostrar('progreso', false);
    pintarTodo(ms);
  } catch (e) {
    avisar(`<b>Ocurrió un error inesperado al procesar los archivos.</b><br>` +
      `<small class="mono">${esc(e?.message ?? e)}</small><br>` +
      `Sus archivos no se modificaron. Puede intentarlo de nuevo o probar con menos archivos a la vez.`, 'error');
  }
}

/** Lista siempre visible de qué compone el análisis actual, con opción de quitar. */
function pintarListaFuentes() {
  const caja = $('listaSeleccion');
  if (!estado.fuentes.length) { caja.innerHTML = ''; return; }
  const diag = new Map(Ingesta.diagnosticoArchivos(estado.archivos).map((d) => [d.nombre, d]));
  const clase = { [LECTURA.COMPLETA]: 'p-ok', [LECTURA.PARCIAL]: 'p-parcial', [LECTURA.FALLIDA]: 'p-fallo' };
  caja.innerHTML = `<div class="titulillo">Archivos del análisis actual (${num(estado.fuentes.length)})</div>` +
    estado.fuentes.map((f) => {
      const d = diag.get(f.nombre);
      const pastilla = d ? `<span class="pastilla ${clase[d.estado]}">${esc(d.etiqueta)}</span>` : '<span class="pastilla p-lejos">pendiente</span>';
      const n = d ? `${num(d.trazados)} trazado(s)` : '';
      return `<div class="fuente">
        ${pastilla}
        <span class="crece"><b>${esc(f.nombre)}</b> <small>${esc(n)}</small></span>
        <button class="b-suave b-mini" data-quitar="${esc(f.nombre)}" title="Quitar este archivo del análisis">Quitar</button>
      </div>`;
    }).join('');
  caja.querySelectorAll('[data-quitar]').forEach((b) => {
    b.onclick = () => quitarArchivo(b.dataset.quitar);
  });
}

function soloCalidad() {
  const diag = Ingesta.diagnosticoArchivos(estado.archivos);
  mostrar('panelDetalle', true);
  Tablas.pintarCalidad(diag, resumir(null, [], []), []);
  irAPestana('cal');
  mostrar('btnEmpezarDeNuevo', true);
}

/* ───────────────────────── Proyectos ───────────────────────── */

function guardarProyecto() {
  const nombre = prompt('Nombre para este proyecto:', estado.nombreProyecto || 'Proyecto PMT');
  if (nombre === null) return;
  estado.nombreProyecto = nombre;
  const p = Proyecto.crearProyecto({
    filas: estado.filas, relaciones: estado.relaciones, archivos: estado.archivos,
    config: CONFIG, filtros: Controles.actuales(), nombre,
  });
  descargar(Proyecto.nombreArchivo(nombre), Proyecto.serializar(p), 'application/json;charset=utf-8');
  avisar(`Proyecto <b>«${esc(nombre)}»</b> guardado. Puede volver a abrirlo cuando quiera, sin cargar otra vez los KMZ.`, '');
  setTimeout(() => mostrar('progreso', false), 6000);
}

async function abrirProyecto(file) {
  avisar('Abriendo el proyecto…');
  let texto;
  try { texto = await file.text(); } catch (e) {
    return avisar(`<b>No se pudo leer el archivo.</b> ${esc(e?.message ?? e)}`, 'error');
  }
  const r = Proyecto.leerProyecto(texto);
  if (!r.ok) return avisar(`<b>No se pudo abrir el proyecto.</b> ${esc(r.motivo)}`, 'error');

  Controles.parar();
  Mapa.olvidarAcercamientos();
  Tablas.reiniciarPaginas();
  estado.fuentes = [];                                    // el proyecto ya trae los datos normalizados
  estado.filas = r.proyecto.trazados;
  estado.relaciones = r.proyecto.relaciones;
  estado.porId = new Map(estado.filas.map((x) => [x.id, x]));
  estado.archivos = r.proyecto.archivos;
  estado.analisis = { calidad: recalcularCalidad(estado.filas, r.proyecto.archivos), estadisticas: {} };
  estado.nombreProyecto = r.proyecto.nombre;
  estado.seleccionado = null;
  estado.instanteRecorrido = null;

  mostrar('panelCarga', false);
  pintarTodo(0, { proyecto: r.proyecto, avisos: r.avisos });
}

/** Reconstruye los contadores de calidad a partir de los trazados guardados. */
function recalcularCalidad(filas, archivos) {
  const cuenta = (f) => filas.filter(f).length;
  const estadoDe = (a) => a.estadoLectura ?? 'completa';
  return {
    total: filas.length,
    analizables: cuenta((x) => x.analizable),
    sinGeometria: cuenta((x) => !x.tieneGeometria),
    sinVigenciaValida: cuenta((x) => !x.vigenciaValida),
    sinContrato: cuenta((x) => !x.contrato),
    sinMunicipio: cuenta((x) => !x.municipio),
    conAvisos: cuenta((x) => (x.avisos ?? []).length),
    duplicadosExactos: 0,
    archivosCompletos: (archivos ?? []).filter((a) => estadoDe(a) === 'completa').length,
    archivosParciales: (archivos ?? []).filter((a) => estadoDe(a) === 'parcial').length,
    archivosFallidos: (archivos ?? []).filter((a) => estadoDe(a) === 'fallida').length,
  };
}

/* ───────────────────────── Pintado ───────────────────────── */

function pintarTodo(ms, extra = null) {
  for (const p of ['panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar']) mostrar(p, true);
  mostrar('btnEmpezarDeNuevo', true);
  mostrar('btnGuardarProyecto', true);

  Mapa.iniciar('mapa', { onSeleccion: (id) => seleccionar(id) });
  montarControlFondo();
  if (extra?.proyecto?.filtros) Controles.fijarFiltros(extra.proyecto.filtros);
  Controles.montarFiltros(estado.filas, aplicarFiltros);
  Controles.montarRecorrido(estado.filas, (instante) => {
    estado.instanteRecorrido = instante;
    aplicarFiltros();
  });

  aplicarFiltros();
  Mapa.encuadrar();

  const res = resumir(estado.analisis, estado.filas, estado.relaciones);
  pintarResumen(res, ms, extra);
  Tablas.pintarCalidad(
    Ingesta.diagnosticoArchivos(estado.archivos), res,
    estado.filas.filter((x) => (x.avisos ?? []).length));

  $('panelResumen').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pintarResumen(res, ms, extra) {
  const dudas = res.espacialNoEval || res.temporalNoEval || res.archivosParciales || res.archivosFallidos;
  const caja = $('fraseResumen');
  caja.className = 'frase ' + (res.archivosFallidos ? 'error' : dudas ? 'atencion' : '');
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

  const pasos = ['Use el <b>mapa</b> y los <b>filtros</b> para mirar lo que le interese.'];
  if (res.relaciones) pasos.push('Abra la pestaña <b>Relaciones</b> para ver pareja por pareja.');
  if (dudas) pasos.push('Revise <b>Calidad de los datos</b>: hay cosas que no se pudieron comprobar.');
  pasos.push('Guarde el <b>proyecto</b> para no volver a cargar los archivos mañana.');
  const origen = extra?.proyecto
    ? `<small>Proyecto «${esc(extra.proyecto.nombre)}»${extra.proyecto.creado ? ', guardado el ' + esc(extra.proyecto.creado.slice(0, 10)) : ''}.</small>`
    : `<small>(análisis completado en ${num(ms)} ms)</small>`;
  const avisosProy = extra?.avisos?.length
    ? `<div style="margin-top:6px;color:var(--naranja-oscuro)">${extra.avisos.map(esc).join('<br>')}</div>` : '';
  $('siguientePaso').innerHTML = `<b>¿Y ahora qué?</b> ${pasos.join(' ')} ${origen}${avisosProy}`;
}

/* ───────────────────────── Mapa de fondo ───────────────────────── */

function montarControlFondo() {
  const caja = $('elegirFondo');
  if (!caja || caja.dataset.listo) return;
  caja.dataset.listo = '1';
  const cfg = Base.leerConfig();
  const ops = [...Base.PROVEEDORES.map((p) => [p.id, p.nombre + (p.url ? '' : ' (sin configurar)')]),
    [Base.SIN_FONDO, 'Sin mapa de fondo']];
  caja.innerHTML = `<label class="mini-campo">Mapa de fondo
    <select id="selFondo">${ops.map(([v, t]) => `<option value="${esc(v)}"${v === cfg.proveedor ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
  </label>`;
  $('selFondo').onchange = (e) => {
    const id = e.target.value;
    if (id === 'corporativo') return pedirServidorCorporativo();
    Base.guardarConfig({ ...Base.leerConfig(), proveedor: id });
    Mapa.aplicarFondo();
  };
}

/**
 * Permite apuntar a un servidor de teselas de EPM sin tocar el codigo ni
 * reconstruir nada. Es la via prevista para cuando TI confirme si existe uno.
 */
function pedirServidorCorporativo() {
  const cfg = Base.leerConfig();
  const url = prompt(
    'Dirección del servidor de mapas de EPM.\n\n' +
    'Formato habitual:  https://mapas.epm.com.co/tiles/{z}/{x}/{y}.png\n' +
    '(Pregunte a su área de TI si existe uno. Deje vacío para cancelar.)',
    cfg.urlCorporativa || '');
  if (!url) { $('selFondo').value = cfg.proveedor; return; }
  const v = Base.validarUrlTeselas(url);
  if (!v.ok) { alert(v.motivo); $('selFondo').value = cfg.proveedor; return; }
  Base.guardarConfig({ ...cfg, proveedor: 'corporativo', urlCorporativa: v.url });
  Mapa.aplicarFondo();
}

/* ───────────────────────── Filtrado y sincronia ───────────────────────── */

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

function irAPestana(cual) {
  for (const b of $$('.pestanas button')) b.setAttribute('aria-selected', String(b.dataset.pest === cual));
  for (const p of ['pmt', 'rel', 'cal']) mostrar('pest_' + p, p === cual);
}

/* ───────────────────────── Exportaciones e informe ───────────────────────── */

const marca = () => new Date().toISOString().slice(0, 10);

function conectarExportaciones() {
  $('expPmtCsv').onclick = () => descargar(`PMT_${marca()}.csv`, Export.pmtsACsv(estado.visibles), 'text/csv;charset=utf-8');
  $('expRelCsv').onclick = () => descargar(`Relaciones_PMT_${marca()}.csv`, Export.relacionesACsv(estado.relVisibles, estado.porId), 'text/csv;charset=utf-8');
  $('expGeoJson').onclick = () => descargar(`PMT_${marca()}.geojson`, JSON.stringify(Export.aGeoJson(estado.visibles), null, 1), 'application/geo+json');
  $('expKml').onclick = () => descargar(`PMT_${marca()}.kml`, Export.aKml(estado.visibles), 'application/vnd.google-earth.kml+xml');
  $('expLegado').onclick = () => descargar(`reporte_dinamico_${marca()}.csv`, Export.csvCompatibleLegado(estado.visibles, estado.relVisibles), 'text/csv;charset=utf-8');
  $('expInforme').onclick = () => verInforme();
  $('btnImprimirInforme').onclick = () => Informe.imprimir();
  $('btnCerrarInforme').onclick = () => { mostrar('panelInforme', false); mostrar('panelExportar', true); };
}

export function verInforme() {
  Informe.generar({
    filas: estado.visibles, relaciones: estado.relVisibles, porId: estado.porId,
    archivos: Ingesta.diagnosticoArchivos(estado.archivos),
    resumen: resumir(estado.analisis, estado.visibles, estado.relVisibles),
    filtros: Controles.actuales(), config: CONFIG,
  });
  mostrar('panelInforme', true);
  $('panelInforme').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ───────────────────────── Arranque ───────────────────────── */

function conectarResto() {
  $('verRelaciones').onchange = () => Mapa.pintarRelaciones(estado.relVisibles, $('verRelaciones').checked);
  $('btnEncuadrar').onclick = () => Mapa.encuadrar();
  for (const b of $$('.pestanas button')) b.onclick = () => irAPestana(b.dataset.pest);
  // Leyenda del mapa, generada desde la misma simbologia que usa el dibujo.
  $('leyendaMapa').innerHTML =
    [...TIPOS_CIERRE, '(sin dato)'].map((t) => {
      const s = simbologiaDe(t);
      return `<span><i class="muestra" style="background:${s.color}"></i>${esc(s.etiqueta)}</span>`;
    }).join('') +
    `<span><i class="muestra" style="background:#c62828"></i>Se tocan</span>` +
    `<span><i class="muestra" style="background:#1565c0"></i>Cerca, sin tocarse</span>` +
    `<span><i class="muestra" style="background:#6a1b9a"></i>No se pudo analizar</span>` +
    `<span class="pista-campo">Línea discontinua = no coinciden en el tiempo</span>`;
}

conectarCarga();
conectarExportaciones();
conectarResto();
