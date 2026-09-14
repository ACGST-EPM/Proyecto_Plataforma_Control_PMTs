/**
 * IDENTIDAD DEL PMT Y ACTIVACIONES.
 *
 * ══ EL NEGOCIO ════════════════════════════════════════════════════════════
 *
 * Un mismo cierre físico se ejecuta varias veces durante un contrato: se cierra
 * la calle en enero, se reabre, y en mayo hay que volver a cerrarla igual. Hoy
 * eso obliga a redibujar la misma geometría, con dos consecuencias malas:
 *
 *   · el trazado nuevo NO es idéntico al anterior —se dibuja a mano— así que
 *     las distancias medidas cambian sin que haya cambiado nada en la calle;
 *   · el sistema ve dos PMT distintos donde la operación ve uno reactivado, y
 *     entonces no se puede responder «¿cuántas veces hemos cerrado aquí?».
 *
 * ══ LA SEPARACIÓN ═════════════════════════════════════════════════════════
 *
 *   PMT BASE (identidad)     qué se cierra y dónde: geometría, contrato,
 *                            frente, tipo de cierre, municipio, dirección.
 *                            NO cambia entre activaciones.
 *
 *   ACTIVACIÓN (vigencia)    una ejecución temporal de ese cierre: fechas,
 *                            documentos de esa activación, motivo, procedencia.
 *
 * ══ POR QUÉ LA FILA SIGUE SIENDO LA UNIDAD, Y NO UN ÁRBOL ═════════════════
 *
 * La tentación era anidar: un objeto PMT con una lista de activaciones dentro.
 * Se descartó, y la razón es concreta: **la unidad de análisis del motor es el
 * par (geometría, vigencia)**. Dos activaciones del mismo cierre en fechas
 * distintas son DOS hechos espacio-temporales distintos, y el motor tiene que
 * poder compararlos por separado con los PMT de otros contratos. Anidarlas
 * obligaría a desanidarlas en cada análisis, en cada filtro, en cada tabla y en
 * cada exportación — y a mantener las dos formas sincronizadas.
 *
 * Así que cada FILA ES UNA ACTIVACIÓN, y lleva encima la identidad de su base:
 *
 *     fila.idBase        a qué PMT base pertenece
 *     fila.activacion    { numero, motivo, creada }
 *
 * El «PMT base» es entonces una VISTA DERIVADA: agrupar por `idBase`. No hay
 * dos representaciones que puedan divergir, porque solo hay una.
 *
 * ══ COMPATIBILIDAD: LO QUE NO SE PUEDE DEDUCIR, NO SE DEDUCE ══════════════
 *
 * Los KMZ existentes no traen identidad de base. La tentación era agrupar por
 * geometría idéntica, y sería un error: **puede haber dos cierres distintos
 * exactamente en el mismo sitio**, de contratos distintos o del mismo contrato
 * en momentos distintos, y afirmar que son «el mismo PMT reactivado» sería
 * inventar un parentesco.
 *
 * Regla: un trazado sin identidad explícita es **su propia base, con una sola
 * activación**. Ni más ni menos. Vincular dos de ellos a posteriori es una
 * acción del usuario, no una deducción del programa.
 */

/** Prefijo de las bases creadas dentro de la plataforma. */
const PREFIJO_BASE = 'base_';

/** Campos que pertenecen a la IDENTIDAD y NO cambian entre activaciones. */
export const CAMPOS_DE_BASE = Object.freeze([
  'contrato', 'contratista', 'proyecto', 'frente', 'municipio', 'direccion',
  'tipoCierre', 'geometria', 'tipoGeometria',
]);

/** Campos que pertenecen a la ACTIVACIÓN y cambian en cada una. */
export const CAMPOS_DE_ACTIVACION = Object.freeze([
  'inicio', 'fin', 'inicioMs', 'finMs', 'vigenciaValida', 'vigenciaEstado',
  'resolucionPmt', 'permisoRotura', 'cierrePermisoRotura',
]);

/**
 * Identidad de base de una fila.
 *
 * Sin `idBase` explícito, la fila ES su propia base. Se devuelve su `id`, no un
 * identificador nuevo: así el comportamiento de todo lo anterior no cambia ni
 * un bit, y un proyecto de la Etapa 2 se abre exactamente igual.
 */
export const baseDe = (fila) => fila?.idBase ?? fila?.id ?? null;

/** ¿Esta fila es una activación posterior, o la primera (o única)? */
export const esReactivacion = (fila) => (fila?.activacion?.numero ?? 1) > 1;

