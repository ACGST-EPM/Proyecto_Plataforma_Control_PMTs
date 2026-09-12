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
import { rangoTemporal, limitesDelDia } from '../nucleo/filtrado.js';
import { centroDe } from './mapa.js';
import { puntosMasCercanos } from '../../motor/src/geo/acercamiento.js';

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

  // Contactos: se marcan DONDE SE TOCAN DE VERDAD. Antes se pintaba el centro
  // del trazado A, que puede estar a cientos de metros del punto de contacto.
  for (const r of relaciones) {
    if (estadoEspacial(r) !== ESPACIAL.CONTACTO) continue;
    const a = porId.get(r.idA), b = porId.get(r.idB);
    if (!a?.geometria || !b?.geometria) continue;
    const ac = puntosMasCercanos(a.geometria, b.geometria);
    if (!ac.evaluable || !ac.a) continue;        // sin ubicacion fiable, no se marca nada
    const [px, py] = T(ac.a);
    trozos.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="none" stroke="#c62828" stroke-width="2"/>`);
  }

  return `<svg viewBox="0 0 ${ancho} ${alto}" class="mapa-informe" role="img" aria-label="Mapa de los trazados analizados">
    <rect width="${ancho}" height="${alto}" fill="#f6f7f8"/>${trozos.join('')}</svg>`;
}

/* ───────────────────────── Informe ───────────────────────── */

const tarjeta = (n, t, clase = '') => `<div class="inf-kpi ${clase}"><div class="inf-kpi-n">${num(n)}</div><div class="inf-kpi-t">${esc(t)}</div></div>`;

function textoFiltros(f, diaRecorrido) {
  const partes = [];
  if (diaRecorrido !== null && diaRecorrido !== undefined) {
    partes.push(`Recorrido temporal activo: solo el día ${soloDia(limitesDelDia(diaRecorrido).inicio)}`);
  }
  const nombres = { contratista: 'Contratista', contrato: 'Contrato', proyecto: 'Proyecto', municipio: 'Municipio', frente: 'Frente', tipoCierre: 'Tipo de cierre', relacion: 'Tipo de relación' };
  for (const [k, t] of Object.entries(nombres)) if (f[k]?.length) partes.push(`${t}: ${f[k].join(', ')}`);
  if (f.desde || f.hasta) partes.push(`Fechas: ${f.desde ?? 'sin límite'} a ${f.hasta ?? 'sin límite'}`);
  if ((f.texto ?? '').trim()) partes.push(`Búsqueda: «${f.texto.trim()}»`);
  return partes.length ? partes.join(' · ') : 'Ninguno: el informe cubre todos los datos cargados.';
}

/**
 * Mapa de DETALLE de una relacion: encuadra sus dos trazados y marca el punto
 * exacto de aproximacion. Sin teselas, sin captura manual y sin QGIS.
 */
export function mapaDetalle(rel, porId, { ancho = 470, alto = 300 } = {}) {
  const a = porId.get(rel.idA), b = porId.get(rel.idB);
  if (!a?.geometria || !b?.geometria) return '';
  const ac = puntosMasCercanos(a.geometria, b.geometria);

  const proy = ([lon, lat]) => {
    const x = (lon + 180) / 360;
    const sn = Math.sin((lat * Math.PI) / 180);
    return [x, 0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)];
  };
  const pts = [];
  const recoge = (g) => {
    if (!g) return;
    if (g.type === 'GeometryCollection') return (g.geometries ?? []).forEach(recoge);
    const plano = (v) => { if (typeof v[0] === 'number') pts.push(proy(v)); else v.forEach(plano); };
    if (g.coordinates) plano(g.coordinates);
  };
  recoge(a.geometria); recoge(b.geometria);
  if (!pts.length) return '';

  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = Math.max(maxX - minX, 1e-9), dy = Math.max(maxY - minY, 1e-9);
  minX -= dx * 0.18; maxX += dx * 0.18; minY -= dy * 0.18; maxY += dy * 0.18;
  const k = Math.min(ancho / (maxX - minX), alto / (maxY - minY));
  const cx = (maxX + minX) / 2, cy = (maxY + minY) / 2;
  const T = (c) => { const [x, y] = proy(c); return [(x - cx) * k + ancho / 2, (y - cy) * k + alto / 2]; };
  const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

  const trozos = [];
  const pinta = (g, color) => {
    if (!g) return;
    const est = `fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
    switch (g.type) {
      case 'Point': { const [x, y] = T(g.coordinates); trozos.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${color}"/>`); break; }
      case 'MultiPoint': g.coordinates.forEach((c) => pinta({ type: 'Point', coordinates: c }, color)); break;
      case 'LineString': trozos.push(`<polyline points="${g.coordinates.map((c) => fmt(T(c))).join(' ')}" ${est}/>`); break;
      case 'MultiLineString': g.coordinates.forEach((l) => pinta({ type: 'LineString', coordinates: l }, color)); break;
      case 'Polygon': trozos.push(`<polygon points="${g.coordinates[0].map((c) => fmt(T(c))).join(' ')}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/>`); break;
      case 'MultiPolygon': g.coordinates.forEach((pg) => pinta({ type: 'Polygon', coordinates: pg }, color)); break;
      case 'GeometryCollection': (g.geometries ?? []).forEach((x) => pinta(x, color)); break;
      default: break;
    }
  };
  pinta(a.geometria, '#1565c0');
  pinta(b.geometria, '#d56b00');

  let leyendaDist = '';
  if (ac.evaluable && ac.a && ac.b) {
    const [x1, y1] = T(ac.a), [x2, y2] = T(ac.b);
    trozos.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c62828" stroke-width="2" stroke-dasharray="4 3"/>`);
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      trozos.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="#c62828" stroke="#fff" stroke-width="1.5"/>`);
    }
    leyendaDist = `${ac.metros.toFixed(1)} m`;
  } else {
    leyendaDist = 'no se pudo situar';
  }

  return `<div class="inf-detalle">
    <div class="inf-detalle-tit"><b>${esc(rel.contratoA)}</b> ${esc(rel.frenteA ?? '')}
      <span class="inf-vs">vs</span> <b>${esc(rel.contratoB)}</b> ${esc(rel.frenteB ?? '')}</div>
    <svg viewBox="0 0 ${ancho} ${alto}" class="inf-detalle-svg" role="img"
      aria-label="Detalle de la relación entre ${esc(rel.frenteA ?? '')} y ${esc(rel.frenteB ?? '')}">
      <rect width="${ancho}" height="${alto}" fill="#f6f7f8"/>${trozos.join('')}</svg>
    <div class="inf-detalle-pie">
      <span><i style="background:#1565c0"></i>${esc(rel.frenteA ?? 'A')}</span>
      <span><i style="background:#d56b00"></i>${esc(rel.frenteB ?? 'B')}</span>
      <span><i style="background:#c62828"></i>${esc(leyendaDist)}</span>
      <span>${esc(ETIQUETA_ESPACIAL[estadoEspacial(rel)])} · ${esc(ETIQUETA_TEMPORAL[estadoTemporal(rel)])}</span>
    </div>
  </div>`;
}

/* ═══════════════ VIGENCIA DEL INFORME (un informe viejo no puede parecer nuevo) ═══
 *
 * ══ EL DEFECTO ════════════════════════════════════════════════════════════
 *
 * Se generaba el informe, se quitaba una fuente, la aplicación recalculaba
 * todo… y el informe seguía en pantalla, con el archivo retirado dentro y sus
 * cifras antiguas, listo para imprimirse como si fuera el de ahora. Lo mismo al
 * cambiar un filtro o el día del recorrido.
 *
 * ══ LA CLASE DE ERROR ═════════════════════════════════════════════════════
 *
 * «Un resultado que ya se pintó sobrevive al estado que lo produjo». No es solo
 * la fuente retirada: es cualquier cambio en aquello sobre lo que se generó.
 *
 * ══ LA POLÍTICA ELEGIDA: B (invalidación explícita) ═══════════════════════
 *
 * Se descartó regenerar solo (A) por dos razones concretas:
 *   · el recorrido del tiempo dispara un cambio cada pocas décimas de segundo,
 *     y el informe dibuja hasta trece mapas: regenerarlo en cada paso convierte
 *     la animación en un pase de diapositivas;
 *   · un informe que se rehace solo, sin avisar, es indistinguible de uno que no
 *     ha cambiado. La usuaria imprime pensando que es el que estaba leyendo.
 *
 * Con la invalidación explícita el informe caducado NO desaparece —se puede
 * seguir leyendo— pero se marca, se atenúa y NO se deja imprimir hasta pulsar
 * «Actualizar el informe». Nunca hay un PDF con cifras que ya no existen.
 *
 * El SELLO es la huella del estado con el que se generó: fuentes, filtros, día
 * y recuentos. Si el sello de ahora no es el del informe, está caducado.
 */
let selloDelInforme = null;
let caducado = false;

/** Sello del informe que hay en pantalla, o `null` si no hay ninguno. */
export const selloActual = () => selloDelInforme;

/** ¿Hay un informe pintado ahora mismo? */
export const hayInforme = () => selloDelInforme !== null;

/** ¿Está caducado el informe que hay en pantalla? */
export const estaCaducado = () => caducado;

/** Olvida el informe: se usa al cerrarlo y al empezar de nuevo. */
export function olvidar() {
  selloDelInforme = null;
  caducado = false;
  const aviso = $('avisoInforme');
  if (aviso) { aviso.classList.add('oculto'); aviso.innerHTML = ''; }
  const cuerpo = $('informe');
  if (cuerpo) { cuerpo.classList.remove('caducado'); cuerpo.innerHTML = ''; }
}

/**
 * Compara el estado de ahora con el del informe pintado. Si no coinciden, lo
 * marca como caducado. Devuelve `true` si acaba de caducar.
 *
 * @param {string} sello        huella del estado actual
 * @param {string} [motivo]     qué cambió, en lenguaje llano
 * @param {Function} [onActualizar] qué hacer al pulsar «Actualizar el informe»
 */
export function revisarVigencia(sello, motivo, onActualizar) {
  if (selloDelInforme === null) return false;

  // Si el estado ha VUELTO a ser el del informe —se quitó el filtro que se
  // acababa de poner, por ejemplo—, el informe corresponde otra vez y se
  // desmarca. Dejarlo caducado seria mentir en la otra direccion: avisar de una
  // diferencia que ya no existe, y bloquear una impresion legitima.
  if (sello === selloDelInforme) {
    if (caducado) marcarAlDia();
    return false;
  }

  caducado = true;
  const cuerpo = $('informe');
  if (cuerpo) cuerpo.classList.add('caducado');
  const aviso = $('avisoInforme');
  if (aviso) {
    aviso.classList.remove('oculto');
    aviso.innerHTML =
      `<span><b>Este informe ya no corresponde a lo que se está viendo.</b> ` +
      `${esc(motivo ?? 'El análisis ha cambiado desde que se generó.')} ` +
      `Hasta que lo actualice no se puede imprimir, para que no salga un PDF con cifras viejas.</span>` +
      `<button class="b-nar" type="button" id="btnActualizarInforme">Actualizar el informe</button>`;
    const btn = $('btnActualizarInforme');
    if (btn && onActualizar) btn.onclick = () => onActualizar();
  }
  const imprimir = $('btnImprimirInforme');
  if (imprimir) imprimir.disabled = true;
  return true;
}

/**
 * Construye el informe completo dentro de `#informe` y abre la impresión.
 * Devuelve el HTML generado, para poder comprobarlo en las pruebas.
 */
export function generar({ filas, relaciones, porId, noEvaluables, archivos, resumen, filtros,
  config, versionReglas, diaRecorrido, totalCargado, sello = null }) {
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

  // Las cifras vienen del MISMO modelo de resumen que usa el tablero, calculado
  // sobre el MISMO alcance que las tablas de este informe. Antes el informe las
  // recalculaba por su cuenta y la tarjeta de no evaluables decía 0 mientras su
  // propia tabla mostraba 1.
  const contactoYTiempo = relaciones.filter((r) =>
    estadoEspacial(r) === ESPACIAL.CONTACTO && estadoTemporal(r) === TEMPORAL.COINCIDE);

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

  // ALCANCE HONESTO. Durante el recorrido temporal el informe cubre SOLO ese
  // dia, y decir "cubre todos los datos cargados" seria falso.
  const enRecorrido = diaRecorrido !== null && diaRecorrido !== undefined;
  const parcial = enRecorrido || (totalCargado && filas.length < totalCargado);
  const alcance = parcial
    ? `<b>Subconjunto:</b> ${num(filas.length)} de ${num(totalCargado ?? filas.length)} PMT cargados` +
      (enRecorrido ? `, correspondientes al día ${esc(soloDia(limitesDelDia(diaRecorrido).inicio))} completo` : ', según los filtros aplicados') + '.'
    : `Todos los datos cargados: ${num(filas.length)} PMT.`;

  // Mapas de detalle: las relaciones que mas importa poder interpretar, sin
  // clasificarlas. Se limita el numero y se dice, para no producir un PDF
  // interminable.
  const MAX_DETALLE = 12;
  const paraDetalle = [...relaciones].sort((a, b) => {
    const p = (r) => (estadoEspacial(r) === ESPACIAL.CONTACTO ? 0 : 1) + (estadoTemporal(r) === TEMPORAL.COINCIDE ? 0 : 2);
    return p(a) - p(b) || (a.distanciaMetros ?? 1e9) - (b.distanciaMetros ?? 1e9);
  }).slice(0, MAX_DETALLE);

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
    ${tarjeta(resumen.pmts, 'PMT analizados', 'verde')}
    ${tarjeta(resumen.contratos, 'contratos')}
    ${tarjeta(resumen.municipios, 'municipios')}
    ${tarjeta(resumen.relaciones, 'relaciones entre contratos', resumen.relaciones ? 'azul' : '')}
    ${tarjeta(resumen.contacto, 'llegan a tocarse', resumen.contacto ? 'nar' : '')}
    ${tarjeta(resumen.aLaVez, 'coinciden en el tiempo', resumen.aLaVez ? 'nar' : '')}
    ${tarjeta(contactoYTiempo.length, 'se tocan Y coinciden', contactoYTiempo.length ? 'nar' : '')}
    ${tarjeta(resumen.espacialNoEval + resumen.temporalNoEval, 'no se pudieron analizar',
      (resumen.espacialNoEval + resumen.temporalNoEval) ? 'rojo' : 'gris')}
  </div>

  <h2>Qué se analizó</h2>
  <table class="inf-tabla inf-datos">
    <tr><th>Archivos</th><td>${esc((archivos ?? []).map((a) => a.nombre).join(', ')) || '—'}</td></tr>
    <tr><th>Periodo cubierto</th><td>${rango ? `${esc(soloDia(rango.min))} a ${esc(soloDia(rango.max))}` : 'los datos no traen fechas válidas'}</td></tr>
    <tr><th>Criterio espacial</th><td>distancia mínima real entre las geometrías, umbral de <b>${esc(config.umbralMetros)} m</b></td></tr>
    <tr><th>Criterio temporal</th><td>fecha <b>y hora</b> reales, coincidencia mínima exigida de ${esc(config.toleranciaMinutos)} minutos</td></tr>
    <tr><th>Regla invariante</th><td>dos frentes del <b>mismo contrato</b> nunca se consideran interferencia entre contratos</td></tr>
    <tr><th>Filtros aplicados</th><td>${esc(textoFiltros(filtros, diaRecorrido))}</td></tr>
    <tr><th>Alcance del informe</th><td>${alcance}</td></tr>
    <tr><th>Reglas del motor</th><td>${esc(versionReglas ?? 'no declarada')}</td></tr>
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

  ${paraDetalle.length ? `
  <h2>Detalle cartográfico de las relaciones</h2>
  <p class="inf-p">Cada recuadro encuadra los dos trazados implicados y marca <b>el punto exacto donde
  más se aproximan</b>. ${relaciones.length > MAX_DETALLE
    ? `Se muestran ${MAX_DETALLE} de ${num(relaciones.length)} relaciones, ordenadas poniendo primero las que se tocan y coinciden en el tiempo.`
    : `Se muestran todas las relaciones encontradas.`}
  El orden <b>no es una clasificación de criticidad</b>.</p>
  <div class="inf-detalles">${paraDetalle.map((r) => mapaDetalle(r, porId)).join('')}</div>` : ''}

  ${resumen.noEvaluables?.length ? `
  <h2>Parejas que no se pudieron evaluar</h2>
  <div class="inf-nota inf-nota-aviso">
    <b>${num(resumen.noEvaluables.length)} pareja(s) cuya distancia no se pudo determinar.</b>
    No significa que estén lejos ni que no haya interferencia: significa que no se pudo comprobar.
  </div>
  <table class="inf-tabla">
    <thead><tr><th>Contrato A</th><th>Frente A</th><th>Contrato B</th><th>Frente B</th><th>Motivo</th></tr></thead>
    <tbody>${resumen.noEvaluables.slice(0, 40).map((h) => `<tr>
      <td>${esc(h.contratoA ?? '—')}</td><td>${esc(h.frenteA ?? '—')}</td>
      <td>${esc(h.contratoB ?? '—')}</td><td>${esc(h.frenteB ?? '—')}</td>
      <td><small>${esc((h.avisos ?? h.errores ?? []).join(' · ') || 'sin motivo registrado')}</small></td>
    </tr>`).join('')}</tbody>
  </table>` : ''}

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

  // El informe recién pintado corresponde al estado de ahora.
  selloDelInforme = sello;
  marcarAlDia();
  return html;
}

/** Quita la marca de caducado y vuelve a permitir la impresión. */
function marcarAlDia() {
  caducado = false;
  const cuerpo = $('informe');
  if (cuerpo) cuerpo.classList.remove('caducado');
  const aviso = $('avisoInforme');
  if (aviso) { aviso.classList.add('oculto'); aviso.innerHTML = ''; }
  const botonImprimir = $('btnImprimirInforme');
  if (botonImprimir) botonImprimir.disabled = false;
}

/**
 * Imprime SOLO el informe. Marca el `body` antes de llamar a la impresion y lo
 * desmarca al terminar, de modo que la hoja de estilos de impresion pueda
 * ocultar el tablero. Sin esto salian varias paginas de filtros y tablas que
 * nadie habia pedido.
 */
export function imprimir() {
  // Un informe caducado no se imprime: seria un PDF con cifras que ya no son.
  if (caducado) return false;
  const cuerpo = document.body;
  cuerpo.classList.add('imprimiendo-informe');
  const limpiar = () => cuerpo.classList.remove('imprimiendo-informe');
  if (typeof window.onafterprint !== 'undefined') {
    window.addEventListener('afterprint', limpiar, { once: true });
  }
  try { window.print(); } finally { setTimeout(limpiar, 1500); }
  return true;
}
