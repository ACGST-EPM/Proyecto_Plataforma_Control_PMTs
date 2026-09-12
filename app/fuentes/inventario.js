/**
 * MODELO EXPLÍCITO: FUENTE → VERSIÓN → REGISTROS DERIVADOS.
 *
 * ══ POR QUÉ HACE FALTA SEPARAR TRES COSAS QUE SE CONFUNDEN ════════════════
 *
 * Hoy la aplicación trabaja con «archivos que la usuaria elige». Eso funciona
 * con ocho KMZ y deja de funcionar en cuanto los archivos llegan solos, cambian
 * de versión o alguien los renombra. Antes de automatizar nada hay que decidir
 * qué significa «el mismo». Y son TRES preguntas distintas, no una:
 *
 *   1. DEDUPLICACIÓN TÉCNICA  ¿son los mismos BYTES?
 *      Responde la huella del contenido. Dos archivos con nombres distintos y
 *      el mismo contenido son la misma versión copiada dos veces.
 *
 *   2. VERSIONADO             ¿es el mismo ARCHIVO, más nuevo?
 *      Responde la identidad de la FUENTE (su ruta o su nombre dentro de una
 *      carpeta). Mismo sitio, otro contenido = versión nueva de lo mismo.
 *
 *   3. IDENTIDAD DE NEGOCIO   ¿es el mismo PMT?
 *      Responde el identificador estable del trazado, que el motor deriva de su
 *      contenido (`pmt:id` o huella del contenido). Un mismo PMT puede aparecer
 *      en varias versiones de una fuente, y hay que saber que es el mismo.
 *
 * Mezclarlas produce errores concretos y predecibles: renombrar un archivo
 * parecería un alta y una baja; corregir una fecha en un KMZ parecería que
 * desaparecen todos sus PMT y aparecen otros nuevos; copiar un archivo a otra
 * carpeta duplicaría 60 trazados.
 *
 * ══ QUÉ ES CADA COSA AQUÍ ═════════════════════════════════════════════════
 *
 *   Fuente    de dónde sale la información. Tiene identidad estable: el
 *             proveedor y la ruta dentro de él. No cambia al cambiar el
 *             contenido.
 *   Versión   el contenido concreto de una fuente en un momento dado,
 *             identificado por su huella. Una fuente tiene 1..n versiones.
 *   Registros los PMT que produjo esa versión, por su identificador de
 *             negocio. Son DERIVADOS: se recalculan, nunca mandan.
 *
 * Esto NO es una base de datos ni un sistema de versiones. Es el mínimo
 * necesario para poder responder «qué cambió desde la última vez» sin
 * reprocesarlo todo y sin inventarse nada.
 *
 * @module
 */
import { huellaDe, mismaHuella } from './huella.js';

/** Versión del formato del inventario. Se guarda con él. */
export const ESQUEMA_INVENTARIO = 1;

/**
 * Identidad estable de una fuente: proveedor + ruta.
 *
 * NO incluye el contenido. Ese es justo el punto: la fuente es «ese sitio», y
 * lo que hay en ese sitio puede cambiar.
 */
export const idFuente = (proveedor, ruta) => `${proveedor}:${ruta}`;

/**
 * Crea el registro de una fuente vista ahora mismo.
 *
 * @param {{proveedor:string, ruta:string, nombre?:string, datos:Uint8Array,
 *          modificado?:string|null, etiquetaRemota?:string|null}} entrada
 */
export async function observarFuente(entrada) {
  const huella = await huellaDe(entrada.datos);
  return {
    id: idFuente(entrada.proveedor, entrada.ruta),
    proveedor: entrada.proveedor,
    ruta: entrada.ruta,
    nombre: entrada.nombre ?? entrada.ruta.split('/').pop(),
    huella,
    bytes: huella.bytes,
    // Lo que diga el origen sobre cuándo cambió. Es INFORMATIVO: no se usa para
    // decidir si algo cambió, porque un reloj ajeno no es una prueba. Decide la
    // huella del contenido, que sí lo es.
    modificadoDeclarado: entrada.modificado ?? null,
    etiquetaRemota: entrada.etiquetaRemota ?? null,
    observadoEn: new Date().toISOString(),
  };
}

/**
 * Inventario: lo que se sabe de un conjunto de fuentes en un momento dado.
 * Es lo que se guarda para poder comparar la próxima vez.
 */