/** Identificador nuevo de base, para un PMT creado en la plataforma. */
export const nuevoIdBase = (ahora = Date.now(), sufijo = '') =>
  `${PREFIJO_BASE}${ahora.toString(36)}${sufijo}`;

/**
 * Agrupa filas por PMT base y devuelve el historial de cada uno.
 *
 * Las activaciones salen ORDENADAS POR FECHA DE INICIO, no por el número que
 * llevan guardado: el número dice en qué orden se capturaron, y eso puede no
 * coincidir con el orden en que ocurrieron —se puede registrar hoy una
 * activación de hace dos meses—. Para leer un historial importa cuándo pasó.
 */
export function agruparPorBase(filas) {
  const bases = new Map();
  for (const f of filas) {
    const id = baseDe(f);
    if (id === null) continue;
    if (!bases.has(id)) {
      bases.set(id, {
        idBase: id,
        // La identidad se toma de la PRIMERA activación que se encuentra; una
        // prueba vigila que todas las de una base declaren lo mismo.
        contrato: f.contrato ?? null, contratista: f.contratista ?? null,
        proyecto: f.proyecto ?? null, frente: f.frente ?? null,
        municipio: f.municipio ?? null, direccion: f.direccion ?? null,
        tipoCierre: f.tipoCierre ?? null, geometria: f.geometria ?? null,
        activaciones: [],
      });
    }
    bases.get(id).activaciones.push(f);
  }
  for (const b of bases.values()) {
    b.activaciones.sort((p, q) =>
      (p.inicioMs ?? Infinity) - (q.inicioMs ?? Infinity)
      || String(p.id).localeCompare(String(q.id)));
    b.veces = b.activaciones.length;
    b.reactivado = b.veces > 1;
  }
  return bases;
}

/**
 * Historial legible de un PMT base: cuántas veces, cuándo, cuánto duró cada
 * activación y cuánto tiempo pasó entre una y la siguiente.
 *
 * ══ LO QUE ESTO NO HACE ═══════════════════════════════════════════════════
 *
 * No juzga. Reactivar mucho puede significar una obra compleja bien gestionada
 * o una mal planeada, y desde aquí no se puede distinguir. Se conserva el DATO;
 * la interpretación es de EPM y todavía no existe. Por eso no hay ningún campo
 * llamado «recurrencia excesiva» ni nada que se le parezca.
 */
export function historialDeBase(base) {
  const MS_DIA = 86400000;
  const act = base.activaciones.map((a, i) => ({
    id: a.id,
    numero: a.activacion?.numero ?? i + 1,
    motivo: a.activacion?.motivo ?? null,
    inicio: a.inicio ?? null, fin: a.fin ?? null,
    inicioMs: a.inicioMs ?? null, finMs: a.finMs ?? null,
    // Días CALENDARIO, ambos incluidos: es como cuenta el resto del producto.
    dias: (a.inicioMs !== null && a.finMs !== null && a.inicioMs !== undefined && a.finMs !== undefined)
      ? Math.round((Math.floor(a.finMs / MS_DIA) - Math.floor(a.inicioMs / MS_DIA))) + 1
      : null,
    anio: a.inicioMs !== null && a.inicioMs !== undefined
      ? new Date(a.inicioMs).getUTCFullYear() : null,
  }));
  // Hueco entre el fin de una y el inicio de la siguiente. `null` cuando alguna
  // de las dos no se puede situar: un hueco inventado sería peor que ninguno.
  for (let i = 1; i < act.length; i++) {
    const previo = act[i - 1].finMs, actual = act[i].inicioMs;
    act[i].diasDesdeLaAnterior = (previo !== null && actual !== null)
      ? Math.round((Math.floor(actual / MS_DIA) - Math.floor(previo / MS_DIA))) : null;
  }
  const dias = act.map((a) => a.dias).filter((d) => d !== null);
  return {
    idBase: base.idBase, contrato: base.contrato, contratista: base.contratista,
    frente: base.frente, municipio: base.municipio, tipoCierre: base.tipoCierre,
    veces: act.length,
    activaciones: act,
    diasTotales: dias.length ? dias.reduce((s, d) => s + d, 0) : null,
    anios: [...new Set(act.map((a) => a.anio).filter((y) => y !== null))].sort(),
  };
}

/**
 * Recuento de reactivaciones de un conjunto, para tarjetas e informes.
 * Conserva el dato; no lo interpreta.
 */
