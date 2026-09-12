/**
 * VISTA PREVIA · DATOS — la experiencia que se busca, funcionando de verdad.
 *
 * ══ PARA QUÉ SIRVE ESTA PÁGINA ════════════════════════════════════════════
 *
 * Hoy, para usar la plataforma hay que buscar ocho KMZ, descargarlos,
 * seleccionarlos uno por uno y preguntarse cuál es la última versión de cada
 * uno. La pregunta que hay que responder antes de pedirle nada a TI es: **si
 * los archivos llegaran solos, ¿cómo debería verse?**
 *
 * Esta maqueta lo enseña con la tubería REAL (`app/fuentes/`), no con un dibujo:
 * el detector incremental, el inventario, el plan y la bitácora son los mismos
 * que se usarían con un origen corporativo. Lo único simulado es de DÓNDE salen
 * los archivos, que es justamente lo que todavía no está decidido.
 *
 * ══ LO QUE NO HACE, A PROPÓSITO ═══════════════════════════════════════════
 *
 * No habla con ningún servicio. No tiene credenciales. No guarda nada en el
 * equipo. No analiza los KMZ (eso ya lo hace la aplicación): aquí lo que se
 * demuestra es la GESTIÓN DE LAS FUENTES, que es la pieza que falta.
 */
import { $, esc, num, mostrar } from '../ui/dom.js';
import { proveedorSimulado } from '../fuentes/proveedores.js';
import { revisar, aplicar, explicarSincronizacion } from '../fuentes/sincronizacion.js';
import { crearBitacora, ultimas } from '../fuentes/auditoria.js';
import { huellaCorta } from '../fuentes/huella.js';
import { CAMBIO } from '../fuentes/inventario.js';

/* ── Un origen de laboratorio con algo parecido a lo que hay hoy ── */
const origen = proveedorSimulado('Carpeta de laboratorio · PMT');
const CONTRATOS = ['CW322377', 'CW323402', 'CW323849', 'CW328120', 'CW352217', 'CW353556'];
for (const c of CONTRATOS) {
  origen.poner(`PMT/2026/${c}.kmz`, `contenido inicial de ${c}`);
}

const estado = {
  inventario: null,
  bitacora: crearBitacora(),
  revision: null,
  ultimaSincronizacion: null,
};

/**
 * «Procesar» aquí solo inventa identificadores estables a partir del contenido.
 * En la aplicación de verdad, esta función es la que lee el KMZ con el motor.
 * Que sea un parámetro y no una dependencia es lo que permite probar la tubería
 * sin arrastrar el motor entero.
 */
const procesar = async (fuente) => {
  const base = fuente.huella.valor.slice(0, 10);
  return [`pmt_${base}_1`, `pmt_${base}_2`, `pmt_${base}_3`];
};

/* ───────────────────────── Pintar ───────────────────────── */

const ETIQUETA = {
  [CAMBIO.NUEVA]: ['Nuevo', 'p-ok'],
  [CAMBIO.MODIFICADA]: ['Modificado', 'p-parcial'],
  [CAMBIO.SIN_CAMBIO]: ['Sin cambios', 'p-gris'],
  [CAMBIO.ELIMINADA]: ['Ya no está', 'p-fallo'],
  [CAMBIO.MOVIDA]: ['Cambió de sitio', 'p-avez'],
  [CAMBIO.DUPLICADA]: ['Copia repetida', 'p-gris'],
  [CAMBIO.INDETERMINADA]: ['No se pudo comparar', 'p-parcial'],
};

function pintarEstadoOrigen() {
  const inv = estado.inventario;
  const cuando = estado.ultimaSincronizacion
    ? new Date(estado.ultimaSincronizacion).toLocaleString('es-CO')
    : 'todavía no se ha incorporado nada';
  $('estadoOrigen').innerHTML =
    `<span class="etq-alcance">${esc(origen.nombre)}</span>` +
    `<span><b>${num(inv?.fuentes.length ?? 0)}</b> fuente(s) incorporada(s) · ` +
    `última incorporación: <b>${esc(cuando)}</b></span>` +
    `<span class="pista-campo">${origen.admiteNotificaciones
      ? 'Este origen podría avisar de los cambios por sí solo.'
      : 'Este origen no puede avisar: hay que preguntarle.'}</span>`;
}

