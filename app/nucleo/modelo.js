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
    // ══ LINEA CONTINUA, NO DISCONTINUA ══════════════════════════════════
    //
    // La usuaria lo pidio expresamente, y el motivo es solido: un cierre
    // parcial NO es un tramo intermitente. La linea discontinua se lee como
    // «aqui si, aqui no», cuando lo que ocurre es que TODO el tramo esta
    // afectado y lo que se reduce es la calzada.
    //
    // Al quitar el guion hay que devolver la diferencia por otro sitio, o los
    // tres tipos vuelven a distinguirse solo por color: el parcial es mas
    // FINO que el total y lleva un nucleo claro encima (forma `linea-doble`),
    // que es la convencion de «calzada reducida» y se ve en blanco y negro.
    color: '#d56b00', grosor: 5, guion: null, halo: 3, marcador: false,
    nucleo: { color: '#ffe0b8', grosor: 1.6 },
    etiqueta: 'Cierre parcial',
    ayuda: 'Se mantiene el paso, con la calzada reducida o desviada.',
    forma: 'linea-doble',
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
  const linea = (color, ancho2, extra = '') =>
    `<line x1="2" y1="${y}" x2="${ancho - 2}" y2="${y}" stroke="${color}" ` +
    `stroke-width="${ancho2}" stroke-linecap="round"${guion}${extra}/>`;
  return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" aria-hidden="true">` +
    linea('#fff', s.grosor + s.halo) +
    linea(s.color, s.grosor) +
    // NUCLEO CLARO: distingue el cierre parcial del total sin usar guiones y
    // sin depender del color. Se ve tambien impreso en blanco y negro.
    (s.nucleo ? linea(s.nucleo.color, s.nucleo.grosor) : '') +
    '</svg>';
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

/* ═══════════ LECTURA OPERATIVA (PROVISIONAL, Etapa 3) ═══════════════════
 *
 * ══ QUE PROBLEMA RESUELVE ══════════════════════════════════════════════
 *
 * «Se tocan» y «A la vez» son HECHOS MEDIDOS: dicen que paso en el terreno y
 * en el calendario. Pero quien coordina no pregunta eso, pregunta «¿tengo que
 * sentar a estos dos contratistas en la misma mesa?». Esa segunda pregunta es
 * una CONSECUENCIA OPERATIVA, y hasta ahora habia que deducirla leyendo dos
 * columnas y cruzandolas mentalmente.
 *
 * ══ POR QUE NO SE LLAMA «CRITICO» ══════════════════════════════════════
 *
 * «Critico» afirma una prioridad, y una prioridad implica un criterio aprobado
 * (quien cede, en cuanto tiempo, con que consecuencia) que EPM no ha definido.
 * Este vocabulario NO prioriza: solo nombra la consecuencia inmediata.
 *
 *   COINCIDENCIA_ESPACIAL  los dos ocupan el mismo espacio segun el criterio
 *                          espacial VIGENTE, pero NO a la vez. Se sabe que
 *                          comparten sitio; no hace falta coordinar fechas.
 *   ARTICULACION_REQUERIDA ocupan el mismo espacio Y coinciden en el tiempo.
 *                          Hay que articular: dos obras a la vez en el mismo
 *                          punto es lo que esta plataforma existe para detectar.
 *   SIN_COINCIDENCIA       se midio y no comparten espacio.
 *   NO_EVALUABLE           no se pudo comprobar. NUNCA es «sin coincidencia».
 *
 * ══ LO QUE NO HACE ═════════════════════════════════════════════════════
 *
 * No sustituye a `estadoEspacial` ni a `estadoTemporal`: se DERIVA de ellos y
 * se presenta AL LADO, nunca en su lugar. Y depende del criterio espacial
 * vigente, asi que en cualquier sitio donde salga tiene que salir tambien con
 * que criterio se calculo (`describirModeloEspacial`).
 */
export const OPERATIVO = Object.freeze({
  ARTICULACION_REQUERIDA: 'articulacion-requerida',
  COINCIDENCIA_ESPACIAL: 'coincidencia-espacial',
  SIN_COINCIDENCIA: 'sin-coincidencia',
  NO_EVALUABLE: 'no-evaluable',
});

export const ETIQUETA_OPERATIVO = Object.freeze({
  [OPERATIVO.ARTICULACION_REQUERIDA]: 'Articulación requerida',
  [OPERATIVO.COINCIDENCIA_ESPACIAL]: 'Coincidencia espacial',
  [OPERATIVO.SIN_COINCIDENCIA]: 'Sin coincidencia',
  [OPERATIVO.NO_EVALUABLE]: 'No se pudo analizar',
});

