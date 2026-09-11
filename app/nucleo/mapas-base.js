/**
 * MAPA BASE — catalogo de proveedores, desacoplado del resto del producto.
 *
 * POR QUE EXISTE ESTE MODULO
 * En la Etapa 2 el mapa base estaba escrito a pelo dentro del codigo del mapa,
 * apuntando a `{s}.tile.openstreetmap.org`, y con `crossOrigin: true`. Eso
 * produjo el fallo que reporto la usuaria. La causa esta demostrada mas abajo.
 * La politica de teselas de OpenStreetMap pide literalmente lo contrario de lo
 * que haciamos: «avoid hard-coding the tile URL; allow switching without
 * needing a software update».
 *
 * ── LA CAUSA DEL MAPA EN BLANCO, MEDIDA ────────────────────────────────────
 * `crossOrigin: true` hace que el navegador pida la tesela en modo CORS. Si la
 * respuesta no trae `Access-Control-Allow-Origin` —lo que ocurre en cuanto un
 * proxy corporativo reescribe la respuesta, y es el caso habitual en una red
 * de empresa— el navegador DESCARTA la imagen con `net::ERR_FAILED` aunque
 * haya llegado entera. Sin esa opcion, la misma tesela se pinta sin problema,
 * porque una <img> normal no esta sujeta a CORS.
 *
 * Comprobado en las 8 combinaciones de origen (file:// y http://) x
 * crossOrigin (si/no) x CORS del servidor (si/no): el UNICO caso que falla es
 * crossOrigin activado contra un servidor sin CORS. Por eso ya no se activa.
 *
 * `crossOrigin` solo hace falta para leer los pixeles del lienzo. Para el
 * informe NO se usa: el mapa del informe se dibuja aparte, con las geometrias,
 * sin depender de las teselas.
 *
 * ── SUBDOMINIOS ────────────────────────────────────────────────────────────
 * Tambien se retira el prefijo `{s}.`. La politica de OSM avisa de que «other
 * subdomains or hostnames may be slower or withdrawn without notice». El
 * nombre canonico es `tile.openstreetmap.org`, que ademas habla HTTP/2 y no
 * necesita repartir peticiones entre dominios.
 */

/** Sin fondo: identificador reservado, no es un proveedor. */
export const SIN_FONDO = 'sin-fondo';

/**
 * Catalogo. Cada entrada declara lo que hay que saber ANTES de usarla:
 * condiciones, atribucion obligatoria, si pide clave y si conviene en un
 * entorno corporativo. Ningun proveedor lleva secretos: si alguno necesitara
 * clave, la clave la pone quien despliegue, nunca el codigo.
 */
export const PROVEEDORES = Object.freeze([
  {
    id: 'osm',
    nombre: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© colaboradores de OpenStreetMap',
    maxZoom: 19,
    requiereClave: false,
    publico: true,
    nota: 'Servicio comunitario gratuito. Su politica de uso prohibe la descarga masiva ' +
          'y pide no fijar la URL en el codigo. Uso normal de un visor interno: admitido. ' +
          'Las peticiones salen al exterior, asi que la red corporativa debe permitirlo.',
  },
  {
    id: 'carto-claro',
    nombre: 'CARTO Positron (claro y sobrio)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdominios: 'abcd',
    atribucion: '© colaboradores de OpenStreetMap · © CARTO',
    maxZoom: 20,
    requiereClave: false,
    publico: true,
    nota: 'Fondo gris claro: los trazados de colores se leen mucho mejor encima. ' +
          'Gratuito para uso no comercial con atribucion; para uso intensivo CARTO pide contratar.',
  },
  {
    id: 'esri-satelite',
    nombre: 'Esri — imagen de satelite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imagenes © Esri y proveedores',
    maxZoom: 19,
    requiereClave: false,
    publico: true,
    nota: 'Util para reconocer la obra sobre el terreno. Servicio de cortesia de Esri, ' +
          'sujeto a sus condiciones; conviene confirmarlas si el uso deja de ser puntual.',
  },
  {
    id: 'corporativo',
    nombre: 'Servidor de mapas de EPM',
    url: null,                      // lo rellena quien despliegue
    atribucion: 'Cartografia corporativa de EPM',
    maxZoom: 20,
    requiereClave: false,
    publico: false,
    configurable: true,
    nota: 'PENDIENTE DE VALIDACION CORPORATIVA. Es la opcion preferible: no saca ' +
          'peticiones fuera de la red y no depende de terceros. Se activa poniendo la ' +
          'direccion del servidor de teselas de EPM, sin tocar el codigo.',
  },
]);

