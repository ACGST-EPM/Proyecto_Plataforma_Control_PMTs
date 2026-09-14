/**
 * ZONA DE INFLUENCIA DE SEÑALIZACIÓN — el modelo espacial candidato.
 *
 * ══ QUÉ REPRESENTA, Y QUÉ NO ══════════════════════════════════════════════
 *
 * La geometría de un KMZ representa el CIERRE: una línea es el tramo vial que
 * se cierra; un punto es un ingreso o salida de vehículos de obra.
 *
 * Pero un PMT no es solo el cierre. Alrededor se instala señalización vertical
 * para advertir, informar y canalizar a quien circula, y operativamente se
 * considera que puede haberla hasta unos 120 m alrededor de la geometría.
 *
 * LA ZONA DE 120 m NO DICE QUE HAYA UNA SEÑAL EN CADA PUNTO. Dice:
 *
 *     «zona aproximada de influencia de la señalización de este PMT».
 *
 * La geometría original NUNCA se toca. La zona es un dato DERIVADO que se
 * calcula para mirar y para decidir coincidencias; el trazado sigue siendo el
 * que venía en el KMZ.
 *
 * ══ EL TEOREMA QUE HACE QUE ESTO SEA EXACTO Y BARATO ══════════════════════
 *
 * Para zonas métricas de verdad (el conjunto de puntos a distancia ≤ r de una
 * geometría), se cumple una identidad exacta:
 *
 *     zona(A, rA)  ∩  zona(B, rB)  ≠  ∅     ⟺     dist(A, B)  ≤  rA + rB
 *
 * Demostración, en los dos sentidos:
 *
 *  (⇐) Si dist(A,B) = d ≤ rA + rB, tómense los puntos a∈A y b∈B que realizan
 *      esa distancia mínima y el punto p del segmento geodésico a→b situado a
 *      distancia min(rA, d) de a. Entonces dist(p,A) ≤ rA y
 *      dist(p,B) ≤ d − min(rA,d) ≤ rB. Luego p está en las dos zonas.
 *
 *  (⇒) Si existe p en las dos zonas, entonces dist(A,B) ≤ dist(A,p) + dist(p,B)
 *      ≤ rA + rB por desigualdad triangular.
 *
 * CONSECUENCIA PRÁCTICA, que es lo que importa: para DECIDIR si dos zonas se
 * superponen **no hace falta construir ni intersecar ningún polígono**. Basta
 * comparar la distancia mínima —que el motor ya calcula, y que está auditada
 * contra un oráculo— con la suma de los dos radios.
 *
 * Con radio 120 m en los dos PMT, el modelo candidato es EXACTAMENTE:
 *
 *     coincidencia espacial  ⟺  distancia mínima ≤ 240 m
 *
 * Esto NO es una aproximación: es la misma pregunta escrita de otra forma. Y
 * evita la trampa de construir buffers poligonales, que sí serían aproximados
 * (un arco discretizado en 16 o 32 segmentos se queda por dentro del círculo) y
 * habrían introducido falsos negativos cerca del borde.
 *
 * Los polígonos de zona que genera este módulo son, por tanto, SOLO PARA
 * DIBUJAR. No deciden nada.
 */
import { planoLocal } from './plano-local.js';
import { descomponer, cajaDe } from './geometria.js';

/** Radio operativo por defecto de la zona de influencia, en metros. */
export const RADIO_INFLUENCIA_METROS = 120;

/**
 * ¿Se superponen las zonas de influencia de dos geometrías?
 *
 * No construye polígonos: aplica la identidad de la cabecera sobre la distancia
 * que ya calculó el motor.
 *
 * @param {number|null} distanciaMinimaMetros  lo que devolvió `medir()`
 * @param {number} radioA
 * @param {number} radioB
 * @returns {boolean|null} `null` si la distancia no se pudo medir: no se sabe,
 *                         y eso no es lo mismo que «no se superponen».
 */
export function zonasSeSuperponen(distanciaMinimaMetros, radioA = RADIO_INFLUENCIA_METROS,
  radioB = RADIO_INFLUENCIA_METROS) {
  if (distanciaMinimaMetros === null || distanciaMinimaMetros === undefined) return null;
  if (!Number.isFinite(distanciaMinimaMetros)) return null;
  return distanciaMinimaMetros <= radioA + radioB;
}

