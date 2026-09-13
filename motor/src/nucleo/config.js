/**
 * Parametros del motor. Todos configurables, ninguno enterrado en el codigo.
 *
 * Los valores por defecto son los APROBADOS en la revision de la Etapa 0.
 * Cualquiera de ellos se puede cambiar desde el verificador sin tocar codigo.
 */

export const CONFIG_POR_DEFECTO = Object.freeze({
  /**
   * Umbral de cercania en METROS REALES entre las geometrias originales.
   * Aprobado provisionalmente en 120 m. El motor legado producia ~243 m por un
   * defecto de implementacion (aplicaba el colchon a las dos geometrias antes
   * de cruzarlas); ese valor solo se usa en el perfil `legado` para comparar.
   */
  umbralMetros: 120,

  /**
   * Tolerancia del traslape temporal, en minutos.
   * Por defecto 0: no se inventa margen operativo mientras no exista una regla
   * que lo respalde. El parametro existe para poder fijarlo cuando se decida.
   */
  toleranciaMinutos: 0,

  /**
   * Si la fecha de fin viene con hora 00:00:00, extenderla al final de ese dia.
   *
   * POR QUE IMPORTA: en los datos reales 214 de 457 trazados terminan a las
   * 00:00. Con criterio estricto de fecha+hora eso excluye el ultimo dia
   * completo de la vigencia; el motor legado, que solo miraba fechas, lo
   * incluia. Es una decision semantica del negocio, no un detalle tecnico, asi
   * que queda expuesta como interruptor y el verificador mide su efecto.
   *
   * false = criterio estricto (lo que dice literalmente el dato).
   * true  = criterio del motor legado (la fecha de fin cubre todo el dia).
   */
  finInclusivoDiaCompleto: false,

  /**
   * Granularidad de la comparacion temporal.
   *  'instante' fecha + hora, que es lo aprobado para el motor nuevo.
   *  'dia'      descarta la hora y compara dias calendario completos, que es
   *             lo que hacia el motor legado. Solo para comparar.
   */
  granularidadTemporal: 'instante',

  /**
   * Frentes del mismo contrato nunca se consideran interferencia entre
   * contratos. Invariante del proyecto; se expone solo para poder probarlo.
   */
  excluirMismoContrato: true,

  /**
   * Modo de medida espacial:
   *  'real'   distancia minima entre las geometrias originales (el correcto).
   *  'legado' reproduce el defecto del motor QGIS: colchon en ambas geometrias,
   *           es decir, umbral efectivo del doble. Solo para comparar.
   */
  modoDistancia: 'real',

  /**
   * MODELO ESPACIAL: que se considera «coincidencia espacial».
   *
   *  'minima'            hay coincidencia si la distancia minima entre las
   *                      geometrias ORIGINALES es <= umbralMetros.
   *                      Es la regla vigente y la que produjo la baseline.
   *
   *  'zonasDeInfluencia' cada PMT tiene una zona de influencia de senalizacion
   *                      de `radioInfluenciaMetros` a su alrededor, y hay
   *                      coincidencia si las dos zonas se superponen. Por la
   *                      identidad demostrada en `geo/zona-influencia.js`, eso
   *                      equivale EXACTAMENTE a distancia <= radioA + radioB.
   *
   * ES UNA HIPOTESIS OPERATIVA EN EVALUACION, no una regla aprobada. El valor
   * por defecto NO cambia: la baseline tiene que seguir siendo reproducible.
   */
  modeloEspacial: 'minima',

  /** Radio de la zona de influencia de senalizacion, en metros. */
  radioInfluenciaMetros: 120,
});

/** Perfil que reproduce el comportamiento del motor QGIS legado. */
export const PERFIL_LEGADO = Object.freeze({
  umbralMetros: 121.6,          // 0.0011 grados a la latitud de los datos
  toleranciaMinutos: 0,
  finInclusivoDiaCompleto: false,
  granularidadTemporal: 'dia',   // el legado descartaba la hora por completo
  excluirMismoContrato: true,
  modoDistancia: 'legado',       // umbral efectivo = 2 x umbralMetros
});

