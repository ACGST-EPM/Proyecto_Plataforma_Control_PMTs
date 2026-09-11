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
import { cotaInferiorMetros } from '../geo/cajas.js';

// Se re-exporta para que las pruebas del prefiltro tengan un punto de entrada
// estable; la implementacion vive en geo/cajas.js.
export { separacionLongitud, cotaInferiorMetros } from '../geo/cajas.js';
import { traslape } from '../tiempo/intervalo.js';
import { resolverConfig, alcanceMetros } from './config.js';

/**
 * Prefiltro por caja envolvente.
 *
 * GARANTIA: nunca descarta un par que el calculo preciso situaria dentro del
 * umbral. Se apoya en `cotaInferiorMetros`, que por construccion devuelve un
 * valor menor o igual que la distancia real, asi que si esa cota ya supera el
 * alcance el par se puede tirar sin riesgo.
 *
 * El prefiltro anterior convertia grados a metros con un coseno limitado a
 * 0,01, y con eso descartaba pares reales: dos puntos a 89,999 grados de
 * latitud separados un grado entero de longitud estan a 1,9 m, y los tiraba.
 */
function puedenEstarCerca(a, b, alcance) {
  if (!a.caja || !b.caja) return false;
  return cotaInferiorMetros(a.caja, b.caja) <= alcance;
}

/** Hechos de un par concreto, sin prefiltro ni umbral. Util para pruebas. */
export function hechosDelPar(a, b, configParcial = {}) {
  const config = resolverConfig(configParcial);
  const m = medir(a.geometria, b.geometria);
  const t = traslape(a.vigencia, b.vigencia, { toleranciaMinutos: config.toleranciaMinutos });
  const umbralEfectivo = alcanceMetros(config);
  const espacialEvaluable = m.metros !== null && m.dominioValido;
  const dentro = espacialEvaluable ? m.metros <= umbralEfectivo : null;
  return {
    idA: a.id, idB: b.id,
    frenteA: a.frente, frenteB: b.frente,
    contratoA: a.contrato, contratoB: b.contrato,
    contratistaA: a.contratista, contratistaB: b.contratista,
    municipioA: a.municipio, municipioB: b.municipio,
    tipoCierreA: a.tipoCierre, tipoCierreB: b.tipoCierre,
    tipoGeometriaA: a.tipoGeometria, tipoGeometriaB: b.tipoGeometria,

    // --- hechos espaciales ---
    distanciaMetros: espacialEvaluable ? Math.round(m.metros * 1000) / 1000 : null,
    espacialEvaluable,
    dominioValido: m.dominioValido,
    estadoEspacial: !espacialEvaluable ? 'no_evaluable' : dentro ? 'dentro_del_umbral' : 'fuera_del_umbral',
    motivoNoEvaluableEspacial: espacialEvaluable ? null : m.errores.join('; '),
    intersecanFisicamente: espacialEvaluable ? m.intersecan : null,
    dentroDelUmbral: dentro,
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
    paresNoEvaluablesEspacialmente: 0,
    paresEvaluadosFueraDelUmbral: 0,
    msTotal: 0,
  };

  const t0 = Date.now();
  const relaciones = [];
  const paresNoEvaluablesEspacialmente = [];
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
      if (!h.espacialEvaluable) {
        paresNoEvaluablesEspacialmente.push(h);
        est.paresNoEvaluablesEspacialmente++;
        continue;
      }
      if (!h.dentroDelUmbral) { est.paresEvaluadosFueraDelUmbral++; continue; }

      relaciones.push(h);
      est.relaciones++;
      if (h.hayTraslapeTemporal) est.conTraslape++;
      if (h.intersecanFisicamente) est.conInterseccion++;
      if (!h.traslapeEvaluable) est.noEvaluablesPorFechas++;
    }
  }
  est.msTotal = Date.now() - t0;
  return { relaciones, paresNoEvaluablesEspacialmente, estadisticas: est, config };
}
