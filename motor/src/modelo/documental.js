/**
 * SEGUIMIENTO DOCUMENTAL DE UN PMT.
 *
 * ══ QUE SE SIGUE, Y EN QUE ORDEN OCURRE ═══════════════════════════════════
 *
 *   RESOLUCION PMT          codigo de la resolucion con la que la autoridad
 *                           aprueba el Plan de Manejo de Transito.
 *   PERMISO ROTURA          codigo de la resolucion que aprueba el permiso de
 *                           rotura. Se gestiona DESPUES del PMT, pero comparte
 *                           su vigencia.
 *   CIERRE PERMISO ROTURA   codigo de la resolucion que aprueba el cierre de
 *                           ese permiso de rotura.
 *
 * Los tres los aporta el contratista cuando existen. Que falten es NORMAL: un
 * PMT recien creado no tiene ninguno.
 *
 * ══ LA REGLA QUE EVITA EL PROBLEMA DE SIEMPRE ═════════════════════════════
 *
 * «Pendiente» NO ES UN CODIGO DE RESOLUCION. Tampoco «N/A», ni «-», ni «por
 * definir». Si alguien escribe eso en la casilla, el dato NO EXISTE y hay que
 * tratarlo como ausente, no guardarlo como si fuera el numero de una
 * resolucion.
 *
 * Es un problema real y conocido: en cuanto se admite un texto libre, la
 * columna se llena de marcadores que luego nadie puede distinguir de un codigo
 * de verdad, y los recuentos dejan de significar nada. Aqui:
 *
 *   · el VALOR es el codigo, o `null`. Nunca un texto de relleno.
 *   · el ESTADO es DERIVADO: `registrado` o `pendiente`. No se guarda.
 *
 * Separar las dos cosas es lo que permite contar («2 de 3») sin ambiguedad y
 * filtrar por «le falta el permiso de rotura» sin depender de como lo escribio
 * cada quien.
 */

/** Los tres documentos, en el orden en que ocurren. */
export const DOCUMENTOS = Object.freeze([
  { clave: 'resolucionPmt', campo: 'resolucion_pmt', etiqueta: 'Resolución PMT',
    ayuda: 'Resolución con la que la autoridad aprueba el PMT.' },
  { clave: 'permisoRotura', campo: 'permiso_rotura', etiqueta: 'Permiso de rotura',
    ayuda: 'Resolución que aprueba el permiso de rotura. Comparte la vigencia del PMT.' },
  { clave: 'cierrePermisoRotura', campo: 'cierre_permiso_rotura', etiqueta: 'Cierre del permiso de rotura',
    ayuda: 'Resolución que aprueba el cierre del permiso de rotura.' },
]);

/**
 * ══ TRES ESTADOS, Y EL TERCERO EXISTE PARA NO DECIDIR ═════════════════════
 *
 * REGISTRADO   esta activacion tiene su propio codigo.
 * PENDIENTE    no hay codigo, y no hay ninguno anterior al que mirar.
 * HEREDADO_POR_CONFIRMAR
 *              esta activacion NO tiene codigo propio, pero la activacion
 *              anterior del MISMO PMT si lo tenia.
 *
 * ══ POR QUE EL TERCERO NO SE PUEDE COLAPSAR EN NINGUNO DE LOS OTROS DOS ═══
 *
 * Cuando un PMT se reactiva, no sabemos si su resolucion anterior ampara
 * tambien la vigencia nueva. **No tenemos esa regla de EPM** (pregunta P21).
 * Las dos salidas faciles son las dos erroneas:
 *
 *   · copiar el codigo   → afirma que el documento SIGUE siendo valido;
 *   · dejarlo pendiente  → afirma que NO lo es, y borra de la vista una
 *                          evidencia que existe y que alguien tendra que
 *                          mirar para decidir.
 *
 * Las dos son decisiones juridicas, y este programa no puede tomarlas. El
 * tercer estado dice exactamente lo que se sabe: HAY un documento anterior, y
 * su aplicabilidad a esta activacion ESTA POR CONFIRMAR.
 *
 * Cuando EPM responda P21, la decision se implementa sin migrar nada: la
 * evidencia ya esta guardada y solo cambia como se interpreta.
 */
export const ESTADO_DOC = Object.freeze({
  REGISTRADO: 'registrado',
  PENDIENTE: 'pendiente',
  HEREDADO_POR_CONFIRMAR: 'heredado-por-confirmar',
});

export const ETIQUETA_ESTADO_DOC = Object.freeze({
  [ESTADO_DOC.REGISTRADO]: 'Registrado',
  [ESTADO_DOC.PENDIENTE]: 'Pendiente',
  [ESTADO_DOC.HEREDADO_POR_CONFIRMAR]: 'Previo disponible · aplicabilidad por confirmar',
});

/**
 * Textos que la gente escribe cuando NO tiene el dato. No son codigos.
 *
 * La lista es corta y se compara sin acentos ni mayusculas. No pretende ser
 * exhaustiva: cubre lo que aparece de verdad. Cualquier otro texto se admite
 * como codigo, porque inventar mas reglas rechazaria codigos legitimos.
 */
const MARCADORES_DE_AUSENCIA = new Set([
  'pendiente', 'pendientes', 'n/a', 'na', 'n.a.', 'no aplica', 'no aplica.',
  'sin', 'sin dato', 'sin datos', 'ninguno', 'ninguna', 'no', '-', '--', '---',
  'por definir', 'por asignar', 'en tramite', 'en tramite.', 'tramite',
  '0', 'null', 'none', 'nulo', 'vacio', '.',
]);