export function resolverConfig(parcial = {}) {
  const c = { ...CONFIG_POR_DEFECTO, ...parcial };
  if (!(Number.isFinite(c.umbralMetros) && c.umbralMetros >= 0)) {
    throw new Error(`umbralMetros debe ser un numero >= 0 (llego: ${c.umbralMetros})`);
  }
  if (!(Number.isFinite(c.toleranciaMinutos) && c.toleranciaMinutos >= 0)) {
    throw new Error(`toleranciaMinutos debe ser un numero >= 0 (llego: ${c.toleranciaMinutos})`);
  }
  if (c.granularidadTemporal !== 'instante' && c.granularidadTemporal !== 'dia') {
    throw new Error(`granularidadTemporal debe ser 'instante' o 'dia' (llego: ${c.granularidadTemporal})`);
  }
  if (c.modeloEspacial !== 'minima' && c.modeloEspacial !== 'zonasDeInfluencia') {
    throw new Error(`modeloEspacial debe ser 'minima' o 'zonasDeInfluencia' (llego: ${c.modeloEspacial})`);
  }
  if (!(Number.isFinite(c.radioInfluenciaMetros) && c.radioInfluenciaMetros > 0)) {
    throw new Error(`radioInfluenciaMetros debe ser un numero > 0 (llego: ${c.radioInfluenciaMetros})`);
  }
  if (c.modoDistancia !== 'real' && c.modoDistancia !== 'legado') {
    throw new Error(`modoDistancia debe ser 'real' o 'legado' (llego: ${c.modoDistancia})`);
  }
  return Object.freeze(c);
}

/** Distancia maxima a la que dos registros pueden generar una relacion. */
export function alcanceMetros(config) {
  // MODELO DE ZONAS: el alcance es la suma de los dos radios. Ver la identidad
  // demostrada en `geo/zona-influencia.js`: dos zonas de radio r se superponen
  // exactamente cuando la distancia minima no pasa de 2r.
  if (config.modeloEspacial === 'zonasDeInfluencia') {
    return 2 * (config.radioInfluenciaMetros ?? 120);
  }
  return config.modoDistancia === 'legado' ? config.umbralMetros * 2 : config.umbralMetros;
}

/** Descripcion legible del criterio espacial vigente, para informes y pantallas. */
export function describirModeloEspacial(config) {
  if (config.modeloEspacial === 'zonasDeInfluencia') {
    const r = config.radioInfluenciaMetros ?? 120;
    return `se superponen las zonas de influencia de senalizacion de ${r} m ` +
      `(equivale a una distancia minima de hasta ${2 * r} m)`;
  }
  return `la distancia minima entre los trazados no pasa de ${config.umbralMetros} m`;
}

/**
 * VERSION DE LAS REGLAS DEL MOTOR.
 *
 * Identifica el conjunto de reglas canonicas con el que se produjo un
 * resultado. Sirve para que un proyecto guardado pueda detectar que se abrio
 * con un motor distinto del que lo genero y avisar en vez de mezclar criterios
 * en silencio.
 *
 * SE SUBE cuando cambia algo que altera los resultados: umbral, semantica
 * temporal, regla de exclusion, dominio espacial o la definicion de traslape.
 * NO se sube por cambios internos que no muevan ninguna cifra.
 */
export const VERSION_REGLAS = '1.2.0';

/** Resumen legible de las reglas vigentes, para dejarlo escrito en informes y proyectos. */
export const REGLAS_CANONICAS = Object.freeze({
  version: VERSION_REGLAS,
  distancia: 'minima real entre las geometrias originales',
  umbralPorDefecto: 120,
  temporal: 'fecha y hora reales',
  toleranciaPorDefecto: 0,
  exclusion: 'frentes del mismo contrato no son interferencia entre contratos',
  dominioEspacialKm: 50,
});
