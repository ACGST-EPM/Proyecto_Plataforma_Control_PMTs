/**
 * PANEL DE CAPAS — qué se está viendo en el mapa, y cuánto hay de cada cosa.
 *
 * ══ POR QUE ES UN PANEL Y NO UNA LISTA DE CASILLAS ════════════════════════
 *
 * Una lista de casillas sin cifras obliga a encenderlas y apagarlas para
 * averiguar qué hay. Aquí cada capa dice cuántos elementos tiene, así que el
 * panel se lee sin tocarlo: «6 se tocan, 68 coinciden en el tiempo».
 *
 * ══ DOS GRUPOS, PORQUE SON DOS COSAS DISTINTAS ═══════════════════════════
 *
 *   LO QUE HAY      los PMT: dónde y de qué tipo son los cierres.
 *   LO QUE PASA     la coordinación: qué PMT comparten zona y cuándo.
 *
 * Mezclarlos hacía que el mapa pareciera una maraña. Separados, se puede mirar
 * una cosa cada vez, que es como se mira un mapa de verdad.
 *
 * La capa de MEDICIÓN EXACTA queda apagada por defecto y marcada como técnica:
 * las líneas que unían los puntos de mínima distancia dibujaban triángulos que
 * parecían rutas. Se conserva porque a veces hace falta ver dónde se aproximan
 * de verdad dos trazados; deja de ser la representación principal.
 */
import { $, esc, num } from './dom.js';
import { TIPOS_CIERRE, muestraSvg, SIMBOLOGIA_COORDINACION } from '../nucleo/modelo.js';

/** Estado de las capas. Lo lee el mapa; no se guarda en ninguna parte. */
const estado = {
  cierres: new Set([...TIPOS_CIERRE, '(sin dato)']),
  zonas: false,
  coincidencias: true,
  articulaciones: true,
  medicion: false,
  accesos: true,
};

export const capasActivas = () => ({ ...estado, cierres: new Set(estado.cierres) });
export const verCierre = (tipo) => estado.cierres.has(String(tipo ?? '(sin dato)').toLowerCase() || '(sin dato)');

let alCambiar = () => {};

const muestraColor = (color, opacidad = 1) =>
  `<svg width="44" height="16" aria-hidden="true"><rect x="2" y="3" width="40" height="10" rx="2" ` +
  `fill="${color}" fill-opacity="${opacidad}" stroke="${color}" stroke-opacity=".6"/></svg>`;

/**
 * Monta el panel.
 * @param {object} cuentas  cuántos hay de cada cosa, para enseñarlo sin tocar nada
 * @param {Function} onCambio
 */
export function montar(cuentas, onCambio) {
  alCambiar = onCambio ?? (() => {});
  const caja = $('panelCapas');
  if (!caja) return;

  const fila = (id, marcado, muestra, nombre, cuenta, titulo = '') => `
    <label class="capa-fila" ${titulo ? `title="${esc(titulo)}"` : ''}>
      <input type="checkbox" data-capa="${esc(id)}"${marcado ? ' checked' : ''}>
      <span class="muestra-svg">${muestra}</span>
      <span class="capa-nombre">${esc(nombre)}</span>
      <span class="capa-cuenta">${cuenta === null || cuenta === undefined ? '' : num(cuenta)}</span>
    </label>`;

  const S = SIMBOLOGIA_COORDINACION;
  caja.innerHTML =
    '<div class="capa-grupo">Lo que hay</div>' +
    [...TIPOS_CIERRE, '(sin dato)'].map((t) =>
      fila('cierre:' + t, estado.cierres.has(t), muestraSvg(t),
        t === '(sin dato)' ? 'Sin tipo de cierre' : t[0].toUpperCase() + t.slice(1),
        cuentas.porCierre?.[t] ?? 0)).join('') +

    '<div class="capa-grupo">Lo que pasa entre contratos</div>' +
    fila('zonas', estado.zonas, muestraColor(S.zona.color, 0.25),
      'Zonas de influencia (120 m)', cuentas.pmts ?? null,
      'Zona aproximada donde puede haber señalización de cada PMT.') +
    fila('coincidencias', estado.coincidencias, muestraColor(S.superposicion.color, 0.3),
      'Comparten zona', cuentas.coincidencias ?? 0,
      'Las zonas de influencia se superponen.') +
    fila('articulaciones', estado.articulaciones, muestraColor('#c1272d', 0.45),
      'Y además a la vez', cuentas.articulaciones ?? 0,
      'Se superponen Y las vigencias coinciden.') +
    fila('accesos', estado.accesos, muestraSvg('ingreso y salida'),
      'Puntos de ingreso y salida', cuentas.accesos ?? 0) +

    '<div class="capa-grupo">Técnico</div>' +
    fila('medicion', estado.medicion,
      '<svg width="44" height="16" aria-hidden="true"><line x1="3" y1="8" x2="41" y2="8" stroke="#1c1e21" stroke-width="2" stroke-dasharray="4 4"/></svg>',
      'Medición exacta', null,
      'Une los dos puntos donde los trazados más se aproximan. Útil para comprobar, ruidoso para leer.') +
    '<p class="capa-ayuda">La <b>medición exacta</b> es una herramienta de comprobación: ' +
    'dibuja dónde se aproximan dos trazados. Para entender la coordinación son más claras las zonas.</p>';

  for (const inp of caja.querySelectorAll('input[data-capa]')) {
    inp.onchange = () => {
      const id = inp.dataset.capa;
      if (id.startsWith('cierre:')) {
        const t = id.slice(7);
        if (inp.checked) estado.cierres.add(t); else estado.cierres.delete(t);
      } else {
        estado[id] = inp.checked;
      }
      alCambiar(capasActivas());
    };
  }
}

/** Actualiza solo las cifras, sin repintar el panel ni perder el foco. */
export function actualizarCuentas(cuentas) {
  const caja = $('panelCapas');
  if (!caja) return;
  const poner = (id, v) => {
    const e = caja.querySelector(`input[data-capa="${CSS.escape(id)}"]`)?.closest('.capa-fila')
      ?.querySelector('.capa-cuenta');
    if (e && v !== null && v !== undefined) e.textContent = num(v);
  };
  for (const t of [...TIPOS_CIERRE, '(sin dato)']) poner('cierre:' + t, cuentas.porCierre?.[t] ?? 0);
  poner('coincidencias', cuentas.coincidencias ?? 0);
  poner('articulaciones', cuentas.articulaciones ?? 0);
  poner('accesos', cuentas.accesos ?? 0);
  poner('zonas', cuentas.pmts ?? 0);
}
