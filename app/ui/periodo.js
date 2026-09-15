/**
 * SELECTOR DE ALCANCE TEMPORAL Y BANDA DE CONTEXTO.
 *
 * ══ QUÉ PROBLEMA RESUELVE ═════════════════════════════════════════════════
 *
 * Con el histórico completo cargado, la vista se llena de PMT que terminaron
 * hace meses. Ninguno de ellos se puede coordinar ya, así que todos son ruido
 * sobre los pocos que sí piden atención hoy. Pero borrarlos sería peor: el
 * histórico es evidencia, y hace falta para responder «¿quién estaba
 * interviniendo aquí en marzo de 2025?».
 *
 * La solución no es un filtro más: es un PUNTO DE VISTA explícito.
 *
 * ══ POR QUÉ UN SELECTOR Y NO PESTAÑAS POR AÑO ════════════════════════════
 *
 * Unas pestañas «2024 | 2025 | 2026» se leen muy bien… durante tres años. Al
 * quinto no caben, al décimo hay que hacerlas desplazables, y para entonces la
 * pestaña del año en curso —que es la que se usa el 95 % del tiempo— está
 * compitiendo por el espacio con nueve que casi nadie abre.
 *
 * Por eso: DOS decisiones separadas, cada una con su control.
 *
 *   1. ¿Qué estoy mirando?   Operativo · Histórico · Todo
 *   2. ¿De qué año?          solo aparece si eligió Histórico
 *
 * El año sale de un desplegable POBLADO CON LOS DATOS, nunca de una lista fija:
 * una lista fija envejece sola y deja de cubrir el año en curso.
 *
 * ══ LA BANDA DE CONTEXTO ═════════════════════════════════════════════════
 *
 * Confundir «esto ocurrió en 2025» con «esto hay que coordinarlo» es el error
 * más caro que puede cometer esta pantalla. Por eso el contexto NO se señala
 * solo con un color —que puede no distinguirse, o imprimirse en gris— sino con
 * una banda que lo dice con palabras, siempre visible, encima de las cifras.
 */
import { $, esc, num } from './dom.js';
import { ALCANCE } from '../nucleo/temporalidad.js';

let alCambiar = () => {};

const OPCIONES = [
  [ALCANCE.OPERATIVO, 'Operativo', 'Lo que todavía se puede atender'],
  [ALCANCE.HISTORICO, 'Histórico', 'Consultar un año concreto'],
  [ALCANCE.TODO, 'Todo', 'Sin recorte de periodo'],
];

/**
 * Monta el selector.
 * @param {object} filtros      estado actual (lleva `alcance` y `anio`)
 * @param {{anios:Array, sinAnio:number}} inventario  años presentes en los datos
 * @param {Function} onCambio   recibe { alcance?, anio? }
 */
