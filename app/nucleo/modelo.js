/**
 * MODELO INTERNO DE LA APLICACION
 *
 * Un unico modelo estable, derivado directamente de lo que produce el motor.
 * NO es el CSV legado: el CSV queda como formato de EXPORTACION, no como
 * estructura de trabajo. Aqui no hay indices numericos ni columnas posicionales.
 *
 * Cada PMT conserva todo lo que venia en el KMZ mas su diagnostico de calidad.
 * Nada se pierde por el camino: si un dato falta, el campo queda en null y el
 * motivo queda escrito en `avisos`.
 */

/** Campos que el producto garantiza conservar de cada PMT. */
export const CAMPOS_PMT = Object.freeze([
  'id', 'frente', 'contrato', 'contratista', 'proyecto', 'municipio',
  'direccion', 'tipoCierre', 'inicio', 'fin', 'geometria', 'origenArchivo',
]);

/**
 * Tipos de cierre reconocidos.
 *
 * `total`, `parcial` e `ingreso y salida` son la lista historica cerrada que
 * produce `Generador_KMZ.html` y que valida el motor. `ingreso` y `salida` se
 * aceptan ademas por separado: se anaden SIN retirar el valor compuesto, de
 * modo que ningun KMZ que hoy sea valido deja de serlo.
 */
export const TIPOS_CIERRE = Object.freeze(['total', 'parcial', 'ingreso y salida', 'ingreso', 'salida']);

/** Estado de evaluacion espacial de una relacion, sin ambiguedad posible. */
export const ESPACIAL = Object.freeze({
  CONTACTO: 'contacto',          // las geometrias se tocan de verdad (0 m)
  CERCANIA: 'cercania',          // dentro del umbral, pero no se tocan
  FUERA: 'fuera',                // medido, y esta fuera del umbral
  NO_EVALUABLE: 'no-evaluable',  // NO se pudo determinar. No es "no hay".
});

/** Estado de evaluacion temporal, con la misma disciplina. */
export const TEMPORAL = Object.freeze({
  COINCIDE: 'coincide',
  NO_COINCIDE: 'no-coincide',
  NO_EVALUABLE: 'no-evaluable',
});

/** Como se lee cada archivo de entrada. */
export const LECTURA = Object.freeze({
  COMPLETA: 'completa',
  PARCIAL: 'parcial',
  FALLIDA: 'fallida',
});

/** Clasifica el hecho espacial de una relacion. NO le pone criticidad. */
export function estadoEspacial(rel) {
  if (rel.espacialEvaluable === false) return ESPACIAL.NO_EVALUABLE;
  if (rel.distanciaMetros === null || rel.distanciaMetros === undefined) return ESPACIAL.NO_EVALUABLE;
  if (rel.intersecanFisicamente) return ESPACIAL.CONTACTO;
  if (rel.dentroDelUmbral === false) return ESPACIAL.FUERA;
  return ESPACIAL.CERCANIA;
}

/** Clasifica el hecho temporal. "No se sabe" nunca se presenta como "no". */
export function estadoTemporal(rel) {
  if (rel.traslapeEvaluable === false) return TEMPORAL.NO_EVALUABLE;
  return rel.hayTraslapeTemporal ? TEMPORAL.COINCIDE : TEMPORAL.NO_COINCIDE;
}

/** Etiquetas en castellano llano, para una persona que no es tecnica. */
export const ETIQUETA_ESPACIAL = Object.freeze({
  [ESPACIAL.CONTACTO]: 'Se tocan',
  [ESPACIAL.CERCANIA]: 'Cerca',
  [ESPACIAL.FUERA]: 'Lejos',
  [ESPACIAL.NO_EVALUABLE]: 'No se pudo analizar',
});

export const ETIQUETA_TEMPORAL = Object.freeze({
  [TEMPORAL.COINCIDE]: 'A la vez',
  [TEMPORAL.NO_COINCIDE]: 'En otro momento',
  [TEMPORAL.NO_EVALUABLE]: 'No se pudo analizar',
});

/**
 * Aplana un registro del motor a la vista que usa la interfaz. Deja la
 * vigencia en campos planos para poder ordenar y filtrar sin rodeos, pero
 * conserva el objeto completo por si hace falta el detalle.
 */
export function aFilaPmt(reg) {
  return {
    id: reg.id,
    frente: reg.frente,
    contrato: reg.contrato,
    contratista: reg.contratista,
    proyecto: reg.proyecto,
    municipio: reg.municipio,
    direccion: reg.direccion,
    tipoCierre: reg.tipoCierre,
    inicio: reg.vigencia?.inicio ?? null,
    fin: reg.vigencia?.fin ?? null,
    inicioMs: reg.vigencia?.inicioMs ?? null,
    finMs: reg.vigencia?.finMs ?? null,
    vigenciaValida: reg.vigencia?.valida ?? false,
    tipoGeometria: reg.tipoGeometria,
    tieneGeometria: reg.tieneGeometria,
    analizable: reg.analizable,
    origenArchivo: reg.origenArchivo,
    carpeta: reg.carpeta,
    avisos: reg.avisos ?? [],
    geometria: reg.geometria,
  };
}
