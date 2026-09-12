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
 * Tipos de cierre. LISTA CERRADA, la misma del generador y del motor.
 *
 * En la Etapa 2 se habian anadido `ingreso` y `salida` por separado. Se retiran:
 * no existe una decision aprobada que separe esos dos valores, y el contrato
 * vigente del proyecto —el que produce `Generador_KMZ.html` y el que valida
 * `motor/src/io/descripcion.js`— sigue siendo exactamente estos tres.
 */
export const TIPOS_CIERRE = Object.freeze(['total', 'parcial', 'ingreso y salida']);

/**
 * SIMBOLOGIA CARTOGRAFICA por tipo de cierre.
 *
 * Conserva el significado del mapa de QGIS, que la Etapa 2 habia perdido al
 * pintarlo todo del mismo verde:
 *   · cierre TOTAL              rojo, trazo grueso  (via cerrada por completo)
 *   · cierre PARCIAL            ambar, trazo medio  (via con paso restringido)
 *   · INGRESO Y SALIDA          azul + marcador circular propio sobre el trazado
 *   · sin dato / no reconocido  gris
 *
 * Cambios deliberados frente a QGIS, por legibilidad y accesibilidad:
 *   · el amarillo puro (#ffff00) del cierre parcial es ilegible sobre fondo
 *     claro; se sustituye por un ambar oscuro con contraste suficiente;
 *   · cada tipo lleva ademas un GROSOR y un PATRON distintos, para que no
 *     dependa solo del color: quien no distinga rojo de verde sigue leyendo el
 *     mapa. El color nunca es la unica senal.
 */
export const SIMBOLOGIA_CIERRE = Object.freeze({
  'total':            { color: '#c62828', grosor: 5,   guion: null,    etiqueta: 'Cierre total',      marcador: false },
  'parcial':          { color: '#e08600', grosor: 4,   guion: '10 5',  etiqueta: 'Cierre parcial',    marcador: false },
  'ingreso y salida': { color: '#0066cc', grosor: 3.5, guion: '2 6',   etiqueta: 'Ingreso y salida',  marcador: true },
  '(sin dato)':       { color: '#6b7075', grosor: 3,   guion: '4 4',   etiqueta: 'Sin tipo de cierre', marcador: false },
});

/** Simbologia de un registro, con respaldo seguro si el tipo no se reconoce. */
export function simbologiaDe(tipoCierre) {
  const k = String(tipoCierre ?? '').trim().toLowerCase();
  return SIMBOLOGIA_CIERRE[k] ?? SIMBOLOGIA_CIERRE['(sin dato)'];
}

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
    // PROCEDENCIA, no resultado: el motor marca aqui si este trazado es una
    // copia identica de otro del mismo origen, o si su identificador venia
    // repetido en el KMZ. Si no se arrastra hasta la fila, el contador de
    // "duplicados exactos" se queda sin respaldo en cuanto el analisis deja de
    // venir de archivos (por ejemplo, al abrir un proyecto guardado).
    duplicadoExacto: reg.duplicadoExacto === true,
    idRepetidoEnOrigen: reg.idRepetidoEnOrigen === true,
    avisos: reg.avisos ?? [],
    geometria: reg.geometria,
  };
}
