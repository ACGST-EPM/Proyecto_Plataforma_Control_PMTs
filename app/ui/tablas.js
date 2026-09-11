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
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL,
  ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL, LECTURA, simbologiaDe } from '../nucleo/modelo.js';

const CLASE_ESPACIAL = {
  [ESPACIAL.CONTACTO]: 'p-contacto', [ESPACIAL.CERCANIA]: 'p-cerca',
  [ESPACIAL.FUERA]: 'p-lejos', [ESPACIAL.NO_EVALUABLE]: 'p-nosabe',
};
const CLASE_TEMPORAL = {
  [TEMPORAL.COINCIDE]: 'p-avez', [TEMPORAL.NO_COINCIDE]: 'p-otro',
  [TEMPORAL.NO_EVALUABLE]: 'p-nosabe',
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

const COLS_PMT = [
  ['frente', 'Frente'], ['contrato', 'Contrato'], ['contratista', 'Contratista'],
  ['proyecto', 'Proyecto'], ['municipio', 'Municipio'], ['tipoCierre', 'Tipo de cierre'],
  ['inicio', 'Desde'], ['fin', 'Hasta'], ['tipoGeometria', 'Geometria'], ['origenArchivo', 'Archivo'],
];

/** Tabla de PMT. Al pulsar una fila, el mapa se acerca a ese trazado. */
export function pintarPmts(filas, { onFila, seleccionado } = {}) {
  const tabla = $('tablaPmt');
  const repintar = () => pintarPmts(filas, { onFila, seleccionado });
  tabla.querySelector('thead').innerHTML = cabecera(COLS_PMT, 'pmt');
  conectarOrden(tabla, 'pmt', repintar);

  const todos = ordenar(filas, orden.pmt.col, orden.pmt.asc);
  const info = recortar(todos, 'pmt');
  const datos = info.vista;
  const cuerpo = tabla.querySelector('tbody');
  pintarPaginador('pagPmt', 'pmt', todos.length, info, repintar);
  if (!todos.length) {
    cuerpo.innerHTML = `<tr><td colspan="${COLS_PMT.length}" class="vacio">Ningún PMT coincide con los filtros aplicados.<br><small>Pruebe a quitar algún filtro.</small></td></tr>`;
    return;
  }
  cuerpo.innerHTML = datos.map((x) => {
    const problema = !x.vigenciaValida || !x.tieneGeometria;
    const marca = problema
      ? ` <span class="pastilla p-nosabe" title="${esc((x.avisos ?? []).join(' · '))}">revisar</span>` : '';
    return `<tr data-id="${esc(x.id)}" class="${x.id === seleccionado ? 'sel' : ''}">
      <td>${esc(x.frente ?? '—')}${marca}</td>
      <td class="mono">${esc(x.contrato ?? '—')}</td>
      <td>${esc(x.contratista ?? '—')}</td>
      <td>${esc(x.proyecto ?? '—')}</td>
      <td>${esc(x.municipio ?? '—')}</td>
      <td><span class="punto-cierre" style="background:${simbologiaDe(x.tipoCierre).color}"></span>${esc(x.tipoCierre ?? '—')}</td>
      <td class="mono">${esc(fechaLegible(x.inicio))}</td>
      <td class="mono">${esc(fechaLegible(x.fin))}</td>
      <td>${esc(x.tipoGeometria ?? 'sin geometria')}</td>
      <td><small>${esc(x.origenArchivo ?? '—')}</small></td>
    </tr>`;
  }).join('');
  cuerpo.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.onclick = () => onFila?.(tr.dataset.id);
  });
}

const COLS_REL = [
  ['contratoA', 'Contrato A'], ['frenteA', 'Frente A'], ['contratoB', 'Contrato B'], ['frenteB', 'Frente B'],
  ['distanciaMetros', 'Distancia', 'num'], ['_espacial', 'En el espacio'], ['_temporal', 'En el tiempo'],
  ['traslapeInicio', 'Coinciden desde'], ['traslapeDias', 'Dias', 'num'],
];

/** Tabla de relaciones. Hechos separados; ninguna criticidad. */
export function pintarRelaciones(relaciones, { onFila } = {}) {
  const tabla = $('tablaRel');
  const repintar = () => pintarRelaciones(relaciones, { onFila });
  tabla.querySelector('thead').innerHTML = cabecera(COLS_REL, 'rel');
  conectarOrden(tabla, 'rel', repintar);

  const conEstado = relaciones.map((r) => ({
    ...r, _espacial: ETIQUETA_ESPACIAL[estadoEspacial(r)], _temporal: ETIQUETA_TEMPORAL[estadoTemporal(r)],
  }));
  const todos = ordenar(conEstado, orden.rel.col, orden.rel.asc);
  const info = recortar(todos, 'rel');
  const datos = info.vista;
  const cuerpo = tabla.querySelector('tbody');
  pintarPaginador('pagRel', 'rel', todos.length, info, repintar);
  if (!todos.length) {
    cuerpo.innerHTML = `<tr><td colspan="${COLS_REL.length}" class="vacio">No hay relaciones que mostrar con los filtros aplicados.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = datos.map((r, i) => {
    const e = estadoEspacial(r), t = estadoTemporal(r);
    return `<tr data-i="${i}">
      <td class="mono">${esc(r.contratoA)}</td><td>${esc(r.frenteA ?? '—')}</td>
      <td class="mono">${esc(r.contratoB)}</td><td>${esc(r.frenteB ?? '—')}</td>
      <td class="num">${r.distanciaMetros === null || r.distanciaMetros === undefined
        ? '<span class="pastilla p-nosabe">no medible</span>' : esc(r.distanciaMetros.toFixed(1)) + ' m'}</td>
      <td><span class="pastilla ${CLASE_ESPACIAL[e]}">${esc(ETIQUETA_ESPACIAL[e])}</span></td>
      <td><span class="pastilla ${CLASE_TEMPORAL[t]}">${esc(ETIQUETA_TEMPORAL[t])}</span></td>
      <td class="mono">${esc(r.traslapeInicio ? fechaLegible(r.traslapeInicio) : '—')}</td>
      <td class="num">${esc(r.traslapeDias ?? '—')}</td>
    </tr>`;
  }).join('');
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

  trozos.push('<h3 style="margin:0 0 10px;font-size:.95rem">Archivos seleccionados</h3>');
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