export function montar(filtros, inventario, onCambio) {
  alCambiar = onCambio ?? (() => {});
  const caja = $('selectorPeriodo');
  if (!caja) return;

  const alcance = filtros.alcance ?? ALCANCE.OPERATIVO;
  const anios = inventario?.anios ?? [];
  // Si el año elegido ya no existe en los datos —se quitó una fuente— se cae al
  // más reciente disponible en vez de dejar un filtro que no se puede
  // representar. Nunca puede haber un recorte activo sin su control.
  const anioValido = anios.some((a) => a.anio === filtros.anio)
    ? filtros.anio : (anios[0]?.anio ?? null);

  caja.innerHTML =
    `<fieldset class="periodo-grupo">
       <legend class="periodo-leyenda">Qué estoy viendo</legend>
       ${OPCIONES.map(([v, etq, ayuda]) => `
         <label class="periodo-op${v === alcance ? ' elegida' : ''}" for="alc_${esc(v)}" id="lab_alc_${esc(v)}">
           <input type="radio" name="alcancePeriodo" value="${esc(v)}"
             id="alc_${esc(v)}" ${v === alcance ? 'checked' : ''}>
           <span class="periodo-nombre">${esc(etq)}</span>
           <span class="periodo-ayuda">${esc(ayuda)}</span>
         </label>`).join('')}
     </fieldset>` +
    (alcance === ALCANCE.HISTORICO
      ? `<label class="mini-campo" for="selAnio">Año
           <select id="selAnio">
             ${anios.length
    ? anios.map((a) => `<option value="${a.anio}"${a.anio === anioValido ? ' selected' : ''}>${a.anio} · ${num(a.pmts)} PMT</option>`).join('')
    : '<option value="">sin datos con fecha</option>'}
           </select></label>` +
        // UN PMT SIN VIGENCIA NO PERTENECE A NINGÚN AÑO, así que no sale en
        // ninguna consulta histórica. Es correcto —no se puede situar— pero
        // callarlo lo haría desaparecer de la vista SIN QUE NADIE LO SUPIERA:
        // no estaría en operativo, no estaría en ningún año, y solo aparecería
        // en «Todo», que casi nadie abre. Se dice aquí, donde se elige el año.
        (inventario?.sinAnio
          ? `<span class="periodo-nota">⚠ ${num(inventario.sinAnio)} PMT no salen en ningún año:
               su vigencia no se pudo determinar. Están en «Todo» y en Calidad de los datos.</span>`
          : '')
      : '');

  for (const [v] of OPCIONES) {
    const r = $('alc_' + v);
    if (r) r.onchange = () => alCambiar({ alcance: v, anio: v === ALCANCE.HISTORICO ? anioValido : null });
  }
  const sel = $('selAnio');
  if (sel) sel.onchange = (e) => alCambiar({ anio: e.target.value ? +e.target.value : null });

  // Si se corrigió el año, el estado tiene que enterarse: un valor mostrado que
  // no está en el estado es la misma clase de error, del otro lado.
  if (alcance === ALCANCE.HISTORICO && anioValido !== filtros.anio) {
    alCambiar({ anio: anioValido });
  }
}

/**
 * Pinta la banda de contexto.
 *
 * @param {{etiqueta:string, detalle:string, retrospectivo:boolean}} contexto
 * @param {{operativos:number, historicos:number, total:number, vigentes:number, futuros:number, sinVigencia:number}} reparto
 */
export function pintarBanda(contexto, reparto) {
  const banda = $('bandaContexto');
  if (!banda) return;
  banda.className = 'banda-contexto' + (contexto.retrospectivo ? ' retrospectiva' : '');
  // El icono acompaña; NUNCA es la única señal. El texto dice lo mismo.
  const icono = contexto.retrospectivo ? '🕘' : '📍';
  banda.innerHTML =
    `<span class="bc-icono" aria-hidden="true">${icono}</span>` +
    `<span class="bc-texto"><b>${esc(contexto.etiqueta)}</b> · ${esc(contexto.detalle)}</span>` +
    desglose(reparto);
}

/**
 * Frase de reparto. Dice SIEMPRE los dos lados, porque el número que no se ve
 * es justamente el que hace dudar de la herramienta: «¿y los otros 460?».
 */
/**
 * Aviso de «la vista operativa lo ha escondido todo».
 *
 * ══ EL DEFECTO QUE CIERRA ═════════════════════════════════════════════════
 *
 * Con datos de hace unos meses —lo normal al empezar a usar la herramienta— la
 * vista operativa deja la pantalla VACÍA: ningún PMT está vigente ni
 * programado. Sin explicación, eso no se lee como «no hay nada que coordinar»;
 * se lee como «la herramienta no funciona» o «no cargó mis archivos».
 *
 * Se descubrió porque media suite de pruebas empezó a fallar sola al pasar la
 * fecha de sus fixtures. Le habría pasado igual a quien abra la aplicación con
 * los PMT del año pasado.
 *
 * @param {number} cargados  PMT en total
 * @param {number} visibles  PMT que pasan el alcance y los filtros
 * @param {Function} onVerTodo  qué hacer al pulsar «Ver todo el histórico»
 */