export function crearInventario(fuentes = [], registrosPorFuente = new Map()) {
  return {
    esquema: ESQUEMA_INVENTARIO,
    creado: new Date().toISOString(),
    fuentes: fuentes.map((f) => ({
      ...f,
      // Registros DERIVADOS de esta versión: solo los identificadores. El
      // contenido de cada PMT no se guarda aquí; para eso está el proyecto.
      registros: [...(registrosPorFuente.get(f.id) ?? [])].sort(),
    })),
  };
}

/** Serializa el inventario para guardarlo. Sin nada que no venga de los datos. */
export const serializarInventario = (inv) => JSON.stringify(inv, null, 1);

/**
 * Lee un inventario guardado, validándolo. Nunca lanza.
 * Un inventario corrupto NO es un error fatal: significa «no sé qué había
 * antes», y entonces todo se trata como nuevo, que es lo seguro.
 */
export function leerInventario(texto) {
  let d;
  try { d = typeof texto === 'string' ? JSON.parse(texto) : texto; }
  catch { return { ok: false, motivo: 'el inventario no se pudo leer' }; }
  if (!d || typeof d !== 'object') return { ok: false, motivo: 'el inventario no es un objeto' };
  if (d.esquema !== ESQUEMA_INVENTARIO) {
    return { ok: false, motivo: `inventario en formato ${d.esquema}; esta versión entiende el ${ESQUEMA_INVENTARIO}` };
  }
  if (!Array.isArray(d.fuentes)) return { ok: false, motivo: 'el inventario no trae fuentes' };
  const fuentes = d.fuentes.filter((f) =>
    f && typeof f.id === 'string' && f.huella && typeof f.huella.valor === 'string');
  return { ok: true, inventario: { ...d, fuentes } };
}

/* ═══════════════════ COMPARACIÓN INCREMENTAL ═══════════════════ */

/** Estados posibles de una fuente entre dos inventarios. */
export const CAMBIO = Object.freeze({
  NUEVA: 'nueva',
  MODIFICADA: 'modificada',
  SIN_CAMBIO: 'sin_cambio',
  ELIMINADA: 'eliminada',
  MOVIDA: 'movida',           // mismo contenido, otra ruta
  DUPLICADA: 'duplicada',     // mismo contenido que otra fuente del mismo lote
  INDETERMINADA: 'indeterminada', // huellas no comparables (algoritmos distintos)
});

/**
 * Compara lo que hay ahora con lo que había antes.
 *
 * ══ EL ORDEN DE LAS PREGUNTAS IMPORTA ═════════════════════════════════════
 *
 * 1. ¿Existía ya esta RUTA?  → misma fuente: sin cambio o versión nueva.
 * 2. Si no existía, ¿conozco ya este CONTENIDO en otra ruta? → se movió o se
 *    copió. NO es un alta: sus PMT ya estaban.
 * 3. Si no, es nueva de verdad.
 * 4. Lo que había antes y ya no está: eliminada.
 *
 * Hacer la pregunta 2 después de la 1 es lo que evita que renombrar un archivo
 * se vea como un alta y una baja a la vez.
 *
 * @param {object|null} anterior inventario previo, o null si no hay
 * @param {Array} ahora          fuentes observadas ahora (`observarFuente`)
 * @returns {{cambios:Array, resumen:object, hayCambios:boolean}}
 */
