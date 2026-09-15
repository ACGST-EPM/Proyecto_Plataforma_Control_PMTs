/**
 * FICHA OPERACIONAL — lo que hay que saber de un PMT, en el orden en que se
 * pregunta.
 *
 * ══ QUE NO FUNCIONABA ═════════════════════════════════════════════════════
 *
 * La ficha anterior tenía la información correcta y la presentaba como una
 * lista de pares «campo: valor», todos con el mismo peso. Eso obliga a leerla
 * entera para encontrar cualquier cosa. Y el nombre del archivo de origen
 * competía visualmente con el nombre del frente, que es lo que identifica el
 * PMT para quien trabaja con él.
 *
 * ══ EL ORDEN EN QUE SE PREGUNTA ═══════════════════════════════════════════
 *
 *   1. QUE ES        el frente y el tipo de cierre. Es el titular.
 *   2. QUIEN LO HACE contrato y contratista.
 *   3. CUANDO        la vigencia.
 *   4. DONDE         municipio y dirección.
 *   5. COMO VA       el seguimiento documental.
 *   6. CON QUIEN     sus relaciones con otros contratos.
 *   7. DE DONDE SALE origen y trazabilidad. Al final, porque casi nunca se
 *                    necesita, pero tiene que estar.
 *
 * Cada bloque se puede leer solo. Quien busca «¿cuándo es esto?» no tiene que
 * atravesar el resto.
 */
import { esc, num, fechaLegible } from './dom.js';
import { agruparPorBase, baseDe, historialDeBase } from '../nucleo/identidad-pmt.js';
import { lecturaOperativaEnContexto, OPERATIVO, ETIQUETA_OPERATIVO } from '../nucleo/modelo.js';
import { simbologiaDe, muestraSvg, estadoEspacial, estadoTemporal,
  ESPACIAL, TEMPORAL, ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL } from '../nucleo/modelo.js';
import { DOCUMENTOS } from '../../motor/src/modelo/documental.js';

/**
 * Un bloque de la ficha.
 *
 * ══ EL RÓTULO SE ESCAPA SIEMPRE, Y ESO NO SE TOCA ═════════════════════════
 *
 * Apareció en pantalla el texto literal
 * «ACTIVACIONES DE ESTE PMT <SPAN CLASS="PASTILLA P-CERCA">2</SPAN>».
 * La causa NO era que el escape sobrara: era una llamada que metía HTML dentro
 * del rótulo. El escape hizo exactamente lo que tiene que hacer.
 *
 * Quitarlo habría convertido un defecto visual en un agujero de inyección: los
 * rótulos llevan datos de archivos que no controlamos. Así que el rótulo sigue
 * escapándose y, cuando hace falta un distintivo, va por su propio parámetro
 * —un número o un texto corto— que también se escapa.
 */
const bloque = (rotulo, cuerpo, insignia = null) =>
  `<div class="ficha-bloque"><div class="ficha-rotulo">${esc(rotulo)}` +
  (insignia === null || insignia === undefined ? ''
    : `<span class="ficha-insignia">${esc(insignia)}</span>`) +
  `</div>${cuerpo}</div>`;
