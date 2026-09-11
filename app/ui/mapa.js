/**
 * MAPA — Leaflet, con la semantica cartografica del sistema historico.
 *
 * CAPAS SEPARADAS, cada una con su responsabilidad:
 *   · fondo        el mapa base, intercambiable (ver `nucleo/mapas-base.js`)
 *   · trazados     los PMT, con simbologia por tipo de cierre
 *   · accesos      marcadores de "ingreso y salida", como la capa azul de QGIS
 *   · relaciones   donde dos trazados se aproximan o se tocan
 *
 * El fondo NO es lo mismo que los datos. Si el fondo falla, los trazados siguen
 * dibujandose y se dice con todas las letras que lo que falta es el fondo. Que
 * no se pueda distinguir "no hay mapa base" de "no cargaron mis datos" era uno
 * de los problemas de la entrega anterior.
 *
 * SOBRE LOS CONECTORES DE RELACION
 * NO se une centro con centro. Un conector de centroide a centroide pinta la
 * distancia en un sitio donde esa distancia no existe: dos calles que se rozan
 * en un extremo aparecerian unidas por una linea que cruza manzanas enteras.
 * Se usan los PUNTOS REALES de maxima aproximacion, que calcula
 * `motor/src/geo/acercamiento.js` y cuya distancia coincide con la que analiza
 * el motor (hay una prueba que lo exige).
 */
import { $, crear, esc, fechaLegible } from './dom.js';
import { simbologiaDe, estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL,
  ETIQUETA_ESPACIAL, ETIQUETA_TEMPORAL, SIMBOLOGIA_CIERRE } from '../nucleo/modelo.js';
import { puntosMasCercanos } from '../../motor/src/geo/acercamiento.js';
import * as Base from '../nucleo/mapas-base.js';

const COLOR_REL = {
  contacto: '#c62828',      // se tocan de verdad
  cercania: '#1565c0',      // cerca, sin tocarse
  noEval:   '#6a1b9a',      // no se pudo determinar
};

let mapa = null;
let capas = {};
let porId = new Map();
let alSeleccionar = () => {};
let estadoFondo = { proveedor: null, capa: null, cargo: false, fallo: false, intentados: [] };
let acercamientos = new Map();     // clave de relacion -> puntos mas cercanos

export function iniciar(idContenedor, { onSeleccion } = {}) {
  if (mapa) return mapa;
  alSeleccionar = onSeleccion ?? (() => {});
  mapa = L.map(idContenedor, { preferCanvas: true, zoomControl: true })
    .setView([6.25, -75.57], 11);
  capas = {
    trazados: L.layerGroup().addTo(mapa),
    accesos: L.layerGroup().addTo(mapa),
    relaciones: L.layerGroup().addTo(mapa),
  };
  aplicarFondo();
  return mapa;
}

/* ───────────────────────── Mapa base ───────────────────────── */

/**
 * Pone el mapa base configurado. Si no carga ni una tesela en unos segundos,
 * pasa al siguiente de la cadena de respaldo, y lo dice.
 */
export function aplicarFondo(config = null) {
  if (!mapa) return;
  const r = Base.resolver(config ?? Base.leerConfig());
  estadoFondo.intentados = [];
  ponerProveedor(r.proveedor, r.alternativas, r.motivo);
}

