/**
 * MAPA — Leaflet, servido desde el propio archivo.
 *
 * POR QUE LEAFLET Y NO EL MAPA DE qgis2web:
 *  · qgis2web genera un mapa ESTATICO: para actualizarlo hay que volver a abrir
 *    QGIS, regenerar y volver a publicar. Eso es justo el paso que esta etapa
 *    elimina. Aqui el mapa se dibuja desde los datos que el usuario acaba de
 *    cargar, en el momento.
 *  · El tablero historico incrustaba ese mapa en un <iframe> y hablaba con el
 *    por `contentWindow`, lo que ademas obligaba a buscar la carpeta correcta
 *    preguntando a la API de GitHub. Sin iframe no hace falta nada de eso.
 *  · Leaflet (BSD-2-Clause) va incluido en el propio archivo: no se descarga de
 *    ninguna CDN, asi que funciona en un equipo sin internet y no depende de que
 *    la red corporativa permita cdnjs.
 *
 * EL MAPA FUNCIONA SIN INTERNET. Las teselas de fondo son un extra: si no se
 * pueden descargar, los trazados se dibujan igual sobre un fondo liso y se
 * avisa. Nunca se queda en blanco sin explicacion.
 */
import { $, crear, esc, fechaLegible } from './dom.js';
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL, ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL } from '../nucleo/modelo.js';

const COLOR = {
  normal:   '#009300',
  contacto: '#d56b00',
  cercania: '#1565c0',
  noEval:   '#5e35b1',
  apagado:  '#9aa0a6',
};

let mapa = null;
let capaPmts = null;
let capaRelaciones = null;
let capaFondo = null;
let porId = new Map();
let alSeleccionar = () => {};
let hayTeselas = false;

export function iniciar(idContenedor, { onSeleccion } = {}) {
  if (mapa) return mapa;
  alSeleccionar = onSeleccion ?? (() => {});
  mapa = L.map(idContenedor, { preferCanvas: true, zoomControl: true })
    .setView([6.25, -75.57], 11);            // Medellin como encuadre inicial

  capaFondo = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true,
  });
  capaFondo.on('tileload', () => { hayTeselas = true; avisoTeselas(false); });
  capaFondo.on('tileerror', () => { if (!hayTeselas) avisoTeselas(true); });
  capaFondo.addTo(mapa);

  capaPmts = L.layerGroup().addTo(mapa);
  capaRelaciones = L.layerGroup().addTo(mapa);
  return mapa;
}

function avisoTeselas(falla) {
  const n = $('avisoMapa');
  if (!n) return;
  n.classList.toggle('oculto', !falla);
  if (falla) {
    n.innerHTML = 'No se pudo cargar el mapa de fondo (sin conexion o bloqueado por la red). ' +
      '<b>Los trazados se dibujan igual</b> y el analisis no se ve afectado.';
  }
}

/** Convierte GeoJSON [lon,lat] al orden [lat,lon] que usa Leaflet. */
const aLatLng = (c) => [c[1], c[0]];
const anillo = (a) => a.map(aLatLng);

function dibujarGeometria(g, estilo) {
  if (!g) return null;
  switch (g.type) {
    case 'Point': return L.circleMarker(aLatLng(g.coordinates), { radius: 6, ...estilo });
    case 'MultiPoint': return L.layerGroup(g.coordinates.map((c) => L.circleMarker(aLatLng(c), { radius: 6, ...estilo })));
    case 'LineString': return L.polyline(anillo(g.coordinates), estilo);
    case 'MultiLineString': return L.polyline(g.coordinates.map(anillo), estilo);
    case 'Polygon': return L.polygon(g.coordinates.map(anillo), estilo);
    case 'MultiPolygon': return L.polygon(g.coordinates.map((p) => p.map(anillo)), estilo);
    case 'GeometryCollection': return L.layerGroup((g.geometries ?? []).map((x) => dibujarGeometria(x, estilo)).filter(Boolean));
    default: return null;
  }
}

function fichaPmt(x) {
  const linea = (k, v) => v ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : '';
  const avisos = (x.avisos ?? []).length
    ? `<div style="margin-top:6px;color:#a35200"><b>Avisos:</b> ${esc(x.avisos.length)}</div>` : '';
  return `<div style="min-width:230px;font-size:13px">
    <div style="font-weight:700;font-size:14px;color:#006b00;margin-bottom:5px">${esc(x.frente ?? '(sin nombre)')}</div>
    ${linea('Contrato', x.contrato)}${linea('Contratista', x.contratista)}
    ${linea('Proyecto', x.proyecto)}${linea('Municipio', x.municipio)}
    ${linea('Direccion', x.direccion)}${linea('Tipo de cierre', x.tipoCierre)}
    <div style="margin-top:5px"><b>Desde:</b> ${esc(fechaLegible(x.inicio))}</div>
    <div><b>Hasta:</b> ${esc(fechaLegible(x.fin))}</div>
    ${linea('Archivo', x.origenArchivo)}${avisos}
  </div>`;
}

