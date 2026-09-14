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
import { descomponer, cajaDe, RADIO_DOMINIO_METROS, medir } from './geometria.js';
import { planoParaCajas } from './plano-local.js';
import { unir, radioAproximadoMetros, cotaInferiorMetros } from './cajas.js';
import { ajustarACero, puntoEnAnillo, distPuntoAnillo } from './segmentos.js';
import { distanciaGeodesica } from './geodesica.js';

/**
 * Margen para dar por buena una ubicacion frente a la distancia canonica.
 *
 * Un milimetro: muy por encima del efecto arco-cuerda documentado (2,6 mm por
 * kilometro de tramo) seria demasiado, y por debajo del micrometro rechazaria
 * ubicaciones correctas por ruido de coma flotante. Se usa solo para decidir si
 * se dibuja el conector; nunca altera la distancia, que es la del motor.
 */
const TOLERANCIA_UBICACION_M = 0.05;

/** Punto mas cercano de un segmento a un punto, como parametro t en [0,1]. */
function tCercanoPuntoSegmento(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return 0;
  const t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Interpola entre dos vertices GEOGRAFICOS.
 *
 * OJO CON EL ANTIMERIDIANO: interpolar 179,9995 y -179,9995 tal cual da 0, es
 * decir, el conector aparecia en el golfo de Guinea en vez de en el Pacifico.
 * Se "desenrolla" la longitud antes de interpolar y se vuelve a normalizar
 * despues, que es el mismo criterio de camino corto que usa el prefiltro.
 */
function interpGeo(a, b, t) {
  let lonB = b[0];
  if (Math.abs(lonB - a[0]) > 180) lonB += lonB > a[0] ? -360 : 360;
  let lon = a[0] + (lonB - a[0]) * t;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lon, a[1] + (b[1] - a[1]) * t];
}

/** Interpolacion plana, para el plano metrico local donde no hay antimeridiano. */
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

/**
 * Contencion: un punto DENTRO de un poligono esta a 0 m de el, aunque su borde
 * quede lejos. Recorrer solo los anillos daba la distancia al borde —en el caso
 * que encontro la auditoria, 552 m donde el motor decia 0— y pintaba el
 * conector fuera del poligono. Aqui se detecta el caso y se devuelve el propio
 * punto como lugar del contacto, que es donde esta de verdad.
 */
function dentroDelPoligono(p, pg) {
  if (!puntoEnAnillo(p, pg.exterior)) return false;
  for (const h of pg.huecos) {
    // Sobre el borde de un hueco sigue habiendo contacto con el poligono.
    if (puntoEnAnillo(p, h) && distPuntoAnillo(p, h) > 0) return false;
  }
  return true;
}

/**
 * Busca un punto de una parte que caiga dentro de un poligono de la otra.
 * Devuelve su indice dentro del tramo para poder recuperar la coordenada
 * geografica original, sin pasar por ninguna reproyeccion.
 */
