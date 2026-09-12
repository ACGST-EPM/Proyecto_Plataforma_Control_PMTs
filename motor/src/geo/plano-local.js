/**
 * PROYECCIÓN MÉTRICA LOCAL — decisión técnica central del motor.
 *
 * Problema: hay que medir distancias en METROS entre geometrías que llegan en
 * grados (lon/lat WGS84), con precisión suficiente alrededor de un umbral de
 * 120 m, y SIN quedar atado a una región concreta del planeta.
 *
 * Solución adoptada: plano tangente local ENU (Este-Norte-Arriba) construido
 * por rotación de coordenadas geocéntricas (ECEF) alrededor de un punto de
 * referencia que se calcula PARA CADA CÁLCULO a partir de los propios datos.
 *
 * Por qué es defendible:
 *  - Es el mismo método que usan los sistemas de navegación para trabajo local.
 *    No es una aproximación casera ni una constante calibrada a una ciudad.
 *  - Funciona en cualquier latitud y longitud del planeta, incluidos los polos
 *    y el antimeridiano, porque la rotación se hace en el espacio cartesiano.
 *  - No necesita elegir zona UTM, ni origen nacional, ni tabla de husos, así que
 *    no se rompe cuando los datos cruzan un límite de zona.
 *  - El error frente a la distancia geodésica real crece como d³/(6R²): a 120 m
 *    es del orden de 10⁻⁸ m, y a 10 km sigue siendo de milímetros. El archivo
 *    de pruebas lo mide contra dos referencias independientes (Vincenty y Turf).
 *  - Se implementa en ~30 líneas sin dependencias, así que el producto final
 *    puede ser un único archivo portable.
 *
 * Alternativas evaluadas y descartadas (ver motor/README.md para el detalle):
 *  - Equirectangular calibrada a Medellín: rápida, pero impone una restricción
 *    territorial innecesaria. Descartada.
 *  - UTM con selección automática de huso: estándar, pero introduce factor de
 *    escala (hasta ~1 ‰) y falla cuando los datos cruzan husos. Descartada.
 *  - proj4js con EPSG:9377 (MAGNA-SIRGAS / Origen Nacional): correcta para
 *    Colombia, pero añade dependencia y vuelve a atar el motor a un país.
 *    Descartada como base; se puede añadir después si se necesita exportar a
 *    un CRS oficial concreto.
 *  - Distancia geodésica exacta segmento a segmento sobre el elipsoide: no
 *    tiene forma cerrada y exigiría optimización numérica por par. Es
 *    sobreingeniería para una tolerancia de metros. Descartada.
 */

import { aEcef, gradARad, radAGrad, A, B, E2, radioNormal } from './elipsoide.js';
import { unir } from './cajas.js';

/**
 * ECEF -> geodesicas WGS84 (metodo de Bowring). Devuelve [lon, lat, altura].
 *
 * Se necesita para poder DESHACER la proyeccion local, es decir, para saber a
 * que punto del terreno corresponde una coordenada del plano metrico. No
 * interviene en ninguna medida: `medir()` no lo usa.
 */
function deEcef(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  const ep2 = (A * A - B * B) / (B * B);
  const theta = Math.atan2(z * A, p * B);
  const st = Math.sin(theta), ct = Math.cos(theta);
  const lat = Math.atan2(z + ep2 * B * st * st * st, p - E2 * A * ct * ct * ct);
  const N = radioNormal(lat);
  const sl = Math.sin(lat), cl = Math.cos(lat);
  // Cerca de los polos `p` tiende a 0 y dividir por el coseno pierde precision:
  // ahi se usa la componente Z, que es la que domina.
  const h = Math.abs(cl) > 1e-10 ? p / cl - N : z / sl - N * (1 - E2);
  return [radAGrad(lon), radAGrad(lat), h];
}

/**
 * Crea un plano tangente local centrado en (lonG, latG).
 * Devuelve un objeto con la función de proyección y los datos del origen.
 */
export function planoLocal(lonG, latG) {
  const lon = gradARad(lonG);
  const lat = gradARad(latG);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const [x0, y0, z0] = aEcef(lonG, latG);

  /**
   * Proyecta [lon, lat] (grados) a [este, norte] en metros respecto del origen.
   * @param {[number,number]} par
   * @returns {[number,number]}
   */
  function proyectar([pl, pf]) {
    const [x, y, z] = aEcef(pl, pf);
    const dx = x - x0, dy = y - y0, dz = z - z0;
    return [
      -sinLon * dx + cosLon * dy,
      -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz,
    ];
  }

  /**
   * DESHACE la proyeccion: de [este, norte] en metros a [lon, lat] en grados.
   *
   * ══ PARA QUE SIRVE ═══════════════════════════════════════════════════════
   *
   * El motor mide sobre este plano: un tramo entre dos vertices es, para el
   * calculo, la RECTA del plano que los une. Cuando hace falta saber en que
   * punto del terreno cae el minimo, interpolar en grados sobre el tramo
   * original no vale: la recta en grados y la recta del plano no son la misma
   * linea. En un tramo de 66 km a lo largo de un paralelo se separan 9,4 m, y
   * ese fue justamente el caso que dejaba el conector del mapa con los dos
   * extremos en el mismo sitio mientras el motor declaraba 9,39 m de distancia.
   *
   * ══ POR QUE HAY QUE ITERAR ═══════════════════════════════════════════════
   *
   * La proyeccion tira la componente vertical, asi que la vuelta necesita una
   * condicion que la fije. Se impone la natural: el punto esta SOBRE el
   * elipsoide (altura 0). Se parte de altura 0 en el plano tangente, se mira la
   * altura que sale y se corrige. Converge en dos o tres pasos porque la
   * vertical local y la del punto casi coinciden a distancias de decenas de km.
   *
   * No participa en ninguna medida: se usa solo para situar un dibujo.
   */
  function desproyectar([este, norte]) {
    // Vectores unitarios ENU en el origen, expresados en ECEF.
    const ex = -sinLon, ey = cosLon, ez = 0;
    const nx = -sinLat * cosLon, ny = -sinLat * sinLon, nz = cosLat;
    const ux = cosLat * cosLon, uy = cosLat * sinLon, uz = sinLat;

    let arriba = 0, salida = null;
    for (let i = 0; i < 8; i++) {
      const x = x0 + este * ex + norte * nx + arriba * ux;
      const y = y0 + este * ey + norte * ny + arriba * uy;
      const z = z0 + este * ez + norte * nz + arriba * uz;
      salida = deEcef(x, y, z);
      if (Math.abs(salida[2]) < 1e-6) break;
      arriba -= salida[2];
    }
    return [salida[0], salida[1]];
  }

  return { origen: [lonG, latG], proyectar, desproyectar };
}

/**
 * Plano tangente centrado en el punto medio de una lista de cajas envolventes
 * geográficas. Se usa para que el origen quede siempre cerca de los datos que
 * se están comparando, que es lo que mantiene el error en el orden del milímetro.
 *
 * Trata correctamente el cruce del antimeridiano: si el tramo de longitudes es
 * más corto pasando por ±180°, promedia por ahí.
 *
 * @param {Array<{minLon:number,minLat:number,maxLon:number,maxLat:number}>} cajas
 */
export function planoParaCajas(cajas) {
  const { minLat, maxLat, minLon, maxLon } = cajas.reduce(unir);
  const latRef = (minLat + maxLat) / 2;
  let lonRef = (minLon + maxLon) / 2;
  return planoLocal(lonRef, latRef);
}
