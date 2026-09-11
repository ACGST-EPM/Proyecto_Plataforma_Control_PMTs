/**
 * Lectura de marcas de tiempo de un PMT.
 *
 * Los PMT se expresan en HORA LOCAL DE OBRA y el KMZ no lleva zona horaria.
 * Por eso aqui NO se usa `new Date(texto)`: ese constructor interpreta la zona
 * del equipo, asi que el mismo archivo daria resultados distintos en dos PC.
 * En su lugar se descomponen los campos y se convierten con Date.UTC, que aqui
 * se usa solo como calculadora de calendario. El resultado es un numero de
 * milisegundos "civiles", comparable siempre consigo mismo.
 *
 * ── VALIDACION DEL TEXTO COMPLETO ──────────────────────────────────────────
 *
 * La expresion regular esta ANCLADA a los dos extremos del texto. Antes no lo
 * estaba, y eso permitia que sobras silenciosas se colaran:
 *
 *   "2026-03-01 123:00"     la parte horaria no encajaba, y el texto se
 *                           interpretaba como "fecha sin hora" -> 00:00
 *   "2026-03-01 12:3"       igual: hora presente pero tratada como ausente
 *   "2026-03-01 24:00:001"  se leia 24:00:00 y el "1" sobrante se ignoraba
 *   "2026-03-01 12:00:00Z"  el sufijo de zona horaria se ignoraba
 *
 * Ahora se distinguen tres estados sin ambiguedad, en el campo `estadoHora`:
 *
 *   'ausente'  el texto trae solo la fecha
 *   'valida'   el texto trae una hora y es correcta
 *   'invalida' el texto trae algo donde deberia ir la hora, pero no es una
 *              hora valida -> el instante entero se rechaza
 *
 * Una hora invalida NUNCA se convierte en medianoche ni en ninguna otra cosa.
 */

/** Texto completo: fecha, o fecha + hora. Anclado a los dos extremos. */
const RE_COMPLETA = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/;
/** Solo la fecha, para saber si el problema esta en la parte horaria. */
const RE_FECHA = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.*))?$/;
/** Sufijos de zona horaria que el contrato de datos actual NO admite. */
const RE_ZONA = /(Z|UTC|GMT|[+-]\d{2}:?\d{2})\s*$/i;

/**
 * @typedef {object} Instante
 * @property {number|null} ms       milisegundos civiles, o null si no se pudo leer
 * @property {string|null} iso      texto normalizado 'YYYY-MM-DD HH:MM:SS'
 * @property {boolean} tieneHora    si el texto original traia hora utilizable
 * @property {'ausente'|'valida'|'invalida'} estadoHora
 * @property {'ausente'|'explicita'|'medianoche24'} origenHora  procedencia del valor
 * @property {string|null} diaDeclarado  la fecha tal como venia escrita, 'YYYY-MM-DD'
 * @property {string[]} avisos      problemas de calidad detectados
 */

const fallo = (avisos, estadoHora = 'ausente', diaDeclarado = null) => ({
  ms: null, iso: null, tieneHora: false, estadoHora,
  origenHora: 'ausente', diaDeclarado, avisos,
});

/**
 * Lee una marca de tiempo. Nunca lanza excepcion: los problemas salen en `avisos`.
 * @param {string} texto
 * @param {{horaPorDefecto?: '00:00:00'|'23:59:59'}} [opciones]
 * @returns {Instante}
 */
