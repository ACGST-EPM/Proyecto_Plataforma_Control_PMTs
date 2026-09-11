/**
 * INFORME EJECUTIVO.
 *
 * QUE CAMBIA FRENTE AL INFORME HISTORICO
 * Aquel tenia buenas ideas —portada con identidad EPM, tarjetas de cifras,
 * resumen, detalle y barras de avance en el tiempo— pero dependia de html2pdf
 * (una CDN mas) y, sobre todo, EL MAPA HABIA QUE ADJUNTARLO A MANO: el usuario
 * tenia que hacer una captura de pantalla y subirla con un selector de archivo.
 * Aqui el mapa se dibuja solo, a partir de las mismas geometrias que se estan
 * viendo, con la misma simbologia y la misma leyenda.
 *
 * COMO SE PRODUCE EL PDF
 * Con la impresion del propio navegador (Ctrl+P → «Guardar como PDF»). No es
 * un atajo: html2pdf rasteriza la pagina y produce un PDF borroso y pesado,
 * mientras que la impresion nativa da texto seleccionable, vectorial, con
 * saltos de pagina correctos y sin descargar 300 KB de libreria. El informe
 * lleva su propia hoja de estilos de impresion.
 *
 * NO CLASIFICA CRITICIDAD. Presenta hechos medidos. Ninguna relacion se marca
 * como critica, alta o media: esa decision operativa aun no esta tomada, y un
 * informe que la insinuara induciria a actuar sobre una regla inexistente.
 */
import { $, esc, num, fechaLegible, soloDia } from './dom.js';
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL,
  ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL, simbologiaDe, TIPOS_CIERRE, LECTURA } from '../nucleo/modelo.js';
import { rangoTemporal } from '../nucleo/filtrado.js';
import { centroDe } from './mapa.js';

/* ───────────────── Mini-mapa vectorial propio para el informe ───────────────── */

/**
 * Dibuja las geometrias en un SVG con proyeccion Web Mercator simple.
 *
 * Se hace aparte en vez de capturar el lienzo de Leaflet porque capturar el
 * mapa exigiria `crossOrigin` en las teselas —que es EXACTAMENTE lo que rompia
 * el mapa base— o depender de que el fondo haya cargado. Este mapa sale siempre,
 * con o sin internet, y como es vectorial se imprime nitido a cualquier tamano.
 */
