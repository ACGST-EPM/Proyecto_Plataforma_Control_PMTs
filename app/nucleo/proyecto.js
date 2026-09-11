/**
 * PROYECTOS `.pmt.json` — guardar y volver a abrir un análisis.
 *
 * ══ PRINCIPIO DE ESTA VERSIÓN (esquema 2) ═══════════════════════════════════
 *
 *   Las FUENTES son entrada. Los RESULTADOS son derivados.
 *   Un resultado no adquiere autoridad por estar escrito en un archivo.
 *
 * La versión anterior guardaba las relaciones y las volvía a presentar tal cual
 * al abrir el proyecto. Una auditoría independiente demostró que bastaba con
 * editar el archivo a mano —cambiar una distancia a 98.765,4 m— para que la
 * aplicación mostrara ese número como si lo hubiera calculado el motor. También
 * entraban identificadores repetidos, relaciones con extremos inexistentes,
 * coordenadas imposibles, configuraciones absurdas y esquemas 0 o −1.
 *
 * Ahora:
 *   · se guardan los TRAZADOS NORMALIZADOS, la procedencia y la configuración;
 *   · las relaciones NO se guardan como dato; **se recalculan siempre al abrir**;
 *   · se guarda una INSTANTÁNEA de solo recuentos, marcada como informativa, que
 *     sirve para avisar si el recálculo no coincide con lo que se guardó;
 *   · todo lo que entra se valida campo a campo antes de usarse.
 *
 * POR QUÉ RECALCULAR Y NO USAR UNA CACHÉ VERIFICABLE
 * Una caché firmada solo protegería de ediciones torpes, no de alguien que
 * recalcule la firma; y obligaría a mantener dos caminos —el de la caché y el
 * del cálculo— que pueden divergir. Recalcular cuesta ~300 ms sobre los datos
 * reales y elimina la clase entera de problema: lo que se ve en pantalla lo
 * acaba de calcular el motor, con las reglas del motor que está instalado.
 *
 * SOBRE EL HASH DE INTEGRIDAD
 * El archivo lleva `huella`, útil para detectar corrupción accidental (una
 * copia truncada, un editor que rompió el JSON). **No es autenticación ni
 * protege frente a manipulación deliberada**: quien edita el archivo puede
 * recalcular la huella. Por eso la validación no depende de ella y los
 * resultados se recalculan de todos modos.
 *
 * QUÉ NO CONTIENE: contraseñas, claves, direcciones de servidores internos ni
 * nada que no viniera dentro de los propios KMZ. Lleva los mismos datos
 * operativos que los KMZ de entrada, así que se custodia igual: **no se sube al
 * repositorio público**.
 */

import { validarGeometria as validarGeo } from './geojson.js';
import { normalizarVigencia } from './tiempo.js';

export const ESQUEMA = 2;
export const ESQUEMA_MINIMO_LEGIBLE = 1;
export const EXTENSION = '.pmt.json';
const MARCA = 'plataforma-pmt-epm';

/* ───────────────────────── Utilidades de validación ───────────────────────── */

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const esTextoONulo = (x) => x === null || x === undefined || typeof x === 'string';
const esNumFinito = (x) => typeof x === 'number' && Number.isFinite(x);

/** Huella de integridad accidental: NO es una firma. */
export function huellaDe(texto) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

/**
 * Valida una geometría. Delega en `geojson.js`, que tiene una regla explícita
 * por tipo: nada se deduce de la profundidad de los arrays, que es lo que hacía
 * que un `Polygon` de un solo anillo se confundiera con una coordenada.
 */
export function validarGeometria(g) {
  const r = validarGeo(g);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  return { ok: true, geometria: g ?? null };
}

/**
 * Valida la configuración del análisis. Un proyecto con una configuración
 * absurda no puede abrirse «como si nada»: cambiaría lo que ve el usuario sin
 * que él lo sepa.
 */
