/** Utilidades minimas de DOM. Deliberadamente pequenas: no hay framework. */

/**
 * Busca un elemento por su identificador.
 *
 * Tolera que NO haya documento: asi los modulos de interfaz se pueden importar
 * desde Node para probar su logica sin arrastrar un navegador entero. En el
 * navegador el comportamiento es exactamente el de `getElementById`.
 */
export const $ = (id) => (typeof document === 'undefined' ? null : document.getElementById(id));
export const $$ = (sel, raiz = null) => {
  if (typeof document === 'undefined') return [];
  return [...(raiz ?? document).querySelectorAll(sel)];
};

/** Escapa texto antes de inyectarlo como HTML. Todo dato de archivo pasa por aqui. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function crear(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'clase') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'texto') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  return n;
}

export const mostrar = (id, si = true) => { const n = $(id); if (n) n.classList.toggle('oculto', !si); };

/** Formatea un numero con separador de miles en castellano. */
export const num = (n) => (n ?? 0).toLocaleString('es-CO');

/** Fecha legible: '2026-03-01 06:00:00' -> '01/03/2026 06:00'. */
export function fechaLegible(s) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s));
  if (!m) return String(s).slice(0, 16);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export const soloDia = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Entrega un archivo al usuario. En un HTML abierto con doble clic no hay
 * servidor, asi que se construye un Blob y se dispara la descarga desde ahi.
 */
export function descargar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = crear('a', { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
