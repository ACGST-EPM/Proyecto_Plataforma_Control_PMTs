/**
 * TABLAS — listado de PMT, de relaciones y de calidad de los datos.
 *
 * Sin DataTables ni jQuery: el tablero historico cargaba jQuery, DataTables,
 * Buttons y Select2 desde tres CDN distintas para hacer ordenar, filtrar y
 * exportar. Todo eso son ~300 KB de red que en un equipo corporativo sin salida
 * a internet simplemente no llegan, y la pagina se queda muerta. Ordenar una
 * tabla y exportarla son treinta lineas propias.
 */
import { $, esc, num, fechaLegible } from './dom.js';
import { estadoEspacial, estadoTemporal, lecturaOperativaEnContexto, ESPACIAL, TEMPORAL, OPERATIVO,
  ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL, ETIQUETA_OPERATIVO, EXPLICACION_OPERATIVO,
  LECTURA, simbologiaDe } from '../nucleo/modelo.js';
import { ETIQUETA_SITUACION } from '../nucleo/temporalidad.js';

const CLASE_ESPACIAL = {
  [ESPACIAL.CONTACTO]: 'p-contacto', [ESPACIAL.CERCANIA]: 'p-cerca',
  [ESPACIAL.FUERA]: 'p-lejos', [ESPACIAL.NO_EVALUABLE]: 'p-nosabe',
};
const CLASE_TEMPORAL = {
  [TEMPORAL.COINCIDE]: 'p-avez', [TEMPORAL.NO_COINCIDE]: 'p-otro',
  [TEMPORAL.NO_EVALUABLE]: 'p-nosabe',
};
// LECTURA OPERATIVA: va en su PROPIA columna, la primera, porque es la
// pregunta que se hace quien coordina. No sustituye a las dos de hechos: las
// tres se ven a la vez y se puede comprobar de donde sale.
const CLASE_OPERATIVO = {
  [OPERATIVO.ARTICULACION_REQUERIDA]: 'p-articula',
  [OPERATIVO.COINCIDENCIA_ESPACIAL]: 'p-coincide-esp',
  [OPERATIVO.SIN_COINCIDENCIA]: 'p-lejos',
  [OPERATIVO.NO_EVALUABLE]: 'p-nosabe',
};

const orden = { pmt: { col: 'frente', asc: true }, rel: { col: 'distanciaMetros', asc: true } };

/**
 * PAGINACION. Con 460 PMT y 174 relaciones, una sola tabla con scroll obliga a
 * arrastrar cientos de filas para llegar al final y hace que el navegador
 * mantenga miles de celdas vivas. Se pagina en bloques, con el tamano a
 * eleccion del usuario y con «todas» disponible para quien prefiera buscar con
 * Ctrl+F. No se restaura DataTables: ordenar y paginar son treinta lineas y no
 * justifican jQuery mas tres CDN.
 */
const TAMANOS = [50, 100, 250, 'todas'];
const pagina = { pmt: { n: 0, tam: 50 }, rel: { n: 0, tam: 50 } };

export function reiniciarPaginas() { pagina.pmt.n = 0; pagina.rel.n = 0; }

function recortar(datos, clave) {
  const p = pagina[clave];
  if (p.tam === 'todas') return { vista: datos, desde: 1, hasta: datos.length, paginas: 1 };
  const paginas = Math.max(1, Math.ceil(datos.length / p.tam));
  if (p.n >= paginas) p.n = paginas - 1;
  const desde = p.n * p.tam;
  return { vista: datos.slice(desde, desde + p.tam), desde: desde + 1, hasta: Math.min(desde + p.tam, datos.length), paginas };
}