export function leerInstante(texto, opciones = {}) {
  const avisos = [];
  const t = (texto ?? '').toString().trim();
  if (!t || t === 'No definido' || t === 'N/A') {
    return fallo(['marca de tiempo ausente']);
  }

  const m = RE_COMPLETA.exec(t);
  if (!m) {
    // El texto no encaja entero. Hay que decir POR QUE, sin inventar un valor.
    const f = RE_FECHA.exec(t);
    if (!f) {
      return fallo([`no se reconoce como fecha: "${recortar(t)}"`]);
    }
    const resto = (f[4] ?? '').trim();
    const dia = `${f[1]}-${pad2(f[2])}-${pad2(f[3])}`;
    if (RE_ZONA.test(resto)) {
      return fallo([
        `la marca de tiempo trae zona horaria ("${recortar(resto)}") y el formato del proyecto ` +
        `no la admite: los PMT se expresan en hora local de obra, sin zona`,
      ], 'invalida', dia);
    }
    return fallo([`hora no valida: "${recortar(resto)}" (se esperaba HH:MM o HH:MM:SS)`], 'invalida', dia);
  }

  const [, Y, M, D, h, mi, s] = m;
  const anio = +Y, mes = +M, dia = +D;
  const diaDeclarado = `${Y}-${pad2(M)}-${pad2(D)}`;
  const tieneHora = h !== undefined;

  // Validacion de calendario real: rechaza 2026-02-29, 2026-04-31, mes 13, etc.
  const prueba = new Date(Date.UTC(anio, mes - 1, dia));
  if (mes < 1 || mes > 12 || dia < 1 ||
      prueba.getUTCFullYear() !== anio || prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== dia) {
    return fallo([`fecha inexistente en el calendario: ${diaDeclarado}`],
      tieneHora ? 'valida' : 'ausente', diaDeclarado);
  }

  if (!tieneHora) {
    const porDefecto = opciones.horaPorDefecto === '23:59:59' ? [23, 59, 59] : [0, 0, 0];
    avisos.push('sin hora: se asumio ' + (opciones.horaPorDefecto ?? '00:00:00'));
    const ms = Date.UTC(anio, mes - 1, dia, ...porDefecto);
    return { ms, iso: formatear(ms), tieneHora: false, estadoHora: 'ausente',
      origenHora: 'ausente', diaDeclarado, avisos };
  }

  const hora = +h, min = +mi, seg = s !== undefined ? +s : 0;
  const horaTexto = `${pad2(h)}:${mi}${s !== undefined ? ':' + s : ''}`;

  // VALIDACION ESTRICTA. La unica normalizacion admitida es 24:00:00.
  if (min > 59) {
    return fallo([`hora invalida (${horaTexto}): los minutos no pueden pasar de 59`], 'invalida', diaDeclarado);
  }
  if (seg > 59) {
    return fallo([`hora invalida (${horaTexto}): los segundos no pueden pasar de 59`], 'invalida', diaDeclarado);
  }
  if (hora === 24 && min === 0 && seg === 0) {
    // 24:00:00 es el final del dia declarado, que en la linea del tiempo es el
    // instante 00:00:00 del dia siguiente. Se guarda de donde viene para que
    // nadie lo vuelva a extender mas tarde.
    avisos.push('24:00:00 interpretado como el final del dia ' + diaDeclarado);
    const ms = Date.UTC(anio, mes - 1, dia + 1, 0, 0, 0);
    return { ms, iso: formatear(ms), tieneHora: true, estadoHora: 'valida',
      origenHora: 'medianoche24', diaDeclarado, avisos };
  }
  if (hora >= 24) {
    return fallo([`hora invalida (${horaTexto}): solo se admite 24:00:00 como fin de dia`], 'invalida', diaDeclarado);
  }

  const ms = Date.UTC(anio, mes - 1, dia, hora, min, seg);
  return { ms, iso: formatear(ms), tieneHora: true, estadoHora: 'valida',
    origenHora: 'explicita', diaDeclarado, avisos };
}

const pad2 = (n) => String(n).padStart(2, '0');
const recortar = (s) => (s.length > 40 ? s.slice(0, 40) + '…' : s);

/** Convierte milisegundos civiles a 'YYYY-MM-DD HH:MM:SS'. */
export function formatear(ms) {
  if (ms === null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Solo la parte de fecha, 'YYYY-MM-DD'. */
export function soloFecha(ms) {
  const f = formatear(ms);
  return f ? f.slice(0, 10) : null;
}

/** Milisegundos del comienzo del dia declarado ('YYYY-MM-DD'). */
export function inicioDelDiaDeclarado(diaDeclarado) {
  if (!diaDeclarado) return null;
  const [Y, M, D] = diaDeclarado.split('-').map(Number);
  return Date.UTC(Y, M - 1, D, 0, 0, 0);
}

export const MS_DIA = 86400000;
export const MS_MINUTO = 60000;
