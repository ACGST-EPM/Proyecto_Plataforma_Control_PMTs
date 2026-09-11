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
 * Prefiltro barato por caja envolvente. Solo descarta pares que con seguridad
 * estan mas lejos que el alcance; nunca descarta un par que podria calificar.
 */
function puedenEstarCerca(a, b, alcance) {
  if (!a.caja || !b.caja) return false;
  const margenLat = alcance / GRADO_LAT_MIN_METROS;
  const latMed = (a.caja.minLat + a.caja.maxLat + b.caja.minLat + b.caja.maxLat) / 4;
  const cos = Math.max(0.01, Math.cos((latMed * Math.PI) / 180));
  const margenLon = margenLat / cos;
  return !(
    a.caja.minLon - margenLon > b.caja.maxLon ||
    b.caja.minLon - margenLon > a.caja.maxLon ||
    a.caja.minLat - margenLat > b.caja.maxLat ||
    b.caja.minLat - margenLat > a.caja.maxLat
  );
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

      // INVARIANTE: dos frentes del mismo contrato no son interferencia entre
      // contratos. Se aplica antes que cualquier calculo.
      if (config.excluirMismoContrato && a.contrato && b.contrato && a.contrato === b.contrato) {
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