function pintarPaginador(idCaja, clave, total, info, repintar) {
  const caja = $(idCaja);
  if (!caja) return;
  const p = pagina[clave];
  if (!total) { caja.innerHTML = ''; return; }
  const btn = (txt, destino, activo, titulo) =>
    `<button class="b-suave b-mini" data-ir="${destino}" ${activo ? '' : 'disabled'} title="${esc(titulo)}">${txt}</button>`;
  caja.innerHTML = `
    <span class="pista-campo">Mostrando <b>${num(info.desde)}–${num(info.hasta)}</b> de <b>${num(total)}</b></span>
    <span class="sep"></span>
    ${btn('« Primera', 0, p.n > 0, 'Ir a la primera página')}
    ${btn('‹ Anterior', p.n - 1, p.n > 0, 'Página anterior')}
    <span class="pista-campo">Página ${p.tam === 'todas' ? 1 : p.n + 1} de ${info.paginas}</span>
    ${btn('Siguiente ›', p.n + 1, p.n < info.paginas - 1, 'Página siguiente')}
    ${btn('Última »', info.paginas - 1, p.n < info.paginas - 1, 'Ir a la última página')}
    <label class="mini-campo">Filas
      <select data-tam>${TAMANOS.map((t) => `<option value="${t}"${String(t) === String(p.tam) ? ' selected' : ''}>${t}</option>`).join('')}</select>
    </label>`;
  caja.querySelectorAll('[data-ir]').forEach((b) => {
    b.onclick = () => { p.n = +b.dataset.ir; repintar(); };
  });
  const sel = caja.querySelector('[data-tam]');
  if (sel) sel.onchange = (e) => {
    p.tam = e.target.value === 'todas' ? 'todas' : +e.target.value;
    p.n = 0; repintar();
  };
}

function ordenar(filas, col, asc) {
  return [...filas].sort((a, b) => {
    const x = a[col], y = b[col];
    if (x === null || x === undefined) return 1;      // lo desconocido, al final
    if (y === null || y === undefined) return -1;
    const c = typeof x === 'number' && typeof y === 'number'
      ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
    return asc ? c : -c;
  });
}

function cabecera(cols, clave, alOrdenar) {
  return '<tr>' + cols.map(([c, t, cl]) => {
    const act = orden[clave].col === c;
    const flecha = act ? (orden[clave].asc ? '▲' : '▼') : '⇅';
    return `<th data-col="${esc(c)}" class="${cl ?? ''}" title="Ordenar por ${esc(t)}">${esc(t)} <span class="orden">${flecha}</span></th>`;
  }).join('') + '</tr>';
}

function conectarOrden(tabla, clave, repintar) {
  tabla.querySelectorAll('th[data-col]').forEach((th) => {
    th.onclick = () => {
      const c = th.dataset.col;
      if (orden[clave].col === c) orden[clave].asc = !orden[clave].asc;
      else { orden[clave].col = c; orden[clave].asc = true; }
      repintar();
    };
  });
}

/**
 * COLUMNAS DE LA TABLA DE PMT.
 *
 * ══ POCAS DE ENTRADA, TODAS DISPONIBLES ═══════════════════════════════════
 *
 * Antes se enseñaban las diez a la vez. Con nombres de contratista como
 * «CONSORCIO_INFRAESTRUCTURA_DE_AGUAS_2024» la tabla se iba de ancho y no se
 * leia ninguna. Ahora entran siete de alto valor y el resto se añade desde
 * «Columnas».
 *
 * `basica: true` marca las que salen por defecto. El criterio: responder
 * «que es, de quien, donde, cuando y como va» sin desplazamiento horizontal.
 */