function pintarNovedades() {
  const caja = $('novedades');
  const rev = estado.revision;
  if (!rev) { caja.innerHTML = ''; return; }

  const filas = rev.comparacion.cambios.map((c) => {
    const [txt, clase] = ETIQUETA[c.tipo] ?? ['—', 'p-gris'];
    return `<tr>
      <td><span class="pastilla ${clase}">${esc(txt)}</span></td>
      <td>${esc(c.fuente.nombre)}</td>
      <td class="mono"><small>${esc(c.fuente.ruta)}</small></td>
      <td class="mono"><small>${esc(huellaCorta(c.fuente.huella))}</small></td>
      <td><small>${esc(c.motivo ?? '')}</small></td>
    </tr>`;
  }).join('');

  const rechazadas = rev.rechazadas.map((r) => `<tr>
    <td><span class="pastilla p-fallo">No se pudo leer</span></td>
    <td>${esc(r.nombre)}</td><td class="mono"><small>${esc(r.ruta)}</small></td>
    <td>—</td><td><small>${esc(r.motivo)}</small></td></tr>`).join('');

  const ahorro = rev.plan.total
    ? `Habría que leer <b>${num(rev.plan.aLeer)}</b> de ${num(rev.plan.total)} archivo(s). ` +
      `El resto ya se conoce y <b>no se vuelve a procesar</b>.`
    : 'No hay nada que leer.';

  caja.innerHTML = `
    <div class="frase" style="margin-top:14px">${ahorro}</div>
    <div class="tabla-caja"><table class="datos">
      <thead><tr><th>Estado</th><th>Archivo</th><th>Dónde está</th><th>Huella</th><th>Por qué</th></tr></thead>
      <tbody>${filas}${rechazadas}</tbody>
    </table></div>`;
}