export function avisarVistaVacia(cargados, visibles, alcance, onVerTodo, sinVigencia = 0) {
  const caja = $('avisoVistaVacia');
  if (!caja) return;
  const operativa = alcance === ALCANCE.OPERATIVO;
  const escondeTodo = cargados > 0 && visibles === 0 && operativa;
  // ══ LO QUE NO SE PUEDE SITUAR TAMBIÉN SE ANUNCIA ══════════════════════
  //
  // Queda fuera del alcance operativo porque no se sabe si está vigente. Pero
  // sacarlo de la vista SIN DECIRLO sería esconder un problema de datos: nadie
  // iría a corregirlo, y la resta «460 − 182 − 277 = 1» no la podría explicar.
  const hayPerdidos = operativa && sinVigencia > 0;

  caja.classList.toggle('oculto', !escondeTodo && !hayPerdidos);
  if (!escondeTodo && !hayPerdidos) { caja.innerHTML = ''; return; }

  caja.innerHTML = (escondeTodo
    ? `<span><b>Ninguno de los ${num(cargados)} PMT cargados está vigente ni programado hoy.</b> ` +
      `No es que no se hayan leído: es que todos terminaron antes de la fecha de referencia, así que ` +
      `ya no hay nada que coordinar sobre ellos. Siguen enteros en el histórico.</span>`
    : `<span><b>${num(sinVigencia)} PMT no entran en esta vista porque su vigencia no se pudo ` +
      `determinar.</b> No están vencidos ni vigentes: <b>no se sabe</b>, así que no se pueden ` +
      `presentar como algo que se pueda atender. Se conservan enteros; conviene revisar sus fechas ` +
      `en «Calidad de los datos».</span>`) +
    `<button type="button" class="b-nar b-mini" id="btnVerHistorico">${
      escondeTodo ? 'Ver todo el histórico' : 'Verlos todos'}</button>`;
  const b = $('btnVerHistorico');
  if (b && onVerTodo) b.onclick = () => onVerTodo();
}

export function frase(r) {
  if (!r || !r.total) return 'sin PMT cargados';
  const partes = [];
  if (r.vigentes) partes.push(`${r.vigentes} vigente(s)`);
  if (r.futuros) partes.push(`${r.futuros} programado(s)`);
  if (r.historicos) partes.push(`${r.historicos} vencido(s)`);
  // «Vigencia no determinada» SIEMPRE se nombra si la hay, y con esas palabras:
  // es el único que no entra en «operativo», y callarlo dejaría una resta que
  // nadie puede explicar.
  if (r.sinVigencia) partes.push(`${r.sinVigencia} con vigencia no determinada`);
  return `${r.total} PMT cargados: ${partes.join(' · ')}`;
}

/**
 * Desglose con la CUENTA EXPLICADA.
 *
 * ══ POR QUÉ NO SON CINCO TARJETAS GRANDES ════════════════════════════════
 *
 * Cinco tarjetas del mismo tamaño dicen que las cinco cifras importan igual, y
 * no es verdad: la que se mira todos los días es «operativo». Las otras cuatro
 * son el desglose que permite comprobarla.
 *
 * Así que va en UNA línea, con la suma escrita: quien quiera comprobar de dónde
 * sale el número lo ve sin abrir nada, y quien no, no tiene que esquivar cinco
 * cajas para llegar al mapa.
 */
export function desglose(r) {
  if (!r || !r.total) return '';
  const celda = (n, etq, clase = '') =>
    `<span class="desg-item ${clase}"><b>${num(n)}</b> ${esc(etq)}</span>`;
  return `<div class="desglose">
      <span class="desg-suma">${celda(r.operativos, 'operativos', 'fuerte')}
        <span class="desg-igual">=</span>
        ${celda(r.vigentes, 'vigentes')}<span class="desg-mas">+</span>${celda(r.futuros, 'programados')}</span>
      <span class="desg-sep"></span>
      ${celda(r.historicos, 'vencidos', 'tenue')}
      ${r.sinVigencia ? celda(r.sinVigencia, 'con vigencia no determinada', 'aviso') : ''}
      <span class="desg-sep"></span>
      ${celda(r.total, 'en total', 'tenue')}
    </div>`;
}