const COLS_PMT = [
  // EL NOMBRE VA PRIMERO. La situación es útil, pero en la vista operativa es
  // la misma en casi todas las filas, y la primera columna es la que se usa
  // para ENCONTRAR la fila que se busca. Gastarla en una pastilla repetida
  // empuja el identificador a segundo plano por nada.
  ['frente', 'Frente', { basica: true }],
  ['situacion', 'Situación', { basica: true }],
  ['contrato', 'Contrato', { basica: true }],
  ['municipio', 'Municipio', { basica: true }],
  ['tipoCierre', 'Tipo', { basica: true }],
  ['inicio', 'Desde', { basica: true }],
  ['fin', 'Hasta', { basica: true }],
  ['documental', 'Documentos', { basica: true }],
  ['contratista', 'Contratista', {}],
  ['proyecto', 'Proyecto', {}],
  ['direccion', 'Direccion', {}],
  ['resolucionPmt', 'Resolucion PMT', {}],
  ['permisoRotura', 'Permiso rotura', {}],
  ['cierrePermisoRotura', 'Cierre rotura', {}],
  ['activacion', 'Activacion', {}],
  ['tipoGeometria', 'Geometria', {}],
  ['origenArchivo', 'Archivo', {}],
];

export const COLUMNAS_PMT_BASICAS = Object.freeze(COLS_PMT.filter((c) => c[2]?.basica).map((c) => c[0]));
export const COLUMNAS_PMT_TODAS = Object.freeze(COLS_PMT.map(([k, t]) => ({ clave: k, titulo: t })));

/** Celda de cada columna. Una sola definicion: cabecera y celda no pueden separarse. */
function celdaPmt(x, clave) {
  switch (clave) {
    case 'situacion': {
      // La situacion es DERIVADA de la fecha de referencia, y la pone quien
      // pinta la tabla (`x._situacion`). Si no viene, no se inventa ninguna.
      const sit = x._situacion;
      if (!sit) return '<td>—</td>';
      return `<td><span class="pastilla p-${esc(sit)}">${esc(ETIQUETA_SITUACION[sit] ?? sit)}</span></td>`;
    }
    case 'activacion': {
      const a = x.activacion;
      if (!a || !a.de || a.de <= 1) return '<td><small style="color:var(--tenue)">única</small></td>';
      return `<td><span class="pastilla p-cerca" title="Este PMT se ha activado ${esc(a.de)} veces">` +
        `${esc(a.numero)} de ${esc(a.de)}</span></td>`;
    }
    case 'frente': {
      const problema = !x.vigenciaValida || !x.tieneGeometria;
      const marca = problema
        ? ` <span class="pastilla p-nosabe" title="${esc((x.avisos ?? []).join(' · '))}">revisar</span>` : '';
      return `<td>${esc(x.frente ?? '—')}${marca}</td>`;
    }
    case 'contrato': return `<td class="mono">${esc(x.contrato ?? '—')}</td>`;
    case 'tipoCierre':
      return `<td><span class="punto-cierre" style="background:${simbologiaDe(x.tipoCierre).color}"></span>${esc(x.tipoCierre ?? '—')}</td>`;
    case 'inicio': return `<td class="mono">${esc(fechaLegible(x.inicio))}</td>`;
    case 'fin': return `<td class="mono">${esc(fechaLegible(x.fin))}</td>`;
    case 'documental': {
      const d = x.documental;
      if (!d) return '<td>—</td>';
      const clase = d.completo ? 'p-ok' : d.sinNinguno ? 'p-gris' : 'p-parcial';
      return `<td><span class="pastilla ${clase}" title="${esc(d.detalle.map((y) => y.etiqueta + ': ' + y.estado).join(' · '))}">${esc(d.resumen)}</span></td>`;
    }
    case 'resolucionPmt': case 'permisoRotura': case 'cierrePermisoRotura': {
      if (x[clave]) return `<td class="mono"><small>${esc(x[clave])}</small></td>`;
      const previo = x.documental?.detalle?.find((d) => d.clave === clave)?.codigoPrevio;
      // El documento de la activación anterior NO ocupa esta casilla: cada
      // vigencia lleva el suyo, así que esto está PENDIENTE. El número anterior
      // va debajo, en letra menuda, como referencia para buscar el expediente.
      return `<td><span class="doc-pendiente">Pendiente</span>${previo
        ? `<div class="doc-previo" title="Es el de la activación anterior. Esta vigencia necesita el suyo.">la anterior tuvo <span class="mono">${esc(previo)}</span></div>`
        : ''}</td>`;
    }
    case 'origenArchivo': return `<td><small>${esc(x.origenArchivo ?? '—')}</small></td>`;
    case 'tipoGeometria': return `<td>${esc(x.tipoGeometria ?? 'sin geometria')}</td>`;
    default: return `<td>${esc(x[clave] ?? '—')}</td>`;
  }
}

