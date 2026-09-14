/**
 * BITÁCORA — qué pasó, cuándo, y a partir de qué.
 *
 * ══ QUÉ RESPONDE Y QUÉ NO ═════════════════════════════════════════════════
 *
 * RESPONDE: «¿por qué hoy salen 176 relaciones y ayer 174?».
 * NO RESPONDE: «¿quién lo hizo?». Hoy la plataforma es un archivo que se abre
 * con doble clic: no hay identidad, así que **no se inventa una**. El campo
 * `actor` existe y vale `'equipo-local'` hasta que haya identidad de verdad;
 * cuando la haya, se rellena y la bitácora empieza a responder también eso.
 *
 * Escribir «usuario: Leydi» porque es quien suele usarla sería fabricar una
 * atribución. Una bitácora que miente es peor que no tenerla.
 *
 * ══ FORMA ═════════════════════════════════════════════════════════════════
 *
 * Solo se añade al final. No se corrige ni se borra: si algo salió mal, se
 * anota que salió mal. Cada anotación es un hecho con su momento.
 *
 * @module
 */

export const ESQUEMA_BITACORA = 1;

/** Hechos que se anotan. Neutros: describen lo que pasó, no lo valoran. */
export const HECHO = Object.freeze({
  SINCRONIZACION: 'sincronizacion',
  FUENTE_NUEVA: 'fuente_nueva',
  FUENTE_MODIFICADA: 'fuente_modificada',
  FUENTE_RETIRADA: 'fuente_retirada',
  FUENTE_MOVIDA: 'fuente_movida',
  FUENTE_RECHAZADA: 'fuente_rechazada',
  ANALISIS: 'analisis',
  PMT_ALTA: 'pmt_alta',
  PMT_BAJA: 'pmt_baja',
  RELACIONES_CAMBIAN: 'relaciones_cambian',
  PROYECTO_GUARDADO: 'proyecto_guardado',
  PROYECTO_ABIERTO: 'proyecto_abierto',
  ERROR: 'error',
});

export function crearBitacora(anotaciones = []) {
  return { esquema: ESQUEMA_BITACORA, anotaciones: [...anotaciones] };
}

/**
 * Añade una anotación. Devuelve una bitácora NUEVA: no se muta la anterior,
 * que es lo que permite comparar estados sin sorpresas.
 *
 * @param {object} bitacora
 * @param {{hecho:string, detalle?:object, resumen:string, actor?:string}} a
 */
export function anotar(bitacora, a) {
  if (!HECHO[Object.keys(HECHO).find((k) => HECHO[k] === a.hecho)]) {
    // Un hecho desconocido no se rechaza en silencio: se anota como tal.
    a = { ...a, hecho: HECHO.ERROR, resumen: `hecho no reconocido «${a.hecho}»: ${a.resumen ?? ''}` };
  }
  return {
    ...bitacora,
    anotaciones: [...bitacora.anotaciones, {
      momento: new Date().toISOString(),
      hecho: a.hecho,
      resumen: a.resumen,
      detalle: a.detalle ?? null,
      // Sin identidad todavía. Ver la cabecera de este archivo.
      actor: a.actor ?? 'equipo-local',
    }],
  };
}

/** Anota de golpe lo que una sincronización cambió. Una llamada, no veinte. */
export function anotarSincronizacion(bitacora, { proveedor, comparacion, plan, difRegistros }) {
  let b = anotar(bitacora, {
    hecho: HECHO.SINCRONIZACION,
    resumen: `Sincronización con «${proveedor}»: ${plan.aLeer} fuente(s) a leer de ${plan.total}.`,
    detalle: { proveedor, resumen: comparacion.resumen, avisos: plan.avisos },
  });
  const porTipo = {
    nueva: HECHO.FUENTE_NUEVA, modificada: HECHO.FUENTE_MODIFICADA,
    eliminada: HECHO.FUENTE_RETIRADA, movida: HECHO.FUENTE_MOVIDA,
    duplicada: HECHO.FUENTE_RECHAZADA, indeterminada: HECHO.FUENTE_MODIFICADA,
  };
  for (const c of comparacion.cambios) {
    if (c.tipo === 'sin_cambio') continue;
    b = anotar(b, {
      hecho: porTipo[c.tipo] ?? HECHO.ERROR,
      resumen: `${c.fuente.nombre}: ${c.tipo}${c.motivo ? ` — ${c.motivo}` : ''}`,
      detalle: { id: c.fuente.id, huella: c.fuente.huella.valor, bytes: c.fuente.bytes },
    });
  }
  if (difRegistros?.hayCambios) {
    if (difRegistros.altas.length) {
      b = anotar(b, { hecho: HECHO.PMT_ALTA,
        resumen: `${difRegistros.altas.length} PMT nuevo(s).`,
        detalle: { ids: difRegistros.altas.slice(0, 200) } });
    }
    if (difRegistros.bajas.length) {
      b = anotar(b, { hecho: HECHO.PMT_BAJA,
        resumen: `${difRegistros.bajas.length} PMT que ya no están.`,
        detalle: { ids: difRegistros.bajas.slice(0, 200) } });
    }
  }
  return b;
}

/** Las últimas n anotaciones, de la más reciente a la más antigua. */
export const ultimas = (bitacora, n = 50) => [...bitacora.anotaciones].slice(-n).reverse();

export const serializarBitacora = (b) => JSON.stringify(b, null, 1);

export function leerBitacora(texto) {
  try {
    const d = typeof texto === 'string' ? JSON.parse(texto) : texto;
    if (d?.esquema !== ESQUEMA_BITACORA || !Array.isArray(d.anotaciones)) return crearBitacora();
    return { esquema: ESQUEMA_BITACORA, anotaciones: d.anotaciones.filter((x) => x && x.momento && x.hecho) };
  } catch { return crearBitacora(); }
}