function pintarDatos() {
  const inv = estado.inventario;
  const fuentes = inv?.fuentes ?? [];
  const registros = fuentes.flatMap((f) => f.registros ?? []);
  const t = (n, txt, clase = '') =>
    `<div class="tarjeta ${clase}"><div class="n">${num(n)}</div><div class="t">${txt}</div></div>`;
  $('tarjetasDatos').innerHTML =
    t(fuentes.length, 'fuentes activas', 'verde') +
    t(registros.length, 'PMT incorporados') +
    t(new Set(registros).size, 'PMT distintos') +
    t(estado.bitacora.anotaciones.length, 'hechos anotados', 'gris');

  const tb = $('tablaFuentes');
  tb.querySelector('thead').innerHTML =
    '<tr><th>Archivo</th><th>Dónde está</th><th>Tamaño</th><th>Huella</th><th>PMT</th><th>Visto</th></tr>';
  tb.querySelector('tbody').innerHTML = fuentes.length
    ? fuentes.map((f) => `<tr>
        <td>${esc(f.nombre)}</td>
        <td class="mono"><small>${esc(f.ruta)}</small></td>
        <td class="num">${num(f.bytes)} B</td>
        <td class="mono"><small title="${esc(f.huella.algoritmo)}">${esc(huellaCorta(f.huella))}</small></td>
        <td class="num">${num(f.registros?.length ?? 0)}</td>
        <td><small>${esc(new Date(f.observadoEn).toLocaleString('es-CO'))}</small></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="vacio">Todavía no se ha incorporado ninguna fuente.</td></tr>';
}

function pintarBitacora() {
  const tb = $('tablaBitacora');
  tb.querySelector('thead').innerHTML = '<tr><th>Cuándo</th><th>Qué pasó</th><th>Detalle</th><th>Quién</th></tr>';
  const filas = ultimas(estado.bitacora, 60);
  tb.querySelector('tbody').innerHTML = filas.length
    ? filas.map((a) => `<tr>
        <td class="mono"><small>${esc(new Date(a.momento).toLocaleString('es-CO'))}</small></td>
        <td><span class="pastilla p-gris">${esc(a.hecho)}</span></td>
        <td>${esc(a.resumen)}</td>
        <td><small>${esc(a.actor)}</small></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="vacio">Nada todavía.</td></tr>';
}

const pintarTodo = () => { pintarEstadoOrigen(); pintarNovedades(); pintarDatos(); pintarBitacora(); };

function avisarSim(texto, clase = '') {
  const n = $('avisoSim');
  n.className = 'frase ' + clase;
  n.innerHTML = texto;
  mostrar('avisoSim', true);
}

/* ───────────────────────── Acciones ───────────────────────── */

$('btnRevisar').onclick = async () => {
  estado.revision = await revisar(origen, estado.inventario);
  const hay = estado.revision.comparacion.hayCambios || estado.revision.rechazadas.length;
  $('btnSincronizar').disabled = !hay;
  pintarTodo();
  avisarSim(hay
    ? `<b>Hay novedades.</b> ${esc(explicarSincronizacion(estado.revision, null))}`
    : '<b>Todo está al día.</b> No hace falta volver a analizar nada.', hay ? 'atencion' : '');
};

$('btnSincronizar').onclick = async () => {
  if (!estado.revision) return;
  const res = await aplicar(origen, estado.revision, procesar, estado.inventario, estado.bitacora);
  estado.inventario = res.inventario;
  estado.bitacora = res.bitacora;
  estado.ultimaSincronizacion = new Date().toISOString();
  estado.revision = null;
  $('btnSincronizar').disabled = true;
  pintarTodo();
  const errores = res.errores.length
    ? ` <b>${num(res.errores.length)} archivo(s) no se pudieron leer</b> y NO se dan por buenos con su versión anterior.`
    : '';
  avisarSim(`<b>Incorporado.</b> Se leyeron ${num(res.leidas)} archivo(s) y se reaprovecharon ` +
    `${num(res.ahorradas)} sin volver a procesarlos (${num(res.porcentajeEvitado)} % evitado).${errores}`,
    res.errores.length ? 'atencion' : '');
};

/* ── Banco de pruebas: lo que pasa de verdad en una carpeta compartida ── */
let n = 0;
const rutas = () => CONTRATOS.map((c) => `PMT/2026/${c}.kmz`);

$('simAnadir').onclick = () => {
  const c = `CW9000${++n}`;
  origen.poner(`PMT/2026/${c}.kmz`, `contenido nuevo de ${c} ${Date.now()}`);
  avisarSim(`Llegó <b>${esc(c)}.kmz</b>. Pulse «Revisar si hay novedades».`);
};
$('simModificar').onclick = () => {
  const r = rutas()[0];
  origen.poner(r, `contenido corregido ${Date.now()}`);
  avisarSim(`Alguien corrigió <b>${esc(r)}</b>. Pulse «Revisar»: debería salir «Modificado», y solo ese archivo se vuelve a leer.`);
};
$('simMover').onclick = () => {
  const r = rutas()[1];
  origen.mover(r, r.replace('PMT/2026/', 'PMT/historico/'));
  avisarSim(`Movieron <b>${esc(r)}</b> a otra carpeta. Pulse «Revisar»: tiene que salir <b>«Cambió de sitio»</b>, ` +
    `no «nuevo» y «ya no está». Si saliera eso, todos sus PMT desaparecerían y volverían a aparecer.`);
};
$('simCopiar').onclick = () => {
  const r = rutas()[2];
  origen.poner(r.replace('.kmz', ' - copia.kmz'), `contenido inicial de ${CONTRATOS[2]}`);
  avisarSim(`Alguien dejó una copia con otro nombre. Pulse «Revisar»: tiene que salir <b>«Copia repetida»</b> ` +
    `y <b>no</b> procesarse dos veces.`);
};
$('simBorrar').onclick = () => {
  const r = rutas()[3];
  origen.quitar(r);
  avisarSim(`Retiraron <b>${esc(r)}</b>. Pulse «Revisar»: se verá qué PMT se van con él.`);
};
$('simRomper').onclick = () => {
  const r = rutas()[4];
  origen.poner(r, `contenido cambiado ${Date.now()}`).romper(r, 'el origen no dejó leer este archivo');
  avisarSim(`<b>${esc(r)}</b> cambió pero ya no se deja leer. Pulse «Revisar» e «Incorporar»: el resto sigue, ` +
    `y esa fuente <b>no</b> se da por vigente con su versión anterior.`, 'atencion');
};

pintarTodo();
