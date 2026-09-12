/**
 * LA TUBERÍA: observar → comparar → planificar → aplicar → anotar.
 *
 * ══ QUÉ ES Y QUÉ NO ES ════════════════════════════════════════════════════
 *
 * Es el orquestador que junta las cuatro piezas anteriores. Es puro: no toca el
 * DOM, no descarga nada por su cuenta y no sabe de dónde vienen los datos.
 * Recibe un proveedor —el local de hoy o el simulado de las pruebas— y
 * devuelve QUÉ HABRÍA QUE HACER y QUÉ PASÓ.
 *
 * NO decide sola. Devuelve el plan y el resultado; quien llama decide si lo
 * aplica y cómo se lo cuenta a la persona. Una automatización que actúa sin que
 * se vea lo que hizo es exactamente lo que no queremos.
 *
 * ══ LA PROPIEDAD QUE TIENE QUE CUMPLIR ════════════════════════════════════
 *
 * Sincronizar dos veces seguidas sin que cambie nada en el origen NO puede
 * producir ningún cambio la segunda vez. Si lo produce, hay algo que depende
 * del reloj o del orden, y eso acabaría en reprocesar todo cada mañana.
 *
 * @module
 */
import { observarTodo } from './proveedores.js';
import { crearInventario, compararInventarios, planDeActualizacion,
  diferenciasDeRegistros } from './inventario.js';
import { anotarSincronizacion, anotar, HECHO } from './auditoria.js';

/**
 * Mira el origen y dice qué cambió, SIN aplicar nada.
 *
 * @param {object} proveedor
 * @param {object|null} inventarioPrevio
 */
export async function revisar(proveedor, inventarioPrevio = null) {
  const { observadas, rechazadas } = await observarTodo(proveedor);
  const comparacion = compararInventarios(inventarioPrevio, observadas);
  const plan = planDeActualizacion(comparacion);
  return { observadas, rechazadas, comparacion, plan };
}

/**
 * Aplica el plan: lee SOLO lo que hace falta y deja el inventario al día.
 *
 * @param {object} proveedor
 * @param {object} revision           lo que devolvió `revisar`
 * @param {(fuente, datos) => Promise<string[]>} procesar
 *        función que convierte los bytes de una fuente en identificadores de
 *        PMT. La pone quien llama: aquí no se sabe leer un KMZ, y está bien.
 * @param {object|null} inventarioPrevio
 * @param {object|null} bitacora
 */
export async function aplicar(proveedor, revision, procesar, inventarioPrevio = null, bitacora = null) {
  const { comparacion, plan, rechazadas } = revision;

  // Lo que no cambió conserva sus registros: ese es todo el ahorro.
  const registrosPorFuente = new Map();
  for (const c of comparacion.cambios) {
    if (c.tipo === 'sin_cambio' || c.tipo === 'movida') {
      registrosPorFuente.set(c.fuente.id, c.registrosPrevios ?? []);
    }
  }

  const errores = [...rechazadas];
  let leidas = 0;
  for (const f of plan.leer) {
    try {
      const datos = await proveedor.leer(f.ruta);
      registrosPorFuente.set(f.id, await procesar(f, datos));
      leidas++;
    } catch (e) {
      // Una fuente que falla no tumba el lote, y NO se da por buena la versión
      // anterior: eso haría pasar por vigente algo que no se pudo confirmar.
      errores.push({ ruta: f.ruta, nombre: f.nombre, motivo: e?.message ?? String(e) });
    }
  }

  const fuentesFinales = revision.observadas.filter((f) => registrosPorFuente.has(f.id));
  const inventario = crearInventario(fuentesFinales, registrosPorFuente);

  const antes = (inventarioPrevio?.fuentes ?? []).flatMap((f) => f.registros ?? []);
  const ahora = fuentesFinales.flatMap((f) => registrosPorFuente.get(f.id) ?? []);
  const difRegistros = diferenciasDeRegistros(antes, ahora);

  let b = bitacora;
  if (b) {
    b = anotarSincronizacion(b, { proveedor: proveedor.nombre, comparacion, plan, difRegistros });
    for (const e of errores) {
      b = anotar(b, { hecho: HECHO.FUENTE_RECHAZADA,
        resumen: `${e.nombre}: no se pudo leer — ${e.motivo}` });
    }
  }

  return {
    inventario, difRegistros, errores, bitacora: b,
    leidas,
    ahorradas: plan.conservar.length,
    // Cifra honesta del ahorro: solo tiene sentido si antes había algo.
    porcentajeEvitado: plan.total ? Math.round((plan.conservar.length / plan.total) * 100) : 0,
  };
}

/** Frase llana de lo que acaba de pasar, para enseñar tal cual. */
export function explicarSincronizacion(revision, resultado) {
  const r = revision.comparacion.resumen;
  const partes = [];
  if (r.nueva) partes.push(`${r.nueva} archivo(s) nuevo(s)`);
  if (r.modificada) partes.push(`${r.modificada} modificado(s)`);
  if (r.eliminada) partes.push(`${r.eliminada} que ya no está(n)`);
  if (r.movida) partes.push(`${r.movida} que cambió(aron) de sitio sin cambiar de contenido`);
  if (r.duplicada) partes.push(`${r.duplicada} repetido(s), que no se procesan dos veces`);
  if (!partes.length) return 'No ha cambiado nada desde la última vez. No hizo falta volver a analizar.';

  const dif = resultado?.difRegistros;
  const pmt = dif?.hayCambios
    ? ` En PMT: ${dif.altas.length} alta(s) y ${dif.bajas.length} baja(s).`
    : ' Ningún PMT cambió.';
  const ahorro = resultado && resultado.ahorradas
    ? ` Se reaprovecharon ${resultado.ahorradas} archivo(s) sin volver a leerlos.` : '';
  return `Cambios: ${partes.join(', ')}.${pmt}${ahorro}`;
}
