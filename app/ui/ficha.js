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
import { simbologiaDe, muestraSvg, estadoEspacial, estadoTemporal,
  ESPACIAL, TEMPORAL, ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL } from '../nucleo/modelo.js';
import { DOCUMENTOS } from '../../motor/src/modelo/documental.js';

const bloque = (rotulo, cuerpo) =>
  `<div class="ficha-bloque"><div class="ficha-rotulo">${esc(rotulo)}</div>${cuerpo}</div>`;
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

function detalleDocumental(pmt) {
  const doc = pmt.documental;
  if (!doc) return '';
  const lista = doc.detalle.map((d) => `<li>
      <span>${esc(d.etiqueta)}</span>
      ${d.codigo
        ? `<span class="doc-codigo">${esc(d.codigo)}</span>`
        : '<span class="doc-pendiente">Pendiente</span>'}
    </li>`).join('');
  return barraDocumental(doc) + `<ul class="doc-lista">${lista}</ul>` +
    (doc.sinNinguno
      ? '<p class="capa-ayuda">Todavía no se ha registrado ninguno. En un PMT recién creado es lo normal.</p>'
      : '');
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

  return bloque(`Activaciones de este PMT <span class="pastilla p-cerca">${num(h.veces)}</span>`,
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
       de cierre en ${esc(h.anios.join(', '))}.</div>` : ''}`);
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

    ${bloque('Seguimiento documental', detalleDocumental(pmt))}

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
  if (!rel) return '<p class="ficha-vacia">Seleccione una relación para ver por qué existe.</p>';
  const a = porId?.get(rel.idA), b = porId?.get(rel.idB);
  const e = estadoEspacial(rel), t = estadoTemporal(rel);
  const S = { A: '#009300', B: '#1565c0' };

  const porQue = rel.zonasDeInfluenciaSeSuperponen
    ? `Sus <b>zonas de influencia de ${esc(radio)} m se superponen</b> en unos ` +
      `<b>${esc((rel.solapeDeZonasMetros ?? 0).toFixed(0))} m</b>.`
    : rel.distanciaMetros !== null && rel.distanciaMetros !== undefined
      ? `Están a <b>${esc(rel.distanciaMetros.toFixed(1))} m</b>, dentro del umbral.`
      : 'No se pudo medir la distancia entre los dos trazados.';

  const cuando = t === TEMPORAL.COINCIDE
    ? `<div class="ficha-dato"><b style="color:var(--epm-naranja)">Coinciden en el tiempo</b><br>
         ${esc(fechaLegible(rel.traslapeInicio))} — ${esc(fechaLegible(rel.traslapeFin))}<br>
         <small>${num(rel.traslapeDias ?? 0)} día(s) en común</small></div>`
    : t === TEMPORAL.NO_COINCIDE
      ? '<div class="ficha-dato">Las vigencias <b>no se solapan</b>: afectan al mismo sector en momentos distintos.</div>'
      : '<div class="ficha-dato" style="color:var(--naranja-oscuro)">No se pudo decidir: falta alguna fecha.</div>';

  return `
    <div class="ficha-titulo">Relación entre dos contratos</div>
    <div class="ficha-sub">Lo que sigue son <b>hechos medidos</b>. No hay ninguna clasificación de criticidad.</div>

    ${bloque('Los dos PMT',
      `<div class="ficha-dato" style="border-left:4px solid ${S.A};padding-left:8px;margin-bottom:8px">
         <b>${esc(rel.contratoA ?? '')}</b><br><small>${esc(rel.frenteA ?? '')}</small></div>
       <div class="ficha-dato" style="border-left:4px solid ${S.B};padding-left:8px">
         <b>${esc(rel.contratoB ?? '')}</b><br><small>${esc(rel.frenteB ?? '')}</small></div>`)}

    ${bloque('Por qué están relacionados',
      `<div class="ficha-dato">${porQue}</div>` +
      filaKV('Distancia entre trazados', rel.distanciaMetros === null || rel.distanciaMetros === undefined
        ? 'no se pudo medir' : `<b>${esc(rel.distanciaMetros.toFixed(1))} m</b>`) +
      filaKV('¿Llegan a tocarse?', e === ESPACIAL.CONTACTO ? '<b>Sí</b>' : 'No') +
      filaKV('En el espacio', esc(ETIQUETA_ESPACIAL[e])))}

    ${bloque('Cuándo', cuando)}

    ${bloque('Vigencias',
      `<div class="ficha-dato"><span style="color:${S.A}">■</span> ${esc(fechaLegible(rel.vigenciaA?.inicio))} — ${esc(fechaLegible(rel.vigenciaA?.fin))}</div>
       <div class="ficha-dato"><span style="color:${S.B}">■</span> ${esc(fechaLegible(rel.vigenciaB?.inicio))} — ${esc(fechaLegible(rel.vigenciaB?.fin))}</div>`)}

    ${bloque('Con qué regla salió',
      filaKV('Criterio espacial', modelo === 'zonasDeInfluencia'
        ? `zonas de ${esc(radio)} m que se superponen`
        : 'distancia mínima entre trazados')
      + filaKV('Municipio', esc([rel.municipioA, rel.municipioB].filter(Boolean).join(' · ') || '—')))}
  `;
}
