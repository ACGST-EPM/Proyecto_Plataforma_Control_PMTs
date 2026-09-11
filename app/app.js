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
import { calcularRelaciones, VERSION_REGLAS } from '../motor/src/nucleo/index.js';
import { caja as cajaDeGeometria } from '../motor/src/geo/geometria.js';

/** Parametros aprobados en la Etapa 1. */
const CONFIG = Object.freeze({
  umbralMetros: 120,
  granularidadTemporal: 'instante',
  toleranciaMinutos: 0,
  excluirMismoContrato: true,
  modoDistancia: 'real',
});

const estado = {
  /**
   * FUENTES DE LA SESION. Cada una es un archivo vivo del que se puede volver a
   * calcular todo. Un proyecto abierto tambien es una fuente: asi "anadir" y
   * "quitar" significan lo mismo se venga de donde se venga.
   *
   *   { clase: 'archivo', nombre, datos, huella }
   *   { clase: 'proyecto', nombre, trazados, fuentesOriginales, filtros, ... }
   */
  fuentes: [],
  filas: [], relaciones: [], noEvaluables: [], porId: new Map(),
  archivos: [], analisis: null,
  visibles: [], relVisibles: [], seleccionado: null, instanteRecorrido: null,
  nombreProyecto: '',
};

/** Huella de contenido de un archivo, para reconocer el mismo dato con otro nombre. */
function huellaBytes(datos) {
  const b = datos instanceof Uint8Array ? datos
    : typeof datos === 'string' ? new TextEncoder().encode(datos) : new Uint8Array(0);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 + b[i] + i, 0x85ebca6b) >>> 0;
  }
  return b.length + '-' + h1.toString(16) + h2.toString(16);
}

/* ───────────────────────── Carga y gestion de archivos ───────────────────────── */

function conectarCarga() {
  const zona = $('zona'), entrada = $('entrada');
  $('btnElegir').onclick = () => entrada.click();
  entrada.onchange = () => { if (entrada.files.length) anadirArchivos([...entrada.files], false); entrada.value = ''; };

  const anadir = $('entradaAnadir');
  $('btnAnadir').onclick = () => anadir.click();
  anadir.onchange = () => { if (anadir.files.length) anadirArchivos([...anadir.files], true); anadir.value = ''; };

  const proy = $('entradaProyecto');
  $('btnAbrirProyecto').onclick = () => { proy.dataset.acumular = '1'; proy.click(); };
  $('btnAbrirProyecto2').onclick = () => { proy.dataset.acumular = ''; proy.click(); };
  // Desde la pantalla de carga: abre el proyecto solo. Desde el resumen
  // («Abrir otro proyecto»): se anade al conjunto actual, que es lo que espera
  // quien ya tiene datos en pantalla.
  proy.onchange = async () => {
    if (proy.files.length) await abrirProyecto(proy.files[0], { acumular: proy.dataset.acumular === '1' });
    proy.value = ''; proy.dataset.acumular = '';
  };

  for (const ev of ['dragenter', 'dragover']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); });
  }
  zona.addEventListener('drop', (e) => {
    const f = [...(e.dataTransfer?.files ?? [])];
    if (!f.length) return;
    if (f.length === 1 && /\.pmt\.json$/i.test(f[0].name)) {
      return abrirProyecto(f[0], { acumular: estado.fuentes.length > 0 });
    }
    anadirArchivos(f, estado.fuentes.length > 0);
  });

  $('btnEmpezarDeNuevo').onclick = () => reiniciar();
  $('btnGuardarProyecto').onclick = () => guardarProyecto();
  $('btnDetalleFuentes').onclick = (e) => {
    const abierto = e.target.getAttribute('aria-expanded') === 'true';
    e.target.setAttribute('aria-expanded', String(!abierto));
    e.target.textContent = abierto ? 'Ver detalle' : 'Ocultar detalle';
    mostrar('listaFuentes', !abierto);
  };
}

