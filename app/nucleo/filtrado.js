/**
 * FILTRADO — logica pura, sin DOM, para poder probarla automaticamente.
 *
 * Conserva todas las capacidades del tablero historico (contratista, contrato,
 * frente, municipio, estado de interferencia y rango de fechas) y anade las
 * dos que faltaban: PROYECTO y TIPO DE CIERRE.
 *
 * Regla de diseno: un filtro vacio no filtra. Nunca se deja al usuario delante
 * de una tabla vacia sin saber por que.
 */
import { estadoEspacial, estadoTemporal, lecturaOperativaEnContexto,
  ESPACIAL, TEMPORAL, OPERATIVO } from './modelo.js';
import { ALCANCE, SITUACION, situacionDe, tocaAnio, MS_DIA, limitesDelDia,
  esAccionable, relevanciaDeRelacion, RELEVANCIA,
  coincidenciaAccionable, articulacionCoordinable } from './temporalidad.js';

// Las primitivas de dia calendario viven en `temporalidad.js` (ver alli el
// motivo). Se reexportan para que nadie tenga que cambiar su importacion.
export { MS_DIA, limitesDelDia };

/** Filtros en blanco: no descartan nada. */
export function filtrosVacios() {
  return {
    contratista: [], contrato: [], proyecto: [], municipio: [],
    frente: [], tipoCierre: [], relacion: [], documental: [],
    desde: null, hasta: null, texto: '',
    // ALCANCE TEMPORAL. No es «un filtro más»: decide desde qué fecha se mira,
    // y de ahí se derivan vigente / futuro / histórico en TODA la interfaz.
    //   'operativo'  lo que todavía se puede atender, respecto de la referencia
    //   'historico'  un año concreto, para consultar qué ocurrió
    //   'todo'       sin recorte: la base entera
    alcance: ALCANCE.OPERATIVO,
    anio: null,
  };
}

export function hayFiltrosActivos(f) {
  return ['contratista', 'contrato', 'proyecto', 'municipio', 'frente', 'tipoCierre', 'relacion', 'documental']
    .some((k) => f[k]?.length) || !!f.desde || !!f.hasta || !!(f.texto ?? '').trim();
}

/**
 * ¿Recorta el ALCANCE TEMPORAL lo que se ve?
 *
 * Va aparte de `hayFiltrosActivos` a propósito. Un filtro de contrato es una
 * elección del usuario sobre un conjunto; el alcance temporal es el PUNTO DE
 * VISTA desde el que se mira todo. Mezclarlos haría que «quitar los filtros»
 * devolviera al usuario a un alcance que no eligió, o al revés.
 */
export function alcanceRecorta(f) {
  return (f?.alcance ?? ALCANCE.OPERATIVO) !== ALCANCE.TODO;
}

const enLista = (lista, valor) => !lista?.length || lista.includes(valor ?? '(sin dato)');

/**
 * Solapamiento con el rango de fechas pedido. Un PMT entra si su vigencia toca
 * el rango en algun punto; no hace falta que este contenido entero.
 *
 * Un PMT SIN vigencia valida NO se descarta por fecha: no se puede afirmar que
 * quede fuera de un rango que no se puede comparar. Se conserva y se marca.
 */
export function tocaRango(fila, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!fila.vigenciaValida || fila.inicioMs === null || fila.finMs === null) return true;
  const d = desde ? Date.parse(desde + 'T00:00:00Z') : -Infinity;
  const h = hasta ? Date.parse(hasta + 'T23:59:59Z') : Infinity;
  return fila.inicioMs <= h && fila.finMs >= d;
}

const norm = (s) => (s ?? '').toString().toLowerCase();

function coincideTexto(fila, texto) {
  const t = norm(texto).trim();
  if (!t) return true;
  // El buscador tiene que encontrar TAMBIEN un codigo de resolucion: es la
  // forma natural de llegar a un PMT cuando lo que se tiene a mano es el
  // numero del tramite, no el nombre del frente.
  return [fila.frente, fila.contrato, fila.contratista, fila.proyecto, fila.municipio, fila.direccion,
    fila.resolucionPmt, fila.permisoRotura, fila.cierrePermisoRotura]
    .some((v) => norm(v).includes(t));
}