/** Tabla de PMT. Al pulsar una fila, el mapa se acerca a ese trazado. */
export function pintarPmts(filas, { onFila, seleccionado, columnas } = {}) {
  const tabla = $('tablaPmt');
  const activas = columnas?.length ? columnas : COLUMNAS_PMT_BASICAS;
  const cols = COLS_PMT.filter(([k]) => activas.includes(k)).map(([k, t]) => [k, t]);
  const repintar = () => pintarPmts(filas, { onFila, seleccionado, columnas });
  tabla.querySelector('thead').innerHTML = cabecera(cols, 'pmt');
  conectarOrden(tabla, 'pmt', repintar);

  const todos = ordenar(filas, orden.pmt.col, orden.pmt.asc);
  const info = recortar(todos, 'pmt');
  const datos = info.vista;
  const cuerpo = tabla.querySelector('tbody');
  pintarPaginador('pagPmt', 'pmt', todos.length, info, repintar);
  if (!todos.length) {
    cuerpo.innerHTML = `<tr><td colspan="${cols.length}" class="vacio">Ningún PMT coincide con los filtros aplicados.<br><small>Pruebe a quitar algún filtro.</small></td></tr>`;
    return;
  }
  cuerpo.innerHTML = datos.map((x) =>
    `<tr data-id="${esc(x.id)}" class="${x.id === seleccionado ? 'sel' : ''}">` +
    cols.map(([k]) => celdaPmt(x, k)).join('') + '</tr>').join('');
  cuerpo.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.onclick = () => onFila?.(tr.dataset.id);
  });
}

/**
 * VISTA DE SEGUIMIENTO DOCUMENTAL.
 *
 * Existe como pestaña propia y no como columnas del mapa por una razon: son
 * datos de TRAMITE, no de territorio. Meterlos en el mapa lo satura y no
 * aportan nada a la lectura espacial; en su propia vista, en cambio, se puede
 * ver de un golpe a cuantos PMT les falta cada documento.
 */