export function resumenDeReactivaciones(filas) {
  const bases = agruparPorBase(filas);
  let reactivados = 0, activacionesExtra = 0, maximo = 0;
  for (const b of bases.values()) {
    if (b.veces > 1) { reactivados++; activacionesExtra += b.veces - 1; }
    if (b.veces > maximo) maximo = b.veces;
  }
  return {
    bases: bases.size,
    activaciones: filas.length,
    basesReactivadas: reactivados,
    activacionesExtra,
    maxActivaciones: maximo,
  };
}

/**
 * ¿Son estas dos geometrías la MISMA, coordenada a coordenada?
 *
 * Se compara estructura y números EXACTOS, sin tolerancia. Una tolerancia aquí
 * sería justamente el defecto que esto existe para impedir: reactivar tiene que
 * reutilizar el trazado, no uno parecido. Si algún día hiciera falta comparar
 * trazados «casi iguales», eso es otra función con otro nombre.
 */
export function mismaGeometria(a, b) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'GeometryCollection') {
    const ga = a.geometries ?? [], gb = b.geometries ?? [];
    return ga.length === gb.length && ga.every((g, i) => mismaGeometria(g, gb[i]));
  }
  const iguales = (x, y) => {
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    if (!Array.isArray(x)) return Object.is(x, y);
    return x.length === y.length && x.every((v, i) => iguales(v, y[i]));
  };
  return iguales(a.coordinates, b.coordinates);
}

/**
 * Copia profunda de una geometría, sin tocar ni un decimal.
 *
 * Devuelve `undefined` si NO se pudo clonar —una estructura circular, por
 * ejemplo—. Antes lanzaba, y quien llamaba esperaba un objeto de fallo: una
 * función que promete devolver `{ok:false}` y en su lugar revienta convierte un
 * caso previsto en un error inesperado a mitad de la interfaz.
 */
export function clonarGeometria(g) {
  if (g === null || g === undefined) return g;
  try {
    return JSON.parse(JSON.stringify(g));
  } catch {
    return undefined;
  }
}

/**
 * Prepara los datos de una NUEVA ACTIVACIÓN a partir de una existente.
 *
 * ══ INVARIANTE DE ESTA FUNCIÓN ════════════════════════════════════════════
 *
 * La geometría se reutiliza EXACTAMENTE. Se clona para que editar la nueva no
 * toque a la anterior, y acto seguido se COMPRUEBA la igualdad: si el clon no
 * fuera idéntico, se devuelve un fallo en vez de una activación silenciosamente
 * desplazada. Un trazado que se mueve solo es el peor defecto posible aquí,
 * porque nadie lo ve y cambia todas las distancias medidas.
 *
 * Los documentos NO se copian por defecto, y es una decisión con motivo: una
 * resolución ampara unas fechas concretas. Copiar el número a una vigencia
 * nueva haría pasar por tramitado algo que no lo está. Si EPM confirma que
 * algún documento sí ampara varias activaciones, se cambia entonces —queda
 * como DECISIÓN PENDIENTE en la documentación.
 *
 * @returns {{ok:true, datos:object} | {ok:false, motivo:string}}
 */
export function prepararReactivacion(origen, { inicio = '', fin = '', motivo = '',
  copiarDocumentos = false, ahora = Date.now() } = {}) {
  if (!origen) return { ok: false, motivo: 'no hay PMT de origen' };
  if (!origen.geometria) {
    return { ok: false, motivo: 'el PMT de origen no tiene trazado que reutilizar' };
  }
  const geometria = clonarGeometria(origen.geometria);
  if (geometria === undefined) {
    return { ok: false, motivo: 'el trazado del PMT de origen no se pudo copiar' };
  }
  if (!mismaGeometria(geometria, origen.geometria)) {
    return { ok: false, motivo: 'no se pudo reutilizar el trazado sin alterarlo' };
  }
  const idBase = baseDe(origen);
  const datos = {
    // IDENTIDAD: se hereda entera y no se toca.
    idBase,
    contrato: origen.contrato ?? '', contratista: origen.contratista ?? '',
    proyecto: origen.proyecto ?? '', frente: origen.frente ?? '',
    municipio: origen.municipio ?? '', direccion: origen.direccion ?? '',
    tipoCierre: origen.tipoCierre ?? '',
    geometria,
    // ACTIVACIÓN: vacía, a la espera de las fechas nuevas.
    inicio, fin,
    resolucionPmt: copiarDocumentos ? (origen.resolucionPmt ?? null) : null,
    permisoRotura: copiarDocumentos ? (origen.permisoRotura ?? null) : null,
    cierrePermisoRotura: copiarDocumentos ? (origen.cierrePermisoRotura ?? null) : null,
    reactivacionDe: origen.id ?? null,
    activacion: { numero: null, motivo: motivo || null, creada: new Date(ahora).toISOString() },
  };
  return { ok: true, datos };
}

