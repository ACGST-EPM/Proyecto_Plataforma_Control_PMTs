/**
 * Cajas envolventes geograficas: separacion circular en longitud y cotas
 * inferiores de distancia en METROS.
 *
 * Estas funciones son la base de dos cosas que tienen que ser correctas por
 * construccion:
 *
 *  1. El PREFILTRO de pares nunca debe descartar un par que el calculo preciso
 *     situaria dentro del umbral. Para garantizarlo se usa una COTA INFERIOR:
 *     un numero que siempre es menor o igual que la distancia real. Si esa cota
 *     ya supera el umbral, el par se puede descartar con total seguridad.
 *
 *  2. La poda entre partes de una geometria multiple, por el mismo motivo.
 *
 * Todas las conversiones de grados a metros usan los factores MINIMOS, porque
 * al subestimar la distancia la cota sigue siendo inferior y el filtro sigue
 * siendo seguro. Es deliberado: preferimos calcular de mas a perder un par.
 */

/** Metros por grado de latitud: se usa el valor MINIMO del elipsoide (ecuador). */
export const METROS_POR_GRADO_LAT_MIN = 110574;
/** Metros por grado de longitud en el ecuador (el maximo posible). */
const METROS_POR_GRADO_LON_ECUADOR = 111320;

/**
 * Separacion angular minima, en grados, entre dos intervalos de longitud
 * MEDIDA SOBRE EL CIRCULO.
 *
 * Es imprescindible que sea circular: la longitud da la vuelta en +-180. Dos
 * trazados separados 110 m a los lados del antimeridiano tienen longitudes
 * 179.9995 y -179.9995, y una resta normal los ve a 359.999 grados, es decir,
 * casi una vuelta entera al planeta.
 *
 * Se prueba el segundo intervalo desplazado una vuelta a cada lado y se toma
 * la separacion menor. Devuelve 0 si los intervalos se solapan.
 */
export function separacionLongitud(aMin, aMax, bMin, bMax) {
  let menor = Infinity;
  for (const vuelta of [-360, 0, 360]) {
    const b1 = bMin + vuelta, b2 = bMax + vuelta;
    const hueco = Math.max(0, Math.max(aMin - b2, b1 - aMax));
    if (hueco < menor) menor = hueco;
  }
  return menor;
}

/** Separacion en latitud, en grados. No hay vuelta que dar. */
export function separacionLatitud(a, b) {
  return Math.max(0, Math.max(a.minLat - b.maxLat, b.minLat - a.maxLat));
}

/**
 * COTA INFERIOR de la distancia entre dos cajas, en metros.
 *
 * Garantia: el valor devuelto es SIEMPRE menor o igual que la distancia real
 * entre cualquier punto de una caja y cualquier punto de la otra.
 *
 * Como se consigue:
 *  - La separacion en latitud se convierte con 110.574 m/grado, que es el valor
 *    MINIMO del elipsoide WGS84: subestima, luego la cota sigue siendo inferior.
 *  - La separacion en longitud se convierte con el factor de la latitud MAS
 *    ALEJADA del ecuador de las dos cajas, que es donde un grado de longitud
 *    mide menos. Cerca del polo ese factor tiende a cero y la aportacion
 *    longitudinal se anula, que es justo lo correcto: a 89,999 grados de
 *    latitud, un grado entero de longitud son menos de dos metros.
 *
 * Esta ultima parte es la que corrige el defecto que tenia el prefiltro: antes
 * se limitaba el coseno a 0,01 y con eso descartaba pares que estaban a dos
 * metros de distancia real.
 */
export function cotaInferiorMetros(a, b) {
  // Las cajas en grados no acotan los segmentos proyectados en ENU. La
  // conversion anterior sobreestimaba incluso pares de puntos en los polos.
  // Cero es una cota demostrable para TODOS los tipos: desactiva esa poda.
  return 0;
}

/** Arco circular menor que contiene los vertices; puede terminar sobre 180°. */
export function cajaCircular(vertices) {
  if (!vertices.length) return null;
  const lons = vertices.map((p) => p[0]).sort((a, b) => a - b);
  let inicio = 0, mayorHueco = lons[0] + 360 - lons.at(-1);
  for (let i = 1; i < lons.length; i++) {
    const hueco = lons[i] - lons[i - 1];
    if (hueco > mayorHueco) { mayorHueco = hueco; inicio = i; }
  }
  return {
    minLon: lons[inicio], maxLon: inicio ? lons[inicio - 1] + 360 : lons.at(-1),
    minLat: vertices.reduce((n, p) => Math.min(n, p[1]), Infinity),
    maxLat: vertices.reduce((n, p) => Math.max(n, p[1]), -Infinity),
  };
}

/** Union de dos cajas, tratando correctamente el cruce del antimeridiano. */
export function unir(a, b) {
  const minLat = Math.min(a.minLat, b.minLat);
  const maxLat = Math.max(a.maxLat, b.maxLat);
  // Para la longitud se elige el desplazamiento de b que produzca el arco menor.
  let mejor = null, mejorAncho = Infinity;
  for (const vuelta of [-360, 0, 360]) {
    const minLon = Math.min(a.minLon, b.minLon + vuelta);
    const maxLon = Math.max(a.maxLon, b.maxLon + vuelta);
    const ancho = maxLon - minLon;
    if (ancho < mejorAncho) { mejorAncho = ancho; mejor = { minLon, maxLon }; }
  }
  return { minLat, maxLat, minLon: mejor.minLon, maxLon: mejor.maxLon };
}

/**
 * COTA SUPERIOR del radio que ocuparia una caja alrededor de su centro, en
 * metros. Se usa para decidir si la proyeccion local sigue siendo defendible.
 * Sobreestima a proposito: usa los factores MAXIMOS.
 */
export function radioAproximadoMetros(caja) {
  const altoGrados = caja.maxLat - caja.minLat;
  const anchoGrados = Math.min(360, caja.maxLon - caja.minLon);
  // Para el ancho se usa el coseno de la latitud MAS CERCANA al ecuador, que es
  // donde un grado de longitud mide mas: asi el radio queda sobreestimado.
  const latMasCercana = Math.min(Math.abs(caja.minLat), Math.abs(caja.maxLat));
  const cruzaEcuador = caja.minLat <= 0 && caja.maxLat >= 0;
  const cosMax = cruzaEcuador ? 1 : Math.cos((latMasCercana * Math.PI) / 180);
  // Longitud de un camino meridiano + paralelo desde el centro: cota superior
  // (la hipotenusa no era una demostracion sobre una superficie curva).
  const alto = altoGrados * 111700;
  const ancho = anchoGrados * 111700 * cosMax;
  return (alto + ancho) / 2;
}
