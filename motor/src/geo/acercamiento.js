/**
 * DONDE se acercan dos geometrias, no solo CUANTO.
 *
 * Extension ADITIVA de la Etapa 2.1. No modifica `medir()` ni ninguna cifra
 * aprobada en la Etapa 1: es un modulo aparte que se usa solo para DIBUJAR.
 * Su razon de ser es que un conector de centro a centro miente: pinta la
 * distancia en un sitio donde esa distancia no existe. Con esto, la linea del
 * mapa une los dos puntos reales donde los trazados se aproximan.
 *
 * COMO GARANTIZA QUE NO SE DESVIA DE LO APROBADO
 * Calcula la distancia por su cuenta y la prueba `acercamiento.test.mjs` exige
 * que coincida con `medir()` en todos los casos. Si alguna vez difiriera, la
 * bateria se pone en rojo antes de que nadie vea un mapa equivocado.
 *
 * PRECISION DE LA VUELTA A COORDENADAS
 * El minimo se localiza en el plano metrico local (el mismo que usa el motor) y
 * se devuelve al terreno interpolando sobre el segmento ORIGINAL con el mismo
 * parametro. Para segmentos de longitud urbana el error es de milimetros, y
 * este resultado no alimenta ningun calculo: solo decide donde se pinta una
 * linea.
 */
import { descomponer, cajaDe, RADIO_DOMINIO_METROS } from './geometria.js';
import { planoParaCajas } from './plano-local.js';
import { unir, radioAproximadoMetros, cotaInferiorMetros } from './cajas.js';
import { ajustarACero } from './segmentos.js';

/** Punto mas cercano de un segmento a un punto, como parametro t en [0,1]. */
function tCercanoPuntoSegmento(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return 0;
  const t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

const interp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/**
 * Par de puntos mas cercanos entre dos segmentos, con sus parametros.
 * Si se cruzan, devuelve el punto de corte con distancia cero.
 */
function cercanosSegmentoSegmento(p1, p2, q1, q2) {
  const r = [p2[0] - p1[0], p2[1] - p1[1]];
  const s = [q2[0] - q1[0], q2[1] - q1[1]];
  const denom = r[0] * s[1] - r[1] * s[0];

  if (denom !== 0) {
    const qp = [q1[0] - p1[0], q1[1] - p1[1]];
    const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
    const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { d: 0, t, u, pa: interp(p1, p2, t), pb: interp(q1, q2, u) };
    }
  }

  // No se cruzan dentro de los tramos: el minimo esta en alguno de los cuatro
  // extremos proyectados sobre el segmento contrario.
  let mejor = null;
  const probar = (t, u) => {
    const pa = interp(p1, p2, t), pb = interp(q1, q2, u);
    const d = dist(pa, pb);
    if (!mejor || d < mejor.d) mejor = { d, t, u, pa, pb };
  };
  probar(tCercanoPuntoSegmento(q1, p1, p2), 0);
  probar(tCercanoPuntoSegmento(q2, p1, p2), 1);
  probar(0, tCercanoPuntoSegmento(p1, q1, q2));
  probar(1, tCercanoPuntoSegmento(p2, q1, q2));
  return mejor;
}

/** Vertices de una parte, como lista de anillos/lineas de al menos un punto. */
function tramosDe(parte) {
  if (parte.tipo === 'punto') return [[parte.dato]];
  if (parte.tipo === 'linea') return [parte.dato];
  return [parte.dato.exterior, ...parte.dato.huecos];
}

function partesDe(geom) {
  const desc = descomponer(geom, []);
  if (!desc) return [];
  const partes = [];
  for (const p of desc.puntos) partes.push({ tipo: 'punto', dato: p });
  for (const l of desc.lineas) partes.push({ tipo: 'linea', dato: l });
  for (const g of desc.poligonos) partes.push({ tipo: 'poligono', dato: g });
  return partes.map((p) => ({ ...p, caja: cajaDe({ puntos: p.tipo === 'punto' ? [p.dato] : [],
    lineas: p.tipo === 'linea' ? [p.dato] : [], poligonos: p.tipo === 'poligono' ? [p.dato] : [] }) }))
    .filter((p) => p.caja);
}

/**
 * Encuentra donde se acercan mas dos geometrias.
 *
 * @returns {{a:[number,number]|null, b:[number,number]|null, metros:number|null,
 *            evaluable:boolean, contacto:boolean}}
 *          `a` y `b` en [lon, lat]. Si no es evaluable, todo va a null: nunca
 *          se inventa una ubicacion.
 */
export function puntosMasCercanos(geomA, geomB) {
  const partesA = partesDe(geomA), partesB = partesDe(geomB);
  const vacio = { a: null, b: null, metros: null, evaluable: false, contacto: false };
  if (!partesA.length || !partesB.length) return vacio;

  let min = Infinity, mejorA = null, mejorB = null, algunaEvaluada = false;

  for (const pa of partesA) {
    for (const pb of partesB) {
      if (cotaInferiorMetros(pa.caja, pb.caja) >= min) continue;
      const union = unir(pa.caja, pb.caja);
      if (radioAproximadoMetros(union) > RADIO_DOMINIO_METROS) continue;
      algunaEvaluada = true;

      const plano = planoParaCajas([pa.caja, pb.caja]);
      const P = plano.proyectar;
      for (const tramoA of tramosDe(pa)) {
        for (const tramoB of tramosDe(pb)) {
          const provA = tramoA.map(P), provB = tramoB.map(P);
          const nA = Math.max(1, provA.length - 1), nB = Math.max(1, provB.length - 1);
          for (let i = 0; i < nA; i++) {
            const a1 = provA[i], a2 = provA[Math.min(i + 1, provA.length - 1)];
            for (let j = 0; j < nB; j++) {
              const b1 = provB[j], b2 = provB[Math.min(j + 1, provB.length - 1)];
              const r = cercanosSegmentoSegmento(a1, a2, b1, b2);
              if (r.d >= min) continue;
              min = r.d;
              // Vuelta al terreno: mismo parametro sobre el segmento original.
              const ga1 = tramoA[i], ga2 = tramoA[Math.min(i + 1, tramoA.length - 1)];
              const gb1 = tramoB[j], gb2 = tramoB[Math.min(j + 1, tramoB.length - 1)];
              mejorA = interp(ga1, ga2, r.t);
              mejorB = interp(gb1, gb2, r.u);
            }
          }
        }
      }
    }
  }

  if (!algunaEvaluada || !Number.isFinite(min)) return vacio;
  const metros = ajustarACero(min);
  return { a: mejorA, b: mejorB, metros, evaluable: true, contacto: metros === 0 };
}