/** Qué significa cada lectura, en una frase, para ponerlo donde se muestre. */
export const EXPLICACION_OPERATIVO = Object.freeze({
  [OPERATIVO.ARTICULACION_REQUERIDA]:
    'Comparten espacio y además coinciden en el tiempo: hay que coordinar entre contratos.',
  [OPERATIVO.COINCIDENCIA_ESPACIAL]:
    'Comparten espacio, pero en momentos distintos: no exige coordinar fechas.',
  [OPERATIVO.SIN_COINCIDENCIA]:
    'Se midió y no comparten espacio con el criterio vigente.',
  [OPERATIVO.NO_EVALUABLE]:
    'No se pudo comprobar. No significa que no exista coincidencia.',
});

/**
 * Deriva la lectura operativa de una relación. NO prioriza y NO clasifica
 * criticidad: solo nombra la consecuencia de dos hechos ya medidos.
 */
export function lecturaOperativa(rel) {
  const e = estadoEspacial(rel), t = estadoTemporal(rel);
  if (e === ESPACIAL.NO_EVALUABLE) return OPERATIVO.NO_EVALUABLE;
  if (e === ESPACIAL.FUERA) return OPERATIVO.SIN_COINCIDENCIA;
  // Comparten espacio. Falta saber si a la vez, y «no se sabe» no es «no».
  if (t === TEMPORAL.NO_EVALUABLE) return OPERATIVO.NO_EVALUABLE;
  if (t !== TEMPORAL.COINCIDE) return OPERATIVO.COINCIDENCIA_ESPACIAL;

  // ══ EL TRASLAPE TIENE QUE SEGUIR VIVO ═══════════════════════════════════
  //
  // Articular es ponerse de acuerdo sobre un tramo de tiempo compartido. Si ese
  // tramo YA PASÓ ENTERO, no queda nada que acordar: la coincidencia ocurrió.
  //
  // Ojo con lo que NO se hace aquí: la relación no se borra ni se degrada a
  // «sin coincidencia». Los dos siguen compartiendo espacio, y eso sigue siendo
  // cierto hoy. Lo único que caduca es la posibilidad de coordinar aquel
  // solape. El hecho —que coincidieron, cuándo y cuántos días— está intacto en
  // `hayTraslapeTemporal`, `traslapeInicio` y `traslapeFin`, y volver a mirar
  // aquella fecha devuelve la articulación entera.
  //
  // `articulacionVigente` lo pone la vista (`marcarVigenciaDeRelaciones`) a
  // partir de la FECHA DE REFERENCIA. Si no viene, no se supone nada: se
  // mantiene la lectura de los hechos, que es lo que hacía antes.
  if (rel.articulacionVigente === false) return OPERATIVO.COINCIDENCIA_ESPACIAL;
  return OPERATIVO.ARTICULACION_REQUERIDA;
}

/**
 * Lectura operativa AJUSTADA a la relevancia temporal de la pareja.
 *
 * ══ POR QUÉ HACE FALTA, Y POR QUÉ VA APARTE ══════════════════════════════
 *
 * `lecturaOperativa` lee HECHOS: distancia y traslape. Pero si uno de los dos
 * PMT no se puede situar en el tiempo, no se puede afirmar que la pareja sea
 * algo sobre lo que actuar hoy — ni tampoco que no lo sea. Decir
 * «articulación requerida» sería prometer una acción sin base; decir «sin
 * coincidencia» sería negar un hecho que sí está medido.
 *
 * La respuesta correcta es la tercera: NO SE PUDO COMPROBAR.
 *
 * Va en una función aparte y no dentro de `lecturaOperativa` porque son dos
 * preguntas distintas: qué dicen los hechos, y qué se puede hacer desde la
 * fecha que se está mirando. Mezclarlas haría imposible enseñar las dos.
 *
 * `relevanciaTemporal` la pone la vista (`marcarVigenciaDeRelaciones`). Si no
 * viene, no se supone nada y manda la lectura de los hechos.
 */
export function lecturaOperativaEnContexto(rel) {
  if (rel.relevanciaTemporal === 'no-evaluable') return OPERATIVO.NO_EVALUABLE;
  return lecturaOperativa(rel);
}

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
    // ══ IDENTIDAD DEL PMT BASE ═══════════════════════════════════════════
    //
    // Un trazado venido de un KMZ es SU PROPIA BASE, con una sola activación.
    // No se deduce parentesco por geometría idéntica: puede haber dos cierres
    // distintos exactamente en el mismo sitio, y afirmar que uno es la
    // reactivación del otro sería inventarlo.
    //
    // `reg.idBase` solo llega cuando el registro viene de un proyecto guardado
    // que SÍ declaraba identidad. Un KMZ nunca la trae.
    idBase: reg.idBase ?? reg.id,
    activacion: reg.activacion ?? { numero: 1, de: 1, motivo: null, creada: null, reactivacionDe: null },
  };
}
