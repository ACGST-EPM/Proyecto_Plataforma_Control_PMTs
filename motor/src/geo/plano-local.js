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

import { aEcef, gradARad } from './elipsoide.js';
import { unir } from './cajas.js';

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

  return { origen: [lonG, latG], proyectar };
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