function ponerProveedor(p, alternativas, motivo) {
  if (estadoFondo.capa) { mapa.removeLayer(estadoFondo.capa); estadoFondo.capa = null; }
  estadoFondo.proveedor = p;
  estadoFondo.cargo = false;
  estadoFondo.fallo = false;

  if (!p) {
    avisarFondo(motivo === 'elegido'
      ? { tipo: 'sin-fondo', texto: 'Está viendo el mapa <b>sin fondo</b>, tal y como lo configuró. Los trazados se dibujan igual.' }
      : { tipo: 'error', texto: 'No hay ningún mapa de fondo configurado. <b>Los trazados se dibujan igual</b> y el análisis no se ve afectado.' });
    return;
  }

  estadoFondo.intentados.push(p.nombre);
  const capa = L.tileLayer(p.url, Base.opcionesLeaflet(p));
  let errores = 0;
  capa.on('tileload', () => {
    if (estadoFondo.cargo) return;
    estadoFondo.cargo = true;
    avisarFondo(null);
  });
  capa.on('tileerror', () => {
    errores++;
    if (estadoFondo.cargo || estadoFondo.fallo || errores < 3) return;
    estadoFondo.fallo = true;
    if (alternativas?.length) {
      const siguiente = alternativas[0];
      avisarFondo({ tipo: 'aviso', texto: `El mapa de fondo «${esc(p.nombre)}» no responde. Probando con «${esc(siguiente.nombre)}»…` });
      ponerProveedor(siguiente, alternativas.slice(1), 'respaldo');
    } else {
      avisarFondo({
        tipo: 'error',
        texto: `<b>No se pudo cargar ningún mapa de fondo.</b> Se intentó con: ${esc(estadoFondo.intentados.join(', '))}. ` +
          'Lo más probable es que la red de su oficina no permita salir a esos servidores. ' +
          '<b>Esto NO afecta al análisis:</b> sus trazados y todas las relaciones están calculados y dibujados. ' +
          'Si su área de TI dispone de un servidor de mapas propio, puede indicarlo en <b>Mapa de fondo → Servidor de EPM</b>.',
      });
    }
  });
  capa.addTo(mapa);
  capa.bringToBack();
  estadoFondo.capa = capa;

  // Si en 8 segundos no llego ni una tesela ni un error, tambien se avisa: hay
  // redes que se limitan a no contestar.
  setTimeout(() => {
    if (estadoFondo.proveedor !== p || estadoFondo.cargo || estadoFondo.fallo) return;
    estadoFondo.fallo = true;
    avisarFondo({ tipo: 'error', texto: `El mapa de fondo «${esc(p.nombre)}» no contesta. <b>Los trazados se dibujan igual.</b>` });
  }, 8000);
}

function avisarFondo(aviso) {
  const n = $('avisoMapa');
  if (!n) return;
  if (!aviso) { n.classList.add('oculto'); n.innerHTML = ''; return; }
  n.className = 'frase ' + (aviso.tipo === 'error' ? 'atencion' : aviso.tipo === 'sin-fondo' ? '' : 'atencion');
  n.innerHTML = aviso.texto;
  n.classList.remove('oculto');
}

export const estadoDelFondo = () => ({ ...estadoFondo, capa: undefined });

/* ───────────────────────── Geometrias ───────────────────────── */

const aLatLng = (c) => [c[1], c[0]];
const anillo = (a) => a.map(aLatLng);

function dibujar(g, estilo) {
  if (!g) return null;
  switch (g.type) {
    case 'Point': return L.circleMarker(aLatLng(g.coordinates), { radius: 6, ...estilo });
    case 'MultiPoint': return L.layerGroup(g.coordinates.map((c) => L.circleMarker(aLatLng(c), { radius: 6, ...estilo })));
    case 'LineString': return L.polyline(anillo(g.coordinates), estilo);
    case 'MultiLineString': return L.polyline(g.coordinates.map(anillo), estilo);
    case 'Polygon': return L.polygon(g.coordinates.map(anillo), estilo);
    case 'MultiPolygon': return L.polygon(g.coordinates.map((p) => p.map(anillo)), estilo);
    case 'GeometryCollection': return L.layerGroup((g.geometries ?? []).map((x) => dibujar(x, estilo)).filter(Boolean));
    default: return null;
  }
}

/** Centro aproximado, solo para colocar el marcador de ingreso y salida. */
export function centroDe(g) {
  const pts = [];
  (function recoge(x) {
    if (!x) return;
    if (x.type === 'GeometryCollection') return (x.geometries ?? []).forEach(recoge);
    const c = x.coordinates;
    if (!c) return;
    const plano = (v) => { if (typeof v[0] === 'number') pts.push(v); else v.forEach(plano); };
    plano(c);
  })(g);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[1], 0) / pts.length, pts.reduce((s, p) => s + p[0], 0) / pts.length];
}