/**
 * ¿Entra este PMT en el alcance temporal pedido?
 *
 * NO BORRA NADA. Un PMT histórico sigue existiendo, con su geometría, sus
 * fechas y sus relaciones; lo único que decide esto es si aparece en la vista
 * que el usuario está mirando ahora mismo. Cambiar la fecha de referencia lo
 * devuelve entero.
 */
export function enAlcance(fila, f, ref) {
  const alcance = f?.alcance ?? ALCANCE.OPERATIVO;
  if (alcance === ALCANCE.TODO) return true;
  if (alcance === ALCANCE.HISTORICO) {
    // Consulta histórica de un año: lo que tuviera actividad ESE año. Un PMT
    // que cruza el 31 de diciembre toca los dos años y sale en los dos.
    return f.anio === null || f.anio === undefined ? true : tocaAnio(fila, f.anio);
  }
  // ══ OPERATIVO = VIGENTE o FUTURO. NADA MÁS ════════════════════════════
  //
  // Antes esto era «todo lo que no haya terminado», que metía dentro a los PMT
  // cuya vigencia NO SE PUEDE DETERMINAR. Eso los presentaba como atendibles
  // sin saberlo: la misma afirmación sin fundamento que el producto persigue.
  //
  // «No determinada» se conserva entero —sigue en «Todo», en el histórico y en
  // Calidad de los datos—, se cuenta aparte, y la interfaz lo ANUNCIA en la
  // vista operativa para que se pueda ir a corregir. Lo que no hace es entrar
  // en un alcance cuya definición exige saber si está vigente.
  return esAccionable(fila, ref);
}

/**
 * Aplica los filtros a la lista de PMT.
 *
 * `ref` es la FECHA DE REFERENCIA. Es opcional para no romper a ningún llamador
 * anterior: sin ella, el alcance temporal no recorta nada y el comportamiento
 * es exactamente el de antes.
 */
export function filtrarPmts(filas, f, ref = null) {
  const conAlcance = ref ? filas.filter((x) => enAlcance(x, f, ref)) : filas;
  return conAlcance.filter((x) =>
    enLista(f.contratista, x.contratista) &&
    enLista(f.contrato, x.contrato) &&
    enLista(f.proyecto, x.proyecto) &&
    enLista(f.municipio, x.municipio) &&
    enLista(f.frente, x.frente) &&
    enLista(f.tipoCierre, x.tipoCierre) &&
    cumpleDocumental(x, f.documental) &&
    tocaRango(x, f.desde, f.hasta) &&
    coincideTexto(x, f.texto));
}

/**
 * Claves del filtro documental. Son ESTADOS DERIVADOS, no valores guardados:
 * se calculan de los codigos, asi que no se pueden falsear escribiendo
 * «Pendiente» en una casilla. Ver `motor/src/modelo/documental.js`.
 */
export const CLAVES_DOCUMENTAL = Object.freeze([
  ['completa', 'Documentacion completa (3 de 3)'],
  ['incompleta', 'Documentacion incompleta'],
  ['sin-ninguno', 'Sin ningun documento todavia'],
  // PENDIENTE y REGISTRADO por documento. Hacen falta LAS DOS caras: preguntar
  // «cuales tienen ya la resolucion» es tan legitimo como preguntar «a cuales
  // les falta», y antes solo se podia preguntar lo segundo.
  ['falta-resolucion', 'Resolucion PMT pendiente'],
  ['tiene-resolucion', 'Resolucion PMT registrada'],
  ['falta-permiso', 'Permiso de rotura pendiente'],
  ['tiene-permiso', 'Permiso de rotura registrado'],
  ['falta-cierre', 'Cierre de rotura pendiente'],
  ['tiene-cierre', 'Cierre de rotura registrado'],
]);

const CLAVE_A_PENDIENTE = {
  'falta-resolucion': 'resolucionPmt',
  'falta-permiso': 'permisoRotura',
  'falta-cierre': 'cierrePermisoRotura',
};
const CLAVE_A_REGISTRADO = {
  'tiene-resolucion': 'resolucionPmt',
  'tiene-permiso': 'permisoRotura',
  'tiene-cierre': 'cierrePermisoRotura',
};