export function pintarDocumental(filas, { onFila } = {}) {
  const caja = $('panelDocumental');
  if (!caja) return;
  const conteo = { completos: 0, sinNinguno: 0, resolucionPmt: 0, permisoRotura: 0, cierrePermisoRotura: 0, conPrevio: 0 };
  for (const x of filas) {
    const d = x.documental;
    if (!d) continue;
    if (d.completo) conteo.completos++;
    if (d.sinNinguno) conteo.sinNinguno++;
    if ((d.conPrevio ?? 0) > 0) conteo.conPrevio++;
    for (const p of d.pendientes) conteo[p]++;
  }
  const t = (n, txt, clase = '') =>
    `<div class="tarjeta ${clase}"><div class="n">${num(n)}</div><div class="t">${esc(txt)}</div></div>`;

  const pendientes = filas.filter((x) => !x.documental?.completo);
  const filasHtml = pendientes.slice(0, 400).map((x) => {
    const d = x.documental;
    const celda = (clave) => {
      if (x[clave]) return `<td class="mono"><small>${esc(x[clave])}</small></td>`;
      // Cada activación tiene sus propios documentos, así que esto está
      // PENDIENTE. Si la activación anterior tuvo el suyo, se dice al lado como
      // historia: sirve para saber que el trámite ya se hizo alguna vez, y no
      // rebaja en nada lo que falta aquí.
      const previo = d?.detalle?.find((y) => y.clave === clave)?.codigoPrevio;
      return `<td><span class="doc-pendiente">Pendiente</span>${previo
        ? `<div class="doc-previo" title="Es el de la activación anterior. Esta vigencia necesita el suyo.">la anterior tuvo ${esc(previo)}</div>`
        : ''}</td>`;
    };
    return `<tr data-id="${esc(x.id)}">
      <td>${esc(x.frente ?? '—')}</td>
      <td class="mono">${esc(x.contrato ?? '—')}</td>
      <td>${esc(x.municipio ?? '—')}</td>
      ${celda('resolucionPmt')}${celda('permisoRotura')}${celda('cierrePermisoRotura')}
      <td><span class="pastilla ${d?.sinNinguno ? 'p-gris' : 'p-parcial'}">${esc(d?.resumen ?? '—')}</span></td>
    </tr>`;
  }).join('');

  caja.innerHTML = `
    <p class="pista-campo" style="margin-top:0">
      El <b>código</b> y el <b>estado</b> van separados a propósito. Cuando un documento no existe,
      la casilla queda <b>vacía</b> y el estado es <b>Pendiente</b>: escribir «Pendiente» como si fuera
      el número de la resolución haría imposible distinguirlo de un código de verdad.
    </p>
    ${conteo.conPrevio ? `<p class="frase" style="font-size:.86rem">
      <b>${num(conteo.conPrevio)} PMT reactivado${conteo.conPrevio === 1 ? '' : 's'}
      ${conteo.conPrevio === 1 ? 'arrastra' : 'arrastran'} el número de documento de su activación
      anterior.</b> Sigue apareciendo <b>Pendiente</b>, y es correcto: cada vigencia lleva su propia
      resolución y su propio permiso de rotura. El número anterior se muestra al lado únicamente
      para saber que ese trámite ya se hizo antes para este mismo cierre.
    </p>` : ''}
    <div class="tarjetas" style="margin-bottom:16px">
      ${t(conteo.completos, 'con los 3 documentos', conteo.completos ? 'verde' : 'gris')}
      ${t(conteo.resolucionPmt, 'sin Resolución PMT', conteo.resolucionPmt ? 'nar' : '')}
      ${t(conteo.permisoRotura, 'sin Permiso de rotura', conteo.permisoRotura ? 'nar' : '')}
      ${t(conteo.cierrePermisoRotura, 'sin Cierre de rotura', conteo.cierrePermisoRotura ? 'nar' : '')}
      ${t(conteo.sinNinguno, 'sin ningún documento', 'gris')}
    </div>
    ${pendientes.length ? `
      <h3 class="titulo-grupo">PMT con documentación pendiente</h3>
      <div class="tabla-caja"><table class="datos">
        <thead><tr><th>Frente</th><th>Contrato</th><th>Municipio</th>
          <th>Resolución PMT</th><th>Permiso rotura</th><th>Cierre rotura</th><th>Estado</th></tr></thead>
        <tbody>${filasHtml}</tbody>
      </table></div>
      ${pendientes.length > 400 ? `<p class="pista-campo">Se listan los primeros 400 de ${num(pendientes.length)}.</p>` : ''}
    ` : '<div class="frase">Todos los PMT del alcance actual tienen sus tres documentos registrados.</div>'}`;

  caja.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => onFila?.(tr.dataset.id); });
}

/**
 * COLUMNAS DE LA TABLA DE RELACIONES.
 *
 * ══ TRES SON FIJAS, Y NO ES UN CAPRICHO ═══════════════════════════════════
 *
 * `fija: true` marca las que NO se pueden quitar: la lectura operativa y los
 * dos hechos de los que se deduce (espacio y tiempo). El invariante de la
 * etapa anterior dice que la lectura no sustituye a los hechos, y que las tres
 * se ven a la vez para poder comprobar de donde sale. Si el selector dejara
 * apagar «En el espacio», la lectura quedaria sola y afirmando por su cuenta,
 * que es justo lo que ese invariante impide. Un selector de columnas no puede
 * deshacer una garantia del producto.
 *
 * `basica: true` marca las que salen por defecto. El resto existe y se añade
 * desde «Columnas»: no se ha quitado nada.
 */
