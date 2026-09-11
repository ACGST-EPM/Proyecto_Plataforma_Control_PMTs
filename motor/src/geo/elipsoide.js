/**
 * Constantes y geometría del elipsoide WGS84 (EPSG:4326), que es el sistema en
 * el que vienen todas las coordenadas de un KML/KMZ por definición del formato.
 *
 * Ningún valor de este archivo depende de una zona geográfica concreta.
 */

/** Semieje mayor en metros. */
export const A = 6378137.0;
/** Achatamiento inverso. */
export const INV_F = 298.257223563;
/** Achatamiento. */
export const F = 1 / INV_F;
/** Semieje menor en metros. */
export const B = A * (1 - F);
/** Primera excentricidad al cuadrado. */
export const E2 = F * (2 - F);

export const gradARad = (g) => (g * Math.PI) / 180;
export const radAGrad = (r) => (r * 180) / Math.PI;

/**
 * Radio de curvatura de la primera vertical en la latitud dada.
 * @param {number} latRad latitud en radianes
 */
export function radioNormal(latRad) {
  const s = Math.sin(latRad);
  return A / Math.sqrt(1 - E2 * s * s);
}

/**
 * Radio de curvatura del meridiano en la latitud dada.
 * @param {number} latRad latitud en radianes
 */
export function radioMeridiano(latRad) {
  const s = Math.sin(latRad);
  return (A * (1 - E2)) / Math.pow(1 - E2 * s * s, 1.5);
}

/**
 * Coordenadas geocéntricas cartesianas (ECEF) de un punto sobre el elipsoide.
 * @param {number} lonG longitud en grados
 * @param {number} latG latitud en grados
 * @param {number} [h] altura elipsoidal en metros (se ignora en el uso normal)
 * @returns {[number,number,number]} [X, Y, Z] en metros
 */
export function aEcef(lonG, latG, h = 0) {
  const lon = gradARad(lonG);
  const lat = gradARad(latG);
  const N = radioNormal(lat);
  const cosLat = Math.cos(lat);
  return [
    (N + h) * cosLat * Math.cos(lon),
    (N + h) * cosLat * Math.sin(lon),
    (N * (1 - E2) + h) * Math.sin(lat),
  ];
}
