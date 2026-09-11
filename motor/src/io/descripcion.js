/**
 * Lectura del campo <description> del KMZ.
 *
 * INVARIANTE DEL PROYECTO - no se toca en esta etapa:
 *   fecha_inicio: ... | fecha_fin: ... | tipo_cierre: ... | direccion: ... |
 *   municipio: ... | contrato: ... | contratista: ... | proyecto: ...
 * separador " | ", orden indiferente, `municipio` opcional.
 *
 * ── LECTURA ESTRUCTURAL, NO POR BUSQUEDA SUELTA ────────────────────────────
 *
 * Antes cada campo se buscaba con una expresion del tipo `contrato\\s*:\\s*(...)`
 * en cualquier punto del texto. Eso permitia inventar datos: una direccion que
 * dijera
 *
 *     direccion: subcontrato: CW999
 *
 * hacia que el motor leyera un contrato "CW999" que no existe en el archivo, y
 * con el se generaban relaciones entre contratos imaginarios.
 *
 * Ahora la descripcion se parte por el separador y CADA SEGMENTO tiene que
 * empezar por una clave conocida seguida de dos puntos. El contenido que venga
 * despues es valor libre y no se vuelve a inspeccionar. Con eso, el ejemplo de
 * arriba se lee como lo que es: una direccion cuyo texto es "subcontrato: CW999",
 * y el registro queda sin contrato.
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

/** Clave estructural al principio de un segmento, o null si no la hay. */
function claveDe(segmento) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/.exec(segmento);
  if (!m) return null;
  const clave = m[1].toLowerCase();
  return CAMPOS.includes(clave) ? { clave, valor: m[2].trim() } : null;
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

  const campos = Object.fromEntries(CAMPOS.map((c) => [c, null]));

  if (!t) {
    avisos.push('descripcion vacia: el registro no lleva ningun dato');
  } else {
    const segmentos = t.split('|');
    const desconocidos = [];
    for (const seg of segmentos) {
      if (!seg.trim()) continue;
      const par = claveDe(seg);
      if (!par) { desconocidos.push(seg.trim()); continue; }
      if (campos[par.clave] !== null) {
        avisos.push(`el campo "${par.clave}" aparece mas de una vez; se conserva el primero`);
        continue;
      }
      campos[par.clave] = par.valor === '' ? null : par.valor;
    }
    if (desconocidos.length) {
      avisos.push(
        `${desconocidos.length} trozo(s) de la descripcion no empiezan por una clave conocida ` +
        `y se ignoran: "${desconocidos[0].slice(0, 40)}${desconocidos[0].length > 40 ? '…' : ''}"`
      );
    }
  }

  for (const c of CAMPOS) {
    if (campos[c] === null && !OPCIONALES.has(c) && t) {
      avisos.push(`falta el campo obligatorio "${c}"`);
    }
  }

  const tc = (campos.tipo_cierre ?? '').toLowerCase();
  if (tc && !TIPOS_CIERRE.includes(tc)) {
    avisos.push(`tipo_cierre "${campos.tipo_cierre}" no esta en la lista cerrada (${TIPOS_CIERRE.join(', ')})`);
  }
  return { campos, avisos, eraHtml };
}
