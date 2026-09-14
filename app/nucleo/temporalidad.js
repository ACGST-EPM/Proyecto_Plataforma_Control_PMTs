/**
 * FECHA DE REFERENCIA — el único reloj del producto.
 *
 * ══ EL PROBLEMA QUE RESUELVE ══════════════════════════════════════════════
 *
 * «Vigente», «vencido» y «futuro» no son propiedades de un PMT: son propiedades
 * de un PMT **respecto de una fecha**. En cuanto dos partes de la interfaz usan
 * fechas distintas —una `Date.now()` y otra la fecha del recorrido— la pantalla
 * se contradice: el mapa enseña marzo de 2025 mientras la tarjeta dice «0
 * articulaciones requeridas» porque mide contra hoy.
 *
 * La clase de error es «cada parte con su propio reloj». Se elimina con UN solo
 * concepto del que se deriva todo:
 *
 *     FECHA DE REFERENCIA = la fecha desde la que se mira.
 *
 * Y tres orígenes posibles, explícitos:
 *
 *   'hoy'      vista operativa: se mira desde el día de hoy;
 *   'elegida'  recorrido temporal: se mira desde el día que el usuario recorre;
 *   'periodo'  consulta histórica: se mira un tramo (un año, por ejemplo), y la
 *              referencia es su ÚLTIMO instante — porque «lo que quedaba por
 *              coordinar» se juzga al final del tramo consultado.
 *
 * ══ LO QUE ESTO NO HACE ═══════════════════════════════════════════════════
 *
 * NO altera ningún hecho almacenado. Una relación medida sigue existiendo con
 * su distancia y su traslape, se mire desde donde se mire. La fecha de
 * referencia solo decide **qué es relevante ahora mismo para actuar**, que es
 * una pregunta distinta de **qué ocurrió**.
 */
/**
 * PRIMITIVAS DE DÍA CALENDARIO.
 *
 * Viven aquí, y no en `filtrado.js`, porque son el ladrillo temporal del que
 * depende todo lo demás de este módulo. Tenerlas en filtrado creaba un ciclo
 * —filtrado necesita temporalidad para decidir el alcance, y temporalidad
 * necesitaba filtrado para partir el día— y un ciclo de importaciones en un
 * empaquetador de un solo archivo no se resuelve solo: revienta la
 * construcción. `filtrado.js` las reexporta para no romper a nadie.
 *
 * Todo en UTC, por la misma razón que el resto del producto: una línea de
 * tiempo sin horario de verano, para que dos equipos en husos distintos
 * obtengan exactamente el mismo número.
 */
export const MS_DIA = 86400000;

/** Primer y último milisegundo del día calendario que contiene a `ms`. */
export function limitesDelDia(ms) {
  const inicio = Math.floor(ms / MS_DIA) * MS_DIA;
  return { inicio, fin: inicio + MS_DIA - 1 };
}

/** Origen de la fecha de referencia. Siempre explícito: nunca se deduce. */
export const ORIGEN = Object.freeze({
  HOY: 'hoy',
  ELEGIDA: 'elegida',
  PERIODO: 'periodo',
});

/** Alcance con el que se está mirando la base. */
export const ALCANCE = Object.freeze({
  OPERATIVO: 'operativo',
  HISTORICO: 'historico',
  TODO: 'todo',
});

/** Situación de un PMT respecto de la fecha de referencia. */
export const SITUACION = Object.freeze({
  VIGENTE: 'vigente',
  FUTURO: 'futuro',
  HISTORICO: 'historico',
  SIN_VIGENCIA: 'sin-vigencia',   // no se puede situar en el tiempo. NO es «vencido».
});

export const ETIQUETA_SITUACION = Object.freeze({
  [SITUACION.VIGENTE]: 'Vigente',
  [SITUACION.FUTURO]: 'Programado',
  [SITUACION.HISTORICO]: 'Histórico',
  [SITUACION.SIN_VIGENCIA]: 'Sin vigencia utilizable',
});

/**
 * Construye una fecha de referencia.
 *
 * @param {object} [o]
 * @param {string} [o.origen]  ORIGEN.*
 * @param {number} [o.ms]      instante de referencia
 * @param {number} [o.desde]   primer instante del periodo (solo ORIGEN.PERIODO)
 * @param {number} [o.hasta]   último instante del periodo (solo ORIGEN.PERIODO)
 * @param {number} [o.ahora]   se inyecta para poder probar sin depender del reloj
 */