function cumpleDocumental(x, claves) {
  if (!claves?.length) return true;
  const d = x.documental;
  if (!d) return false;
  // Varias claves se combinan con O: «falta el permiso O falta el cierre» es lo
  // que alguien quiere decir al marcar las dos, no «faltan las dos a la vez».
  return claves.some((c) => {
    if (c === 'completa') return d.completo;
    if (c === 'incompleta') return !d.completo;
    if (c === 'sin-ninguno') return d.sinNinguno;
    const p = CLAVE_A_PENDIENTE[c];
    if (p) return d.pendientes.includes(p);
    const r = CLAVE_A_REGISTRADO[c];
    // REGISTRADO significa que tiene CODIGO PROPIO. Un documento «por
    // confirmar» —heredado de una activacion anterior— no cuenta: nadie ha
    // decidido si ampara estas fechas, asi que decir que esta registrado seria
    // resolver la pregunta P21 desde un filtro.
    if (r) return d.detalle.some((y) => y.clave === r && y.codigo);
    return false;
  });
}

/**
 * Claves de relacion disponibles. Son HECHOS, no niveles de criticidad:
 * aqui no aparece la palabra "critico" ni ninguna jerarquia operativa.
 */
export const CLAVES_RELACION = Object.freeze([
  // ── POR LECTURA OPERATIVA: son las que usa la bandeja ──
  //
  // Van PRIMERO porque son las que responden a la pregunta que se hace quien
  // abre esto: «¿qué tengo que coordinar?». Y son EXACTAMENTE lo que cuenta la
  // bandeja: la cifra y el filtro comparten esta funcion, asi que no pueden
  // decir cosas distintas.
  ['articulacion', 'Requieren articulacion'],
  ['coincidencia-espacial', 'Comparten sitio, en otro momento'],
  ['relacion-no-evaluable', 'No se pudieron comprobar'],
  // ── POR HECHOS MEDIDOS: el detalle, para quien lo necesite ──
  ['contacto', 'Se tocan fisicamente'],
  ['cercania', 'Cerca, sin tocarse'],
  ['a-la-vez', 'Coinciden en el tiempo'],
  ['contacto-a-la-vez', 'Se tocan Y coinciden en el tiempo'],
  ['espacial-no-evaluable', 'No se pudo analizar la distancia'],
  ['temporal-no-evaluable', 'No se pudo analizar el tiempo'],
]);

function cumpleClave(rel, clave) {
  const e = estadoEspacial(rel), t = estadoTemporal(rel);
  switch (clave) {
    // La lectura operativa se calcula con `lecturaOperativaEnContexto`, la
    // MISMA que usan la bandeja, la tabla, el informe y las exportaciones. Si
    // alguna vez difieren, es que alguien llamo a otra funcion.
    case 'articulacion':
      return lecturaOperativaEnContexto(rel) === OPERATIVO.ARTICULACION_REQUERIDA;
    case 'coincidencia-espacial':
      return lecturaOperativaEnContexto(rel) === OPERATIVO.COINCIDENCIA_ESPACIAL;
    case 'relacion-no-evaluable':
      return lecturaOperativaEnContexto(rel) === OPERATIVO.NO_EVALUABLE;
    case 'contacto': return e === ESPACIAL.CONTACTO;
    case 'cercania': return e === ESPACIAL.CERCANIA;
    case 'a-la-vez': return t === TEMPORAL.COINCIDE;
    case 'contacto-a-la-vez': return e === ESPACIAL.CONTACTO && t === TEMPORAL.COINCIDE;
    case 'espacial-no-evaluable': return e === ESPACIAL.NO_EVALUABLE;
    case 'temporal-no-evaluable': return t === TEMPORAL.NO_EVALUABLE;
    default: return true;
  }
}

/**
 * Filtra relaciones. Una relacion sobrevive si CUALQUIERA de sus dos extremos
 * pasa el filtro de PMT: si el usuario mira un contrato, quiere ver con quien
 * choca ese contrato, no solo las parejas donde ambos lados coinciden.
 */
