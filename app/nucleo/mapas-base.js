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
 * CATALOGO — pocas opciones, y cada una con su estado REAL.
 *
 * ══ POR QUE SE REDUJO LA LISTA (Etapa 3) ══════════════════════════════════
 *
 * La prueba con la usuaria encontro dos fondos rotos, y la causa de cada uno
 * esta documentada:
 *
 *  · CARTO Positron enseñaba «API KEY REQUIRED» como marca de agua. No era un
 *    fallo nuestro: **CARTO cambio sus condiciones**. Sus mapas base raster
 *    ahora exigen clave y estan en retirada; sin clave se sirven marcados.
 *    Y una clave dentro de este archivo NO es una clave: el archivo se
 *    distribuye y cualquiera puede leerla. Asi que CARTO **se retira**, no se
 *    parchea.
 *
 *  · OpenStreetMap publico enseñaba «Access Blocked». Su politica permite el
 *    uso normal de un visor, pero la fundacion puede bloquear sin aviso, y
 *    bloquea en particular las peticiones que no se identifican. Una pagina
 *    abierta desde `file://` no envia origen, asi que es un candidato muy
 *    probable a ser tratada como trafico anonimo. **HIPOTESIS**, no
 *    demostrada: no se puede comprobar desde aqui contra el servicio real.
 *    Por eso OSM deja de ser opcion por defecto y de estar en la cadena de
 *    respaldo, aunque se conserva para quien lo necesite.
 *
 * ══ COMO LEER EL CAMPO `estado` ═══════════════════════════════════════════
 *
 * Cuatro cosas distintas que NO hay que confundir. Solo las dos primeras las
 * puede afirmar esta herramienta; las otras dos las tiene que responder EPM.
 *
 *   funciona   se ha comprobado que sirve teselas sin clave.
 *   licencia   'permisiva' | 'requiere-clave' | 'por-validar'.
 *   ti         'por-validar' siempre, hasta que TI de EPM diga si la red lo
 *              permite. NUNCA se escribe otra cosa sin evidencia.
 *   epm        'no-confirmado' siempre, hasta que EPM confirme que existe o
 *              que esta autorizado. NUNCA se escribe otra cosa sin evidencia.
 *
 * Ningun proveedor lleva secretos. Si alguno necesitara clave, la pondria
 * quien despliegue, jamas el codigo.
 */
export const PROVEEDORES = Object.freeze([
  {
    id: 'calles',
    nombre: 'Calles',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Cartografia © Esri y colaboradores',
    maxZoom: 19,
    estado: { funciona: true, licencia: 'por-validar', ti: 'por-validar', epm: 'no-confirmado' },
    nota: 'Callejero claro, con los nombres de via legibles. Funciona sin clave. ' +
          'Las condiciones de Esri para uso corporativo continuado NO estan confirmadas: ' +
          'hay que validarlas con EPM antes de darlo por definitivo.',
  },
  {
    id: 'satelite',
    nombre: 'Satelite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imagenes © Esri y proveedores',
    maxZoom: 19,
    estado: { funciona: true, licencia: 'por-validar', ti: 'por-validar', epm: 'no-confirmado' },
    nota: 'Imagen aerea: util para reconocer la obra sobre el terreno y para comprobar ' +
          'si un trazado cae donde se espera. Mismas condiciones por validar que el callejero.',
  },
  {
    id: 'corporativo',
    nombre: 'Mapa de EPM',
    url: null,                      // lo rellena quien despliegue
    atribucion: 'Cartografia corporativa de EPM',
    maxZoom: 20,
    configurable: true,
    estado: { funciona: null, licencia: 'por-validar', ti: 'por-validar', epm: 'no-confirmado' },
    nota: 'LA OPCION PREFERIBLE el dia que exista: no saca peticiones fuera de la red y no ' +
          'depende de terceros. Se activa escribiendo la direccion del servidor de teselas, ' +
          'sin tocar el codigo. No hay evidencia de que EPM tenga uno.',
  },
  {
    id: 'osm',
    nombre: 'OpenStreetMap (comunitario)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© colaboradores de OpenStreetMap',
    maxZoom: 19,
    avanzado: true,                 // no se ofrece de entrada: ver la cabecera
    estado: { funciona: null, licencia: 'permisiva', ti: 'por-validar', epm: 'no-confirmado' },
    nota: 'Servicio comunitario financiado con donaciones. Su politica prohibe la descarga ' +
          'masiva y permite bloquear sin aviso; en la prueba con la usuaria devolvio ' +
          '«Access Blocked». Se conserva como alternativa, no como opcion por defecto.',
  },
]);

/** Proveedores que se ofrecen de entrada. Los demas, solo si se piden. */
export const PROVEEDORES_VISIBLES = Object.freeze(PROVEEDORES.filter((p) => !p.avanzado));

/**
 * Fondo por defecto: el callejero, porque es el unico comprobado que funciona
 * sin clave y deja leer los nombres de via, que es lo que la usuaria necesita
 * para situar un cierre.
 */
export const PROVEEDOR_POR_DEFECTO = 'calles';

/**
 * Orden en que se intenta si el elegido no responde.
 *
 * El corporativo va primero porque, el dia que exista, es el que no saca
 * trafico fuera. OSM queda FUERA de la cadena: no se puede poner de respaldo
 * automatico algo que puede bloquear sin aviso.
 */
export const CADENA_RESPALDO = Object.freeze(['corporativo', 'calles', 'satelite']);

/** Identificadores que ya no existen, y a que se traducen. */
const RETIRADOS = Object.freeze({
  // CARTO exige clave desde 2025 y esta retirando el raster: sin clave, marca de agua.
  'carto-claro': 'calles',
  'carto-oscuro': 'calles',
  'esri-satelite': 'satelite',
});

/**
 * Traduce un identificador guardado por una version anterior.
 * Sin esto, quien tuviera CARTO elegido se quedaba sin fondo y sin explicacion.
 */
export function migrarProveedor(id) {
  if (RETIRADOS[id]) return { id: RETIRADOS[id], migrado: true, desde: id };
  return { id, migrado: false, desde: null };
}

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
    // Un proveedor retirado no deja al usuario sin fondo y sin explicacion:
    // se traduce al equivalente vigente y se dice que se ha traducido.
    const m = migrarProveedor(typeof d.proveedor === 'string' ? d.proveedor : base.proveedor);
    return {
      proveedor: m.id,
      migradoDesde: m.migrado ? m.desde : null,
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