export function compararInventarios(anterior, ahora) {
  const previas = new Map((anterior?.fuentes ?? []).map((f) => [f.id, f]));
  const previasPorHuella = new Map();
  for (const f of anterior?.fuentes ?? []) {
    if (!previasPorHuella.has(f.huella.valor)) previasPorHuella.set(f.huella.valor, f);
  }

  const cambios = [];
  const huellasDelLote = new Map();

  for (const f of ahora) {
    const antes = previas.get(f.id);

    // Duplicado DENTRO del mismo lote: dos rutas con el mismo contenido ahora.
    const gemela = huellasDelLote.get(f.huella.valor);
    huellasDelLote.set(f.huella.valor, f.id);

    if (antes) {
      const igual = mismaHuella(antes.huella, f.huella);
      if (igual === null) {
        cambios.push({ tipo: CAMBIO.INDETERMINADA, fuente: f, antes,
          motivo: `la huella anterior se calculó con «${antes.huella.algoritmo}» y esta con ` +
            `«${f.huella.algoritmo}»: no se pueden comparar, así que se trata como modificada` });
        continue;
      }
      cambios.push({ tipo: igual ? CAMBIO.SIN_CAMBIO : CAMBIO.MODIFICADA, fuente: f, antes,
        registrosPrevios: antes.registros ?? [] });
      continue;
    }

    const mismaCosaEnOtroSitio = previasPorHuella.get(f.huella.valor);
    if (mismaCosaEnOtroSitio) {
      cambios.push({ tipo: CAMBIO.MOVIDA, fuente: f, antes: mismaCosaEnOtroSitio,
        registrosPrevios: mismaCosaEnOtroSitio.registros ?? [],
        motivo: `mismo contenido que «${mismaCosaEnOtroSitio.ruta}»: es el mismo archivo en otro sitio, ` +
          `no información nueva` });
      continue;
    }
    if (gemela) {
      cambios.push({ tipo: CAMBIO.DUPLICADA, fuente: f, antes: null,
        motivo: `mismo contenido que «${gemela}», que llegó en este mismo lote` });
      continue;
    }
    cambios.push({ tipo: CAMBIO.NUEVA, fuente: f, antes: null });
  }

  const idsAhora = new Set(ahora.map((f) => f.id));
  // Una fuente que se movió no está eliminada: se localiza por su contenido.
  const huellasAhora = new Set(ahora.map((f) => f.huella.valor));
  for (const [id, f] of previas) {
    if (idsAhora.has(id)) continue;
    if (huellasAhora.has(f.huella.valor)) continue;   // se movió, no se fue
    cambios.push({ tipo: CAMBIO.ELIMINADA, fuente: f, antes: f, registrosPrevios: f.registros ?? [] });
  }

  const resumen = {};
  for (const v of Object.values(CAMBIO)) resumen[v] = 0;
  for (const c of cambios) resumen[c.tipo]++;
  const hayCambios = cambios.some((c) => c.tipo !== CAMBIO.SIN_CAMBIO);
  return { cambios, resumen, hayCambios };
}

/**
 * Qué hay que hacer con el resultado de la comparación.
 *
 * Deliberadamente NO decide por su cuenta: devuelve un PLAN legible que alguien
 * —persona o proceso— aprueba o ejecuta. «Reprocesar solo lo necesario» es una
 * optimización; presentarla como una decisión tomada a espaldas de nadie es un
 * problema de confianza.
 */
export function planDeActualizacion(comparacion) {
  const leer = [], conservar = [], retirar = [], avisos = [];
  for (const c of comparacion.cambios) {
    switch (c.tipo) {
      case CAMBIO.NUEVA:
      case CAMBIO.MODIFICADA:
      case CAMBIO.INDETERMINADA:
        leer.push(c.fuente);
        if (c.motivo) avisos.push(`${c.fuente.nombre}: ${c.motivo}`);
        break;
      case CAMBIO.SIN_CAMBIO:
        conservar.push(c.fuente);
        break;
      case CAMBIO.MOVIDA:
        // El contenido ya se conoce: no hay que volver a leerlo, pero sí
        // actualizar dónde vive.
        conservar.push(c.fuente);
        avisos.push(`${c.fuente.nombre}: ${c.motivo}`);
        break;
      case CAMBIO.DUPLICADA:
        avisos.push(`${c.fuente.nombre}: ${c.motivo}. No se procesa dos veces.`);
        break;
      case CAMBIO.ELIMINADA:
        retirar.push(c.fuente);
        break;
    }
  }
  return {
    leer, conservar, retirar, avisos,
    // Cuánto trabajo se ahorra. Si es 0, se dice: un «no hay cambios» honesto
    // vale más que una barra de progreso falsa.
    aLeer: leer.length,
    total: leer.length + conservar.length,
    registrosQueSeRetiran: comparacion.cambios
      .filter((c) => c.tipo === CAMBIO.ELIMINADA)
      .flatMap((c) => c.registrosPrevios ?? []),
  };
}

/**
 * Diferencias a nivel de PMT entre dos conjuntos de identificadores.
 *
 * Es la pregunta 3 del modelo: identidad de NEGOCIO. Un PMT que aparece en una
 * versión nueva de la misma fuente y tiene el mismo identificador es el MISMO
 * PMT, no uno nuevo, aunque haya cambiado el archivo que lo trajo.
 */
export function diferenciasDeRegistros(antes, ahora) {
  const a = new Set(antes), b = new Set(ahora);
  const altas = [...b].filter((x) => !a.has(x)).sort();
  const bajas = [...a].filter((x) => !b.has(x)).sort();
  const permanecen = [...b].filter((x) => a.has(x)).sort();
  return { altas, bajas, permanecen,
    hayCambios: altas.length > 0 || bajas.length > 0 };
}
