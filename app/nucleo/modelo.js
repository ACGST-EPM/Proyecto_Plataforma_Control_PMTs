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
import { estadoDocumental } from '../../motor/src/modelo/documental.js';

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
/**
 * SIMBOLOGIA DE LOS CIERRES — rediseñada en la Etapa 3.
 *
 * ══ QUE NO FUNCIONABA ═════════════════════════════════════════════════════
 *
 * La usuaria dijo que la linea punteada del cierre PARCIAL no se entendia. Y
 * tenia razon por un motivo concreto: los tres tipos se distinguian SOLO por el
 * color y por el patron de guiones. A tamaño de mapa, `10 5` y `2 6` se parecen;
 * y quien no distinga bien el rojo del naranja —entre un 5 % y un 8 % de los
 * hombres— no ve ninguna diferencia.
 *
 * ══ EL CRITERIO NUEVO ═════════════════════════════════════════════════════
 *
 * Cada tipo se reconoce por TRES cosas a la vez, no por una:
 *
 *   CIERRE TOTAL      linea GRUESA y CONTINUA.  «la via esta cerrada»
 *   CIERRE PARCIAL    linea mas fina con un TRAZO LARGO Y CLARO, y un halo
 *                     blanco debajo.            «se pasa, pero a medias»
 *   INGRESO Y SALIDA  no es una linea: es un PUNTO con anillo. Es lo que es:
 *                     un sitio, no un tramo.
 *
 * El grosor hace de jerarquia —cuanto mas cerrado, mas gruesa la linea— asi que
 * el orden se lee incluso en blanco y negro. Y el patron de guiones del parcial
 * pasa a `14 8`: suficientemente largo para no confundirse con un punteado fino.
 *
 * ══ EL HALO ═══════════════════════════════════════════════════════════════
 *
 * Todas las lineas llevan un contorno blanco por debajo. Sobre un callejero con
 * las vias en gris claro y sobre una imagen de satelite oscura, una linea de
 * color puro se pierde; con halo se lee sobre las dos. Es la tecnica habitual
 * en cartografia y no añade color.
 */
export const SIMBOLOGIA_CIERRE = Object.freeze({
  'total': {
    color: '#c1272d', grosor: 6, guion: null, halo: 3, marcador: false,
    etiqueta: 'Cierre total',
    ayuda: 'La via queda cerrada al transito en ese tramo.',
    forma: 'linea-continua',
  },
  'parcial': {
    color: '#d56b00', grosor: 4.5, guion: '14 8', halo: 3, marcador: false,
    etiqueta: 'Cierre parcial',
    ayuda: 'Se mantiene el paso, con la calzada reducida o desviada.',
    forma: 'linea-trazos',
  },
  'ingreso y salida': {
    color: '#1565c0', grosor: 3, guion: null, halo: 2, marcador: true,
    etiqueta: 'Ingreso y salida',
    ayuda: 'Punto por donde entran y salen los vehiculos de la obra.',
    forma: 'punto-anillo',
  },
  '(sin dato)': {
    color: '#6b7075', grosor: 3, guion: '3 5', halo: 2, marcador: false,
    etiqueta: 'Sin tipo de cierre',
    ayuda: 'El KMZ no dice de que tipo es. Falta un dato, no es un tipo mas.',
    forma: 'linea-punteada',
  },
});

/**
 * COLORES DE LA COORDINACION — deliberadamente pocos.
 *
 * El mapa ya usa tres colores para los tipos de cierre. Si la coordinacion
 * usara otros tres, habria seis colores compitiendo y ninguno significaria
 * nada. Asi que la coordinacion NO se dice con color de relleno: se dice con
 * una ZONA translucida y su SUPERPOSICION, que es lo que representa de verdad.
 */
export const SIMBOLOGIA_COORDINACION = Object.freeze({
  zona: { color: '#009300', opacidad: 0.10, borde: '#009300', opacidadBorde: 0.35, guionBorde: '6 4' },
  superposicion: { color: '#d56b00', opacidad: 0.30, borde: '#a35200', opacidadBorde: 0.8 },
  seleccionA: { color: '#009300', grosor: 8 },
  seleccionB: { color: '#1565c0', grosor: 8 },
  contexto: { color: '#b6bcc1', opacidad: 0.35 },
});

/** Simbologia de un registro, con respaldo seguro si el tipo no se reconoce. */
export function simbologiaDe(tipoCierre) {
  const k = String(tipoCierre ?? '').trim().toLowerCase();
  return SIMBOLOGIA_CIERRE[k] ?? SIMBOLOGIA_CIERRE['(sin dato)'];
}

/**
 * Muestra en SVG del simbolo, para leyendas y fichas.
 *
 * Se dibuja igual que en el mapa —mismo grosor, mismo halo, mismo trazo— para
 * que la leyenda y el mapa no puedan decir cosas distintas.
 */
export function muestraSvg(tipoCierre, { ancho = 44, alto = 16 } = {}) {
  const s = simbologiaDe(tipoCierre);
  const y = alto / 2;
  if (s.forma === 'punto-anillo') {
    return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" aria-hidden="true">` +
      `<circle cx="${ancho / 2}" cy="${y}" r="6" fill="#fff"/>` +
      `<circle cx="${ancho / 2}" cy="${y}" r="5" fill="none" stroke="${s.color}" stroke-width="3"/>` +
      `<circle cx="${ancho / 2}" cy="${y}" r="1.6" fill="${s.color}"/></svg>`;
  }
  const guion = s.guion ? ` stroke-dasharray="${s.guion}"` : '';
  return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" aria-hidden="true">` +
    `<line x1="2" y1="${y}" x2="${ancho - 2}" y2="${y}" stroke="#fff" stroke-width="${s.grosor + s.halo}" stroke-linecap="round"${guion}/>` +
    `<line x1="2" y1="${y}" x2="${ancho - 2}" y2="${y}" stroke="${s.color}" stroke-width="${s.grosor}" stroke-linecap="round"${guion}/></svg>`;
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
    // SEGUIMIENTO DOCUMENTAL: el codigo (o null) y su estado derivado.
    resolucionPmt: reg.resolucionPmt ?? null,
    permisoRotura: reg.permisoRotura ?? null,
    cierrePermisoRotura: reg.cierrePermisoRotura ?? null,
    documental: reg.documental ?? estadoDocumental(reg),
    avisos: reg.avisos ?? [],
    geometria: reg.geometria,
  };
}