/**
 * Numera una activación dentro de su base, contando las que ya existen.
 * Se llama al guardar, con el conjunto ya cargado.
 */
export function numeroDeActivacion(idBase, filas, idPropio = null) {
  let n = 0;
  for (const f of filas) {
    if (baseDe(f) !== idBase) continue;
    if (idPropio !== null && f.id === idPropio) continue;   // editar no suma
    n++;
  }
  return n + 1;
}

/**
 * Numera las activaciones de TODO un conjunto, en un solo sitio.
 *
 * ══ POR QUÉ AQUÍ Y NO AL LEER CADA FUENTE ═════════════════════════════════
 *
 * El número de una activación depende de CUÁNTAS HAY, y eso solo se sabe con el
 * conjunto completo delante. Si cada fuente numera lo suyo, abrir un proyecto
 * con dos activaciones y añadir después un KMZ que trae una tercera deja dos
 * «activación 1» distintas, y el historial pasa a mentir.
 *
 * Se ordena por FECHA DE INICIO, que es el orden en que ocurrieron. Las que no
 * se pueden situar en el tiempo van al final, ordenadas por identificador, para
 * que el resultado sea el mismo en cada ejecución: una numeración que cambia
 * entre dos aperturas del mismo archivo es indistinguible de un error.
 *
 * Devuelve filas NUEVAS: no modifica las que recibe.
 */
export function numerarActivaciones(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const id = baseDe(f);
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(f);
  }
  const numero = new Map();
  for (const grupo of grupos.values()) {
    const orden = [...grupo].sort((p, q) =>
      (p.inicioMs ?? Infinity) - (q.inicioMs ?? Infinity)
      || String(p.id).localeCompare(String(q.id)));
    orden.forEach((f, i) => numero.set(f.id, { numero: i + 1, de: orden.length }));
  }
  return filas.map((f) => {
    const n = numero.get(f.id) ?? { numero: 1, de: 1 };
    return {
      ...f,
      idBase: baseDe(f),
      activacion: { motivo: null, creada: null, reactivacionDe: null, ...(f.activacion ?? {}), ...n },
    };
  });
}

/**
 * Revisa que las activaciones de una misma base digan lo mismo.
 *
 * ══ POR QUÉ HACE FALTA ════════════════════════════════════════════════════
 *
 * `idBase` es un dato de ENTRADA: viene de un proyecto guardado, y un proyecto
 * se puede editar a mano o combinar con otro. Nada impide que dos archivos
 * declaren la misma base con trazados distintos, o con contratos distintos.
 *
 * Si eso pasa y no se dice, el historial del PMT mostraría dos geometrías
 * diferentes bajo un mismo cierre «que es el mismo», y ese es exactamente el
 * tipo de mentira silenciosa que este producto persigue.
 *
 * ══ QUÉ SE HACE, Y QUÉ NO ═════════════════════════════════════════════════
 *
 * Se AVISA. No se corrige, no se separa y no se descarta nada: no sabemos cuál
 * de las dos versiones es la buena, y elegir una por nuestra cuenta sería
 * inventar. El usuario ve el aviso y decide.
 *
 * @returns {string[]} avisos en lenguaje llano, uno por base incoherente
 */
export function revisarCoherenciaDeBases(filas) {
  const avisos = [];
  for (const [id, base] of agruparPorBase(filas)) {
    if (base.veces <= 1) continue;
    const conGeom = base.activaciones.filter((a) => a.geometria);
    const distintas = conGeom.filter((a) => !mismaGeometria(a.geometria, conGeom[0]?.geometria));
    if (distintas.length) {
      avisos.push(`El PMT «${base.frente ?? id}» tiene ${base.veces} activaciones declaradas como ` +
        `el mismo PMT, pero ${distintas.length + 1} de ellas traen TRAZADOS DISTINTOS. ` +
        `Una reactivación tiene que reutilizar el trazado, así que aquí falla algo: ` +
        `revise si de verdad son el mismo cierre. No se ha modificado nada.`);
    }
    const contratos = new Set(base.activaciones.map((a) => a.contrato ?? '(sin dato)'));
    if (contratos.size > 1) {
      avisos.push(`El PMT «${base.frente ?? id}» tiene activaciones de contratos distintos ` +
        `(${[...contratos].join(', ')}). El contrato es parte de la identidad del PMT base: ` +
        `si de verdad son contratos distintos, son PMT distintos. No se ha modificado nada.`);
    }
  }
  return avisos;
}