/** Pinta los PMT visibles. `resaltados` es un Set opcional de ids a destacar. */
export function pintarPmts(filas, mapaPorId, resaltados = null) {
  if (!mapa) return;
  porId = mapaPorId;
  capaPmts.clearLayers();
  for (const x of filas) {
    if (!x.geometria) continue;
    const destacado = !resaltados || resaltados.has(x.id);
    const estilo = {
      color: destacado ? COLOR.normal : COLOR.apagado,
      weight: destacado ? 4 : 2,
      opacity: destacado ? 0.95 : 0.35,
      fillColor: destacado ? COLOR.normal : COLOR.apagado,
      fillOpacity: destacado ? 0.25 : 0.1,
    };
    const capa = dibujarGeometria(x.geometria, estilo);
    if (!capa) continue;
    capa.bindPopup(fichaPmt(x));
    capa.on('click', () => alSeleccionar(x.id));
    capa.pmtId = x.id;
    capa.addTo(capaPmts);
  }
}

/**
 * Dibuja cada relacion como una linea entre los centros de los dos trazados.
 * El color distingue CONTACTO FISICO de simple CERCANIA, y el trazo discontinuo
 * marca lo que NO se pudo evaluar: nunca se dibuja igual "no hay" que "no se sabe".
 */
export function pintarRelaciones(relaciones, mostrarlas) {
  if (!mapa) return;
  capaRelaciones.clearLayers();
  if (!mostrarlas) return;
  for (const r of relaciones) {
    const a = porId.get(r.idA), b = porId.get(r.idB);
    if (!a?.geometria || !b?.geometria) continue;
    const ca = centro(a.geometria), cb = centro(b.geometria);
    if (!ca || !cb) continue;
    const e = estadoEspacial(r), t = estadoTemporal(r);
    const noEval = e === ESPACIAL.NO_EVALUABLE || t === TEMPORAL.NO_EVALUABLE;
    const color = noEval ? COLOR.noEval : (e === ESPACIAL.CONTACTO ? COLOR.contacto : COLOR.cercania);
    const linea = L.polyline([ca, cb], {
      color, weight: e === ESPACIAL.CONTACTO ? 3.5 : 2,
      opacity: .85, dashArray: noEval ? '4 5' : (t === TEMPORAL.COINCIDE ? null : '9 6'),
    });
    linea.bindPopup(`<div style="min-width:240px;font-size:13px">
      <div style="font-weight:700;color:#006b00;margin-bottom:5px">Relacion detectada</div>
      <div><b>${esc(r.contratoA)}</b> · ${esc(r.frenteA ?? '')}</div>
      <div><b>${esc(r.contratoB)}</b> · ${esc(r.frenteB ?? '')}</div>
      <div style="margin-top:6px"><b>Distancia:</b> ${r.distanciaMetros === null || r.distanciaMetros === undefined
        ? 'no se pudo medir' : esc(r.distanciaMetros.toFixed(1)) + ' m'}</div>
      <div><b>En el espacio:</b> ${esc(ETIQUETA_ESPACIAL[e])}</div>
      <div><b>En el tiempo:</b> ${esc(ETIQUETA_TEMPORAL[t])}</div>
      ${r.traslapeInicio ? `<div style="margin-top:5px"><b>Coinciden:</b> ${esc(fechaLegible(r.traslapeInicio))} — ${esc(fechaLegible(r.traslapeFin))}</div>` : ''}
    </div>`);
    linea.addTo(capaRelaciones);
  }
}

/** Centro aproximado de una geometria, para tirar la linea de relacion. */
function centro(g) {
  const pts = [];
  (function recoge(x) {
    if (!x) return;
    if (x.type === 'GeometryCollection') return (x.geometries ?? []).forEach(recoge);
    const c = x.coordinates;
    if (!c) return;
    const plano = (v) => {
      if (typeof v[0] === 'number') pts.push(v);
      else v.forEach(plano);
    };
    plano(c);
  })(g);
  if (!pts.length) return null;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lon];
}

/** Encuadra el mapa sobre lo que hay dibujado. */
export function encuadrar() {
  if (!mapa) return;
  const capas = [];
  capaPmts.eachLayer((c) => capas.push(c));
  if (!capas.length) return;
  try {
    const g = L.featureGroup(capas);
    mapa.fitBounds(g.getBounds().pad(0.12));
  } catch { /* geometrias degeneradas: se deja el encuadre actual */ }
}

/** Acerca el mapa a un PMT concreto y abre su ficha. */
export function irA(id) {
  if (!mapa) return;
  capaPmts.eachLayer((c) => {
    if (c.pmtId !== id) return;
    try {
      const b = c.getBounds ? c.getBounds() : L.latLngBounds([c.getLatLng(), c.getLatLng()]);
      mapa.fitBounds(b.pad(0.4), { maxZoom: 18 });
    } catch { if (c.getLatLng) mapa.setView(c.getLatLng(), 17); }
    c.openPopup();
  });
}

/** Acerca el mapa a los dos extremos de una relacion, para verla entera. */
export function irARelacion(r) {
  if (!mapa) return;
  const a = porId.get(r.idA), b = porId.get(r.idB);
  const ca = a?.geometria && centro(a.geometria), cb = b?.geometria && centro(b.geometria);
  if (!ca || !cb) return;
  try { mapa.fitBounds(L.latLngBounds([ca, cb]).pad(0.5), { maxZoom: 17 }); } catch { /* nada */ }
}

export function alternarFondo(si) { if (!mapa) return; si ? capaFondo.addTo(mapa) : mapa.removeLayer(capaFondo); }
export const instancia = () => mapa;
