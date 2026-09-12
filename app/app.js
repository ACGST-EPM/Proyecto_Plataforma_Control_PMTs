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
import { diaDe } from './nucleo/tiempo.js';
import { VERSION_APP, VERSION_MOTOR, selloProcedencia } from './nucleo/version.js';
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
  // Empezar de nuevo tambien borra el informe: si no, al cargar otros archivos
  // seguiria ahi el de los anteriores.
  Informe.olvidar();
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
 * NINGUN ERROR QUEDA INVISIBLE — TAMPOCO LOS QUE NO ESPERABAMOS.
 *
 * El invariante decia «todos los errores van a #avisoGlobal», pero solo lo
 * cumplian los que estaban dentro de un `try`. Un fallo en el manejador de un
 * boton —por ejemplo, una funcion que el empaquetador no incluyo— no llegaba a
 * ninguna parte: el boton simplemente no hacia nada y la pantalla se quedaba
 * igual. Se descubrio asi, de verdad, al anadir el sello de procedencia.
 *
 * Esto es la red de seguridad de ultimo recurso. No sustituye a tratar los
 * errores donde ocurren: sirve para que un fallo NO PREVISTO se vea, se pueda
 * contar y no deje a la usuaria pulsando un boton muerto.
 */
function contarErrorInesperado(origen, detalle) {
  avisar(`<b>Algo ha fallado dentro de la aplicación.</b> Sus datos no se han modificado. ` +
    `Puede seguir usando el resto de la pantalla; si vuelve a pasar, avise indicando qué estaba haciendo.` +
    `<br><small class="mono">${esc(origen)}: ${esc(detalle)}</small>`, 'error');
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    // Los recursos que no cargan (teselas del mapa sin internet) no son esto:
    // tienen su propio camino y su propio mensaje.
    if (e?.target && e.target !== window) return;
    contarErrorInesperado('error', e?.message ?? String(e?.error ?? 'desconocido'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    contarErrorInesperado('promesa sin atender', e?.reason?.message ?? String(e?.reason ?? 'desconocido'));
  });
}

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
  // Cambiar las fuentes caduca cualquier informe que hubiera en pantalla, antes
  // incluso de saber que va a salir: lo que ya se pinto hablaba de otro conjunto.
  revisarInforme('Han cambiado las fuentes del análisis (se añadió, se quitó o se reemplazó alguna).');
  avisar(`Analizando ${num(fuentes.length)} fuente(s): trazados, distancias y fechas…`);
  await new Promise((r) => setTimeout(r, 30));

  try {
    const t0 = performance.now();
    const archivos = fuentes.filter((f) => f.clase === 'archivo');
    const proyectos = fuentes.filter((f) => f.clase === 'proyecto');

    let filas = [], diagnostico = [];
    if (archivos.length) {
      const r = await Ingesta.procesar(archivos.map((f) => ({ nombre: f.nombre, datos: f.datos, rechazado: f.rechazado })), CONFIG);
      filas = r.filas;
      diagnostico = r.archivos ?? [];
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
        calidad: calidadDe(filas, diagnostico),
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
function calidadDe(filas, diagnostico) {
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
    // DUPLICADOS: se cuentan sobre los TRAZADOS, no sobre el analisis de los
    // archivos. Antes salian de `analisisArchivos.calidad`, que no existe
    // cuando las fuentes son un proyecto guardado: el contador desaparecia al
    // abrirlo aunque las tres copias siguieran ahi, en la tabla, con su sufijo
    // `~N`. Contando las filas, el numero tiene siempre el mismo respaldo
    // visible y no depende de por donde entraron los datos.
    duplicadosExactos: cuenta((x) => x.duplicadoExacto === true),
    idsRepetidosEnOrigen: cuenta((x) => x.idRepetidoEnOrigen === true),
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
    versionApp: VERSION_APP, versionMotor: VERSION_MOTOR,
  });
  descargar(Proyecto.nombreArchivo(nombre), Proyecto.serializar(p), 'application/json;charset=utf-8');
  const filtrado = estado.visibles.length !== estado.filas.length;
  avisar(`Proyecto <b>«${esc(nombre)}»</b> guardado con <b>los ${num(estado.filas.length)} PMT cargados</b>` +
    `${filtrado ? ` (no solo los ${num(estado.visibles.length)} que se ven ahora; los filtros se guardan aparte y se vuelven a aplicar al abrirlo)` : ''}. ` +
    `Al abrirlo, la aplicación <b>vuelve a calcular</b> las relaciones con el motor: ` +
    `el archivo guarda los trazados, no los resultados.`, '');
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

  aplicarFiltros();        // pinta ya las tarjetas con el alcance visible
  Mapa.encuadrar();

  // CALIDAD DE LA ENTRADA: habla de TODO lo cargado, nunca de lo filtrado, y
  // por eso se pinta aqui una sola vez y con el resumen TOTAL.
  const total = resumenTotal();
  pintarContexto(total, ms, extra);
  Tablas.pintarCalidad(
    Ingesta.diagnosticoArchivos(estado.archivos), total,
    estado.filas.filter((x) => (x.avisos ?? []).length));

  $('panelResumen').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ═════════════════════ RESUMEN: UN MODELO, DOS ALCANCES ═════════════════════
 *
 * Toda cifra de la pantalla sale de `resumir()`, y cada llamada dice de que
 * alcance habla. No hay ningun sitio que cuente por su cuenta.
 *
 *   VISIBLE  lo que se esta viendo con los filtros y el dia puestos ahora.
 *            Es lo que enseñan las tarjetas, las pestañas, el informe y las
 *            exportaciones: los cuatro, siempre, el mismo conjunto.
 *   TOTAL    todo lo cargado. Es lo que enseña "Calidad de los datos" y lo que
 *            se coteja con la instantanea del proyecto guardado, porque esa
 *            instantanea se tomo sobre el analisis entero.
 */

/** Resumen de lo que se esta viendo ahora mismo. */
function resumenVisible() {
  return resumir(estado.analisis, estado.visibles, estado.relVisibles,
    estado.noEvalVisibles ?? estado.noEvaluables, { total: estado.filas.length });
}

/** Resumen de todo lo cargado, sin filtros. */
function resumenTotal() {
  return resumir(estado.analisis, estado.filas, estado.relaciones, estado.noEvaluables);
}

/**
 * TARJETAS DEL TABLERO — hablan SIEMPRE del alcance visible.
 *
 * Antes se pintaban una sola vez, al terminar el analisis, y con el conjunto
 * COMPLETO. Con un filtro puesto la pantalla decia 2 PMT y 2 contratos arriba
 * mientras la tabla y el informe decian 1 y 1: dos cifras ciertas que parecian
 * un error porque nada explicaba que hablaban de conjuntos distintos.
 *
 * Ahora se repintan con cada cambio de filtro o de dia, salen del MISMO
 * `resumir()` que usan las tablas y el informe, y encima de ellas va una linea
 * que dice cuantos PMT hay cargados en total y cuantos se estan viendo.
 */
function pintarTarjetas() {
  const res = resumenVisible();
  const dudas = res.espacialNoEval || res.temporalNoEval || res.archivosParciales || res.archivosFallidos;
  const caja = $('fraseResumen');
  caja.className = 'frase ' + (res.archivosFallidos ? 'error' : dudas ? 'atencion' : '');
  caja.textContent = frasePrincipal(res);

  // ── Linea de alcance: ninguna cifra viaja sin decir de donde sale ──
  const alcance = $('alcanceResumen');
  if (alcance) {
    alcance.className = 'alcance' + (res.filtrado ? ' filtrado' : '');
    const dia = estado.instanteRecorrido !== null
      ? ` · dia <b>${esc(diaDe(estado.instanteRecorrido))}</b>` : '';
    alcance.innerHTML = res.filtrado || dia
      ? `<span class="etq-alcance">Resultado visible</span>` +
        `<span><b>${num(res.pmtsCargados)}</b> PMT cargados · ` +
        `<b>${num(res.pmts)}</b> visibles con los filtros puestos${dia}</span>` +
        `<button type="button" class="enlace" id="btnQuitarFiltros">Quitar los filtros</button>`
      : `<span class="etq-alcance">Todo lo cargado</span>` +
        `<span><b>${num(res.pmtsCargados)}</b> PMT · sin filtros puestos: las tarjetas ` +
        `y las tablas cuentan lo mismo.</span>`;
    const btn = $('btnQuitarFiltros');
    if (btn) btn.onclick = () => { Controles.reiniciarEstado(); aplicarFiltros(); };
  }

  const t = (n, txt, clase = '') => `<div class="tarjeta ${clase}"><div class="n">${num(n)}</div><div class="t">${txt}</div></div>`;
  $('tarjetas').innerHTML =
    t(res.pmts, res.filtrado ? 'PMT visibles' : 'PMT encontrados', 'verde') +
    t(res.contratos, 'contratos') +
    t(res.relaciones, 'relaciones entre contratos', res.relaciones ? 'azul' : '') +
    t(res.contacto, 'llegan a tocarse', res.contacto ? 'nar' : '') +
    t(res.aLaVez, 'coinciden en el tiempo', res.aLaVez ? 'nar' : '') +
    t(res.espacialNoEval + res.temporalNoEval, 'no se pudieron analizar', (res.espacialNoEval + res.temporalNoEval) ? 'rojo' : 'gris');

  // Segunda fila: los ARCHIVOS. No se mueven con los filtros y se dice.
  const ta = $('tarjetasArchivos');
  if (ta) {
    ta.innerHTML =
      t(res.archivosCompletos, 'archivos completos', 'verde') +
      (res.archivosParciales ? t(res.archivosParciales, 'archivos leídos a medias', 'nar') : '') +
      (res.archivosFallidos ? t(res.archivosFallidos, 'archivos que fallaron', 'rojo') : '') +
      t(res.pmtsCargados, 'PMT cargados en total');
  }
  return res;
}

/**
 * Contexto del analisis: qué hacer ahora, de dónde salieron los datos y si el
 * recálculo cuadra con lo que guardaba el proyecto. Se pinta una sola vez por
 * analisis y habla SIEMPRE del TOTAL cargado, que es el alcance de la
 * instantanea guardada.
 */
function pintarContexto(res, ms, extra) {
  const dudas = res.espacialNoEval || res.temporalNoEval || res.archivosParciales || res.archivosFallidos;
  const pasos = ['Use el <b>mapa</b> y los <b>filtros</b> para mirar lo que le interese.'];
  if (res.relaciones) pasos.push('Abra la pestaña <b>Relaciones</b> para ver pareja por pareja.');
  if (dudas) pasos.push('Revise <b>Calidad de los datos</b>: hay cosas que no se pudieron comprobar.');
  pasos.push('Guarde el <b>proyecto</b> para no volver a cargar los archivos mañana.');
  const origen = extra?.proyecto
    ? `<small>Proyecto «${esc(extra.proyecto.nombre)}»${extra.proyecto.creado ? ', guardado el ' + esc(extra.proyecto.creado.slice(0, 10)) : ''}. ` +
      `Las relaciones se han recalculado con el motor ${esc(VERSION_REGLAS)}.</small>`
    : `<small>(análisis completado en ${num(ms)} ms)</small>`;

  // Cotejo con la instantanea guardada: si no cuadra, se dice. Va sobre el
  // TOTAL: la instantanea se tomo del analisis entero, no de una vista filtrada.
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

  // EL MAPA dibuja TODO y atenua en gris lo que queda fuera de los filtros. Eso
  // es util —se ve el contexto— pero solo si la leyenda lo dice.
  Mapa.pintarPmts(estado.filas, estado.porId, ids);
  const pista = $('pistaFueraFiltro');
  if (pista) {
    const fuera = estado.filas.length - visibles.length;
    mostrar('pistaFueraFiltro', fuera > 0);
    if (fuera > 0) pista.innerHTML = `<i class="muestra" style="background:#b6bcc1"></i>` +
      `${num(fuera)} fuera de los filtros (se dibujan en gris, no entran en las cifras)`;
  }
  Mapa.pintarRelaciones(relVisibles, $('verRelaciones').checked);

  Tablas.pintarPmts(visibles, { onFila: seleccionar, seleccionado: estado.seleccionado });
  Tablas.pintarRelaciones(relVisibles, { onFila: (r) => Mapa.irARelacion(r) });

  // UNA RELACION SE VE SI AL MENOS UNO DE SUS DOS EXTREMOS ESTA VISIBLE.
  //
  // Es lo correcto —ocultarla haria creer que un PMT filtrado no interfiere con
  // nada— pero entonces en la tabla de relaciones aparecen contratos que el
  // filtro deberia haber quitado. Sin explicarlo, parece que el filtro falla.
  const conParejaFuera = relVisibles.filter((r) => !(ids.has(r.idA) && ids.has(r.idB))).length;
  const notaRel = $('notaParejaFuera');
  if (notaRel) {
    mostrar('notaParejaFuera', conParejaFuera > 0);
    if (conParejaFuera > 0) {
      notaRel.innerHTML = `<b>${num(conParejaFuera)} de estas ${num(relVisibles.length)} relaciones ` +
        `tienen su pareja fuera de los filtros.</b> Se muestran a propósito: si se ocultaran, ` +
        `parecería que un PMT filtrado no interfiere con nada. Por eso puede ver aquí contratos ` +
        `que no están en la pestaña de PMT.`;
    }
  }
  Tablas.pintarNoEvaluables(noEvalVisibles, estado.porId);

  // LAS TARJETAS SIGUEN AL ALCANCE VISIBLE: se repintan con cada filtro.
  pintarTarjetas();
  pintarAlcancePestana();
  pintarAlcanceExportar();
  // Y si hay un informe en pantalla, deja de corresponder: se marca.
  revisarInforme('Ha cambiado lo que se está viendo (filtros o día del recorrido).');

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

let pestanaActual = 'pmt';

function irAPestana(cual) {
  pestanaActual = cual;
  for (const b of $$('.pestanas button')) b.setAttribute('aria-selected', String(b.dataset.pest === cual));
  for (const p of ['pmt', 'rel', 'noeval', 'cal']) mostrar('pest_' + p, p === cual);
  pintarAlcancePestana();
}

/**
 * CADA PESTANA DICE DE QUE ALCANCE HABLA.
 *
 * Tres pestañas cuentan lo VISIBLE y la de calidad cuenta TODO lo cargado. Son
 * dos universos legítimos, pero puestos uno al lado del otro sin etiqueta
 * parecen contradecirse: 14 PMT arriba y «460 registros» dentro de calidad.
 */
function pintarAlcancePestana() {
  const caja = $('alcancePestana');
  if (!caja) return;
  const total = estado.filas.length;
  const vis = estado.visibles.length;
  const filtrado = vis !== total;
  const dia = estado.instanteRecorrido !== null ? ` y del día <b>${esc(diaDe(estado.instanteRecorrido))}</b>` : '';
  if (pestanaActual === 'cal') {
    caja.innerHTML = `Esta pestaña habla de <b>todo lo cargado</b>: ${num(total)} PMT de ` +
      `${num(estado.archivos.length)} archivo(s). <b>No cambia con los filtros.</b>`;
    return;
  }
  caja.innerHTML = filtrado || dia
    ? `Esta pestaña habla del <b>resultado visible</b>: ${num(vis)} PMT de los ${num(total)} cargados${dia}.`
    : `Esta pestaña habla de <b>los ${num(total)} PMT cargados</b>: no hay filtros puestos.`;
}

/* ───────────────────────── Exportaciones e informe ───────────────────────── */

const marca = () => new Date().toISOString().slice(0, 10);

/**
 * LO QUE PROMETE EL PANEL DE EXPORTACION TIENE QUE SER LO QUE ENTREGA.
 *
 * Decia «se exporta lo que esta viendo ahora» sin decir cuanto era eso, y al
 * lado hay un boton —«Guardar proyecto»— que hace lo contrario: guarda TODO lo
 * cargado. Dos alcances distintos a un palmo, ninguno con su cifra.
 */
function pintarAlcanceExportar() {
  const caja = $('alcanceExportar');
  if (!caja) return;
  const total = estado.filas.length, vis = estado.visibles.length;
  const dia = estado.instanteRecorrido !== null ? `, y solo del día ${esc(diaDe(estado.instanteRecorrido))}` : '';
  caja.innerHTML = vis === total && !dia
    ? `Se exportan los <b>${num(total)} PMT cargados</b>: no hay filtros puestos.`
    : `Se exporta <b>lo que está viendo ahora</b>: <b>${num(vis)}</b> PMT de los ${num(total)} cargados${dia}. ` +
      `<br><small>El botón «Guardar proyecto» es distinto: guarda <b>los ${num(total)}</b>, con los filtros anotados aparte.</small>`;
}

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

/**
 * SELLO DEL ESTADO — huella de aquello sobre lo que se genera un informe.
 *
 * Lleva lo que puede cambiar sus cifras: qué fuentes componen el análisis, qué
 * filtros hay puestos, qué día del recorrido se está viendo y cuántos PMT,
 * relaciones y pares no evaluables quedan a la vista. Si cualquiera de esas
 * cosas cambia, el sello cambia y el informe que había queda marcado como
 * caducado.
 */
function selloEstado() {
  return JSON.stringify({
    fuentes: estado.fuentes.map((f) => `${f.clase}:${f.nombre}:${f.huella ?? ''}`),
    filtros: Controles.actuales(),
    dia: estado.instanteRecorrido,
    pmts: estado.visibles.length,
    relaciones: estado.relVisibles.length,
    noEval: (estado.noEvalVisibles ?? estado.noEvaluables).length,
    cargados: estado.filas.length,
  });
}

/**
 * Comprueba si el informe que hay en pantalla sigue correspondiendo al estado
 * actual. Se llama tras cada filtro y tras cada cambio de fuentes.
 */
function revisarInforme(motivo) {
  Informe.revisarVigencia(selloEstado(), motivo, () => verInforme());
}

export function verInforme() {
  // MISMO alcance para las tarjetas del tablero, las tablas, el informe y las
  // exportaciones: el visible. `totalCargado` lo acompaña para que el informe
  // pueda decir de cuántos PMT sale lo que enseña.
  const resumen = resumenVisible();
  Informe.generar({
    filas: estado.visibles, relaciones: estado.relVisibles, porId: estado.porId,
    noEvaluables: estado.noEvalVisibles ?? estado.noEvaluables,
    archivos: Ingesta.diagnosticoArchivos(estado.archivos),
    resumen,
    filtros: Controles.actuales(), config: CONFIG,
    versionReglas: VERSION_REGLAS,
    // PROCEDENCIA: lo que hay que saber para reproducir este informe.
    procedencia: selloProcedencia(CONFIG, {
      alcance: estado.visibles.length === estado.filas.length
        ? `${estado.filas.length} PMT (todo lo cargado)`
        : `${estado.visibles.length} de ${estado.filas.length} PMT (filtrado)`,
    }),
    // Si el recorrido esta activo, el informe cubre SOLO ese dia y debe decirlo.
    diaRecorrido: estado.instanteRecorrido,
    totalCargado: estado.filas.length,
    sello: selloEstado(),
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
    `<span class="pista-campo">Línea discontinua = no coinciden en el tiempo</span>` +
    `<span id="pistaFueraFiltro" class="oculto"></span>`;
}

conectarCarga();
conectarExportaciones();
conectarResto();
