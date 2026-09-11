/**
 * Operaciones planas elementales sobre puntos y segmentos.
 * Todo lo de este archivo trabaja en METROS sobre un plano ya proyectado.
 * No sabe nada de grados ni de latitudes: eso es responsabilidad de plano-local.js.
 */

/** Distancia de un punto a un segmento (ambos en el plano métrico). */
export function distPuntoSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = 0;
  if (L2 > 0) {
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Orientación del triplete (>0 antihorario, <0 horario, 0 colineal). */
function orientacion(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function enCaja(a, b, p) {
  return (
    Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
  );
}

/** ¿Se cortan los segmentos p1p2 y q1q2? Incluye los casos colineales. */
export function seCortan(p1, p2, q1, q2) {
  const o1 = orientacion(p1, p2, q1);
  const o2 = orientacion(p1, p2, q2);
  const o3 = orientacion(q1, q2, p1);
  const o4 = orientacion(q1, q2, p2);
  if (((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0)) && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) {
    return true;
  }
  if (o1 === 0 && enCaja(p1, p2, q1)) return true;
  if (o2 === 0 && enCaja(p1, p2, q2)) return true;
  if (o3 === 0 && enCaja(q1, q2, p1)) return true;
  if (o4 === 0 && enCaja(q1, q2, p2)) return true;
  return false;
}

/** Distancia mínima entre dos segmentos. Devuelve 0 exacto si se cortan. */
export function distSegmentoSegmento(p1, p2, q1, q2) {
  if (seCortan(p1, p2, q1, q2)) return 0;
  return Math.min(
    distPuntoSegmento(p1, q1, q2),
    distPuntoSegmento(p2, q1, q2),
    distPuntoSegmento(q1, p1, p2),
    distPuntoSegmento(q2, p1, p2)
  );
}

/**
 * ¿El punto está dentro del anillo? Algoritmo del rayo (par/impar).
 * Un punto exactamente sobre el borde se considera DENTRO, porque para detectar
 * interferencias lo que importa es que haya contacto.
 */
export function puntoEnAnillo(p, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[i], b = anillo[j];
    if (distPuntoSegmento(p, a, b) === 0) return true; // sobre el borde
    const corta = (a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (corta) dentro = !dentro;
  }
  return dentro;
}

/** Distancia mínima de un punto a un anillo cerrado (solo al borde). */
export function distPuntoAnillo(p, anillo) {
  let min = Infinity;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const d = distPuntoSegmento(p, anillo[j], anillo[i]);
    if (d < min) min = d;
    if (min === 0) return 0;
  }
  return min;
}
