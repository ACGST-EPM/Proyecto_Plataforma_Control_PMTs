/**
 * NUCLEO DEL MOTOR: calculo de HECHOS entre pares de registros.
 *
 * PRINCIPIO (requisito 1 de la Etapa 1): este archivo no clasifica nada.
 * Produce hechos medidos y deja que otro modulo, u otra persona, decida que
 * significan. Por eso no aparece aqui ninguna palabra como "critico" o
 * "alerta": solo distancias, intersecciones, vigencias y traslapes.
 *
 * Cada relacion responde, para dos registros de contratos distintos:
 *   - distanciaMetros      distancia minima real entre las geometrias
 *   - dentroDelUmbral      si esa distancia cae dentro del umbral configurado
 *   - intersecanFisicamente si las geometrias se tocan de verdad (distancia 0)
 *   - vigencias completas de ambos, con hora
 *   - hayTraslapeTemporal  con fecha y hora, tolerancia configurable
 *   - inicio, fin y duracion del traslape
 *   - contratos, identificadores estables y geometrias implicadas
 *   - avisos de calidad heredados de cualquiera de los dos registros
 */

import { medir } from '../geo/geometria.js';
import { traslape } from '../tiempo/intervalo.js';
import { resolverConfig, alcanceMetros } from './config.js';

/** Grados de latitud equivalentes a un metro (cota superior segura). */
const GRADO_LAT_MIN_METROS = 110574;

/**
 * Separacion angular minima, en grados, entre dos intervalos de longitud
 * MEDIDA SOBRE EL CIRCULO.
 *
 * Es imprescindible que sea circular: la longitud da la vuelta en +-180. Dos
 * trazados separados 110 m a los lados del antimeridiano tienen longitudes
 * 179.9995 y -179.9995, y una resta normal los ve a 359.999 grados de
 * distancia, es decir, casi una vuelta entera al planeta. Con la resta normal
 * el prefiltro los descartaba y el par nunca llegaba a medirse, aunque el
 * calculo final si sabia tratarlos.
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

/**
 * Prefiltro barato por caja envolvente. Solo descarta pares que con seguridad
 * estan mas lejos que el alcance; nunca descarta un par que podria calificar.
 */
function puedenEstarCerca(a, b, alcance) {
  if (!a.caja || !b.caja) return false;
  const margenLat = alcance / GRADO_LAT_MIN_METROS;

  // Separacion en latitud: no hay vuelta que dar, resta directa.
  const huecoLat = Math.max(0, Math.max(a.caja.minLat - b.caja.maxLat, b.caja.minLat - a.caja.maxLat));
  if (huecoLat > margenLat) return false;

  // Separacion en longitud: circular, para no romperse en el antimeridiano.
  // El margen en grados de longitud se ensancha con la latitud; se toma la
  // latitud mas alejada del ecuador de las dos cajas, que es la que da el
  // margen mas ancho, para no descartar nunca un par por quedarse corto.
  const latExtrema = Math.max(
    Math.abs(a.caja.minLat), Math.abs(a.caja.maxLat),
    Math.abs(b.caja.minLat), Math.abs(b.caja.maxLat)
  );
  const cos = Math.max(0.01, Math.cos((latExtrema * Math.PI) / 180));
  const margenLon = margenLat / cos;
  const huecoLon = separacionLongitud(a.caja.minLon, a.caja.maxLon, b.caja.minLon, b.caja.maxLon);
  return huecoLon <= margenLon;
}

