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
  if (c.modoDistancia !== 'real' && c.modoDistancia !== 'legado') {
    throw new Error(`modoDistancia debe ser 'real' o 'legado' (llego: ${c.modoDistancia})`);
  }
  return Object.freeze(c);
}

/** Distancia maxima a la que dos registros pueden generar una relacion. */
export function alcanceMetros(config) {
  return config.modoDistancia === 'legado' ? config.umbralMetros * 2 : config.umbralMetros;
}