function reiniciar() {
  Controles.parar();
  // Limpia TAMBIEN el estado de filtros y del recorrido. Sin esto, un filtro
  // del analisis anterior seguia aplicado —invisible, porque sus controles ya
  // no existian— y el siguiente conjunto de datos aparecia vacio sin motivo.
  Controles.reiniciarEstado();
  Mapa.olvidarAcercamientos();
  Tablas.reiniciarPaginas();
  Object.assign(estado, {
    fuentes: [], filas: [], relaciones: [], noEvaluables: [], porId: new Map(),
    archivos: [], analisis: null, visibles: [], relVisibles: [],
    seleccionado: null, instanteRecorrido: null, nombreProyecto: '',
  });
  $('listaFuentes').innerHTML = '';
  $('cuentaFuentes').textContent = '0';
  ocultarAviso();
  for (const p of ['panelFuentes', 'panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar', 'panelInforme']) mostrar(p, false);
  mostrar('panelCarga', true);
  mostrar('btnEmpezarDeNuevo', false);
  mostrar('btnGuardarProyecto', false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Avisa al usuario. Escribe SIEMPRE en la zona global, que vive fuera del panel
 * de carga y nunca se oculta. Antes los mensajes iban dentro de `panelCarga`, y
 * al abrir un proyecto ese panel se ocultaba: un error al abrir un archivo
 * invalido quedaba escrito en un sitio que nadie podia ver.
 */
function avisar(texto, clase = '') {
  const n = $('avisoGlobal');
  n.className = 'frase no-imprimir ' + clase;
  n.innerHTML = texto;
  mostrar('avisoGlobal', true);
  if (clase === 'error') n.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const ocultarAviso = () => mostrar('avisoGlobal', false);

/**
 * IDENTIDAD DE UNA FUENTE: el NOMBRE del archivo, y su CONTENIDO para saber si
 * cambio. La regla, y por que:
 *
 *   · mismo nombre + mismo contenido  -> es el mismo archivo. No se duplica.
 *   · mismo nombre + otro contenido   -> es una version corregida. Se REEMPLAZA
 *                                        y se avisa, porque perder la version
 *                                        nueva en silencio seria peor.
 *   · otro nombre  + mismo contenido  -> se avisa de que es un duplicado, pero
 *                                        se conserva: puede ser deliberado
 *                                        (una copia de otro contratista).
 *
 * Se identifica por nombre y no por ruta porque el navegador no da la ruta, y
 * no por el contenido solo porque el nombre es lo que la usuaria reconoce.
 */
async function anadirArchivos(files, acumular) {
  const preparados = await Ingesta.prepararArchivos(files);
  const nuevos = acumular ? [...estado.fuentes] : [];
  const notas = [];

  for (const p of preparados) {
    const fuente = { clase: 'archivo', nombre: p.nombre, datos: p.datos, rechazado: p.rechazado,
      huella: p.datos ? huellaBytes(p.datos) : null };
    const i = nuevos.findIndex((x) => x.clase === 'archivo' && x.nombre === fuente.nombre);
    if (i >= 0) {
      if (nuevos[i].huella === fuente.huella) {
        notas.push(`«${p.nombre}» ya estaba cargado y es idéntico: no se duplicó.`);
        continue;
      }
      notas.push(`«${p.nombre}» ya estaba cargado con otro contenido: se reemplazó por la versión nueva.`);
      nuevos[i] = fuente;
      continue;
    }
    const gemelo = nuevos.find((x) => x.huella && x.huella === fuente.huella);
    if (gemelo) notas.push(`«${p.nombre}» tiene el mismo contenido que «${gemelo.nombre}». Se conserva igualmente.`);
    nuevos.push(fuente);
  }
  await reanalizar(nuevos, { notas });
}

/** Quita una fuente del conjunto y vuelve a analizar, sin recargar la pagina. */
async function quitarArchivo(nombre) {
  const quedan = estado.fuentes.filter((x) => x.nombre !== nombre);
  if (!quedan.length) return reiniciar();
  await reanalizar(quedan, { notas: [`Se quitó «${nombre}» del análisis.`] });
}

/**
 * Vuelve a analizar TODO el conjunto de fuentes.
 *
 * Los archivos pasan por el motor completo; los trazados que vienen de un
 * proyecto ya estan normalizados y se incorporan tal cual. Despues, las
 * relaciones se calculan **de una sola vez sobre el conjunto entero**, para que
 * un trazado de un proyecto y otro de un KMZ recien anadido puedan relacionarse
 * entre si. Antes no ocurria: abrir un proyecto vaciaba las fuentes, y anadir
 * un KMZ dejaba solo ese KMZ.
 *
 * Las relaciones NUNCA se leen de un archivo: se calculan aqui, siempre.
 */
async function reanalizar(fuentes, opciones = {}) {
  estado.fuentes = fuentes;
  pintarListaFuentes();
  avisar(`Analizando ${num(fuentes.length)} fuente(s): trazados, distancias y fechas…`);
  await new Promise((r) => setTimeout(r, 30));

  try {
    const t0 = performance.now();
    const archivos = fuentes.filter((f) => f.clase === 'archivo');
    const proyectos = fuentes.filter((f) => f.clase === 'proyecto');

    let filas = [], diagnostico = [], analisis = null;
    if (archivos.length) {
      const r = await Ingesta.procesar(archivos.map((f) => ({ nombre: f.nombre, datos: f.datos, rechazado: f.rechazado })), CONFIG);
      filas = r.filas;
      diagnostico = r.archivos ?? [];
      analisis = r.analisis;
    }
    for (const p of proyectos) {
      filas = filas.concat(p.trazados);
      diagnostico = diagnostico.concat(p.fuentesOriginales ?? []);
    }

    // Identificadores unicos en el conjunto combinado: dos fuentes distintas
    // pueden traer el mismo trazado. Se conserva el primero y se avisa.
    const vistos = new Set();
    const notas = [...(opciones.notas ?? [])];
    let repetidos = 0;
    filas = filas.filter((x) => {
      if (vistos.has(x.id)) { repetidos++; return false; }
      vistos.add(x.id);
      return true;
    });
    if (repetidos) notas.push(`${repetidos} trazado(s) aparecían en más de una fuente; se conserva una sola copia.`);

    if (!filas.length) {
      Object.assign(estado, { filas: [], relaciones: [], noEvaluables: [], porId: new Map(),
        archivos: diagnostico, analisis: null });
      pintarListaFuentes();
      avisar('<b>No se pudo analizar nada.</b> Ninguna de las fuentes aportó trazados utilizables. ' +
        'Revise el detalle más abajo.', 'error');
      return soloCalidad();
    }

    const derivados = recalcular(filas);
    const ms = Math.round(performance.now() - t0);

    Mapa.olvidarAcercamientos();
    Tablas.reiniciarPaginas();
    Object.assign(estado, {
      filas,
      relaciones: derivados.relaciones,
      noEvaluables: derivados.noEvaluables,
      porId: new Map(filas.map((x) => [x.id, x])),
      archivos: diagnostico,
      analisis: {
        calidad: calidadDe(filas, diagnostico, analisis),
        estadisticas: derivados.estadisticas,
      },
    });
    pintarListaFuentes();
    ocultarAviso();
    pintarTodo(ms, opciones.extra ? { ...opciones.extra, notas } : (notas.length ? { notas } : null));
  } catch (e) {
    avisar(`<b>Ocurrió un error inesperado al procesar las fuentes.</b><br>` +
      `<small class="mono">${esc(e?.message ?? e)}</small><br>` +
      `Sus archivos no se modificaron. Puede intentarlo de nuevo o probar con menos archivos a la vez.`, 'error');
  }
}

/**
 * RECALCULA los resultados derivados con el motor, sobre los trazados que sean.
 * Es el unico sitio del producto donde nacen relaciones: ni el proyecto ni
 * ningun archivo pueden aportarlas ya hechas.
 */
function recalcular(filas) {
  const registros = filas.map((x) => ({
    ...x,
    // `caja` es interna del motor y no se guarda en el proyecto: se recalcula.
    caja: x.caja ?? (x.geometria ? cajaDeGeometria(x.geometria) : null),
    tieneGeometria: !!x.geometria,
    vigencia: x.vigencia ?? {
      inicioMs: x.inicioMs, finMs: x.finMs, inicio: x.inicio, fin: x.fin,
      valida: x.vigenciaValida, avisos: [],
    },
  }));
  const r = calcularRelaciones(registros, CONFIG);
  return {
    relaciones: r.relaciones,
    noEvaluables: r.paresNoEvaluablesEspacialmente ?? [],
    estadisticas: r.estadisticas,
  };
}

/** Contadores de calidad del conjunto combinado. */
function calidadDe(filas, diagnostico, analisisArchivos) {
  const cuenta = (f) => filas.filter(f).length;
  const estadoDe = (a) => a.estadoLectura ?? (a.ok === false ? 'fallida' : 'completa');
  return {
    total: filas.length,
    analizables: cuenta((x) => x.analizable),
    sinGeometria: cuenta((x) => !x.tieneGeometria),
    sinVigenciaValida: cuenta((x) => !x.vigenciaValida),
    sinContrato: cuenta((x) => !x.contrato),
    sinMunicipio: cuenta((x) => !x.municipio),
    conAvisos: cuenta((x) => (x.avisos ?? []).length),
    duplicadosExactos: analisisArchivos?.calidad?.duplicadosExactos ?? 0,
    archivosCompletos: diagnostico.filter((a) => estadoDe(a) === 'completa').length,
    archivosParciales: diagnostico.filter((a) => estadoDe(a) === 'parcial').length,
    archivosFallidos: diagnostico.filter((a) => estadoDe(a) === 'fallida').length,
  };
}

/** Lista siempre visible de qué compone el análisis actual, con opción de quitar. */
function pintarListaFuentes() {
  const caja = $('listaFuentes');
  if (!caja) return;
  $('cuentaFuentes').textContent = num(estado.fuentes.length);
  if (!estado.fuentes.length) { caja.innerHTML = ''; return; }
  const diag = new Map(Ingesta.diagnosticoArchivos(estado.archivos).map((d) => [d.nombre, d]));
  const clase = { [LECTURA.COMPLETA]: 'p-ok', [LECTURA.PARCIAL]: 'p-parcial', [LECTURA.FALLIDA]: 'p-fallo' };
  caja.innerHTML = estado.fuentes.map((f) => {
      if (f.clase === 'proyecto') {
        return `<div class="fuente">
          <span class="pastilla p-avez">Proyecto</span>
          <span class="crece"><b>${esc(f.nombre)}</b> <small>${num(f.trazados.length)} trazado(s) · recalculado al abrir</small></span>
          <button class="b-suave b-mini" data-quitar="${esc(f.nombre)}" title="Quitar este proyecto del análisis">Quitar</button>
        </div>`;
      }
      const d = diag.get(f.nombre);
      const pastilla = d ? `<span class="pastilla ${clase[d.estado]}">${esc(d.etiqueta)}</span>`
        : '<span class="pastilla p-lejos">pendiente</span>';
      return `<div class="fuente">
        ${pastilla}
        <span class="crece"><b>${esc(f.nombre)}</b> <small>${d ? num(d.trazados) + ' trazado(s)' : ''}</small></span>
        <button class="b-suave b-mini" data-quitar="${esc(f.nombre)}" title="Quitar este archivo del análisis">Quitar</button>
      </div>`;
    }).join('');
  caja.querySelectorAll('[data-quitar]').forEach((b) => {
    b.onclick = () => quitarArchivo(b.dataset.quitar);
  });
}

function soloCalidad() {
  const diag = Ingesta.diagnosticoArchivos(estado.archivos);
  mostrar('panelFuentes', true);
  mostrar('panelDetalle', true);
  Tablas.pintarCalidad(diag, resumir(null, [], [], []), []);
  irAPestana('cal');
  mostrar('btnEmpezarDeNuevo', true);
}

/* ───────────────────────── Proyectos ───────────────────────── */

function guardarProyecto() {
  const nombre = prompt('Nombre para este proyecto:', estado.nombreProyecto || 'Proyecto PMT');
  if (nombre === null) return;
  estado.nombreProyecto = nombre;
  const p = Proyecto.crearProyecto({
    filas: estado.filas, relaciones: estado.relaciones, noEvaluables: estado.noEvaluables,
    archivos: estado.archivos, config: CONFIG, filtros: Controles.actuales(),
    nombre, versionReglas: VERSION_REGLAS,
  });
  descargar(Proyecto.nombreArchivo(nombre), Proyecto.serializar(p), 'application/json;charset=utf-8');
  avisar(`Proyecto <b>«${esc(nombre)}»</b> guardado. Al abrirlo, la aplicación <b>vuelve a calcular</b> ` +
    `las relaciones con el motor: el archivo guarda los trazados, no los resultados.`, '');
  setTimeout(() => mostrar('progreso', false), 8000);
}

/**
 * Abre un proyecto. Lo incorpora como UNA FUENTE MAS, de modo que despues se
 * le puedan anadir KMZ y todo se relacione entre si. Y recalcula: lo que se ve
 * en pantalla lo acaba de producir el motor instalado, no el archivo.
 */
async function abrirProyecto(file, { acumular = false } = {}) {
  avisar('Abriendo el proyecto…');
  let texto;
  try { texto = await file.text(); } catch (e) {
    return avisar(`<b>No se pudo leer el archivo.</b> ${esc(e?.message ?? e)}`, 'error');
  }
  const r = Proyecto.leerProyecto(texto);
  if (!r.ok) return avisar(`<b>No se pudo abrir el proyecto.</b> ${esc(r.motivo)}`, 'error');

  const notas = [...r.avisos];

  // Reglas distintas: se avisa y se recalcula con las de este motor.
  if (r.proyecto.versionReglas && r.proyecto.versionReglas !== VERSION_REGLAS) {
    notas.push(`El proyecto se generó con las reglas del motor ${r.proyecto.versionReglas} y este motor usa ` +
      `las ${VERSION_REGLAS}. Los resultados se han recalculado con las reglas actuales, así que pueden ` +
      `no coincidir con los que vio al guardarlo.`);
  }
  // Configuracion distinta de la vigente: se avisa; manda la vigente.
  const distintas = Object.keys(CONFIG).filter((k) => r.proyecto.config[k] !== CONFIG[k]);
  if (distintas.length) {
    notas.push(`El proyecto se guardó con otros criterios de análisis (${distintas.join(', ')}). ` +
      `Se ha recalculado con los criterios vigentes de la aplicación.`);
  }

  Controles.parar();
  const fuente = {
    clase: 'proyecto',
    nombre: file.name || `${r.proyecto.nombre}${Proyecto.EXTENSION}`,
    nombreProyecto: r.proyecto.nombre,
    trazados: r.proyecto.trazados,
    fuentesOriginales: r.proyecto.fuentes,
    filtros: r.proyecto.filtros,
    instantanea: r.proyecto.instantanea,
    huella: null,
  };

  const base = acumular ? estado.fuentes.filter((x) => x.nombre !== fuente.nombre) : [];
  if (!acumular) {
    Controles.reiniciarEstado();
    Mapa.olvidarAcercamientos();
    Tablas.reiniciarPaginas();
    estado.instanteRecorrido = null;
    estado.seleccionado = null;
  }
  estado.nombreProyecto = r.proyecto.nombre;
  mostrar('panelCarga', false);

  await reanalizar([...base, fuente], {
    notas,
    extra: { proyecto: r.proyecto, migrado: r.migrado, soloProyecto: !acumular && !base.length },
  });
}

/* ───────────────────────── Pintado ───────────────────────── */

function pintarTodo(ms, extra = null) {
  // El gestor de fuentes queda SIEMPRE visible mientras haya un analisis: es
  // desde donde se anade, se quita y se ven los diagnosticos.
  for (const p of ['panelFuentes', 'panelResumen', 'panelExplorar', 'panelDetalle', 'panelExportar']) mostrar(p, true);
  mostrar('panelCarga', false);
  mostrar('btnEmpezarDeNuevo', true);
  mostrar('btnGuardarProyecto', true);

  Mapa.iniciar('mapa', { onSeleccion: (id) => seleccionar(id) });
  montarControlFondo();
  // Los filtros guardados solo se restauran al ABRIR un proyecto por si solo.
  // Si se estan anadiendo fuentes, mandan los filtros que el usuario tiene puestos.
  if (extra?.soloProyecto && extra.proyecto?.filtros) {
    const rechazados = Controles.fijarFiltros(extra.proyecto.filtros) ?? [];
    if (rechazados.length) (extra.notas ??= []).push(...rechazados);
  }
  Controles.montarFiltros(estado.filas, aplicarFiltros);
  Controles.montarRecorrido(estado.filas, (instante) => {
    estado.instanteRecorrido = instante;
    aplicarFiltros();
  });

  aplicarFiltros();
  Mapa.encuadrar();

  const res = resumir(estado.analisis, estado.filas, estado.relaciones, estado.noEvaluables);
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
    ? `<small>Proyecto «${esc(extra.proyecto.nombre)}»${extra.proyecto.creado ? ', guardado el ' + esc(extra.proyecto.creado.slice(0, 10)) : ''}. ` +
      `Las relaciones se han recalculado con el motor ${esc(VERSION_REGLAS)}.</small>`
    : `<small>(análisis completado en ${num(ms)} ms)</small>`;

  // Cotejo con la instantanea guardada: si no cuadra, se dice.
  let cotejo = '';
  if (extra?.proyecto?.instantanea) {
    const c = Proyecto.cotejarInstantanea(extra.proyecto.instantanea, {
      relaciones: res.relaciones, conTraslape: res.aLaVez, contactos: res.contacto,
      noEvaluablesEspacialmente: estado.noEvaluables.length, trazados: res.pmts,
    });
    if (c.comparable && !c.coincide) {
      cotejo = `<div class="aviso-cotejo"><b>Los resultados recalculados no coinciden con los que se ` +
        `guardaron en el proyecto.</b> ${c.diferencias.map((d) =>
          `${esc(d.campo)}: guardado ${num(d.guardado)}, ahora ${num(d.ahora)}`).join('; ')}. ` +
        `Manda lo que acaba de calcular el motor.</div>`;
    }
  }
  const notas = extra?.notas?.length
    ? `<div class="notas-fuente">${extra.notas.map((n) => `· ${esc(n)}`).join('<br>')}</div>` : '';
  $('siguientePaso').innerHTML = `<b>¿Y ahora qué?</b> ${pasos.join(' ')} ${origen}${cotejo}${notas}`;
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
  // DIA COMPLETO, no un instante: ver `vigentesEnDia` en nucleo/filtrado.js.
  if (estado.instanteRecorrido !== null) visibles = Filtro.vigentesEnDia(visibles, estado.instanteRecorrido);

  const ids = new Set(visibles.map((x) => x.id));
  const relVisibles = Filtro.filtrarRelaciones(estado.relaciones, f, ids);
  // Los pares que NO se pudieron evaluar siguen el mismo filtro: si desaparecen
  // en silencio, el usuario cree que no hay nada que revisar.
  const noEvalVisibles = estado.noEvaluables.filter((h) => ids.has(h.idA) || ids.has(h.idB));

  estado.visibles = visibles;
  estado.relVisibles = relVisibles;
  estado.noEvalVisibles = noEvalVisibles;

  Mapa.pintarPmts(estado.filas, estado.porId, ids);
  Mapa.pintarRelaciones(relVisibles, $('verRelaciones').checked);

  Tablas.pintarPmts(visibles, { onFila: seleccionar, seleccionado: estado.seleccionado });
  Tablas.pintarRelaciones(relVisibles, { onFila: (r) => Mapa.irARelacion(r) });
  Tablas.pintarNoEvaluables(noEvalVisibles, estado.porId);

  $('cuentaPmt').textContent = num(visibles.length);
  $('cuentaRel').textContent = num(relVisibles.length);
  $('cuentaNoEval').textContent = num(noEvalVisibles.length);
  $('cuentaCal').textContent = num(estado.archivos.length);
  mostrar('pestNoEval', noEvalVisibles.length > 0 || estado.noEvaluables.length > 0);
}

function seleccionar(id) {
  estado.seleccionado = id;
  Mapa.irA(id);
  Tablas.pintarPmts(estado.visibles, { onFila: seleccionar, seleccionado: id });
}

function irAPestana(cual) {
  for (const b of $$('.pestanas button')) b.setAttribute('aria-selected', String(b.dataset.pest === cual));
  for (const p of ['pmt', 'rel', 'noeval', 'cal']) mostrar('pest_' + p, p === cual);
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
    noEvaluables: estado.noEvalVisibles ?? estado.noEvaluables,
    archivos: Ingesta.diagnosticoArchivos(estado.archivos),
    // MISMO alcance para las tarjetas y para las tablas del informe.
    resumen: resumir(estado.analisis, estado.visibles, estado.relVisibles, estado.noEvalVisibles ?? estado.noEvaluables),
    filtros: Controles.actuales(), config: CONFIG,
    versionReglas: VERSION_REGLAS,
    // Si el recorrido esta activo, el informe cubre SOLO ese dia y debe decirlo.
    diaRecorrido: estado.instanteRecorrido,
    totalCargado: estado.filas.length,
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