/** Hechos de un par concreto, sin prefiltro ni umbral. Util para pruebas. */
export function hechosDelPar(a, b, configParcial = {}) {
  const config = resolverConfig(configParcial);
  const m = medir(a.geometria, b.geometria);
  const t = traslape(a.vigencia, b.vigencia, { toleranciaMinutos: config.toleranciaMinutos });
  const umbralEfectivo = alcanceMetros(config);
  return {
    idA: a.id, idB: b.id,
    frenteA: a.frente, frenteB: b.frente,
    contratoA: a.contrato, contratoB: b.contrato,
    contratistaA: a.contratista, contratistaB: b.contratista,
    municipioA: a.municipio, municipioB: b.municipio,
    tipoCierreA: a.tipoCierre, tipoCierreB: b.tipoCierre,
    tipoGeometriaA: a.tipoGeometria, tipoGeometriaB: b.tipoGeometria,

    // --- hechos espaciales ---
    distanciaMetros: m.metros === null ? null : Math.round(m.metros * 1000) / 1000,
    intersecanFisicamente: m.intersecan,
    dentroDelUmbral: m.metros !== null && m.metros <= umbralEfectivo,
    umbralAplicadoMetros: umbralEfectivo,

    // --- hechos temporales ---
    vigenciaA: { inicio: a.vigencia.inicio, fin: a.vigencia.fin, valida: a.vigencia.valida },
    vigenciaB: { inicio: b.vigencia.inicio, fin: b.vigencia.fin, valida: b.vigencia.valida },
    hayTraslapeTemporal: t.hayTraslape,
    traslapeEvaluable: t.evaluable,
    vigenciasContiguas: t.contiguas,
    traslapeInicio: t.inicio,
    traslapeFin: t.fin,
    traslapeDias: t.duracionDias,
    traslapeHoras: t.duracionHoras,
    motivoSinTraslape: t.motivo,

    // --- trazabilidad ---
    geometriaA: a.geometria, geometriaB: b.geometria,
    avisos: [
      ...m.errores.map((e) => `geometria: ${e}`),
      ...(a.avisos.length ? [`registro A (${a.frente ?? 'sin nombre'}): ${a.avisos.length} aviso(s)`] : []),
      ...(b.avisos.length ? [`registro B (${b.frente ?? 'sin nombre'}): ${b.avisos.length} aviso(s)`] : []),
    ],
  };
}

/**
 * Recorre todos los pares de registros y devuelve los hechos de los que estan
 * dentro del alcance espacial.
 *
 * @param {Array} registros
 * @param {object} [configParcial]
 * @returns {{relaciones:Array, estadisticas:object, config:object}}
 */
export function calcularRelaciones(registros, configParcial = {}) {
  const config = resolverConfig(configParcial);
  const alcance = alcanceMetros(config);
  const utiles = registros.filter((r) => r.tieneGeometria && r.caja);

  const est = {
    registros: registros.length,
    conGeometria: utiles.length,
    sinGeometria: registros.length - utiles.length,
    paresTotales: (utiles.length * (utiles.length - 1)) / 2,
    paresMismoContrato: 0,
    paresSinContrato: 0,
    paresDescartadosPorCaja: 0,
    distanciasCalculadas: 0,
    relaciones: 0,
    conTraslape: 0,
    conInterseccion: 0,
    noEvaluablesPorFechas: 0,
    msTotal: 0,
  };

  const t0 = Date.now();
  const relaciones = [];
  for (let i = 0; i < utiles.length; i++) {
    for (let j = i + 1; j < utiles.length; j++) {
      const a = utiles[i], b = utiles[j];

      // REGISTROS SIN CONTRATO.
      //
      // Un trazado al que le falta el contrato se conserva y se muestra como
      // dato con problema de calidad (aparece en `registros`, con su aviso y
      // su geometria), pero NO puede participar en una relacion, porque una
      // interferencia se define ENTRE CONTRATOS DISTINTOS y aqui no se sabe a
      // que contrato pertenece. Antes se colaba: al no tener contrato, la
      // comprobacion de "mismo contrato" se saltaba y dos trazados sin
      // contrato se comparaban como si fueran de contratos diferentes.
      if (!a.contrato || !b.contrato) {
        est.paresSinContrato++;
        continue;
      }

      // INVARIANTE: dos frentes del mismo contrato no son interferencia entre
      // contratos. Se aplica antes que cualquier calculo.
      if (config.excluirMismoContrato && a.contrato === b.contrato) {
        est.paresMismoContrato++;
        continue;
      }
      if (!puedenEstarCerca(a, b, alcance)) { est.paresDescartadosPorCaja++; continue; }

      est.distanciasCalculadas++;
      const h = hechosDelPar(a, b, config);
      if (!h.dentroDelUmbral) continue;

      relaciones.push(h);
      est.relaciones++;
      if (h.hayTraslapeTemporal) est.conTraslape++;
      if (h.intersecanFisicamente) est.conInterseccion++;
      if (!h.traslapeEvaluable) est.noEvaluablesPorFechas++;
    }
  }
  est.msTotal = Date.now() - t0;
  return { relaciones, estadisticas: est, config };
}