export function filtrarRelaciones(relaciones, f, idsVisibles, ref = null, porId = null) {
  const alcance = f?.alcance ?? ALCANCE.OPERATIVO;
  return relaciones.filter((r) => {
    if (idsVisibles && !(idsVisibles.has(r.idA) || idsVisibles.has(r.idB))) return false;
    if (f.relacion?.length && !f.relacion.some((c) => cumpleClave(r, c))) return false;
    // RELEVANCIA OPERATIVA. Solo en la vista operativa, y solo para decidir si
    // esto pide atención AHORA. En histórico y en «todo» no se recorta nada,
    // porque ahí la pregunta es otra: qué ocurrió, no qué hay que hacer.
    if (ref && porId && alcance === ALCANCE.OPERATIVO) {
      if (!coincidenciaAccionable(r, porId, ref)) return false;
      // Una articulación cuyo traslape ya pasó entero deja de presentarse como
      // articulación, pero la relación NO desaparece: sigue ahí como
      // coincidencia espacial, que es lo que de verdad es hoy. Esconderla del
      // todo perdería el hecho de que los dos comparten sitio.
    }
    return true;
  });
}

/**
 * Marca cada relación con si su articulación sigue siendo coordinable desde la
 * referencia. Es un dato DERIVADO que se añade a la vista; el hecho almacenado
 * (`hayTraslapeTemporal`, `traslapeInicio`, `traslapeFin`) no se toca jamás.
 */
export function marcarVigenciaDeRelaciones(relaciones, ref, porId = null) {
  if (!ref) return relaciones;
  return relaciones.map((r) => ({
    ...r,
    articulacionVigente: articulacionCoordinable(r, ref),
    // RELEVANCIA TEMPORAL de la pareja: accionable, no accionable, o no
    // evaluable. Es lo que permite que la lectura operativa diga «no se pudo
    // comprobar» en vez de inventar un «sin coincidencia» que nadie ha medido.
    relevanciaTemporal: porId ? relevanciaDeRelacion(r, porId, ref) : undefined,
  }));
}