function ficha(x) {
  const linea = (k, v) => v ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : '';
  const s = simbologiaDe(x.tipoCierre);
  const avisos = (x.avisos ?? []).length
    ? `<div style="margin-top:6px;color:#a35200"><b>${x.avisos.length} aviso(s) de calidad.</b> Véalos en «Calidad de los datos».</div>` : '';
  return `<div style="min-width:250px;font-size:13px">
    <div style="font-weight:700;font-size:14px;color:#006b00;margin-bottom:4px">${esc(x.frente ?? '(sin nombre)')}</div>
    <div style="margin-bottom:6px"><span style="display:inline-block;width:26px;height:4px;background:${s.color};vertical-align:middle;border-radius:2px"></span>
      <span style="margin-left:6px;font-weight:600;color:${s.color}">${esc(s.etiqueta)}</span></div>
    ${linea('Contrato', x.contrato)}${linea('Contratista', x.contratista)}
    ${linea('Proyecto', x.proyecto)}${linea('Municipio', x.municipio)}${linea('Dirección', x.direccion)}
    <div style="margin-top:5px"><b>Desde:</b> ${esc(fechaLegible(x.inicio))}</div>
    <div><b>Hasta:</b> ${esc(fechaLegible(x.fin))}</div>
    ${linea('Archivo', x.origenArchivo)}${avisos}
  </div>`;
}

/** Pinta los PMT. `resaltados` (Set de ids) decide cuáles van en primer plano. */
export function pintarPmts(filas, mapaPorId, resaltados = null) {
  if (!mapa) return;
  porId = mapaPorId;
  capas.trazados.clearLayers();
  capas.accesos.clearLayers();

  for (const x of filas) {
    if (!x.geometria) continue;
    const destacado = !resaltados || resaltados.has(x.id);
    const s = simbologiaDe(x.tipoCierre);
    const estilo = {
      color: destacado ? s.color : '#b6bcc1',
      weight: destacado ? s.grosor : 2,
      opacity: destacado ? 0.92 : 0.3,
      dashArray: s.guion,
      fillColor: destacado ? s.color : '#b6bcc1',
      fillOpacity: destacado ? 0.2 : 0.08,
    };
    const capa = dibujar(x.geometria, estilo);
    if (!capa) continue;
    capa.bindPopup(ficha(x));
    capa.on('click', () => alSeleccionar(x.id));
    capa.pmtId = x.id;
    capa.addTo(capas.trazados);

    // Marcador propio de "ingreso y salida": es la capa 📍 azul que tenia QGIS.
    if (s.marcador && destacado) {
      const c = centroDe(x.geometria);
      if (c) {
        L.circleMarker(c, { radius: 6, color: '#ffffff', weight: 2, fillColor: s.color, fillOpacity: 1 })
          .bindPopup(ficha(x))
          .on('click', () => alSeleccionar(x.id))
          .addTo(capas.accesos);
      }
    }
  }
}

const claveRel = (r) => `${r.idA}|${r.idB}`;

/**
 * Dibuja las relaciones uniendo los puntos REALES de maxima aproximacion.
 * Lo que se ve sobre el mapa es, literalmente, el segmento que mide el motor.
 */