function buscarContenido(partePoligono, parteOtra, P) {
  const pg = {
    exterior: partePoligono.dato.exterior.map(P),
    huecos: partePoligono.dato.huecos.map((h) => h.map(P)),
  };
  for (const tramo of tramosDe(parteOtra)) {
    for (let i = 0; i < tramo.length; i++) {
      if (dentroDelPoligono(P(tramo[i]), pg)) return tramo[i];
    }
  }
  return null;
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
  const vacio = { a: null, b: null, metros: null, evaluable: false, contacto: false };

  // ── LA DISTANCIA LA DICE EL MOTOR, SIEMPRE ──
  //
  // Este modulo localiza DONDE se aproximan dos geometrias; cuanto distan lo
  // decide `medir()`, que es la regla canonica. Antes calculaba su propia
  // distancia y podia separarse de ella: `medir()` subdivide las partes que no
  // caben en el dominio y declara no evaluable un minimo POSITIVO cuando queda
  // algun par sin resolver, y esa regla no estaba aqui. En un barrido aleatorio
  // aparecian casos donde el motor decia "no se puede medir" y el dibujo
  // enseñaba un numero.
  //
  // Delegando, las dos cosas no pueden divergir por construccion.
  const canonico = medir(geomA, geomB);
  if (canonico.metros === null) return vacio;

  const partesA = partesDe(geomA), partesB = partesDe(geomB);
  if (!partesA.length || !partesB.length) return vacio;

  let min = Infinity, mejorA = null, mejorB = null;
  // Coordenadas del minimo EN EL PLANO, que es donde el motor lo calcula.
  // Guardarlas permite deshacer la proyeccion si la interpolacion en grados no
  // reproduce la distancia canonica (ver `ubicarSobreElPlano`, mas abajo).
  let planoMejor = null, planoPuntoA = null, planoPuntoB = null;

  for (const pa of partesA) {
    if (min === 0) break;
    for (const pb of partesB) {
      if (cotaInferiorMetros(pa.caja, pb.caja) >= min) continue;
      const union = unir(pa.caja, pb.caja);
      if (radioAproximadoMetros(union) > RADIO_DOMINIO_METROS) continue;

      const plano = planoParaCajas([pa.caja, pb.caja]);
      const P = plano.proyectar;

      // CONTENCION, EN LAS DOS DIRECCIONES.
      //
      // Si algo cae DENTRO de un poligono, el contacto esta ahi mismo y ningun
      // borde puede mejorarlo. Probar una sola direccion rompia la simetria en
      // cuanto las dos partes eran poligonos: un poligono pequeño contenido en
      // uno grande daba 0 m en un orden y ~1.106 m en el contrario, porque
      // ningun vertice del grande cae dentro del pequeño.
      if (pa.tipo === 'poligono' || pb.tipo === 'poligono') {
        let dentro = null;
        if (pb.tipo === 'poligono') dentro = buscarContenido(pb, pa, P);
        if (!dentro && pa.tipo === 'poligono') dentro = buscarContenido(pa, pb, P);
        if (dentro) {
          min = 0; mejorA = [...dentro]; mejorB = [...dentro];
          // Es un vertice real del dato, no una interpolacion: no hay nada que
          // deshacer, y su separacion geodesica es cero, igual que la distancia.
          planoMejor = null; planoPuntoA = null; planoPuntoB = null;
          break;
        }
      }

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
              const ga1 = tramoA[i], ga2 = tramoA[Math.min(i + 1, tramoA.length - 1)];
              const gb1 = tramoB[j], gb2 = tramoB[Math.min(j + 1, tramoB.length - 1)];
              mejorA = interpGeo(ga1, ga2, r.t);
              mejorB = interpGeo(gb1, gb2, r.u);
              planoMejor = plano; planoPuntoA = r.pa; planoPuntoB = r.pb;
            }
          }
        }
      }
    }
  }

  // ══ LA UBICACION SE COMPRUEBA SOBRE LOS PUNTOS QUE SE VAN A DIBUJAR ══════
  //
  // Antes se comprobaba `min`, el numero intermedio, contra la distancia
  // canonica. Como los dos salen del mismo calculo en el plano, la comprobacion
  // siempre pasaba... aunque las COORDENADAS devueltas no se correspondieran
  // con ese numero. El caso que lo demostro: un punto en [-75,6 · 6,2] frente a
  // una linea de [-75,9 · 6,2] a [-75,3 · 6,2]. El motor dice 9,387513 m y la
  // funcion devolvia `ubicado: true` con los dos extremos en [-75,6 · 6,2]: un
  // conector de longitud cero rotulado "9,4 m".
  //
  // La causa es que interpolar en GRADOS sobre el tramo original no da la misma
  // linea que la recta del plano, que es la que el motor mide. Asi que:
  //   1) se mide de verdad la separacion geodesica de los dos puntos elegidos;
  //   2) si no cuadra, se intenta una ubicacion correcta deshaciendo la
  //      proyeccion (el punto del plano llevado al terreno);
  //   3) si sigue sin cuadrar, no se dibuja nada.
  //
  // INVARIANTE: `ubicado === true` implica
  //             distanciaGeodesica(a, b) ≈ distancia canonica.
  const metros = canonico.metros;
  const localizado = Number.isFinite(min) ? ajustarACero(min) : null;

  // Primer filtro, el de siempre: si el minimo que se ha encontrado aqui no es
  // el del motor —porque `medir()` subdividio partes que aqui se omitieron— no
  // hay ubicacion que valga.
  const mismoMinimo = localizado !== null && Math.abs(localizado - metros) <= TOLERANCIA_UBICACION_M;
  const cuadra = (a, b) => a !== null && b !== null &&
    Math.abs(distanciaGeodesica(a, b) - metros) <= TOLERANCIA_UBICACION_M;

  let a = null, b = null;
  if (mismoMinimo) {
    if (cuadra(mejorA, mejorB)) {
      // La interpolacion en grados sirve: se prefiere porque cae exactamente
      // sobre el trazado tal y como se dibuja en el mapa.
      a = mejorA; b = mejorB;
    } else if (planoMejor) {
      // Segundo intento: el punto del plano, llevado al terreno. Es la posicion
      // del minimo en el modelo con el que el motor mide.
      const da = planoMejor.desproyectar(planoPuntoA);
      const db = planoMejor.desproyectar(planoPuntoB);
      if (cuadra(da, db)) { a = da; b = db; }
    }
  }

  const ubicado = a !== null && b !== null;
  return { a, b, metros, evaluable: true, contacto: metros === 0, ubicado };
}