export function validarConfig(c) {
  if (!esObjeto(c)) return { ok: false, motivo: 'el proyecto no trae configuración del análisis' };
  const problemas = [];

  if (!esNumFinito(c.umbralMetros) || c.umbralMetros <= 0 || c.umbralMetros > 50000) {
    problemas.push(`umbral de distancia inválido (${JSON.stringify(c.umbralMetros)}); debe ser un número entre 0 y 50000 m`);
  }
  if (!esNumFinito(c.toleranciaMinutos) || c.toleranciaMinutos < 0 || c.toleranciaMinutos > 525600) {
    problemas.push(`tolerancia temporal inválida (${JSON.stringify(c.toleranciaMinutos)}); debe ser un número de minutos no negativo`);
  }
  if (!['instante', 'dia'].includes(c.granularidadTemporal)) {
    problemas.push(`granularidad temporal inválida (${JSON.stringify(c.granularidadTemporal)})`);
  }
  if (typeof c.excluirMismoContrato !== 'boolean') {
    problemas.push('falta o es inválida la regla de exclusión de mismo contrato');
  }
  if (!['real', 'legado'].includes(c.modoDistancia)) {
    problemas.push(`modo de distancia inválido (${JSON.stringify(c.modoDistancia)})`);
  }
  return problemas.length ? { ok: false, motivo: problemas.join('; ') } : { ok: true, config: c };
}

/* ───────────────────────── Construcción ───────────────────────── */

/**
 * Construye el proyecto. Las relaciones NO se incluyen: solo sus recuentos,
 * y marcados como informativos.
 */
export function crearProyecto({ filas, relaciones, noEvaluables, archivos, config, filtros, nombre, versionReglas }) {
  const cuerpo = {
    marca: MARCA,
    esquema: ESQUEMA,
    nombre: (nombre ?? '').trim() || 'Proyecto PMT',
    creado: new Date().toISOString(),
    aplicacion: 'Plataforma de Control y Articulacion de PMTs',
    motor: {
      versionReglas: versionReglas ?? 'desconocida',
      nota: 'Las reglas con las que se generó este proyecto. Si al abrirlo el motor ' +
        'instalado tiene otras, la aplicación lo avisa y recalcula con las suyas.',
    },
    config,
    fuentes: (archivos ?? []).map((a) => ({
      nombre: a.nombre,
      estadoLectura: a.estadoLectura ?? (a.ok === false ? 'fallida' : 'completa'),
      placemarks: a.placemarks ?? 0,
      errores: a.errores ?? [],
      motivosCobertura: a.motivosCobertura ?? [],
      avisos: a.avisos ?? [],
    })),
    filtros: filtros ?? null,
    trazados: (filas ?? []).map((x) => ({
      id: x.id, frente: x.frente, contrato: x.contrato, contratista: x.contratista,
      proyecto: x.proyecto, municipio: x.municipio, direccion: x.direccion,
      tipoCierre: x.tipoCierre,
      // CANÓNICO: solo el texto. Los milisegundos son derivados y NO se
      // guardan: dos representaciones de la misma fecha pueden contradecirse,
      // y entonces lo mostrado y lo calculado dejan de ser lo mismo.
      inicio: x.inicio, fin: x.fin,
      tipoGeometria: x.tipoGeometria, tieneGeometria: x.tieneGeometria,
      analizable: x.analizable, origenArchivo: x.origenArchivo, carpeta: x.carpeta,
      avisos: x.avisos ?? [], geometria: x.geometria,
    })),
    /**
     * INSTANTÁNEA: solo recuentos, y solo para poder avisar si el recálculo da
     * otra cosa. NO son las relaciones, y no se presentan nunca como resultado.
     */
    instantanea: {
      nota: 'INFORMATIVO. Recuentos observados al guardar. Al abrir, la aplicación ' +
        'recalcula todo con el motor y compara: estos números no se muestran como resultado.',
      relaciones: (relaciones ?? []).length,
      conTraslape: (relaciones ?? []).filter((r) => r.hayTraslapeTemporal).length,
      contactos: (relaciones ?? []).filter((r) => r.intersecanFisicamente).length,
      noEvaluablesEspacialmente: (noEvaluables ?? []).length,
      trazados: (filas ?? []).length,
    },
  };
  cuerpo.huella = huellaDe(JSON.stringify(cuerpo));
  return cuerpo;
}

export function serializar(proyecto) {
  return JSON.stringify(proyecto, null, 1);
}

