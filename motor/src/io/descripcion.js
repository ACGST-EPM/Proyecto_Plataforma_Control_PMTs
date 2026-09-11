/**
 * Lectura del campo <description> del KMZ.
 *
 * INVARIANTE DEL PROYECTO - no se toca en esta etapa:
 *   fecha_inicio: ... | fecha_fin: ... | tipo_cierre: ... | direccion: ... |
 *   municipio: ... | contrato: ... | contratista: ... | proyecto: ...
 * separador " | ", orden indiferente, `municipio` opcional.
 *
 * Diferencias respecto del lector legado, todas hacia el lado seguro:
 *  - Si la descripcion viene como HTML (Google Earth lo hace a veces), se
 *    reduce a texto antes de buscar los campos, en lugar de fallar.
 *  - Se anota que campos faltaban, en vez de rellenar con "No definido" en
 *    silencio.
 *  - Se valida tipo_cierre contra la lista cerrada del proyecto.
 */

export const CAMPOS = [
  'fecha_inicio', 'fecha_fin', 'tipo_cierre', 'direccion',
  'municipio', 'contrato', 'contratista', 'proyecto',
];

/** Campos que pueden faltar sin que el registro se considere incompleto. */
export const OPCIONALES = new Set(['municipio']);

/** Valores admitidos para tipo_cierre (lista cerrada del proyecto). */
export const TIPOS_CIERRE = ['total', 'parcial', 'ingreso y salida'];

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Convierte una descripcion HTML en texto plano legible. */
export function aTextoPlano(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, ' | ')
    .replace(/<\/(p|div|tr|li|td)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCharCode(n) : m;
      }
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/**
 * @param {string} texto contenido de <description>
 * @returns {{campos:Record<string,string|null>, avisos:string[], eraHtml:boolean}}
 */
export function leerDescripcion(texto) {
  const avisos = [];
  const bruto = String(texto ?? '');
  const eraHtml = /<[a-zA-Z/]/.test(bruto);
  const t = eraHtml ? aTextoPlano(bruto) : bruto.trim();
  if (eraHtml) avisos.push('la descripcion venia como HTML; se convirtio a texto antes de leerla');

  const campos = {};
  for (const c of CAMPOS) {
    const m = new RegExp(`${c}\\s*:\\s*([^|]*)`, 'i').exec(t);
    const v = m ? m[1].trim() : '';
    campos[c] = v === '' ? null : v;
    if (campos[c] === null && !OPCIONALES.has(c)) {
      avisos.push(`falta el campo obligatorio "${c}"`);
    }
  }
  if (!t) avisos.push('descripcion vacia: el registro no lleva ningun dato');

  const tc = (campos.tipo_cierre ?? '').toLowerCase();
  if (tc && !TIPOS_CIERRE.includes(tc)) {
    avisos.push(`tipo_cierre "${campos.tipo_cierre}" no esta en la lista cerrada (${TIPOS_CIERRE.join(', ')})`);
  }
  return { campos, avisos, eraHtml };
}
