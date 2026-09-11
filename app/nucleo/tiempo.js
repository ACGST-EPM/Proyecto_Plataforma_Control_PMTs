/**
 * UNA SOLA VERDAD PARA CADA FECHA.
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * El proyecto guardaba cada vigencia DOS veces: el texto que se muestra
 * (`inicio`) y los milisegundos que se calculan (`inicioMs`). Al abrirlo se
 * aceptaban ambos sin comprobar que dijeran lo mismo. Una auditoría cambió solo
 * los milisegundos a 2030 dejando el texto en marzo de 2026: la tabla seguía
 * mostrando 2026 mientras el motor calculaba con 2030 y clasificaba la relación
 * como «En otro momento». Lo mostrado y lo calculado eran cosas distintas.
 *
 * ══ LA REGLA ═══════════════════════════════════════════════════════════════
 *
 *   CANÓNICO: el TEXTO `AAAA-MM-DD HH:MM:SS`.
 *   DERIVADO: todo lo demás —milisegundos, texto legible, fecha de exportación—
 *             se calcula a partir de él, nunca se lee del archivo.
 *
 * Se eligió el texto y no el epoch por tres razones:
 *   · es lo que viene en el KMZ, así que no hay conversión que perder;
 *   · es legible: quien abra el archivo ve la misma fecha que la aplicación;
 *   · un epoch guardado obliga a decidir una zona horaria, y ahí es donde se
 *     cuelan las diferencias entre navegadores.
 *
 * ══ ZONAS HORARIAS ═════════════════════════════════════════════════════════
 *
 * Las marcas de los PMT son HORA LOCAL DE OBRA y el formato del proyecto no
 * admite sufijo de zona. Para que el resultado no dependa del reloj del equipo,
 * se interpretan SIEMPRE con `Date.UTC`, que es una línea de tiempo sin horario
 * de verano. Así, dos equipos en husos distintos —o el mismo equipo antes y
 * después de un cambio de hora— obtienen exactamente el mismo número. Colombia
 * no aplica horario de verano, pero el producto no debe depender de eso.
 *
 * El parseo lo hace el motor (`leerInstante`), de modo que la aplicación y el
 * análisis usan las mismas reglas: `24:00:00`, calendario real, horas
 * imposibles y sufijos de zona se tratan igual en los dos sitios.
 */
import { leerInstante, formatear } from '../../motor/src/tiempo/instante.js';

/** Forma canónica del texto de una marca de tiempo. */
export const PATRON_CANONICO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Normaliza un texto de fecha a la forma canónica y calcula sus milisegundos.
 *
 * @returns {{ok:true, texto:string, ms:number, avisos:string[]} | {ok:false, motivo:string}}
 */
export function normalizarInstante(texto, opciones = {}) {
  if (texto === null || texto === undefined || texto === '') {
    return { ok: false, motivo: 'marca de tiempo ausente' };
  }
  if (typeof texto !== 'string') {
    return { ok: false, motivo: `la marca de tiempo no es un texto (${typeof texto})` };
  }
  const i = leerInstante(texto, opciones);
  if (i.ms === null) {
    return { ok: false, motivo: i.avisos.join('; ') || 'marca de tiempo ilegible' };
  }
  return { ok: true, texto: formatear(i.ms), ms: i.ms, avisos: i.avisos, origenHora: i.origenHora };
}

/**
 * Normaliza la vigencia de un trazado a partir del TEXTO, que es lo canónico.
 *
 * Si el archivo trae milisegundos y NO cuadran con el texto, se rechaza la
 * vigencia entera en vez de elegir uno de los dos en silencio: son datos que se
 * contradicen y no hay forma de saber cuál quiso decir quien los escribió.
 *
 * @returns {{valida:boolean, inicio:string|null, fin:string|null,
 *            inicioMs:number|null, finMs:number|null, avisos:string[]}}
 */