const COLS_REL = [
  ['_operativo', 'Lectura', null, { fija: true }],
  ['contratoA', 'Contrato A', null, { basica: true }], ['frenteA', 'Frente A', null, { basica: true }],
  ['contratoB', 'Contrato B', null, { basica: true }], ['frenteB', 'Frente B', null, { basica: true }],
  ['distanciaMetros', 'Distancia', 'num', { basica: true }],
  ['_espacial', 'En el espacio', null, { fija: true }], ['_temporal', 'En el tiempo', null, { fija: true }],
  ['traslapeInicio', 'Coinciden desde', null, {}], ['traslapeDias', 'Dias', 'num', {}],
];

export const COLUMNAS_REL_BASICAS = Object.freeze(COLS_REL.filter((c) => c[3]?.basica).map((c) => c[0]));
/** Solo las que se pueden elegir: las fijas no se ofrecen porque no se pueden quitar. */
export const COLUMNAS_REL_ELEGIBLES = Object.freeze(
  COLS_REL.filter((c) => !c[3]?.fija).map(([k, t]) => ({ clave: k, titulo: t })));

/** Celda de cada columna de relacion. Una sola definicion para cabecera y celda. */
function celdaRel(r, clave) {
  const e = estadoEspacial(r), t = estadoTemporal(r), o = lecturaOperativaEnContexto(r);
  switch (clave) {
    case '_operativo':
      return `<td><span class="pastilla ${CLASE_OPERATIVO[o]}" title="${esc(EXPLICACION_OPERATIVO[o])}">${esc(ETIQUETA_OPERATIVO[o])}</span></td>`;
    case 'contratoA': return `<td class="mono">${esc(r.contratoA)}</td>`;
    case 'frenteA': return `<td>${esc(r.frenteA ?? '—')}</td>`;
    case 'contratoB': return `<td class="mono">${esc(r.contratoB)}</td>`;
    case 'frenteB': return `<td>${esc(r.frenteB ?? '—')}</td>`;
    case 'distanciaMetros':
      return `<td class="num">${r.distanciaMetros === null || r.distanciaMetros === undefined
        ? '<span class="pastilla p-nosabe">no medible</span>' : esc(r.distanciaMetros.toFixed(1)) + ' m'}</td>`;
    case '_espacial': return `<td><span class="pastilla ${CLASE_ESPACIAL[e]}">${esc(ETIQUETA_ESPACIAL[e])}</span></td>`;
    case '_temporal': return `<td><span class="pastilla ${CLASE_TEMPORAL[t]}">${esc(ETIQUETA_TEMPORAL[t])}</span></td>`;
    case 'traslapeInicio': return `<td class="mono">${esc(r.traslapeInicio ? fechaLegible(r.traslapeInicio) : '—')}</td>`;
    case 'traslapeDias': return `<td class="num">${esc(r.traslapeDias ?? '—')}</td>`;
    default: return '<td>—</td>';
  }
}

