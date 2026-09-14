/**
 * DESPLEGABLE BUSCABLE — un control de filtro que escala.
 *
 * ══ POR QUE NO SIRVE UN `<select multiple>` ═══════════════════════════════
 *
 * El desplegable múltiple nativo no se pliega: con `size="1"` sigue enseñando
 * una caja abierta con todos los valores. Con ocho contratos ya ocupa media
 * barra; con cuatrocientos frentes es inservible. Y no se puede buscar dentro.
 *
 * ══ QUE HACE ESTE ════════════════════════════════════════════════════════
 *
 *   · plegado ocupa UNA LINEA y dice cuántos hay elegidos;
 *   · al abrirse trae un buscador, así que da igual que haya cuatrocientos;
 *   · cada valor lleva su recuento, para saber qué hay antes de marcarlo;
 *   · lo seleccionado sube arriba del todo y NUNCA desaparece al buscar
 *     —perder de vista un filtro puesto es el defecto que más veces ha
 *     aparecido en este proyecto.
 *
 * Es HTML y CSS, sin dependencias: `<details>` da el plegado y el teclado
 * gratis, y funciona igual en un archivo local que servido por HTTP.
 */
import { esc, num } from './dom.js';

/**
 * @param {string} id         identificador único del control
 * @param {string} etiqueta   lo que se enseña plegado
 * @param {Array<{valor:string,n:number}>} opciones
 * @param {string[]} elegidos
 * @param {Function} onCambio recibe el array de elegidos
 * @param {{maxAltura?:number}} [cfg]
 * @returns {string} HTML
 */
export function desplegableBuscable(id, etiqueta, opciones, elegidos, cfg = {}) {
  const sel = new Set(elegidos ?? []);
  const resumen = sel.size === 0 ? 'todos'
    : sel.size === 1 ? [...sel][0]
    : `${num(sel.size)} elegidos`;
  return `<details class="desp" id="${esc(id)}" data-campo="${esc(id.replace(/^desp_/, ''))}">
    <summary class="desp-boton" title="${esc(etiqueta)}">
      <span class="desp-etq">${esc(etiqueta)}</span>
      <span class="desp-val${sel.size ? ' activo' : ''}">${esc(resumen)}</span>
    </summary>
    <div class="desp-caja" style="max-height:${cfg.maxAltura ?? 280}px">
      ${opciones.length > 8
        ? `<input type="search" class="desp-buscar" placeholder="Buscar…" aria-label="Buscar en ${esc(etiqueta)}">`
        : ''}
      <div class="desp-lista">${listaHtml(opciones, sel)}</div>
      ${sel.size ? '<button type="button" class="desp-limpiar">Quitar los elegidos</button>' : ''}
    </div>
  </details>`;
}

function listaHtml(opciones, sel, filtro = '') {
  const t = filtro.trim().toLowerCase();
  // LO ELEGIDO PRIMERO Y SIEMPRE VISIBLE. Si al buscar desapareciera un valor
  // marcado, habria un filtro activo sin control a la vista.
  const elegidas = opciones.filter((o) => sel.has(String(o.valor)));
  const resto = opciones.filter((o) => !sel.has(String(o.valor)) &&
    (!t || String(o.valor).toLowerCase().includes(t)));
  const fila = (o) => `<label class="desp-fila">
      <input type="checkbox" value="${esc(o.valor)}"${sel.has(String(o.valor)) ? ' checked' : ''}>
      <span class="desp-texto">${esc(o.valor)}</span>
      <span class="desp-n">${num(o.n)}</span></label>`;
  const html = elegidas.map(fila).join('') +
    (elegidas.length && resto.length ? '<div class="desp-sep"></div>' : '') +
    resto.map(fila).join('');
  return html || '<div class="filtro-vacio">Ningún valor coincide con lo que escribió.</div>';
}

/** Conecta un desplegable ya pintado. Devuelve los elegidos en cada cambio. */
export function conectar(raiz, opciones, onCambio) {
  if (!raiz || raiz.dataset.listo) return;
  raiz.dataset.listo = '1';
  const lista = raiz.querySelector('.desp-lista');
  const buscar = raiz.querySelector('.desp-buscar');
  const elegidos = () => [...raiz.querySelectorAll('.desp-lista input:checked')].map((i) => i.value);

  const repintar = () => {
    const sel = new Set(elegidos());
    lista.innerHTML = listaHtml(opciones, sel, buscar?.value ?? '');
    const val = raiz.querySelector('.desp-val');
    if (val) {
      val.textContent = sel.size === 0 ? 'todos' : sel.size === 1 ? [...sel][0] : `${num(sel.size)} elegidos`;
      val.classList.toggle('activo', sel.size > 0);
    }
  };

  lista.addEventListener('change', () => { repintar(); onCambio(elegidos()); });
  if (buscar) buscar.addEventListener('input', () => {
    const sel = new Set(elegidos());
    lista.innerHTML = listaHtml(opciones, sel, buscar.value);
  });
  raiz.querySelector('.desp-limpiar')?.addEventListener('click', () => {
    for (const i of lista.querySelectorAll('input:checked')) i.checked = false;
    repintar();
    onCambio([]);
  });
}