/* ───────────────────────── Lectura estricta ───────────────────────── */

/**
 * Lee y VALIDA un proyecto. Nunca lanza. Devuelve o bien `{ok:false, motivo}`
 * con una explicación entendible, o bien el proyecto saneado **sin relaciones**:
 * quien lo abre tiene que recalcularlas.
 */
export function leerProyecto(texto) {
  let d;
  try {
    d = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch {
    return { ok: false, motivo: 'El archivo no es un proyecto válido: no se pudo leer su contenido.' };
  }
  if (!esObjeto(d)) return { ok: false, motivo: 'El archivo no contiene un proyecto.' };
  if (d.marca !== MARCA) return { ok: false, motivo: 'Este archivo no es un proyecto de la Plataforma de PMTs.' };

  // ── Versión de esquema: estricta por los dos lados ──
  if (!Number.isInteger(d.esquema)) {
    return { ok: false, motivo: 'El proyecto no dice con qué versión se guardó.' };
  }
  if (d.esquema < ESQUEMA_MINIMO_LEGIBLE) {
    return {
      ok: false,
      motivo: `El proyecto declara la versión de formato ${d.esquema}, que no existe. ` +
        `Las versiones válidas van de ${ESQUEMA_MINIMO_LEGIBLE} a ${ESQUEMA}.`,
    };
  }
  if (d.esquema > ESQUEMA) {
    return {
      ok: false,
      motivo: `Este proyecto se guardó con una versión más reciente de la aplicación ` +
        `(formato ${d.esquema}; esta entiende hasta el ${ESQUEMA}). Actualice la aplicación para abrirlo.`,
    };
  }

  const avisos = [];
  const migrado = d.esquema < ESQUEMA;
  if (migrado) {
    avisos.push(`El proyecto se guardó con el formato ${d.esquema} y se ha migrado al ${ESQUEMA}. ` +
      `Vuelva a guardarlo para dejarlo actualizado.`);
  }

  // ── Integridad accidental (NO es autenticación) ──
  if (typeof d.huella === 'string') {
    const { huella, ...sinHuella } = d;
    if (huellaDe(JSON.stringify(sinHuella)) !== huella) {
      avisos.push('El archivo ha sido modificado después de guardarse. Los resultados se recalculan ' +
        'de todas formas, así que lo que verá lo acaba de calcular el motor.');
    }
  }

  // ── Configuración ──
  const cfg = validarConfig(d.config);
  if (!cfg.ok) {
    return { ok: false, motivo: `La configuración del análisis guardada no es válida: ${cfg.motivo}.` };
  }

  // ── Trazados: son la ENTRADA, y se validan uno a uno ──
  if (!Array.isArray(d.trazados)) return { ok: false, motivo: 'El proyecto no contiene ningún trazado.' };

  const trazados = [];
  const vistos = new Set();
  let descartados = 0, geometriasInvalidas = 0, duplicados = 0, fechasDescartadas = 0;

  for (const t of d.trazados) {
    if (!esObjeto(t) || typeof t.id !== 'string' || !t.id.trim()) { descartados++; continue; }
    if (vistos.has(t.id)) { duplicados++; continue; }          // identificador repetido: no entra
    if (![t.frente, t.contrato, t.contratista, t.proyecto, t.municipio, t.direccion,
      t.tipoCierre, t.inicio, t.fin, t.origenArchivo].every(esTextoONulo)) { descartados++; continue; }

    const g = validarGeometria(t.geometria);
    let geometria = t.geometria ?? null;
    const avisosTrazado = Array.isArray(t.avisos) ? t.avisos.filter((a) => typeof a === 'string') : [];
    if (!g.ok) {
      geometriasInvalidas++;
      geometria = null;
      avisosTrazado.push(`geometría descartada al abrir el proyecto: ${g.motivo}`);
    }

    // VIGENCIA: el texto manda y los milisegundos se derivan de él. Si el
    // archivo trae unos que no cuadran, la vigencia se descarta entera: no se
    // elige en silencio entre dos fechas que se contradicen.
    const vig = normalizarVigencia({ inicio: t.inicio, fin: t.fin, inicioMs: t.inicioMs, finMs: t.finMs });
    for (const a of vig.avisos) avisosTrazado.push(a);
    if (!vig.valida && (t.inicio || t.fin)) fechasDescartadas++;

    vistos.add(t.id);
    trazados.push({
      id: t.id,
      frente: t.frente ?? null, contrato: t.contrato ?? null, contratista: t.contratista ?? null,
      proyecto: t.proyecto ?? null, municipio: t.municipio ?? null, direccion: t.direccion ?? null,
      tipoCierre: t.tipoCierre ?? null,
      inicio: vig.inicio, fin: vig.fin,
      inicioMs: vig.inicioMs, finMs: vig.finMs, vigenciaValida: vig.valida,
      geometria,
      tipoGeometria: geometria?.type ?? null,
      tieneGeometria: !!geometria,
      analizable: !!geometria && vig.valida && !!t.contrato,
      origenArchivo: t.origenArchivo ?? null, carpeta: t.carpeta ?? null,
      avisos: avisosTrazado,
    });
  }

  if (descartados) avisos.push(`Se descartaron ${descartados} trazado(s) con datos incompletos o mal formados.`);
  if (duplicados) avisos.push(`Se descartaron ${duplicados} trazado(s) con un identificador repetido.`);
  if (geometriasInvalidas) avisos.push(`${geometriasInvalidas} trazado(s) traían una geometría inválida; se conservan sin geometría y quedan fuera del análisis espacial.`);
  if (fechasDescartadas) avisos.push(`${fechasDescartadas} trazado(s) traían fechas ilegibles o contradictorias; se conservan sin vigencia y no entran en la comparación temporal.`);
  if (!trazados.length) return { ok: false, motivo: 'El proyecto no contiene ningún trazado utilizable.' };

  // ── Relaciones: SI VIENEN, SE IGNORAN ──
  if (Array.isArray(d.relaciones) && d.relaciones.length) {
    avisos.push(`El archivo traía ${d.relaciones.length} relación(es) guardadas. ` +
      `NO se usan: las relaciones se recalculan siempre con el motor al abrir el proyecto.`);
  }

  const fuentes = Array.isArray(d.fuentes) ? d.fuentes.filter(esObjeto)
    : Array.isArray(d.archivos) ? d.archivos.filter(esObjeto) : [];

  return {
    ok: true,
    migrado,
    proyecto: {
      nombre: typeof d.nombre === 'string' ? d.nombre : 'Proyecto PMT',
      creado: typeof d.creado === 'string' ? d.creado : null,
      esquema: d.esquema,
      versionReglas: esObjeto(d.motor) && typeof d.motor.versionReglas === 'string' ? d.motor.versionReglas : null,
      config: cfg.config,
      fuentes,
      filtros: esObjeto(d.filtros) ? d.filtros : null,
      trazados,
      instantanea: esObjeto(d.instantanea) ? d.instantanea : null,
    },
    avisos,
  };
}

/**
 * Compara lo que el motor acaba de calcular con la instantánea guardada.
 * No corrige nada: solo permite decirle al usuario que algo no cuadra.
 */
export function cotejarInstantanea(instantanea, recalculado) {
  if (!instantanea) return { comparable: false, coincide: null, diferencias: [] };
  const pares = [
    ['relaciones', 'relaciones'],
    ['conTraslape', 'conTraslape'],
    ['contactos', 'contactos'],
    ['noEvaluablesEspacialmente', 'noEvaluablesEspacialmente'],
    ['trazados', 'trazados'],
  ];
  const diferencias = [];
  for (const [k, j] of pares) {
    const guardado = instantanea[k], ahora = recalculado[j];
    if (!Number.isInteger(guardado) || !Number.isInteger(ahora)) continue;
    if (guardado !== ahora) diferencias.push({ campo: k, guardado, ahora });
  }
  return { comparable: true, coincide: diferencias.length === 0, diferencias };
}

/** Nombre de archivo sugerido, sin caracteres que molesten en Windows. */
export function nombreArchivo(nombre) {
  const limpio = String(nombre ?? 'Proyecto PMT').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Proyecto PMT';
  return `${limpio} ${new Date().toISOString().slice(0, 10)}${EXTENSION}`;
}
