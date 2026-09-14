/**
 * Vincenty inverso: distancia geodésica exacta sobre el elipsoide WGS84.
 *
 * IMPORTANTE: este archivo NO forma parte del camino de cálculo del motor.
 * Existe como REFERENCIA INDEPENDIENTE para las pruebas: es un algoritmo
 * distinto (iterativo, sobre la esfera auxiliar) al del plano tangente local,
 * así que si ambos coinciden en muchos casos, el acuerdo es una señal real y
 * no una tautología.
 *
 * Referencia: T. Vincenty (1975), "Direct and inverse solutions of geodesics
 * on the ellipsoid with application of nested equations", Survey Review 23.
 */

import { A, B, F, gradARad } from './elipsoide.js';

/**
 * @param {[number,number]} p1 [lon, lat] en grados
 * @param {[number,number]} p2 [lon, lat] en grados
 * @returns {number} distancia geodésica en metros
 */
export function distanciaGeodesica([lon1, lat1], [lon2, lat2]) {
  const L = gradARad(lon2 - lon1);
  const U1 = Math.atan((1 - F) * Math.tan(gradARad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(gradARad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L, lambdaAnt, iter = 0;
  let sinSigma = 0, cosSigma = 0, sigma = 0, cos2SigmaM = 0, cosSqAlpha = 0;

  do {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    );
    if (sinSigma === 0) return 0; // puntos coincidentes
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    lambdaAnt = lambda;
    lambda =
      L +
      (1 - C) * F * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    // Tolerancia 1e-14 rad (~60 nm sobre la superficie terrestre): este archivo
    // es la referencia de las pruebas, asi que conviene que converja mas fino
    // que la precision que se le exige al motor.
  } while (Math.abs(lambda - lambdaAnt) > 1e-14 && ++iter < 200);

  if (iter >= 200) return NaN; // antipodales: no converge (no ocurre en uso real)

  // Series clasicas de Vincenty (1975). Se usan estas y no la simplificacion
  // de Helmert con k1 porque aquella pierde ~1,6 m en 55 km, y este archivo
  // existe precisamente para ser la referencia exacta de las pruebas.
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const Aa = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bb = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    Bb * sinSigma *
    (cos2SigmaM +
      (Bb / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (Bb / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  return B * Aa * (sigma - deltaSigma);
}