export function mapaSvg(filas, relaciones, porId, { ancho = 1000, alto = 620 } = {}) {
  const proy = ([lon, lat]) => {
    const x = (lon + 180) / 360;
    const s = Math.sin((lat * Math.PI) / 180);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return [x, y];
  };

  const puntos = [];
  const recoge = (g) => {
    if (!g) return;
    if (g.type === 'GeometryCollection') return (g.geometries ?? []).forEach(recoge);
    const plano = (v) => { if (typeof v[0] === 'number') puntos.push(proy(v)); else v.forEach(plano); };
    if (g.coordinates) plano(g.coordinates);
  };
  for (const x of filas) recoge(x.geometria);
  if (!puntos.length) {
    return `<div class="sin-mapa">No hay trazados con geometría que dibujar.</div>`;
  }

  const xs = puntos.map((p) => p[0]), ys = puntos.map((p) => p[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const margen = 0.06;
  const anchoD = Math.max(maxX - minX, 1e-9), altoD = Math.max(maxY - minY, 1e-9);
  minX -= anchoD * margen; maxX += anchoD * margen;
  minY -= altoD * margen; maxY += altoD * margen;
  // Escala uniforme para no deformar la geometria.
  const k = Math.min(ancho / (maxX - minX), alto / (maxY - minY));
  const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
  const T = (c) => {
    const [x, y] = proy(c);
    return [(x - cx) * k + ancho / 2, (y - cy) * k + alto / 2];
  };
  const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

  const trozos = [];
  const pinta = (g, s) => {
    if (!g) return;
    const est = `fill="none" stroke="${s.color}" stroke-width="${Math.max(1.2, s.grosor * 0.6)}" stroke-linecap="round" stroke-linejoin="round"` +
      (s.guion ? ` stroke-dasharray="${s.guion}"` : '');
    switch (g.type) {
      case 'Point': { const [x, y] = T(g.coordinates); trozos.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${s.color}"/>`); break; }
      case 'MultiPoint': g.coordinates.forEach((c) => pinta({ type: 'Point', coordinates: c }, s)); break;
      case 'LineString': trozos.push(`<polyline points="${g.coordinates.map((c) => fmt(T(c))).join(' ')}" ${est}/>`); break;
      case 'MultiLineString': g.coordinates.forEach((l) => pinta({ type: 'LineString', coordinates: l }, s)); break;
      case 'Polygon': trozos.push(`<polygon points="${g.coordinates[0].map((c) => fmt(T(c))).join(' ')}" fill="${s.color}" fill-opacity="0.18" stroke="${s.color}" stroke-width="1.4"/>`); break;
      case 'MultiPolygon': g.coordinates.forEach((p) => pinta({ type: 'Polygon', coordinates: p }, s)); break;
      case 'GeometryCollection': (g.geometries ?? []).forEach((x) => pinta(x, s)); break;
      default: break;
    }
  };

  for (const x of filas) pinta(x.geometria, simbologiaDe(x.tipoCierre));

  // Marcadores de ingreso y salida.
  for (const x of filas) {
    const s = simbologiaDe(x.tipoCierre);
    if (!s.marcador || !x.geometria) continue;
    const c = centroDe(x.geometria);
    if (!c) continue;
    const [px, py] = T([c[1], c[0]]);
    trozos.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>`);
  }

  // Relaciones: se marcan los puntos de contacto real.
  for (const r of relaciones) {
    const e = estadoEspacial(r);
    if (e !== ESPACIAL.CONTACTO) continue;
    const a = porId.get(r.idA);
    const c = a?.geometria && centroDe(a.geometria);
    if (!c) continue;
    const [px, py] = T([c[1], c[0]]);
    trozos.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="none" stroke="#c62828" stroke-width="2"/>`);
  }

  return `<svg viewBox="0 0 ${ancho} ${alto}" class="mapa-informe" role="img" aria-label="Mapa de los trazados analizados">
    <rect width="${ancho}" height="${alto}" fill="#f6f7f8"/>${trozos.join('')}</svg>`;
}

/* ───────────────────────── Informe ───────────────────────── */

const tarjeta = (n, t, clase = '') => `<div class="inf-kpi ${clase}"><div class="inf-kpi-n">${num(n)}</div><div class="inf-kpi-t">${esc(t)}</div></div>`;

function textoFiltros(f) {
  const partes = [];
  const nombres = { contratista: 'Contratista', contrato: 'Contrato', proyecto: 'Proyecto', municipio: 'Municipio', frente: 'Frente', tipoCierre: 'Tipo de cierre', relacion: 'Tipo de relación' };
  for (const [k, t] of Object.entries(nombres)) if (f[k]?.length) partes.push(`${t}: ${f[k].join(', ')}`);
  if (f.desde || f.hasta) partes.push(`Fechas: ${f.desde ?? 'sin límite'} a ${f.hasta ?? 'sin límite'}`);
  if ((f.texto ?? '').trim()) partes.push(`Búsqueda: «${f.texto.trim()}»`);
  return partes.length ? partes.join(' · ') : 'Ninguno: el informe cubre todos los datos cargados.';
}

/**
 * Construye el informe completo dentro de `#informe` y abre la impresión.
 * Devuelve el HTML generado, para poder comprobarlo en las pruebas.
 */
export function generar({ filas, relaciones, porId, archivos, resumen, filtros, config }) {
  const rango = rangoTemporal(filas);
  const contratos = [...new Set(filas.map((x) => x.contrato).filter(Boolean))].sort();
  const municipios = [...new Set(filas.map((x) => x.municipio).filter(Boolean))].sort();
  const contratistas = [...new Set(filas.map((x) => x.contratista).filter(Boolean))].sort();

  const porCierre = {};
  for (const t of [...TIPOS_CIERRE, '(sin dato)']) porCierre[t] = 0;
  for (const x of filas) {
    const k = String(x.tipoCierre ?? '').toLowerCase();
    porCierre[TIPOS_CIERRE.includes(k) ? k : '(sin dato)']++;
  }

  const conContacto = relaciones.filter((r) => estadoEspacial(r) === ESPACIAL.CONTACTO);
  const aLaVez = relaciones.filter((r) => estadoTemporal(r) === TEMPORAL.COINCIDE);
  const contactoYTiempo = relaciones.filter((r) =>
    estadoEspacial(r) === ESPACIAL.CONTACTO && estadoTemporal(r) === TEMPORAL.COINCIDE);
  const noEval = relaciones.filter((r) =>
    estadoEspacial(r) === ESPACIAL.NO_EVALUABLE || estadoTemporal(r) === TEMPORAL.NO_EVALUABLE);

  // Se listan primero las que coinciden en espacio Y tiempo, luego el resto por
  // distancia. Es un ORDEN, no una clasificacion de criticidad.
  const orden = [...relaciones].sort((a, b) => {
    const p = (r) => (estadoEspacial(r) === ESPACIAL.CONTACTO ? 0 : 1) + (estadoTemporal(r) === TEMPORAL.COINCIDE ? 0 : 2);
    return p(a) - p(b) || (a.distanciaMetros ?? 1e9) - (b.distanciaMetros ?? 1e9);
  });
  const detalle = orden.slice(0, 60);

  const filaRel = (r) => {
    const e = estadoEspacial(r), t = estadoTemporal(r);
    return `<tr>
      <td>${esc(r.contratoA)}<br><small>${esc(r.frenteA ?? '')}</small></td>
      <td>${esc(r.contratoB)}<br><small>${esc(r.frenteB ?? '')}</small></td>
      <td class="num">${r.distanciaMetros === null || r.distanciaMetros === undefined ? 'no medible' : esc(r.distanciaMetros.toFixed(1)) + ' m'}</td>
      <td>${esc(ETIQUETA_ESPACIAL[e])}</td>
      <td>${esc(ETIQUETA_TEMPORAL[t])}</td>
      <td><small>${r.traslapeInicio ? esc(soloDia(Date.parse(r.traslapeInicio.replace(' ', 'T') + 'Z'))) + ' → ' + esc(soloDia(Date.parse(r.traslapeFin.replace(' ', 'T') + 'Z'))) : '—'}</small></td>
      <td class="num">${esc(r.traslapeDias ?? '—')}</td>
    </tr>`;
  };

  const diagArchivos = (archivos ?? []).map((a) => {
    const estado = a.estado ?? LECTURA.COMPLETA;
    const etq = { [LECTURA.COMPLETA]: 'Completo', [LECTURA.PARCIAL]: 'Parcial', [LECTURA.FALLIDA]: 'No se pudo leer' }[estado];
    return `<tr><td>${esc(a.nombre)}</td><td>${esc(etq)}</td><td class="num">${num(a.trazados ?? 0)}</td>
      <td><small>${a.motivos?.length ? esc(a.motivos.map((m) => m.simple).join(' · ')) : '—'}</small></td></tr>`;
  }).join('');

  const problemas = [
    ['Trazados sin geometría utilizable', resumen.sinGeometria],
    ['Trazados con fechas que no se pudieron interpretar', resumen.sinVigenciaValida],
    ['Trazados sin contrato (excluidos del análisis de interferencias)', resumen.sinContrato],
    ['Trazados sin municipio', resumen.sinMunicipio],
    ['Duplicados exactos dentro de un mismo archivo', resumen.duplicados],
    ['Parejas cuya distancia no se pudo medir', resumen.espacialNoEval],
    ['Parejas cuyas fechas no permiten decidir el traslape', resumen.temporalNoEval],
  ].filter(([, n]) => n > 0);

  const html = `
  <div class="inf-portada">
    <div class="inf-marca">EPM</div>
    <div>
      <h1>Informe de control y articulación de PMTs</h1>
      <p class="inf-sub">Centro de Gestión Servicios Técnicos · Grupo EPM</p>
    </div>
    <div class="inf-fecha">${esc(new Date().toLocaleString('es-CO'))}</div>
  </div>

  <div class="inf-kpis">
    ${tarjeta(filas.length, 'PMT analizados', 'verde')}
    ${tarjeta(contratos.length, 'contratos')}
    ${tarjeta(municipios.length, 'municipios')}
    ${tarjeta(relaciones.length, 'relaciones entre contratos', relaciones.length ? 'azul' : '')}
    ${tarjeta(conContacto.length, 'llegan a tocarse', conContacto.length ? 'nar' : '')}
    ${tarjeta(aLaVez.length, 'coinciden en el tiempo', aLaVez.length ? 'nar' : '')}
    ${tarjeta(contactoYTiempo.length, 'se tocan Y coinciden', contactoYTiempo.length ? 'nar' : '')}
    ${tarjeta(noEval.length, 'no se pudieron analizar', noEval.length ? 'rojo' : 'gris')}
  </div>

  <h2>Qué se analizó</h2>
  <table class="inf-tabla inf-datos">
    <tr><th>Archivos</th><td>${esc((archivos ?? []).map((a) => a.nombre).join(', ')) || '—'}</td></tr>
    <tr><th>Periodo cubierto</th><td>${rango ? `${esc(soloDia(rango.min))} a ${esc(soloDia(rango.max))}` : 'los datos no traen fechas válidas'}</td></tr>
    <tr><th>Criterio espacial</th><td>distancia mínima real entre las geometrías, umbral de <b>${esc(config.umbralMetros)} m</b></td></tr>
    <tr><th>Criterio temporal</th><td>fecha <b>y hora</b> reales, coincidencia mínima exigida de ${esc(config.toleranciaMinutos)} minutos</td></tr>
    <tr><th>Regla invariante</th><td>dos frentes del <b>mismo contrato</b> nunca se consideran interferencia entre contratos</td></tr>
    <tr><th>Filtros aplicados</th><td>${esc(textoFiltros(filtros))}</td></tr>
    <tr><th>Contratistas</th><td>${esc(contratistas.join(', ')) || '—'}</td></tr>
  </table>

  <div class="inf-nota">
    Este informe presenta <b>hechos medidos</b>: a qué distancia están los trazados, si llegan a
    tocarse y si coinciden en el tiempo. <b>No asigna niveles de criticidad</b>, porque esa
    clasificación operativa todavía no está definida.
  </div>

  <h2>Mapa de los trazados analizados</h2>
  ${mapaSvg(filas, relaciones, porId)}
  <div class="inf-leyenda">
    ${[...TIPOS_CIERRE, '(sin dato)'].map((t) => {
      const s = simbologiaDe(t);
      return `<span><i style="background:${s.color}"></i>${esc(s.etiqueta)} (${num(porCierre[t] ?? 0)})</span>`;
    }).join('')}
    <span><i style="background:none;border:2px solid #c62828;border-radius:50%"></i>Punto donde dos trazados se tocan</span>
  </div>

  <h2>Relaciones detectadas</h2>
  ${relaciones.length ? `
  <p class="inf-p">Se listan ordenadas poniendo primero las que coinciden en el espacio y en el tiempo.
  ${orden.length > detalle.length ? `Se muestran las ${detalle.length} primeras de ${num(orden.length)}; el listado completo está en la exportación a Excel.` : ''}</p>
  <table class="inf-tabla">
    <thead><tr><th>Contrato A</th><th>Contrato B</th><th>Distancia</th><th>En el espacio</th><th>En el tiempo</th><th>Coinciden</th><th>Días</th></tr></thead>
    <tbody>${detalle.map(filaRel).join('')}</tbody>
  </table>`
    : '<p class="inf-p">No se detectó ninguna relación entre contratos distintos con los criterios y filtros aplicados.</p>'}

  <h2>Calidad de los datos</h2>
  <table class="inf-tabla">
    <thead><tr><th>Archivo</th><th>Lectura</th><th>Trazados</th><th>Observaciones</th></tr></thead>
    <tbody>${diagArchivos || '<tr><td colspan="4">—</td></tr>'}</tbody>
  </table>
  ${problemas.length ? `
  <table class="inf-tabla" style="margin-top:10px">
    <tbody>${problemas.map(([t, n]) => `<tr><td>${esc(t)}</td><td class="num"><b>${num(n)}</b></td></tr>`).join('')}</tbody>
  </table>
  <div class="inf-nota inf-nota-aviso">
    Lo que aparece como «no se pudo analizar» <b>no significa que no exista un problema</b>:
    significa que con los datos disponibles no fue posible comprobarlo.
  </div>` : '<p class="inf-p">No se detectó ningún problema de calidad en los datos analizados.</p>'}

  <h2>Trazabilidad</h2>
  <table class="inf-tabla inf-datos">
    <tr><th>Generado</th><td>${esc(new Date().toISOString())}</td></tr>
    <tr><th>Aplicación</th><td>Plataforma de Control y Articulación de PMTs — análisis ejecutado en el equipo del usuario</td></tr>
    <tr><th>Motor de cálculo</th><td>motor geoespacial y temporal propio, auditado de forma independiente (Etapa 1)</td></tr>
    <tr><th>Reproducibilidad</th><td>los mismos archivos con los mismos criterios producen exactamente el mismo resultado</td></tr>
  </table>`;

  $('informe').innerHTML = html;
  return html;
}

export function imprimir() { window.print(); }