export function referencia({ origen = ORIGEN.HOY, ms = null, desde = null, hasta = null,
  ahora = Date.now() } = {}) {
  // ══ UNA REFERENCIA ROTA ES PEOR QUE NINGUNA ═════════════════════════════
  //
  // Con `ms` no finito, los límites salen NaN y TODAS las comparaciones de
  // `situacionDe` dan false: `fin < NaN` es false y `inicio > NaN` también, así
  // que absolutamente todo pasaría por VIGENTE. La pantalla no daría ningún
  // error; simplemente mentiría entera, en silencio.
  //
  // Se cae a «hoy», que es la única referencia que siempre existe, y se marca
  // `degradada` para que quien la reciba pueda decirlo en vez de callarse.
  const finito = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!finito(ahora)) ahora = Date.now();
  if (ms !== null && ms !== undefined && !finito(ms)) {
    const d = limitesDelDia(ahora);
    return Object.freeze({ origen: ORIGEN.HOY, ms: d.fin, desde: d.inicio, hasta: d.fin,
      degradada: 'la fecha pedida no era una fecha utilizable; se usa hoy' });
  }
  if (origen === ORIGEN.PERIODO) {
    // En un periodo se juzga desde su FINAL: lo que al acabar el tramo seguía
    // pendiente es lo que quedaba por coordinar en ese tramo.
    const fin = finito(hasta) ? hasta : ahora;
    return Object.freeze({ origen, ms: fin, desde: desde ?? -Infinity, hasta: fin });
  }
  if (origen === ORIGEN.ELEGIDA) {
    const d = limitesDelDia(ms ?? ahora);
    // El DÍA COMPLETO, igual que el resto de la interfaz: no un instante suelto.
    return Object.freeze({ origen, ms: d.fin, desde: d.inicio, hasta: d.fin });
  }
  const d = limitesDelDia(ahora);
  return Object.freeze({ origen: ORIGEN.HOY, ms: d.fin, desde: d.inicio, hasta: d.fin });
}

/**
 * Sitúa un PMT respecto de la referencia.
 *
 * Un PMT SIN vigencia utilizable NO es «histórico»: es «no se puede situar». Si
 * se le llamara vencido, desaparecería de la vista operativa sin que nadie
 * pueda comprobar que debía desaparecer, que es exactamente la clase de error
 * que este producto persigue desde la Etapa 1.
 */
export function situacionDe(fila, ref) {
  if (!fila?.vigenciaValida || fila.inicioMs === null || fila.inicioMs === undefined
    || fila.finMs === null || fila.finMs === undefined) return SITUACION.SIN_VIGENCIA;
  if (fila.finMs < ref.desde) return SITUACION.HISTORICO;
  if (fila.inicioMs > ref.hasta) return SITUACION.FUTURO;
  return SITUACION.VIGENTE;
}

/** ¿Este PMT sigue siendo accionable desde la referencia? */
export const esOperativo = (fila, ref) => {
  const s = situacionDe(fila, ref);
  // «Sin vigencia» cuenta como operativo A PROPÓSITO: no se puede afirmar que
  // haya terminado, así que esconderlo sería afirmarlo. Sale con su etiqueta.
  return s !== SITUACION.HISTORICO;
};

/**
 * ¿Es esta relación una COINCIDENCIA ESPACIAL todavía accionable?
 *
 * Regla: basta con que UNO de los dos siga siendo operativo. Es lo que pidió la
 * operación —«no mostrar como alerta una coincidencia formada EXCLUSIVAMENTE
 * por PMT ya vencidos»— y tiene sentido: que donde hoy trabaja alguien hubo
 * otra intervención es contexto útil, aunque aquella ya terminara.
 */
export function coincidenciaAccionable(rel, porId, ref) {
  const a = porId.get(rel.idA), b = porId.get(rel.idB);
  if (!a || !b) return true;            // sin poder comprobarlo, no se esconde
  return esOperativo(a, ref) || esOperativo(b, ref);
}

/**
 * ¿Es esta ARTICULACIÓN todavía coordinable?
 *
 * Aquí la regla es MÁS ESTRICTA que en la coincidencia, y es deliberado.
 *
 * Articular significa ponerse de acuerdo sobre un tramo de tiempo en el que dos
 * obras coinciden. Si ese tramo YA PASÓ ENTERO, no queda nada que acordar: la
 * coincidencia ocurrió. Un PMT de enero a marzo y otro de febrero a diciembre
 * sí se solaparon —y eso es un hecho que el histórico conserva— pero en junio
 * ya no hay nada que coordinar de aquel solape.
 *
 * Por eso no basta con que uno de los dos siga vivo: lo que tiene que seguir
 * vivo es EL TRASLAPE.
 */
export function articulacionCoordinable(rel, ref) {
  if (!rel.hayTraslapeTemporal) return false;
  const fin = msDeTexto(rel.traslapeFin);
  if (fin === null) return true;        // no se puede situar: no se esconde
  return fin >= ref.desde;
}

