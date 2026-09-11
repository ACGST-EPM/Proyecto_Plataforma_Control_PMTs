/**
 * Lectura de marcas de tiempo de un PMT.
 *
 * Los PMT se expresan en HORA LOCAL DE OBRA y el KMZ no lleva zona horaria.
 * Por eso aquí NO se usa `new Date(texto)`: ese constructor interpreta la zona
 * del equipo, así que el mismo archivo daría resultados distintos en dos PC.
 * En su lugar se descomponen los campos y se convierten con Date.UTC, que aquí
 * se usa solo como calculadora de calendario. El resultado es un número de
 * milisegundos "civiles", comparable siempre consigo mismo.
 */

const RE = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * @typedef {object} Instante
 * @property {number|null} ms      milisegundos civiles, o null si no se pudo leer
 * @property {string|null} iso     texto normalizado 'YYYY-MM-DD HH:MM:SS'
 * @property {boolean} tieneHora   si el texto original traía hora
 * @property {string[]} avisos     problemas de calidad detectados
 */

/**
 * Lee una marca de tiempo. Nunca lanza excepción: los problemas salen en `avisos`.
 * @param {string} texto
 * @param {{horaPorDefecto?: '00:00:00'|'23:59:59'}} [opciones]
 * @returns {Instante}
 */
export function leerInstante(texto, opciones = {}) {
  const avisos = [];
  const t = (texto ?? '').toString().trim();
  if (!t || t === 'No definido' || t === 'N/A') {
    return { ms: null, iso: null, tieneHora: false, avisos: ['marca de tiempo ausente'] };
  }
  const m = RE.exec(t);
  if (!m) {
    return { ms: null, iso: null, tieneHora: false, avisos: [`no se reconoce como fecha: "${t.slice(0, 40)}"`] };
  }

  let [, Y, M, D, h, mi, s] = m;
  let anio = +Y, mes = +M, dia = +D;
  const tieneHora = h !== undefined;
  let hora = tieneHora ? +h : (opciones.horaPorDefecto === '23:59:59' ? 23 : 0);
  let min = tieneHora ? +mi : (opciones.horaPorDefecto === '23:59:59' ? 59 : 0);
  let seg = tieneHora ? (s !== undefined ? +s : 0) : (opciones.horaPorDefecto === '23:59:59' ? 59 : 0);
  if (!tieneHora) avisos.push('sin hora: se asumió ' + (opciones.horaPorDefecto ?? '00:00:00'));

  // Validación de calendario real: rechaza 2026-02-29, 2026-04-31, mes 13, etc.
  const prueba = new Date(Date.UTC(anio, mes - 1, dia));
  if (mes < 1 || mes > 12 || dia < 1 ||
      prueba.getUTCFullYear() !== anio || prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== dia) {
    return { ms: null, iso: null, tieneHora, avisos: [...avisos, `fecha inexistente en el calendario: ${Y}-${M.padStart(2, '0')}-${D.padStart(2, '0')}`] };
  }

  // 24:00:00 es notación legítima para "fin del día": equivale a las 00:00 del
  // VALIDACION ESTRICTA DE LA HORA.
  //
  // La UNICA normalizacion admitida es 24:00:00 -> 00:00:00 del dia siguiente,
  // porque es notacion legitima para "fin del dia" y aparece en los datos.
  //
  // Cualquier otra hora fuera de rango (25:00, 24:30, minutos o segundos por
  // encima de 59) es un DATO INVALIDO y se rechaza con diagnostico explicito.
  // Antes se "arreglaban" sumando dias o recortando a 59, lo que convertia un
  // error de captura en un instante distinto sin que nadie se enterara: el
  // trazado entraba al analisis con una vigencia que nunca existio.
  let desbordeDias = 0;
  const horaTexto = tieneHora
    ? `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
    : '';

  if (min > 59) {
    return { ms: null, iso: null, tieneHora, avisos: [...avisos, `hora invalida (${horaTexto}): los minutos no pueden pasar de 59`] };
  }
  if (seg > 59) {
    return { ms: null, iso: null, tieneHora, avisos: [...avisos, `hora invalida (${horaTexto}): los segundos no pueden pasar de 59`] };
  }
  if (hora === 24 && min === 0 && seg === 0) {
    desbordeDias = 1;
    hora = 0;
    avisos.push('24:00:00 interpretado como 00:00:00 del dia siguiente');
  } else if (hora >= 24) {
    return { ms: null, iso: null, tieneHora, avisos: [...avisos, `hora invalida (${horaTexto}): solo se admite 24:00:00 como fin de dia`] };
  }

  const ms = Date.UTC(anio, mes - 1, dia + desbordeDias, hora, min, seg);
  return { ms, iso: formatear(ms), tieneHora, avisos };
}

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

export const MS_DIA = 86400000;
export const MS_MINUTO = 60000;