const filaKV = (k, v) => `<div class="ficha-fila"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
const oNada = (v) => (v ? esc(v) : '<span style="color:var(--tenue)">—</span>');

/** Barra de progreso documental: tres pasos, y se ve de un vistazo cuántos van. */
export function barraDocumental(doc) {
  if (!doc) return '';
  const pasos = doc.detalle.map((d) =>
    `<span class="doc-paso${d.estado === 'registrado' ? ' hecho' : ''}" title="${esc(d.etiqueta)}: ${d.estado}"></span>`).join('');
  return `<div class="doc-barra"><div class="doc-pasos">${pasos}</div>` +
    `<b>${esc(doc.resumen)}</b> <span style="color:var(--tenue);font-size:.8rem">documentos</span></div>`;
}

/**
 * Seguimiento documental en la ficha.
 *
 * ══ POR QUE NO SE ENSEÑAN SIEMPRE LOS TRES ═══════════════════════════════
 *
 * Antes salian los tres documentos SIEMPRE, y en la mayoria de los PMT eso es
 * literalmente:
 *
 *     Resolucion PMT ................ Pendiente
 *     Permiso de rotura ............. Pendiente
 *     Cierre del permiso de rotura .. Pendiente
 *
 * Tres lineas que no dicen nada y que empujan hacia abajo lo que si importa
 * —quien ejecuta, cuando, donde—. Repetido en cada ficha, el ojo aprende a
 * saltarselo, y entonces tampoco se ve cuando SI hay algo.
 *
 * ══ LA REGLA ═════════════════════════════════════════════════════════════
 *
 * En la ficha normal se enseña lo que EXISTE. Lo que falta se resume en una
 * cifra («1/3») que se puede desplegar.
 *
 * Cuando el usuario esta TRABAJANDO en documentacion —filtro documental
 * activo— la pregunta cambia: entonces lo que importa es justamente lo que
 * falta, y el detalle se abre solo.
 *
 * @param {object} pmt
 * @param {boolean} enfoque  true si hay un filtro documental activo
 */
function detalleDocumental(pmt, enfoque = false) {
  const doc = pmt.documental;
  if (!doc) return '';

  const conCodigo = doc.detalle.filter((d) => d.codigo);
  const porConfirmar = doc.detalle.filter((d) => !d.codigo && d.codigoPrevio);
  const faltan = doc.detalle.filter((d) => !d.codigo && !d.codigoPrevio);

  const linea = (d) => `<li><span>${esc(d.etiqueta)}</span>${
    d.codigo ? `<span class="doc-codigo">${esc(d.codigo)}</span>`
      : d.codigoPrevio
        ? `<span class="doc-codigo" style="opacity:.7">${esc(d.codigoPrevio)}</span>
           <span class="pastilla p-porconfirmar">por confirmar</span>`
        : '<span class="doc-pendiente">Pendiente</span>'}</li>`;

  // Lo que EXISTE se enseña siempre: es lo que alguien puede necesitar copiar.
  const visibles = [...conCodigo, ...porConfirmar];
  const cabecera = barraDocumental(doc);

  if (enfoque || faltan.length === 0) {
    return cabecera + `<ul class="doc-lista">${doc.detalle.map(linea).join('')}</ul>` +
      ((doc.porConfirmar ?? 0)
        ? `<p class="capa-ayuda"><b>${num(doc.porConfirmar)} viene(n) de una activación anterior.</b>
             Nadie ha decidido todavía si amparan también estas fechas.</p>` : '');
  }

  return cabecera +
    (visibles.length ? `<ul class="doc-lista">${visibles.map(linea).join('')}</ul>` : '') +
    `<details class="doc-mas"><summary>${
      visibles.length ? `Faltan ${num(faltan.length)} de ${num(doc.total)}` : `Ninguno de los ${num(doc.total)} registrado`
    }</summary><ul class="doc-lista">${faltan.map(linea).join('')}</ul></details>`;
}

/**
 * Ficha de un PMT.
 * @param {object} pmt
 * @param {{relaciones?:Array, porId?:Map}} [contexto]
 */
/**
 * Historial de activaciones del PMT base al que pertenece este PMT.
 *
 * Solo aparece si hay MÁS DE UNA. Un bloque que dice «1 activación» en todos
 * los PMT que vienen de un KMZ sería ruido puro, y además daría a entender que
 * la plataforma sabe algo que no sabe: un KMZ no declara identidad de base.
 *
 * No hay ninguna valoración. Reactivar diez veces puede ser una obra compleja
 * bien gestionada o una mal planeada, y desde aquí no se puede distinguir.
 */
function historialBloque(pmt, contexto) {
  const todas = contexto.todas ?? [];
  if (!todas.length) return '';
  const bases = agruparPorBase(todas);
  const base = bases.get(baseDe(pmt));
  if (!base || base.veces <= 1) return '';
  const h = historialDeBase(base);

  return bloque('Activaciones de este PMT',
    `<div class="pista-campo" style="margin-bottom:6px">Es el <b>mismo cierre</b>, con el
       <b>mismo trazado</b>, ejecutado en ${num(h.veces)} periodos distintos.</div>
     <div class="historial">
       ${h.activaciones.map((a) => `
         ${a.diasDesdeLaAnterior !== null && a.diasDesdeLaAnterior !== undefined
    ? `<div class="historial-hueco">↕ ${num(a.diasDesdeLaAnterior)} día(s) sin actividad</div>` : ''}
         <div class="historial-fila${a.id === pmt.id ? ' actual' : ''}">
           <span class="historial-n">${esc(a.numero)}</span>
           <span>${esc(a.inicio ? a.inicio.slice(0, 10) : '—')} → ${esc(a.fin ? a.fin.slice(0, 10) : '—')}
             ${a.id === pmt.id ? '<b>(la que está viendo)</b>' : ''}</span>
           <span>${a.dias === null ? '—' : `${num(a.dias)} día(s)`}</span>
         </div>`).join('')}
     </div>
     ${h.diasTotales !== null ? `<div class="pista-campo">En total, <b>${num(h.diasTotales)} día(s)</b>
       de cierre en ${esc(h.anios.join(', '))}.</div>` : ''}`, num(h.veces));
}

export function fichaPmt(pmt, contexto = {}) {
  if (!pmt) return '<p class="ficha-vacia">Seleccione un PMT en el mapa o en la tabla para ver su ficha.</p>';
  const s = simbologiaDe(pmt.tipoCierre);
  const rels = (contexto.relaciones ?? []).filter((r) => r.idA === pmt.id || r.idB === pmt.id);
  const aLaVez = rels.filter((r) => estadoTemporal(r) === TEMPORAL.COINCIDE).length;
  const otros = new Set(rels.map((r) => (r.idA === pmt.id ? r.contratoB : r.contratoA)).filter(Boolean));

  return `
    <div class="ficha-titulo">${oNada(pmt.frente)}</div>
    <div class="ficha-sub">${muestraSvg(pmt.tipoCierre, { ancho: 30, alto: 12 })}
      ${esc(s.etiqueta)}</div>

    ${bloque('Quién lo ejecuta',
      filaKV('Contrato', `<span class="mono">${oNada(pmt.contrato)}</span>`) +
      filaKV('Contratista', oNada(pmt.contratista)) +
      filaKV('Proyecto', oNada(pmt.proyecto)))}

    ${bloque('Cuándo', pmt.vigenciaValida
      ? `<div class="ficha-dato"><b>${esc(fechaLegible(pmt.inicio))}</b><br>` +
        `<small>hasta</small> <b>${esc(fechaLegible(pmt.fin))}</b></div>`
      : `<div class="ficha-dato" style="color:var(--naranja-oscuro)">
           ${pmt.inicio ? `Desde <b>${esc(fechaLegible(pmt.inicio))}</b><br>` : ''}
           ${pmt.fin ? `Hasta <b>${esc(fechaLegible(pmt.fin))}</b><br>` : ''}
           <small>No entra en la comparación temporal: falta una de las dos fechas o no se pudo leer.</small>
         </div>`)}

    ${bloque('Dónde',
      filaKV('Municipio', oNada(pmt.municipio)) +
      `<div class="ficha-dato" style="margin-top:4px">${oNada(pmt.direccion)}</div>`)}

    ${bloque('Seguimiento documental', detalleDocumental(pmt, !!contexto.enfoqueDocumental))}

    ${bloque('Coordinación con otros contratos', rels.length
      ? filaKV('Comparten zona', `<b>${num(rels.length)}</b>`) +
        filaKV('Y además a la vez', `<b>${num(aLaVez)}</b>`) +
        filaKV('Contratos implicados', esc([...otros].sort().join(', ')))
      : '<div class="ficha-dato" style="color:var(--tenue)">Ninguna relación con otros contratos en el alcance actual.</div>')}

    ${historialBloque(pmt, contexto)}

    ${bloque('Origen y trazabilidad',
      filaKV('Archivo', `<small class="mono">${oNada(pmt.origenArchivo)}</small>`) +
      filaKV('Geometría', oNada(pmt.tipoGeometria)) +
      filaKV('Identificador', `<small class="mono">${oNada(pmt.id)}</small>`) +
      ((pmt.avisos ?? []).length
        ? `<div class="ficha-dato" style="margin-top:6px;color:var(--naranja-oscuro);font-size:.8rem">
             ${num(pmt.avisos.length)} aviso(s) de calidad:<br>${pmt.avisos.map((a) => esc(a)).join('<br>')}</div>`
        : ''))}
  `;
}

/**
 * Ficha de una RELACIÓN: explica por qué dos PMT están relacionados sin pedir
 * que nadie entienda geometría.
 */
export function fichaRelacion(rel, porId, { modelo = 'minima', radio = 120 } = {}) {
  if (!rel) {
    return `<p class="ficha-vacia">Elija una relación en el mapa o en la tabla
      para ver qué pasa y qué hay que hacer.</p>`;
  }
  const a = porId?.get(rel.idA), b = porId?.get(rel.idB);
  const e = estadoEspacial(rel), t = estadoTemporal(rel);
  const o = lecturaOperativaEnContexto(rel);
  const sA = simbologiaDe(a?.tipoCierre), sB = simbologiaDe(b?.tipoCierre);

  /* ── 1 · EL VEREDICTO, arriba y en una palabra ── */
  const CLASE = {
    [OPERATIVO.ARTICULACION_REQUERIDA]: 'veredicto-articula',
    [OPERATIVO.COINCIDENCIA_ESPACIAL]: 'veredicto-coincide',
    [OPERATIVO.NO_EVALUABLE]: 'veredicto-nosabe',
    [OPERATIVO.SIN_COINCIDENCIA]: 'veredicto-lejos',
  };
  /* ── 2 · QUÉ HAY QUE HACER. Es lo que se viene a buscar. ── */
  const ACCION = {
    [OPERATIVO.ARTICULACION_REQUERIDA]:
      'Coordinar programación, señalización y manejo del tránsito entre los dos responsables.',
    [OPERATIVO.COINCIDENCIA_ESPACIAL]:
      'Nada que coordinar por ahora: comparten sitio, pero no al mismo tiempo.',
    [OPERATIVO.NO_EVALUABLE]:
      'Revisar las fechas de los dos PMT: sin ellas no se puede saber si hay que coordinar.',
    [OPERATIVO.SIN_COINCIDENCIA]: 'No comparten espacio con el criterio vigente.',
  };

  const lugar = [a?.municipio ?? b?.municipio, a?.direccion].filter(Boolean).join(' · ');

  /* ── 3 · CUÁNDO, con fecha y hora exactas ── */
  const cuando = t === TEMPORAL.COINCIDE
    ? `<div class="rel-cuando">
         <div class="rel-cuando-rot">Coinciden</div>
         <div class="rel-cuando-fechas">
           <b>${esc(fechaLegible(rel.traslapeInicio))}</b>
           <span class="rel-a">a</span>
           <b>${esc(fechaLegible(rel.traslapeFin))}</b>
         </div>
         <div class="rel-cuando-dias">${num(rel.traslapeDias ?? 0)} día(s) en común</div>
       </div>`
    : t === TEMPORAL.NO_COINCIDE
      ? '<div class="rel-cuando neutro">Sus vigencias <b>no se solapan</b>: mismo sector, momentos distintos.</div>'
      : '<div class="rel-cuando aviso">No se pudo decidir: a alguno de los dos le falta una fecha.</div>';

  /* ── 4 · POR QUÉ, en una frase ── */
  const porQue = rel.zonasDeInfluenciaSeSuperponen && modelo === 'zonasDeInfluencia'
    ? `sus zonas de influencia de ${esc(radio)} m se superponen`
    : rel.distanciaMetros !== null && rel.distanciaMetros !== undefined
      ? `están a <b>${esc(rel.distanciaMetros.toFixed(0))} m</b>, dentro del umbral de ${esc(radio)} m`
      : 'no se pudo medir la distancia entre los dos trazados';
  const yAdemas = t === TEMPORAL.COINCIDE ? ' y <b>los dos están activos</b> durante ese periodo' : '';

  return `
    <div class="rel-veredicto ${CLASE[o]}">${esc(ETIQUETA_OPERATIVO[o])}</div>

    <div class="rel-partes">
      <div class="rel-parte">
        <span class="rel-marca" style="background:${sA.color}"></span>
        <b class="mono">${esc(rel.contratoA ?? '—')}</b>
        <span class="rel-frente">${esc(rel.frenteA ?? '—')}</span>
      </div>
      <div class="rel-flecha" aria-hidden="true">↔</div>
      <div class="rel-parte">
        <span class="rel-marca" style="background:${sB.color}"></span>
        <b class="mono">${esc(rel.contratoB ?? '—')}</b>
        <span class="rel-frente">${esc(rel.frenteB ?? '—')}</span>
      </div>
    </div>

    ${lugar ? `<div class="rel-lugar">📍 ${esc(lugar)}</div>` : ''}

    ${cuando}

    <div class="rel-porque"><b>Por qué:</b> ${porQue}${yAdemas}.</div>
    <div class="rel-accion"><b>Qué hacer:</b> ${esc(ACCION[o])}</div>

    <details class="rel-detalle">
      <summary>Detalle técnico</summary>
      ${filaKV('Distancia entre trazados', rel.distanciaMetros === null || rel.distanciaMetros === undefined
    ? 'no se pudo medir' : `<b>${esc(rel.distanciaMetros.toFixed(1))} m</b>`)}
      ${filaKV('¿Llegan a tocarse?', e === ESPACIAL.CONTACTO ? '<b>Sí</b>' : 'No')}
      ${filaKV('En el espacio', esc(ETIQUETA_ESPACIAL[e]))}
      ${rel.zonasDeInfluenciaSeSuperponen !== undefined
    ? filaKV(`Zonas de ${esc(radio)} m`, rel.zonasDeInfluenciaSeSuperponen
      ? `se superponen ${esc((rel.solapeDeZonasMetros ?? 0).toFixed(0))} m` : 'no se superponen') : ''}
      ${filaKV('Vigencia A', `${esc(fechaLegible(rel.vigenciaA?.inicio))} — ${esc(fechaLegible(rel.vigenciaA?.fin))}`)}
      ${filaKV('Vigencia B', `${esc(fechaLegible(rel.vigenciaB?.inicio))} — ${esc(fechaLegible(rel.vigenciaB?.fin))}`)}
      ${filaKV('Criterio espacial', modelo === 'zonasDeInfluencia'
    ? `zonas de ${esc(radio)} m que se superponen` : `distancia mínima ≤ ${esc(radio)} m`)}
      <p class="pista-campo">Son <b>hechos medidos</b>. La plataforma no clasifica criticidad.</p>
    </details>
  `;
}
