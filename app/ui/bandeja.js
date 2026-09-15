/**
 * BANDEJA DE TRABAJO — las cifras que importan, y que ADEMÁS son botones.
 *
 * ══ EL PROBLEMA QUE RESUELVE ══════════════════════════════════════════════
 *
 * La pantalla tenía ocho tarjetas con cifras. Se leían… y no se podía hacer
 * nada con ellas. Quien veía «27 articulación requerida» tenía que bajar al
 * panel de filtros, desplegarlo, buscar el filtro de relación, marcar la
 * casilla correcta y volver a subir. Cinco pasos para llegar a lo que la cifra
 * ya estaba señalando.
 *
 * Peor: la cifra y el filtro se calculaban por caminos distintos, así que
 * podían no coincidir sin que nada lo delatara.
 *
 * ══ LA IDEA ══════════════════════════════════════════════════════════════
 *
 * La cifra ES el filtro. Pulsarla deja en el mapa y en la tabla exactamente lo
 * que cuenta, y pulsarla otra vez lo quita. No pueden contradecirse porque son
 * la misma cosa.
 *
 * ══ POR QUÉ TRES Y NO OCHO ═══════════════════════════════════════════════
 *
 * Tres son las preguntas que se hace quien abre esto por la mañana:
 *   · ¿qué tengo que coordinar hoy?      → articulación requerida
 *   · ¿qué comparte sitio, por si acaso? → coincidencia espacial
 *   · ¿qué no he podido comprobar?       → no evaluable
 *
 * El resto de cifras siguen existiendo, en «Ver el detalle del análisis». No se
 * han quitado: se han dejado de poner delante de quien no las ha pedido.
 */
import { $, esc, num } from './dom.js';
import { OPERATIVO, ETIQUETA_OPERATIVO, EXPLICACION_OPERATIVO } from '../nucleo/modelo.js';

/** Clave de filtro de relación que corresponde a cada lectura operativa. */
export const FILTRO_DE_LECTURA = Object.freeze({
  [OPERATIVO.ARTICULACION_REQUERIDA]: 'articulacion',
  [OPERATIVO.COINCIDENCIA_ESPACIAL]: 'coincidencia-espacial',
  [OPERATIVO.NO_EVALUABLE]: 'relacion-no-evaluable',
});

const FICHAS = [
  { lectura: OPERATIVO.ARTICULACION_REQUERIDA, clave: 'articulacion',
    corto: 'requieren articulación', clase: 'bj-articula', icono: '⚠' },
  { lectura: OPERATIVO.COINCIDENCIA_ESPACIAL, clave: 'coincidencia-espacial',
    corto: 'comparten sitio, en otro momento', clase: 'bj-coincide', icono: '◎' },
  { lectura: OPERATIVO.NO_EVALUABLE, clave: 'relacion-no-evaluable',
    corto: 'no se pudieron comprobar', clase: 'bj-nosabe', icono: '?' },
];

let alFiltrar = () => {};

/**
 * Pinta la bandeja.
 * @param {{articulacion:number, coincidenciaEspacial:number, noEvaluables:number, pmts:number}} res
 * @param {string[]} activos  claves de relación activas ahora mismo
 * @param {Function} onFiltrar  recibe la clave pulsada (o null para quitar)
 */
export function pintar(res, activos, onFiltrar) {
  alFiltrar = onFiltrar ?? (() => {});
  const caja = $('bandeja');
  if (!caja) return;

  const valor = {
    [OPERATIVO.ARTICULACION_REQUERIDA]: res.articulacion ?? 0,
    [OPERATIVO.COINCIDENCIA_ESPACIAL]: res.coincidenciaEspacial ?? 0,
    [OPERATIVO.NO_EVALUABLE]: (res.espacialNoEval ?? 0) + (res.temporalNoEval ?? 0),
  };

  caja.innerHTML = FICHAS.map((f) => {
    const n = valor[f.lectura];
    const on = (activos ?? []).includes(f.clave);
    // Una ficha en cero NO se esconde: «0 requieren articulación» es una
    // respuesta útil y tranquilizadora. Lo que hace es atenuarse y no aceptar
    // pulsación, porque filtrar por nada dejaría la pantalla vacía sin motivo.
    return `<button type="button" class="bj ${f.clase}${on ? ' on' : ''}${n ? '' : ' vacia'}"
        data-clave="${esc(f.clave)}" ${n ? '' : 'disabled'}
        aria-pressed="${on ? 'true' : 'false'}"
        title="${esc(EXPLICACION_OPERATIVO[f.lectura])}">
        <span class="bj-icono" aria-hidden="true">${f.icono}</span>
        <span class="bj-n">${num(n)}</span>
        <span class="bj-t">${esc(f.corto)}</span>
      </button>`;
  }).join('') +
    `<div class="bj-pmt"><b>${num(res.pmts ?? 0)}</b> PMT en esta vista</div>`;

  for (const b of caja.querySelectorAll('button[data-clave]')) {
    b.onclick = () => alFiltrar(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.clave);
  }
}
