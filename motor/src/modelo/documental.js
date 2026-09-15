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
 * ══ DOS ESTADOS. HUBO UN TERCERO, Y YA NO HACE FALTA ══════════════════════
 *
 * REGISTRADO   esta activacion tiene su propio codigo.
 * PENDIENTE    esta activacion no tiene su codigo, y hay que tramitarlo.
 *
 * ══ POR QUE HUBO UN TERCERO, Y POR QUE SE RETIRA ══════════════════════════
 *
 * Mientras no se supo si la resolucion de una activacion amparaba tambien a la
 * siguiente, habia un tercer estado —HEREDADO_POR_CONFIRMAR— que existia
 * justamente para NO decidirlo. Las dos salidas faciles eran las dos erroneas:
 * copiar el codigo afirmaba que seguia valiendo; dejarlo pendiente afirmaba que
 * no. Las dos eran decisiones administrativas, y este programa no podia
 * tomarlas.
 *
 * LA REGLA YA ESTA DADA. La responsable funcional del proceso en EPM (Leydi
 * Marin, Centro de Gestion Servicios Tecnicos) la establecio asi:
 *
 *     «Cada PMT y sus reactivaciones para nuevas vigencias tienen una
 *      resolucion independiente, al igual sucede con los permisos de rotura.»
 *
 * Es la respuesta a P21. Por tanto:
 *
 *   · una activacion nueva NACE SIN DOCUMENTOS PROPIOS, y eso es PENDIENTE,
 *     sin matices: hay que tramitar los suyos;
 *   · el codigo de la activacion anterior NO se copia —nunca se copio— y
 *     tampoco queda «por confirmar»: ya se sabe que no ampara a esta.
 *
 * ══ Y SIN EMBARGO EL DOCUMENTO ANTERIOR NO SE BORRA ═══════════════════════
 *
 * Que no ampare esta vigencia no lo convierte en falso: es un HECHO de la
 * historia del PMT —la activacion anterior tuvo esa resolucion— y sirve para
 * saber que se tramito antes y con que numero. Se conserva en
 * `documentosPrevios`, viaja en `codigoPrevio` con su propio nombre, se enseña
 * como HISTORIA de la activacion anterior y NO cuenta como registrado ni
 * cambia el estado de esta.
 *
 * NO HIZO FALTA MIGRAR NADA: la evidencia ya estaba guardada aparte del campo
 * del codigo, que es exactamente para lo que se separo.
 */
export const ESTADO_DOC = Object.freeze({
  REGISTRADO: 'registrado',
  PENDIENTE: 'pendiente',
});

export const ETIQUETA_ESTADO_DOC = Object.freeze({
  [ESTADO_DOC.REGISTRADO]: 'Registrado',
  [ESTADO_DOC.PENDIENTE]: 'Pendiente',
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
  // mismo PMT. NO amparan a esta —cada activacion tiene los suyos— pero son un
  // hecho de la historia del PMT, asi que se conservan y se enseñan como tal.
  const previos = campos.documentosPrevios ?? null;

  const detalle = DOCUMENTOS.map((d) => {
    const propio = campos[d.clave] ?? null;
    const previo = previos?.[d.clave] ?? null;
    return {
      clave: d.clave,
      etiqueta: d.etiqueta,
      codigo: propio,
      // El codigo anterior viaja aparte y con su nombre. NUNCA ocupa el sitio
      // del propio: si lo hiciera, en la siguiente lectura seria
      // indistinguible de uno tramitado para esta vigencia.
      codigoPrevio: propio ? null : previo,
      // EL ESTADO SOLO DEPENDE DEL CODIGO PROPIO. Que la activacion anterior
      // tuviera el suyo no adelanta ni un paso el tramite de esta.
      estado: propio ? ESTADO_DOC.REGISTRADO : ESTADO_DOC.PENDIENTE,
    };
  });

  const registrados = detalle.filter((d) => d.estado === ESTADO_DOC.REGISTRADO).length;
  // Cuantos de los que faltan SI los tuvo la activacion anterior. Es
  // informativo —dice que ese tramite ya se hizo alguna vez y con que numero—
  // y no cambia ningun recuento.
  const clavesConPrevio = detalle.filter((d) => d.codigoPrevio).map((d) => d.clave);

  return {
    detalle,
    registrados,
    // Documentos que la activacion ANTERIOR si tuvo y esta todavia no. NO suman
    // a `registrados` ni restan a `pendientes`: son historia, no tramite.
    conPrevio: clavesConPrevio.length,
    total: DOCUMENTOS.length,
    completo: registrados === DOCUMENTOS.length,
    // Ni uno: es distinto de «le falta el ultimo». Merece su propio estado
    // porque es el caso de un PMT recien creado, que no es un problema.
    sinNinguno: registrados === 0,
    resumen: `${registrados}/${DOCUMENTOS.length}`,
    // Lo que falta por registrar en ESTA activacion. Es lo que alimenta los
    // filtros, y su significado no ha cambiado.
    pendientes: detalle.filter((d) => d.estado !== ESTADO_DOC.REGISTRADO).map((d) => d.clave),
    // Y aparte, para poder enseñar la historia sin mezclarla con el tramite.
    clavesConPrevio,
  };
}

/** Recuento documental de un conjunto, para tarjetas y filtros. */
export function resumenDocumental(registros) {
  const r = {
    total: registros.length, completos: 0, sinNinguno: 0,
    pendientePorDocumento: {},
    // Cuantos PMT tienen algun documento que la activacion ANTERIOR si tuvo.
    // Es historia, no tramite pendiente de otro tipo: sirve para saber que ese
    // documento ya se tramito alguna vez para este mismo cierre.
    conPrevio: 0,
    conPrevioPorDocumento: {},
  };
  for (const d of DOCUMENTOS) {
    r.pendientePorDocumento[d.clave] = 0;
    r.conPrevioPorDocumento[d.clave] = 0;
  }
  for (const x of registros) {
    const e = x.documental ?? estadoDocumental(x);
    if (e.completo) r.completos++;
    if (e.sinNinguno) r.sinNinguno++;
    if ((e.conPrevio ?? 0) > 0) r.conPrevio++;
    for (const p of e.pendientes) r.pendientePorDocumento[p]++;
    for (const p of (e.clavesConPrevio ?? [])) r.conPrevioPorDocumento[p]++;
  }
  return r;
}
