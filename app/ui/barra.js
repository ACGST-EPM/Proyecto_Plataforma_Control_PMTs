/**
 * BARRA DE TRABAJO — lo que se usa siempre, en una línea.
 *
 * ══ EL PROBLEMA QUE RESUELVE ══════════════════════════════════════════════
 *
 * El panel de filtros tenía todas las listas desplegadas a la vez: contratos,
 * contratistas, proyectos, municipios, frentes, tipos de cierre. Con ocho
 * contratos ya ocupaba media pantalla; con ochenta sería inmanejable, y con
 * cuatrocientos frentes lo es hoy.
 *
 * Aquí arriba viven solo los cuatro controles que se usan continuamente —
 * buscar, periodo, municipio, contrato — y todo lo demás se despliega cuando
 * hace falta. No es esconder opciones: es no enterrar las cuatro que importan
 * entre otras dieciséis.
 *
 * ══ LOS CHIPS ════════════════════════════════════════════════════════════
 *
 * Cada filtro activo aparece como una etiqueta que se puede quitar de un clic.
 * Es la forma compacta del invariante del proyecto: **ningún filtro activo sin
 * su control visible**. Con el panel grande cerrado, los chips son ese control.
 */
import { $, esc, num } from './dom.js';
import { desplegableBuscable, conectar } from './desplegable.js';

let alCambiar = () => {};
let alQuitar = () => {};

const ETIQUETA_CAMPO = {
  contrato: 'Contrato', contratista: 'Contratista', proyecto: 'Proyecto',
  municipio: 'Municipio', frente: 'Frente', tipoCierre: 'Tipo de cierre',
  relacion: 'Relación', documental: 'Documentación',
  desde: 'Desde', hasta: 'Hasta', texto: 'Búsqueda',
};

/**
 * Monta los filtros rápidos de la barra.
 * @param {{municipio:Array, contrato:Array}} opciones  valores disponibles
 * @param {object} filtros  estado actual
 */
export function montarRapidos(opciones, filtros, onCambio) {
  alCambiar = onCambio ?? (() => {});
  const caja = $('filtrosRapidos');
  if (!caja) return;

  caja.innerHTML =
    `<label class="mini-campo" for="rapDesde">Desde
       <input type="date" id="rapDesde" value="${esc(filtros.desde ?? '')}"></label>` +
    `<label class="mini-campo" for="rapHasta">Hasta
       <input type="date" id="rapHasta" value="${esc(filtros.hasta ?? '')}"></label>` +
    desplegableBuscable('desp_municipio', 'Municipio', opciones.municipio ?? [], filtros.municipio ?? []) +
    desplegableBuscable('desp_contrato', 'Contrato', opciones.contrato ?? [], filtros.contrato ?? []);

  for (const campo of ['municipio', 'contrato']) {
    conectar($('desp_' + campo), opciones[campo] ?? [], (v) => alCambiar({ [campo]: v }));
  }
  $('rapDesde').onchange = (e) => alCambiar({ desde: e.target.value || null });
  $('rapHasta').onchange = (e) => alCambiar({ hasta: e.target.value || null });
}

/**
 * Pinta las etiquetas de los filtros activos.
 * @param {object} filtros
 * @param {Function} onQuitar  recibe (campo, valor|null); null = quitar el campo entero
 */
export function pintarChips(filtros, onQuitar) {
  alQuitar = onQuitar ?? (() => {});
  const caja = $('chipsFiltros');
  if (!caja) return;

  const chips = [];
  const anadir = (campo, valor, texto) => chips.push(
    `<span class="chip"><span class="chip-campo">${esc(ETIQUETA_CAMPO[campo] ?? campo)}:</span>` +
    `${esc(texto)}<button type="button" data-campo="${esc(campo)}" data-valor="${esc(valor ?? '')}" ` +
    `aria-label="Quitar el filtro ${esc(texto)}">✕</button></span>`);

  for (const campo of ['contrato', 'contratista', 'proyecto', 'municipio', 'frente', 'tipoCierre', 'relacion', 'documental']) {
    for (const v of filtros[campo] ?? []) anadir(campo, v, v);
  }
  if (filtros.desde) anadir('desde', null, filtros.desde);
  if (filtros.hasta) anadir('hasta', null, filtros.hasta);
  if (filtros.texto) anadir('texto', null, `«${filtros.texto}»`);

  caja.innerHTML = chips.length
    ? chips.join('') +
      '<span class="chip chip-limpiar">Quitar todos' +
      '<button type="button" data-campo="*" aria-label="Quitar todos los filtros">✕</button></span>'
    : '';

  for (const b of caja.querySelectorAll('button[data-campo]')) {
    b.onclick = () => alQuitar(b.dataset.campo, b.dataset.valor || null);
  }
}

/** Cuenta de la barra: siempre dice de qué universo habla. */
export function pintarCuenta(visibles, total) {
  const e = $('btCuenta');
  if (!e) return;
  e.innerHTML = visibles === total
    ? `<b>${num(total)}</b> PMT`
    : `<b>${num(visibles)}</b> de ${num(total)} PMT`;
}