export function normalizarVigencia({ inicio, fin, inicioMs, finMs }) {
  const avisos = [];
  const ini = normalizarInstante(inicio, { horaPorDefecto: '00:00:00' });
  const f = normalizarInstante(fin, { horaPorDefecto: '23:59:59' });

  if (!ini.ok || !f.ok) {
    if (!ini.ok) avisos.push(`fecha de inicio inservible: ${ini.motivo}`);
    if (!f.ok) avisos.push(`fecha de fin inservible: ${f.motivo}`);
    return { valida: false, inicio: null, fin: null, inicioMs: null, finMs: null, avisos };
  }

  // CONTRADICCIÓN entre el texto y los milisegundos guardados: no se elige.
  const contradice = (nombre, msGuardado, msReal, textoReal) => {
    if (msGuardado === null || msGuardado === undefined) return false;
    if (typeof msGuardado !== 'number' || !Number.isFinite(msGuardado)) {
      avisos.push(`${nombre}: los milisegundos guardados no son un número; se recalculan del texto`);
      return false;
    }
    if (msGuardado === msReal) return false;
    avisos.push(`${nombre}: el texto dice «${textoReal}» pero los milisegundos guardados apuntan a ` +
      `«${formatear(msGuardado)}». El archivo se contradice y la vigencia se descarta.`);
    return true;
  };

  const malIni = contradice('fecha de inicio', inicioMs, ini.ms, ini.texto);
  const malFin = contradice('fecha de fin', finMs, f.ms, f.texto);
  if (malIni || malFin) {
    return { valida: false, inicio: ini.texto, fin: f.texto, inicioMs: null, finMs: null, avisos };
  }

  if (f.ms < ini.ms) {
    avisos.push('la fecha de fin es anterior a la de inicio');
    return { valida: false, inicio: ini.texto, fin: f.texto, inicioMs: null, finMs: null, avisos };
  }

  return {
    valida: true,
    inicio: ini.texto, fin: f.texto,
    inicioMs: ini.ms, finMs: f.ms,
    avisos: [...avisos, ...ini.avisos.map((a) => `inicio: ${a}`), ...f.avisos.map((a) => `fin: ${a}`)],
  };
}

/* ───────────────────── Fechas de calendario (AAAA-MM-DD) ───────────────────── */

/**
 * Valida una fecha de calendario DE VERDAD, no con una expresión regular.
 *
 * `2026-99-99` pasa cualquier comprobación de formato y no existe. Aceptarla
 * dejaba un filtro activo que el `<input type="date">` no podía representar:
 * el campo se veía vacío y la tabla salía en cero sin explicación.
 */
export function validarFechaCalendario(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { ok: false, motivo: 'el formato debe ser AAAA-MM-DD' };
  }
  const [a, m, d] = texto.split('-').map(Number);
  if (m < 1 || m > 12) return { ok: false, motivo: `el mes ${m} no existe` };
  if (d < 1 || d > 31) return { ok: false, motivo: `el día ${d} no existe` };
  // `Date.UTC` normaliza los desbordes (31 de abril -> 1 de mayo): si lo que
  // sale no es lo que entró, la fecha no existe en el calendario.
  const fecha = new Date(Date.UTC(a, m - 1, d));
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
    return { ok: false, motivo: `${texto} no existe en el calendario` };
  }
  return { ok: true, texto, ms: fecha.getTime() };
}

export const MS_DIA = 86400000;

/** Primer milisegundo del día calendario (UTC) que contiene a `ms`. */
export const inicioDelDia = (ms) => Math.floor(ms / MS_DIA) * MS_DIA;

/** Texto AAAA-MM-DD del día calendario que contiene a `ms`. */
export const diaDe = (ms) => new Date(inicioDelDia(ms)).toISOString().slice(0, 10);

/** Número de días calendario entre dos instantes, ambos incluidos. */
export function diasCalendarioEntre(msA, msB) {
  return Math.round((inicioDelDia(msB) - inicioDelDia(msA)) / MS_DIA);
}