export const PROVEEDOR_POR_DEFECTO = 'carto-claro';

/** Orden en que se intenta si el elegido no responde. */
export const CADENA_RESPALDO = Object.freeze(['corporativo', 'carto-claro', 'osm', 'esri-satelite']);

export const proveedorPorId = (id) => PROVEEDORES.find((p) => p.id === id) ?? null;

/** Un proveedor es utilizable si tiene URL (el corporativo hay que configurarlo). */
export const utilizable = (p) => !!(p && p.url);

/**
 * Opciones para `L.tileLayer`. `crossOrigin` NO se incluye a proposito: ver la
 * explicacion de la cabecera. Si algun dia hiciera falta, tendria que ser una
 * decision consciente y con un proveedor que garantice CORS.
 */
export function opcionesLeaflet(p) {
  const o = { maxZoom: p.maxZoom ?? 19, attribution: p.atribucion, detectRetina: false };
  if (p.subdominios) o.subdomains = p.subdominios;
  return o;
}

/* ───────────────────── Configuracion que sobrevive a la sesion ───────────────────── */

const CLAVE = 'pmt.mapaBase.v1';

/** Lee la configuracion guardada. Nunca lanza: sin almacenamiento, valores por defecto. */
export function leerConfig(almacen) {
  const a = almacen ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const base = { proveedor: PROVEEDOR_POR_DEFECTO, urlCorporativa: '', atribucionCorporativa: '' };
  try {
    const crudo = a?.getItem(CLAVE);
    if (!crudo) return base;
    const d = JSON.parse(crudo);
    return {
      proveedor: typeof d.proveedor === 'string' ? d.proveedor : base.proveedor,
      urlCorporativa: typeof d.urlCorporativa === 'string' ? d.urlCorporativa : '',
      atribucionCorporativa: typeof d.atribucionCorporativa === 'string' ? d.atribucionCorporativa : '',
    };
  } catch { return base; }
}

export function guardarConfig(cfg, almacen) {
  const a = almacen ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  try { a?.setItem(CLAVE, JSON.stringify(cfg)); return true; } catch { return false; }
}

/**
 * Valida una URL de teselas escrita a mano. Se exige HTTPS (o localhost) para
 * no mezclar contenido inseguro, y que lleve los tres marcadores de Leaflet.
 */
export function validarUrlTeselas(url) {
  const t = String(url ?? '').trim();
  if (!t) return { ok: false, motivo: 'Escriba la direccion del servidor de teselas.' };
  if (!/^https:\/\//i.test(t) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(t)) {
    return { ok: false, motivo: 'La direccion debe empezar por https:// (o http:// solo si es de prueba en su propio equipo).' };
  }
  for (const marca of ['{z}', '{x}', '{y}']) {
    if (!t.includes(marca)) return { ok: false, motivo: `Falta ${marca} en la direccion. El formato habitual es .../{z}/{x}/{y}.png` };
  }
  return { ok: true, url: t };
}

/**
 * Resuelve que proveedor usar de verdad, aplicando la configuracion y la cadena
 * de respaldo. Devuelve tambien POR QUE, para poder decirselo al usuario.
 */
export function resolver(cfg) {
  const c = cfg ?? leerConfig();
  if (c.proveedor === SIN_FONDO) {
    return { proveedor: null, motivo: 'elegido', alternativas: [] };
  }
  const conCorporativo = (p) => (p.id === 'corporativo' && c.urlCorporativa)
    ? { ...p, url: c.urlCorporativa, atribucion: c.atribucionCorporativa || p.atribucion }
    : p;

  const elegido = conCorporativo(proveedorPorId(c.proveedor) ?? {});
  const alternativas = CADENA_RESPALDO
    .map((id) => conCorporativo(proveedorPorId(id)))
    .filter((p) => utilizable(p) && p.id !== elegido.id);

  if (utilizable(elegido)) return { proveedor: elegido, motivo: 'configurado', alternativas };
  return alternativas.length
    ? { proveedor: alternativas[0], motivo: 'respaldo', alternativas: alternativas.slice(1) }
    : { proveedor: null, motivo: 'ninguno-disponible', alternativas: [] };
}