/** `AAAA-MM-DD HH:MM:SS` → milisegundos UTC. Devuelve `null` si no se puede. */
export function msDeTexto(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(ms) ? ms : null;
}

/* ═══════════════════════ AÑOS ═══════════════════════
 *
 * ══ LA REGLA, Y POR QUÉ ES ESTA ═══════════════════════════════════════════
 *
 * Un PMT del 20 de diciembre de 2025 al 15 de enero de 2026 pertenece a LOS DOS
 * años. Cualquier otra regla lo hace desaparecer de una consulta legítima:
 *
 *   · «por el año de inicio» → no sale al consultar 2026, y en enero de 2026
 *     había una obra en la calle;
 *   · «por el año de fin» → no sale al consultar 2025, y en diciembre de 2025
 *     también la había.
 *
 * Un PMT pertenece, por tanto, a TODO año con el que su vigencia se superponga.
 * Los años se cuentan en UTC, igual que el resto del producto.
 */
export function aniosDe(fila) {
  if (!fila?.vigenciaValida || fila.inicioMs === null || fila.finMs === null) return [];
  const a = new Date(fila.inicioMs).getUTCFullYear();
  const b = new Date(fila.finMs).getUTCFullYear();
  const fuera = [];
  for (let y = Math.min(a, b); y <= Math.max(a, b); y++) fuera.push(y);
  return fuera;
}

/** ¿Tiene este PMT actividad en el año calendario `anio`? */
export function tocaAnio(fila, anio) {
  if (!fila?.vigenciaValida || fila.inicioMs === null || fila.finMs === null) return false;
  const ini = Date.UTC(anio, 0, 1);
  const fin = Date.UTC(anio + 1, 0, 1) - 1;
  return fila.inicioMs <= fin && fila.finMs >= ini;
}

/** Límites del año calendario, en UTC. */
export const limitesDelAnio = (anio) => ({
  desde: Date.UTC(anio, 0, 1),
  hasta: Date.UTC(anio + 1, 0, 1) - 1,
});

/**
 * Años presentes en un conjunto, del más reciente al más antiguo, con su
 * recuento. Es lo que alimenta el selector de año: **nunca una lista fija**,
 * porque una lista fija envejece sola y deja de cubrir el año en curso.
 */
export function inventarioDeAnios(filas) {
  const cuenta = new Map();
  let sinAnio = 0;
  for (const x of filas) {
    const aa = aniosDe(x);
    if (!aa.length) { sinAnio++; continue; }
    for (const y of aa) cuenta.set(y, (cuenta.get(y) ?? 0) + 1);
  }
  return {
    anios: [...cuenta.entries()].map(([anio, pmts]) => ({ anio, pmts }))
      .sort((p, q) => q.anio - p.anio),
    sinAnio,
  };
}

/**
 * Reparte un conjunto según la referencia, para poder decir SIEMPRE de qué se
 * está hablando: «460 históricos · 84 operativos».
 */
export function repartirPorSituacion(filas, ref) {
  const r = { vigentes: 0, futuros: 0, historicos: 0, sinVigencia: 0, operativos: 0, total: filas.length };
  for (const x of filas) {
    switch (situacionDe(x, ref)) {
      case SITUACION.VIGENTE: r.vigentes++; r.operativos++; break;
      case SITUACION.FUTURO: r.futuros++; r.operativos++; break;
      case SITUACION.HISTORICO: r.historicos++; break;
      default: r.sinVigencia++; r.operativos++; break;
    }
  }
  return r;
}

/** Texto del contexto que se está viendo, para encabezados e informes. */
export function describirContexto(ref, alcance, anio = null) {
  const dia = (ms) => new Date(limitesDelDia(ms).inicio).toISOString().slice(0, 10);
  if (alcance === ALCANCE.HISTORICO && anio !== null) {
    return { etiqueta: 'Consulta histórica', detalle: `Año ${anio}`, retrospectivo: true };
  }
  if (ref.origen === ORIGEN.ELEGIDA) {
    return { etiqueta: 'Recorrido temporal', detalle: `Situación al ${dia(ref.ms)}`, retrospectivo: false };
  }
  if (ref.origen === ORIGEN.PERIODO) {
    return {
      etiqueta: 'Periodo analizado',
      detalle: `${dia(ref.desde)} a ${dia(ref.hasta)}`,
      retrospectivo: true,
    };
  }
  if (alcance === ALCANCE.TODO) {
    return { etiqueta: 'Todo el histórico', detalle: 'sin filtro de periodo', retrospectivo: true };
  }
  return { etiqueta: 'Operativo', detalle: `al ${dia(ref.ms)}`, retrospectivo: false };
}