/**
 * Cuánto se solapan las zonas, medido de forma honesta.
 *
 * Es la anchura del solape a lo largo de la línea de mínima distancia:
 * `rA + rB − d`. Con d = 0 (los trazados se tocan) vale rA + rB.
 *
 * NO es el área del solape. El área exigiría construir e intersecar polígonos,
 * y para decidir o para ordenar casos esta medida lineal es suficiente y no
 * depende de cuántos lados tenga un arco dibujado.
 *
 * @returns {number|null} metros de solape, 0 si se tocan justo, `null` si no se
 *                        pudo medir.
 */
export function solapeMetros(distanciaMinimaMetros, radioA = RADIO_INFLUENCIA_METROS,
  radioB = RADIO_INFLUENCIA_METROS) {
  if (distanciaMinimaMetros === null || !Number.isFinite(distanciaMinimaMetros)) return null;
  const s = radioA + radioB - distanciaMinimaMetros;
  return s < 0 ? 0 : s;
}

/* ═══════════════ POLÍGONOS DE ZONA — SOLO PARA DIBUJAR ═══════════════ */

/**
 * Desplaza un punto geográfico `metros` en la dirección `angulo` (radianes,
 * 0 = este, π/2 = norte), usando el plano métrico local.
 *
 * Es exacto a escala de cientos de metros, que es la única a la que se usa.
 */
function desplazar(plano, [lon, lat], metros, angulo) {
  const [e, n] = plano.proyectar([lon, lat]);
  return plano.desproyectar([e + metros * Math.cos(angulo), n + metros * Math.sin(angulo)]);
}

/** Anillo circular de `lados` vértices alrededor de un punto. */
function circulo(plano, centro, radio, lados) {
  const anillo = [];
  for (let i = 0; i <= lados; i++) {
    anillo.push(desplazar(plano, centro, radio, (2 * Math.PI * i) / lados));
  }
  return anillo;
}

/**
 * Polígono aproximado de la zona de influencia de una geometría, PARA DIBUJAR.
 *
 * ══ POR QUÉ ES APROXIMADO, Y POR QUÉ NO IMPORTA ═══════════════════════════
 *
 * Un buffer exacto de una línea es un «estadio»: dos semicírculos unidos por un
 * rectángulo. Aquí se dibuja como la unión de círculos en cada vértice más los
 * rectángulos de cada tramo, que es visualmente equivalente y no necesita una
 * librería de geometría.
 *
 * Lo importante: **este polígono no decide nada**. Quien decide si dos zonas se
 * superponen es `zonasSeSuperponen`, que trabaja con la distancia exacta. Si el
 * dibujo y la decisión discreparan en un píxel, manda la decisión — y hay una
 * prueba que exige que la decisión no dependa del dibujo.
 *
 * @returns {{type:'MultiPolygon', coordinates:Array}|null}
 */
export function zonaDeInfluencia(geometria, radio = RADIO_INFLUENCIA_METROS, { lados = 24 } = {}) {
  const desc = descomponer(geometria, []);
  if (!desc) return null;
  const caja = cajaDe(desc);
  if (!caja) return null;
  const plano = planoLocal((caja.minLon + caja.maxLon) / 2, (caja.minLat + caja.maxLat) / 2);

  const poligonos = [];
  const tramos = [];
  for (const p of desc.puntos) tramos.push([p]);
  for (const l of desc.lineas) tramos.push(l);
  for (const g of desc.poligonos) { tramos.push(g.exterior); for (const h of g.huecos) tramos.push(h); }

  for (const tramo of tramos) {
    // Un círculo en cada vértice: cubre los extremos y los codos.
    for (const v of tramo) poligonos.push([circulo(plano, v, radio, lados)]);
    // Y un rectángulo por cada tramo, para el cuerpo de la línea.
    for (let i = 0; i + 1 < tramo.length; i++) {
      const [e1, n1] = plano.proyectar(tramo[i]);
      const [e2, n2] = plano.proyectar(tramo[i + 1]);
      const dx = e2 - e1, dy = n2 - n1;
      const largo = Math.hypot(dx, dy);
      if (largo === 0) continue;
      const nx = (-dy / largo) * radio, ny = (dx / largo) * radio;
      poligonos.push([[
        plano.desproyectar([e1 + nx, n1 + ny]), plano.desproyectar([e2 + nx, n2 + ny]),
        plano.desproyectar([e2 - nx, n2 - ny]), plano.desproyectar([e1 - nx, n1 - ny]),
        plano.desproyectar([e1 + nx, n1 + ny]),
      ]]);
    }
  }
  if (!poligonos.length) return null;
  return { type: 'MultiPolygon', coordinates: poligonos };
}
