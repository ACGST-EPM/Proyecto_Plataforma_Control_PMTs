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

export const ESTADO_DOC = Object.freeze({
  REGISTRADO: 'registrado',
  PENDIENTE: 'pendiente',
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
  const detalle = DOCUMENTOS.map((d) => ({
    clave: d.clave,
    etiqueta: d.etiqueta,
    codigo: campos[d.clave] ?? null,
    estado: campos[d.clave] ? ESTADO_DOC.REGISTRADO : ESTADO_DOC.PENDIENTE,
  }));
  const registrados = detalle.filter((d) => d.estado === ESTADO_DOC.REGISTRADO).length;
  return {
    detalle,
    registrados,
    total: DOCUMENTOS.length,
    completo: registrados === DOCUMENTOS.length,
    // Ni uno: es distinto de «le falta el ultimo». Merece su propio estado
    // porque es el caso de un PMT recien creado, que no es un problema.
    sinNinguno: registrados === 0,
    resumen: `${registrados}/${DOCUMENTOS.length}`,
    pendientes: detalle.filter((d) => d.estado === ESTADO_DOC.PENDIENTE).map((d) => d.clave),
  };
}

/** Recuento documental de un conjunto, para tarjetas y filtros. */
export function resumenDocumental(registros) {
  const r = { total: registros.length, completos: 0, sinNinguno: 0, pendientePorDocumento: {} };
  for (const d of DOCUMENTOS) r.pendientePorDocumento[d.clave] = 0;
  for (const x of registros) {
    const e = x.documental ?? estadoDocumental(x);
    if (e.completo) r.completos++;
    if (e.sinNinguno) r.sinNinguno++;
    for (const p of e.pendientes) r.pendientePorDocumento[p]++;
  }
  return r;
}