/** Valores disponibles para poblar un desplegable, ya ordenados. */
export function opcionesDe(filas, campo) {
  const vistos = new Map();
  for (const x of filas) {
    const v = x[campo] ?? '(sin dato)';
    vistos.set(v, (vistos.get(v) ?? 0) + 1);
  }
  return [...vistos.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'))
    .map(([valor, n]) => ({ valor, n }));
}

/** Campos que participan en el cruce de filtros. */
export const CAMPOS_FACETADOS = Object.freeze(
  ['contratista', 'contrato', 'proyecto', 'municipio', 'frente', 'tipoCierre']);

/**
 * FILTROS CRUZADOS (facetados) — la capacidad del tablero historico que la
 * Etapa 2 habia perdido al construir las listas una sola vez sobre todos los
 * datos.
 *
 * Las tres reglas, que son las que hacen que esto se sienta bien al usarlo:
 *
 *  1. Cada lista se recalcula con TODOS los demas filtros aplicados, pero NO
 *     con el suyo propio. Asi, elegir un contrato reduce los contratistas,
 *     frentes y municipios compatibles, pero la lista de contratos sigue
 *     entera y se pueden marcar varios.
 *
 *  2. Lo ya seleccionado NUNCA desaparece, aunque el recalculo no lo incluyera.
 *     Si se borrase solo, el usuario perderia su seleccion sin haberla tocado.
 *
 *  3. La lista que el usuario esta manipulando en ese momento (`origen`) no se
 *     reconstruye, para que no se le mueva debajo del raton mientras marca.
 *
 * @param {Array} todas   todas las filas cargadas (sin filtrar)
 * @param {object} f      filtros actuales
 * @param {string} [origen] campo que el usuario acaba de tocar
 * @returns {Record<string, Array<{valor:string,n:number,seleccionado:boolean}>>}
 */
export function opcionesFacetadas(todas, f, origen = null) {
  const salida = {};
  for (const campo of CAMPOS_FACETADOS) {
    // Regla 1: todos los filtros MENOS el de este campo.
    const otros = { ...f, [campo]: [] };
    const compatibles = filtrarPmts(todas, otros);
    const ops = opcionesDe(compatibles, campo);

    // Regla 2: recuperar lo seleccionado aunque ya no aparezca.
    const presentes = new Set(ops.map((o) => o.valor));
    for (const sel of f[campo] ?? []) {
      if (!presentes.has(sel)) ops.push({ valor: sel, n: 0 });
    }
    ops.sort((a, b) => String(a.valor).localeCompare(String(b.valor), 'es'));

    salida[campo] = ops.map((o) => ({ ...o, seleccionado: (f[campo] ?? []).includes(o.valor) }));
    // Regla 3: marcar la lista en uso para que la interfaz no la repinte.
    if (campo === origen) salida[campo].enUso = true;
  }
  return salida;
}

/**
 * SEMANTICA TEMPORAL DE LA INTERFAZ — decidida en la Etapa 2.2.
 *
 * El recorrido muestra UN DIA, y "un dia" significa **el dia calendario entero**:
 * entra todo PMT cuya vigencia toque ese dia en algun momento.
 *
 * POR QUE SE CAMBIO: antes se consultaba un INSTANTE (el que resultara de sumar
 * dias al inicio del rango, tipicamente las 06:00) mientras la etiqueta decia
 * "PMT vigentes ese dia". Una obra de 10:00 a 12:00 desaparecia del mapa en su
 * propio dia. La etiqueta prometia una cosa y el calculo hacia otra.
 *
 * IMPORTANTE: esto es SOLO la vista. El motor sigue calculando el traslape
 * entre PMT con **fecha y hora exactas**, que es la regla canonica aprobada en
 * la Etapa 1 y no se toca. Aqui se decide que se enseña, no que se calcula.
 *
 * Si alguna vez hace falta consultar un instante exacto, sera un modo aparte y
 * con su propia etiqueta: nunca las dos cosas bajo el mismo nombre.
 */


/**
 * DOMINIO DEL RECORRIDO, en DIAS CALENDARIO.
 *
 * Antes el deslizador se dimensionaba redondeando la DURACION entre el primer y
 * el ultimo instante. Con una vigencia del 1 de marzo a las 23:00 al 3 de marzo
 * a la 01:00 la duracion es de 26 horas, que redondea a 1 dia, y el 3 de marzo
 * —un dia con actividad real— quedaba fuera del deslizador.
 *
 * Ahora se cuentan DIAS DE CALENDARIO entre el primero y el ultimo, que es
 * exactamente lo que el recorrido representa. El ultimo dia con cualquier
 * actividad siempre es alcanzable.
 */
export function dominioRecorrido(filas) {
  const r = rangoTemporal(filas);
  if (!r) return null;
  const primerDia = limitesDelDia(r.min).inicio;
  const ultimoDia = limitesDelDia(r.max).inicio;
  return {
    primerDia, ultimoDia,
    dias: Math.round((ultimoDia - primerDia) / MS_DIA),   // indice maximo del deslizador
  };
}

/**
 * PMT que tienen actividad en el DIA CALENDARIO que contiene a `ms`.
 * Un PMT sin vigencia valida NO cuenta: no se puede afirmar que este vigente.
 */
export function vigentesEnDia(filas, ms) {
  const { inicio, fin } = limitesDelDia(ms);
  return filas.filter((x) => x.vigenciaValida && x.inicioMs !== null && x.finMs !== null &&
    x.inicioMs <= fin && x.finMs >= inicio);
}

/**
 * PMT vigentes en un INSTANTE exacto. Se conserva porque es la primitiva sobre
 * la que se apoya lo demas y porque puede hacer falta un modo instante
 * explicito, pero la interfaz NO la usa para el recorrido diario.
 */
export function vigentesEn(filas, ms) {
  return filas.filter((x) => x.vigenciaValida && x.inicioMs !== null && x.finMs !== null &&
    x.inicioMs <= ms && x.finMs >= ms);
}

/** Rango temporal que cubren los datos cargados, para encuadrar el recorrido. */
export function rangoTemporal(filas) {
  let min = Infinity, max = -Infinity;
  for (const x of filas) {
    if (!x.vigenciaValida || x.inicioMs === null || x.finMs === null) continue;
    if (x.inicioMs < min) min = x.inicioMs;
    if (x.finMs > max) max = x.finMs;
  }
  return Number.isFinite(min) ? { min, max } : null;
}
