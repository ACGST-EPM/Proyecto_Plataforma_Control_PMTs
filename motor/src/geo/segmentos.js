/**
 * Operaciones planas elementales sobre puntos y segmentos.
 * Todo lo de este archivo trabaja en METROS sobre un plano ya proyectado.
 * No sabe nada de grados ni de latitudes: eso es responsabilidad de plano-local.js.
 *
 * ── TOLERANCIA NUMERICA ────────────────────────────────────────────────────
 *
 * Estas funciones se comparaban antes con cero exacto (`=== 0`). Eso es fragil:
 * dos segmentos que se cruzan de verdad pueden dar un producto cruzado de
 * 1e-13 en lugar de 0 por el redondeo de la coma flotante, y entonces el motor
 * decia "no se tocan" cuando si se tocan.
 *
 * Se introduce una tolerancia NUMERICA de 1 micrometro:
 *
 *     TOLERANCIA_NUMERICA_METROS = 1e-6
 *
 * QUE ES: el margen por debajo del cual dos valores se consideran iguales
 * porque la aritmetica de doble precision no puede distinguirlos.
 *
 * DE DONDE SALE EL VALOR: las coordenadas geocentricas rondan los 6,4 millones
 * de metros, y la doble precision guarda unas 16 cifras significativas, asi que
 * cada componente arrastra un error de ~1,4 nanometros. Al rotarlas al plano
 * local y combinarlas, el residuo medido en casos reales llega a ~16 nanometros:
 * el punto medio del borde de un poligono, que geometricamente esta sobre el
 * borde, se calcula a 1,65e-8 m de el. Con 1 micrometro queda un margen de unas
 * 60 veces sobre ese residuo, y sigue siendo una magnitud sin ningun sentido
 * fisico: el pelo humano mide 70 micrometros.
 *
 * QUE NO ES: NO tiene nada que ver con el umbral operacional de cercania de
 * 120 m. Aquel dice "estos trazados estan lo bastante cerca como para que
 * importe"; este dice "estos dos numeros son el mismo numero". Un micrometro es
 * 120 millones de veces mas pequeno que el umbral de trabajo, asi que ninguna
 * decision de negocio puede depender de el.
 *
 * LO QUE ESTA TOLERANCIA NO ARREGLA, porque no es un problema de redondeo: un
 * tramo entre dos puntos de la misma latitud es una recta en el plano, mientras
 * que el paralelo es una curva. La separacion entre ambos crece con el cuadrado
 * de la distancia: 0,03 mm en 111 m, 2,6 mm en 1,1 km y 26 cm en 11 km. Los
 * meridianos, en cambio, si proyectan rectos. Es geometria de la Tierra, no
 * aritmetica, y esta documentado con pruebas propias.
 *
 * El predicado de orientacion, ademas, se normaliza dividiendo por la longitud
 * del segmento: asi el resultado es una DISTANCIA perpendicular en metros y no
 * un area en metros cuadrados, y la tolerancia significa lo mismo para un
 * segmento de 2 m que para uno de 2 km.
 */

/** Margen por debajo del cual dos magnitudes en metros son indistinguibles. */
export const TOLERANCIA_NUMERICA_METROS = 1e-6;

/** Redondea a cero exacto lo que este dentro de la tolerancia numerica. */
export const ajustarACero = (d) => (d <= TOLERANCIA_NUMERICA_METROS ? 0 : d);

/** Distancia de un punto a un segmento (ambos en el plano métrico). */
export function distPuntoSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = 0;
  if (L2 > 0) {
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return ajustarACero(Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
}

/**
 * Distancia perpendicular con signo del punto c a la recta que pasa por a y b.
 * En METROS, no en metros cuadrados: eso es lo que permite usar una tolerancia
 * con sentido fisico. Si a y b coinciden, devuelve la distancia de c al punto.
 */
function alturaConSigno(a, b, c) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const largo = Math.hypot(dx, dy);
  const cruz = dx * (c[1] - a[1]) - dy * (c[0] - a[0]);
  if (largo <= TOLERANCIA_NUMERICA_METROS) return Math.hypot(c[0] - a[0], c[1] - a[1]);
  return cruz / largo;
}

/** Signo del punto respecto de la recta, con la tolerancia numérica aplicada. */
function ladoDe(a, b, c) {
  const h = alturaConSigno(a, b, c);
  if (Math.abs(h) <= TOLERANCIA_NUMERICA_METROS) return 0; // sobre la recta
  return h > 0 ? 1 : -1;
}

function enCaja(a, b, p) {
  const t = TOLERANCIA_NUMERICA_METROS;
  return (
    Math.min(a[0], b[0]) - t <= p[0] && p[0] <= Math.max(a[0], b[0]) + t &&
    Math.min(a[1], b[1]) - t <= p[1] && p[1] <= Math.max(a[1], b[1]) + t
  );
}

/**
 * ¿Se cortan los segmentos p1p2 y q1q2?
 * Cubre el cruce normal, los extremos compartidos, los vértices que caen sobre
 * el otro segmento y los casos colineales que se solapan.
 */
export function seCortan(p1, p2, q1, q2) {
  const o1 = ladoDe(p1, p2, q1);
  const o2 = ladoDe(p1, p2, q2);
  const o3 = ladoDe(q1, q2, p1);
  const o4 = ladoDe(q1, q2, p2);
  // Cruce propio: cada segmento deja al otro con un extremo a cada lado.
  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) return true;
  // Casos con algún extremo sobre el otro segmento (incluye los colineales).
  if (o1 === 0 && enCaja(p1, p2, q1)) return true;
  if (o2 === 0 && enCaja(p1, p2, q2)) return true;
  if (o3 === 0 && enCaja(q1, q2, p1)) return true;
  if (o4 === 0 && enCaja(q1, q2, p2)) return true;
  return false;
}

/** Distancia mínima entre dos segmentos. Devuelve 0 exacto si se cortan. */
export function distSegmentoSegmento(p1, p2, q1, q2) {
  if (seCortan(p1, p2, q1, q2)) return 0;
  return ajustarACero(Math.min(
    distPuntoSegmento(p1, q1, q2),
    distPuntoSegmento(p2, q1, q2),
    distPuntoSegmento(q1, p1, p2),
    distPuntoSegmento(q2, p1, p2)
  ));
}

/**
 * ¿El punto está dentro del anillo? Algoritmo del rayo (par/impar).
 * Un punto sobre el borde (dentro de la tolerancia numérica) se considera
 * DENTRO, porque para detectar interferencias lo que importa es que haya
 * contacto.
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
  return ajustarACero(min);
}