export function pintarRelaciones(relaciones, mostrarlas) {
  if (!mapa) return;
  capas.relaciones.clearLayers();
  if (!mostrarlas) return;

  for (const r of relaciones) {
    const a = porId.get(r.idA), b = porId.get(r.idB);
    if (!a?.geometria || !b?.geometria) continue;

    const k = claveRel(r);
    let ac = acercamientos.get(k);
    if (!ac) { ac = puntosMasCercanos(a.geometria, b.geometria); acercamientos.set(k, ac); }

    const e = estadoEspacial(r), t = estadoTemporal(r);
    const noEval = e === ESPACIAL.NO_EVALUABLE || t === TEMPORAL.NO_EVALUABLE;
    const color = noEval ? COLOR_REL.noEval : (e === ESPACIAL.CONTACTO ? COLOR_REL.contacto : COLOR_REL.cercania);

    // Sin puntos de aproximacion no se dibuja NADA: mejor ausencia que una
    // linea que sugiera una distancia donde no se pudo medir ninguna.
    if (!ac.evaluable || !ac.a || !ac.b) continue;

    const emergente = `<div style="min-width:250px;font-size:13px">
      <div style="font-weight:700;color:#006b00;margin-bottom:5px">Relación entre contratos</div>
      <div><b>${esc(r.contratoA)}</b> · ${esc(r.frenteA ?? '')}</div>
      <div><b>${esc(r.contratoB)}</b> · ${esc(r.frenteB ?? '')}</div>
      <div style="margin-top:6px"><b>Distancia:</b> ${r.distanciaMetros === null || r.distanciaMetros === undefined
        ? 'no se pudo medir' : esc(r.distanciaMetros.toFixed(1)) + ' m'}</div>
      <div><b>En el espacio:</b> ${esc(ETIQUETA_ESPACIAL[e])}</div>
      <div><b>En el tiempo:</b> ${esc(ETIQUETA_TEMPORAL[t])}</div>
      ${r.traslapeInicio ? `<div style="margin-top:5px"><b>Coinciden:</b><br>${esc(fechaLegible(r.traslapeInicio))} — ${esc(fechaLegible(r.traslapeFin))}</div>` : ''}
      <div style="margin-top:6px;color:#6b7075;font-size:11px">La línea une los dos puntos donde los trazados más se aproximan.</div>
    </div>`;

    const linea = L.polyline([aLatLng(ac.a), aLatLng(ac.b)], {
      color, weight: e === ESPACIAL.CONTACTO ? 4 : 2.5, opacity: .9,
      dashArray: noEval ? '3 5' : (t === TEMPORAL.COINCIDE ? null : '8 6'),
    }).bindPopup(emergente);
    linea.relClave = k;
    linea.addTo(capas.relaciones);

    // Marcas en los dos extremos: senalan el punto exacto de aproximacion.
    for (const p of [ac.a, ac.b]) {
      L.circleMarker(aLatLng(p), {
        radius: e === ESPACIAL.CONTACTO ? 5 : 3.5,
        color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1,
      }).bindPopup(emergente).addTo(capas.relaciones);
    }
  }
}

/** Limpia la memoria de acercamientos cuando cambian los datos. */
export function olvidarAcercamientos() { acercamientos = new Map(); }

export function encuadrar() {
  if (!mapa) return;
  const lista = [];
  capas.trazados.eachLayer((c) => lista.push(c));
  if (!lista.length) return;
  try { mapa.fitBounds(L.featureGroup(lista).getBounds().pad(0.12)); } catch { /* geometrias degeneradas */ }
}

export function irA(id) {
  if (!mapa) return;
  capas.trazados.eachLayer((c) => {
    if (c.pmtId !== id) return;
    try {
      const b = c.getBounds ? c.getBounds() : L.latLngBounds([c.getLatLng(), c.getLatLng()]);
      mapa.fitBounds(b.pad(0.4), { maxZoom: 18 });
    } catch { if (c.getLatLng) mapa.setView(c.getLatLng(), 17); }
    c.openPopup();
  });
}

/** Acerca a una relacion concreta, encuadrando sus dos puntos de aproximacion. */
export function irARelacion(r) {
  if (!mapa) return;
  const ac = acercamientos.get(claveRel(r));
  if (ac?.evaluable && ac.a && ac.b) {
    try {
      mapa.fitBounds(L.latLngBounds([aLatLng(ac.a), aLatLng(ac.b)]).pad(2.5), { maxZoom: 19 });
      capas.relaciones.eachLayer((c) => { if (c.relClave === claveRel(r)) c.openPopup(); });
      return;
    } catch { /* sigue al respaldo */ }
  }
  const a = porId.get(r.idA), b = porId.get(r.idB);
  const ca = a?.geometria && centroDe(a.geometria), cb = b?.geometria && centroDe(b.geometria);
  if (ca && cb) { try { mapa.fitBounds(L.latLngBounds([ca, cb]).pad(0.5), { maxZoom: 17 }); } catch { /* nada */ } }
}

export const instancia = () => mapa;
export const capaDe = (n) => capas[n];
export { SIMBOLOGIA_CIERRE, COLOR_REL };