/** Tabla de relaciones. Hechos separados; ninguna criticidad. */
export function pintarRelaciones(relaciones, { onFila, columnas } = {}) {
  const tabla = $('tablaRel');
  const repintar = () => pintarRelaciones(relaciones, { onFila, columnas });
  // Las fijas entran SIEMPRE, se pidan o no; las demas, si estan elegidas.
  const pedidas = columnas?.length ? columnas : COLUMNAS_REL_BASICAS;
  const activas = COLS_REL.filter(([k, , , o]) => o?.fija || pedidas.includes(k));
  tabla.querySelector('thead').innerHTML = cabecera(activas.map(([k, t, c]) => [k, t, c]), 'rel');
  conectarOrden(tabla, 'rel', repintar);

  const conEstado = relaciones.map((r) => ({
    ...r, _espacial: ETIQUETA_ESPACIAL[estadoEspacial(r)], _temporal: ETIQUETA_TEMPORAL[estadoTemporal(r)],
    _operativo: ETIQUETA_OPERATIVO[lecturaOperativaEnContexto(r)],
  }));
  const todos = ordenar(conEstado, orden.rel.col, orden.rel.asc);
  const info = recortar(todos, 'rel');
  const datos = info.vista;
  const cuerpo = tabla.querySelector('tbody');
  pintarPaginador('pagRel', 'rel', todos.length, info, repintar);
  if (!todos.length) {
    cuerpo.innerHTML = `<tr><td colspan="${activas.length}" class="vacio">No hay relaciones que mostrar con los filtros aplicados.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = datos.map((r, i) =>
    `<tr data-i="${i}">${activas.map(([k]) => celdaRel(r, k)).join('')}</tr>`).join('');
  cuerpo.querySelectorAll('tr[data-i]').forEach((tr) => {
    tr.onclick = () => onFila?.(datos[+tr.dataset.i]);
  });
}

const CLASE_ARCHIVO = {
  [LECTURA.COMPLETA]: 'p-ok', [LECTURA.PARCIAL]: 'p-parcial', [LECTURA.FALLIDA]: 'p-fallo',
};

/**
 * Panel de calidad. Es donde se cumple la regla central de la etapa: que sea
 * imposible confundir "no se encontro relacion" con "no se pudo analizar".
 */
export function pintarCalidad(diagnosticos, resumen, avisosPorPmt) {
  const caja = $('panelCalidad');
  const trozos = [];

  // ALCANCE: esta pestana habla SIEMPRE de todo lo cargado. Decirlo evita que
  // parezca que contradice a las otras tres, que hablan de lo visible.
  trozos.push(`<h3 style="margin:0 0 10px;font-size:.95rem">Archivos seleccionados ` +
    `<small style="font-weight:400;color:#6b7075">· ${num(resumen.pmtsCargados ?? resumen.pmts)} PMT cargados en total</small></h3>`);
  for (const d of diagnosticos) {
    const motivos = d.motivos.length
      ? '<ul>' + d.motivos.map((m) => `<li>${esc(m.simple)}</li>`).join('') + '</ul>' : '';
    trozos.push(`<div class="archivo ${esc(d.estado)}">
      <span class="pastilla ${CLASE_ARCHIVO[d.estado]}">${esc(d.etiqueta)}</span>
      <div class="crece">
        <div class="nom">${esc(d.nombre)}</div>
        <div style="font-size:.82rem;color:#6b7075">${num(d.trazados)} trazado(s) leido(s)</div>
        ${motivos}
      </div>
    </div>`);
  }

  if (resumen.espacialNoEval || resumen.temporalNoEval) {
    trozos.push(`<div class="frase atencion" style="margin-top:14px">
      <b>Hay comprobaciones que no se pudieron completar.</b><br>
      ${resumen.espacialNoEval ? `${num(resumen.espacialNoEval)} pareja(s) cuya <b>distancia no se pudo medir</b>. ` : ''}
      ${resumen.temporalNoEval ? `${num(resumen.temporalNoEval)} pareja(s) cuyas <b>fechas no permiten decidir</b> si coinciden. ` : ''}
      Esto <b>no</b> quiere decir que no haya interferencia: quiere decir que no se pudo comprobar.
    </div>`);
  }

  const problemas = [
    ['Sin geometria utilizable', resumen.sinGeometria],
    ['Con fechas que no se pudieron interpretar', resumen.sinVigenciaValida],
    ['Sin contrato (no entran en el analisis de interferencias)', resumen.sinContrato],
    ['Sin municipio', resumen.sinMunicipio],
    ['Duplicados exactos dentro de un mismo archivo', resumen.duplicados],
    ['Identificador repetido en el KMZ para trazados distintos', resumen.idsRepetidos],
  ].filter(([, n]) => n > 0);

  if (problemas.length) {
    trozos.push('<h3 style="margin:18px 0 8px;font-size:.95rem">Datos incompletos en los trazados</h3>');
    trozos.push('<table class="datos"><tbody>' + problemas.map(([t, n]) =>
      `<tr><td>${esc(t)}</td><td class="num"><b>${num(n)}</b></td></tr>`).join('') + '</tbody></table>');
  }

  if (avisosPorPmt?.length) {
    const lista = avisosPorPmt.slice(0, 200).map((x) =>
      `<tr><td class="mono">${esc(x.contrato ?? '—')}</td><td>${esc(x.frente ?? '—')}</td>
       <td><small>${esc(x.origenArchivo ?? '')}</small></td>
       <td>${x.avisos.map((a) => `<div>${esc(a)}</div>`).join('')}</td></tr>`).join('');
    trozos.push(`<details class="tecnico" open style="margin-top:18px">
      <summary>Detalle tecnico: ${num(avisosPorPmt.length)} trazado(s) con avisos${avisosPorPmt.length > 200 ? ' (se muestran los 200 primeros)' : ''}</summary>
      <div class="tabla-caja" style="margin-top:8px"><table class="datos">
        <thead><tr><th>Contrato</th><th>Frente</th><th>Archivo</th><th>Aviso</th></tr></thead>
        <tbody>${lista}</tbody></table></div></details>`);
  }

  if (!problemas.length && !avisosPorPmt?.length && diagnosticos.every((d) => d.estado === LECTURA.COMPLETA)) {
    trozos.push('<div class="frase" style="margin-top:14px"><b>Todo correcto.</b> Todos los archivos se leyeron completos y ningun trazado presenta problemas de datos.</div>');
  }

  caja.innerHTML = trozos.join('');
}

/**
 * PARES ESPACIALMENTE NO EVALUABLES.
 *
 * El motor los conserva con su motivo, pero la Etapa 2.1 los perdia por el
 * camino: solo quedaba un contador. Un par no evaluable NO es "lejos" ni "sin
 * relacion": es una comprobacion que no se pudo hacer, y quien decide necesita
 * poder mirarla una por una.
 */
export function pintarNoEvaluables(pares, porId) {
  const caja = $('panelNoEval');
  if (!caja) return;
  if (!pares.length) {
    caja.innerHTML = `<div class="frase"><b>No hay ningún par sin evaluar.</b> Todas las parejas de
      contratos distintos se pudieron medir.</div>`;
    return;
  }
  const filas = pares.map((h) => {
    const a = porId.get(h.idA), b = porId.get(h.idB);
    const motivo = (h.avisos ?? h.errores ?? []).join(' · ') || h.motivoNoEvaluable || 'sin motivo registrado';
    return `<tr>
      <td class="mono">${esc(h.contratoA ?? a?.contrato ?? '—')}</td>
      <td>${esc(h.frenteA ?? a?.frente ?? '—')}</td>
      <td class="mono">${esc(h.contratoB ?? b?.contrato ?? '—')}</td>
      <td>${esc(h.frenteB ?? b?.frente ?? '—')}</td>
      <td><span class="pastilla p-nosabe">No se pudo medir</span></td>
      <td><small>${esc(motivo)}</small></td>
    </tr>`;
  }).join('');
  caja.innerHTML = `
    <div class="frase atencion">
      <b>${num(pares.length)} pareja(s) cuya distancia no se pudo determinar.</b>
      Esto <b>no</b> significa que estén lejos ni que no haya interferencia: significa que
      <b>no se pudo comprobar</b>. Revíselas una a una y, si hace falta, corrija los trazados en origen.
    </div>
    <div class="tabla-caja"><table class="datos">
      <thead><tr><th>Contrato A</th><th>Frente A</th><th>Contrato B</th><th>Frente B</th><th>Estado</th><th>Motivo</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
}