const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Normaliza un codigo documental.
 *
 * @returns {{codigo:string|null, aviso:string|null}}
 *          `codigo` es el texto util, o `null` si no hay dato.
 *          `aviso` explica por que se descarto, cuando se descarta algo que
 *          alguien habia escrito: descartarlo en silencio seria peor.
 */
export function normalizarCodigoDocumental(valor, etiqueta = 'el documento') {
  if (valor === null || valor === undefined) return { codigo: null, aviso: null };
  const t = String(valor).trim();
  if (!t) return { codigo: null, aviso: null };
  if (MARCADORES_DE_AUSENCIA.has(sinAcentos(t).toLowerCase())) {
    return {
      codigo: null,
      aviso: `${etiqueta}: se escribio «${t}», que no es un codigo de resolucion. ` +
        `Se registra como PENDIENTE, que es lo que significa.`,
    };
  }
  // Se conserva tal cual: un codigo de resolucion puede tener cualquier forma y
  // no nos corresponde imponerle una.
  return { codigo: t, aviso: null };
}

/**
 * Estado documental de un registro, DERIVADO de sus codigos.
 *
 * @param {object} campos  objeto con `resolucionPmt`, `permisoRotura`,
 *                         `cierrePermisoRotura` (codigos ya normalizados)
 */
export function estadoDocumental(campos = {}) {
  // `documentosPrevios` son los codigos que tenia la activacion ANTERIOR del
  // mismo PMT. Es EVIDENCIA, no un codigo de esta activacion: se conserva para
  // que alguien pueda decidir, y NO se cuenta como registrado.
  const previos = campos.documentosPrevios ?? null;

  const detalle = DOCUMENTOS.map((d) => {
    const propio = campos[d.clave] ?? null;
    const previo = previos?.[d.clave] ?? null;
    return {
      clave: d.clave,
      etiqueta: d.etiqueta,
      codigo: propio,
      // El codigo anterior viaja aparte y con su nombre. Nunca ocupa el sitio
      // del propio: si lo hiciera, en la siguiente lectura seria
      // indistinguible de uno tramitado para esta vigencia.
      codigoPrevio: propio ? null : previo,
      estado: propio ? ESTADO_DOC.REGISTRADO
        : previo ? ESTADO_DOC.HEREDADO_POR_CONFIRMAR
          : ESTADO_DOC.PENDIENTE,
    };
  });

  const cuenta = (e) => detalle.filter((d) => d.estado === e).length;
  const registrados = cuenta(ESTADO_DOC.REGISTRADO);
  const porConfirmar = cuenta(ESTADO_DOC.HEREDADO_POR_CONFIRMAR);

  return {
    detalle,
    registrados,
    // Documentos de la activacion ANTERIOR cuya aplicabilidad a esta nadie ha
    // decidido todavia. NO suman a `registrados`: afirmar que valen seria
    // tomar la decision juridica que no tenemos (P21).
    porConfirmar,
    total: DOCUMENTOS.length,
    completo: registrados === DOCUMENTOS.length,
    // Ni uno: es distinto de «le falta el ultimo». Merece su propio estado
    // porque es el caso de un PMT recien creado, que no es un problema.
    sinNinguno: registrados === 0 && porConfirmar === 0,
    resumen: `${registrados}/${DOCUMENTOS.length}`,
    // Se conserva `pendientes` con su significado de siempre —lo que falta por
    // registrar en ESTA activacion— porque es lo que alimenta los filtros. Lo
    // por confirmar cuenta como pendiente: todavia no hay nada tramitado aqui.
    pendientes: detalle.filter((d) => d.estado !== ESTADO_DOC.REGISTRADO).map((d) => d.clave),
    // Y aparte, para poder enseñarlo distinto sin mezclarlo con lo anterior.
    clavesPorConfirmar: detalle
      .filter((d) => d.estado === ESTADO_DOC.HEREDADO_POR_CONFIRMAR).map((d) => d.clave),
  };
}

/** Recuento documental de un conjunto, para tarjetas y filtros. */
export function resumenDocumental(registros) {
  const r = {
    total: registros.length, completos: 0, sinNinguno: 0,
    pendientePorDocumento: {},
    // Cuantos PMT tienen algun documento de una activacion anterior cuya
    // aplicabilidad esta por confirmar. Se cuenta APARTE de lo pendiente para
    // que no parezca que falta tramitar algo cuando puede que ya exista.
    conPorConfirmar: 0,
    porConfirmarPorDocumento: {},
  };
  for (const d of DOCUMENTOS) {
    r.pendientePorDocumento[d.clave] = 0;
    r.porConfirmarPorDocumento[d.clave] = 0;
  }
  for (const x of registros) {
    const e = x.documental ?? estadoDocumental(x);
    if (e.completo) r.completos++;
    if (e.sinNinguno) r.sinNinguno++;
    if ((e.porConfirmar ?? 0) > 0) r.conPorConfirmar++;
    for (const p of e.pendientes) r.pendientePorDocumento[p]++;
    for (const p of (e.clavesPorConfirmar ?? [])) r.porConfirmarPorDocumento[p]++;
  }
  return r;
}
