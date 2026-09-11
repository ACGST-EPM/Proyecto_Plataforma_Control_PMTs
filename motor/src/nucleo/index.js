/**
 * API publica del motor. Es lo unico que necesitan conocer el verificador, las
 * herramientas de linea de comandos y, mas adelante, el tablero.
 *
 * El motor es PURO: no toca el DOM, no lee rutas del disco por su cuenta y no
 * imprime nada. Recibe bytes de archivo, devuelve datos. Eso es lo que permite
 * probarlo entero en Node y ejecutarlo igual dentro del navegador.
 */

import { extraerKml, decodificarTexto } from '../io/zip.js';
import { analizarLegado } from '../legado/replica.js';
import { leerKml } from '../io/kml.js';
import { aRegistro, resumenCalidad } from '../modelo/registro.js';
import { desambiguar } from '../modelo/identidad.js';
import { calcularRelaciones } from './relaciones.js';
import { resolverConfig } from './config.js';

export { CONFIG_POR_DEFECTO, PERFIL_LEGADO, resolverConfig, alcanceMetros } from './config.js';
export { calcularRelaciones, hechosDelPar } from './relaciones.js';
export { combinacionDe, repartir, porBandaDeDistancia, COMBINACIONES } from './provisional.js';
export { resumenCalidad } from '../modelo/registro.js';
export { medir, descomponer } from '../geo/geometria.js';
export { distanciaGeodesica } from '../geo/geodesica.js';
export { cotejarFidelidad, resumirCotejo } from '../legado/cotejo.js';

const esKmz = (n) => /\.kmz$/i.test(n ?? '');
const esKml = (n) => /\.kml$/i.test(n ?? '');

/**
 * Lee un archivo KMZ o KML y devuelve sus registros.
 * NUNCA lanza: un archivo invalido produce un informe con `ok:false` y el
 * proceso continua con los demas. Es el requisito 9 de la Etapa 1.
 *
 * @param {{nombre:string, datos:ArrayBuffer|Uint8Array|string}} archivo
 * @param {object} [config]
 * @returns {Promise<{nombre:string, ok:boolean, registros:Array, errores:string[], avisos:string[]}>}
 */
export async function leerArchivo(archivo, config = {}) {
  const nombre = archivo?.nombre ?? '(sin nombre)';
  const informe = { nombre, ok: false, estadoLectura: 'fallida', coberturaCompleta: false,
    motivosCobertura: [], registros: [], errores: [], avisos: [], placemarks: 0 };
  try {
    if (!archivo || archivo.datos == null) {
      informe.errores.push('no se recibio contenido para este archivo');
      return informe;
    }
    let textoKml;
    if (typeof archivo.datos === 'string' && (esKml(nombre) || !esKmz(nombre))) {
      textoKml = archivo.datos;
    } else if (esKmz(nombre)) {
      const r = await extraerKml(archivo.datos);
      textoKml = r.texto;
      informe.avisos.push(...r.avisos);
      if (r.otrosKml.length) informe.motivosCobertura.push(...r.avisos);
    } else if (esKml(nombre)) {
      const d = decodificarTexto(archivo.datos);
      textoKml = d.texto;
      if (d.codificacion !== 'UTF-8') informe.avisos.push(`el KML venia en ${d.codificacion}; se convirtio a texto`);
    } else {
      informe.errores.push(`extension no reconocida: se esperaba .kmz o .kml`);
      return informe;
    }

    const { placemarks, errores, avisosDocumento, motivosCobertura } = leerKml(textoKml, nombre);
    informe.errores.push(...errores);
    informe.avisos.push(...avisosDocumento);
    informe.motivosCobertura.push(...motivosCobertura);
    informe.placemarks = placemarks.length;

    const opciones = resolverConfig(config);
    informe.registros = placemarks.map((p) => aRegistro(p, opciones));
    informe.estadoLectura = informe.errores.length ? 'fallida' : informe.motivosCobertura.length ? 'parcial' : 'completa';
    informe.coberturaCompleta = informe.estadoLectura === 'completa';
    informe.ok = informe.coberturaCompleta;
    return informe;
  } catch (e) {
    informe.errores.push(e?.message ? String(e.message) : String(e));
    return informe;
  }
}

/**
 * Lee varios archivos y ejecuta el analisis completo.
 *
 * @param {Array<{nombre:string, datos:any}>} archivos
 * @param {object} [config]
 */
export async function analizar(archivos, config = {}) {
  const cfg = resolverConfig(config);
  const t0 = Date.now();
  const informes = [];
  let registros = [];
  for (const a of archivos) {
    const inf = await leerArchivo(a, cfg);
    informes.push(inf);
    registros = registros.concat(inf.registros);
  }
  const msLectura = Date.now() - t0;

  const desamb = desambiguar(registros);
  const { relaciones, paresNoEvaluablesEspacialmente, estadisticas } = calcularRelaciones(registros, cfg);

  return {
    config: cfg,
    archivos: informes,
    registros,
    relaciones,
    paresNoEvaluablesEspacialmente,
    coberturaCompleta: informes.length > 0 && informes.every((a) => a.coberturaCompleta),
    calidad: {
      ...resumenCalidad(registros),
      archivosCompletos: informes.filter((a) => a.estadoLectura === 'completa').length,
      archivosParciales: informes.filter((a) => a.estadoLectura === 'parcial').length,
      archivosFallidos: informes.filter((a) => a.estadoLectura === 'fallida').length,
      paresNoEvaluablesEspacialmente: paresNoEvaluablesEspacialmente.length,
      duplicadosDesambiguados: desamb.duplicadosExactos,
      idsRepetidosEnOrigen: desamb.idsRepetidos,
      idsUnicos: new Set(registros.map((r) => r.id)).size === registros.length,
    },
    estadisticas: { ...estadisticas, msLectura, msTotalProceso: Date.now() - t0 },
  };
}

/**
 * Ejecuta la REPLICA del motor legado sobre los mismos archivos.
 *
 * Sirve como prueba de fidelidad dentro del propio verificador: si la replica
 * produce los mismos totales que el motor nuevo configurado con PERFIL_LEGADO,
 * entonces la comparacion registro a registro que hace el verificador se puede
 * creer. Si no coincidieran, habria que revisar antes de sacar conclusiones.
 *
 * @param {Array<{nombre:string, datos:any}>} archivos
 */
export async function ejecutarLegado(archivos) {
  let placemarks = [];
  const errores = [];
  const motivosCobertura = [];
  for (const a of archivos) {
    try {
      let texto;
      if (/\.kmz$/i.test(a.nombre)) {
        const z = await extraerKml(a.datos);
        texto = z.texto;
        if (z.otrosKml.length) motivosCobertura.push(...z.avisos.map((m) => `${a.nombre}: ${m}`));
      }
      else if (typeof a.datos === 'string') texto = a.datos;
      else texto = decodificarTexto(a.datos).texto;
      const r = leerKml(texto, a.nombre);
      errores.push(...r.errores.map((e) => `${a.nombre}: ${e}`));
      motivosCobertura.push(...r.motivosCobertura.map((m) => `${a.nombre}: ${m}`));
      placemarks = placemarks.concat(r.placemarks);
    } catch (e) {
      errores.push(`${a.nombre}: ${e?.message ?? e}`);
    }
  }
  const { filas, resumen, noContrastables } = analizarLegado(placemarks);
  return { filas, resumen, errores, noContrastables, placemarks: placemarks.length,
    motivosCobertura, coberturaCompleta: archivos.length > 0 && !errores.length && !motivosCobertura.length };
}

/** Exporta los registros como FeatureCollection GeoJSON estandar. */
export function aGeoJson(registros) {
  return {
    type: 'FeatureCollection',
    features: registros.filter((r) => r.geometria).map((r) => ({
      type: 'Feature',
      id: r.id,
      geometry: r.geometria,
      properties: {
        id: r.id, frente: r.frente, contrato: r.contrato, contratista: r.contratista,
        proyecto: r.proyecto, municipio: r.municipio, direccion: r.direccion,
        tipo_cierre: r.tipoCierre, inicio: r.vigencia.inicio, fin: r.vigencia.fin,
        origen_archivo: r.origenArchivo, avisos: r.avisos.length,
      },
    })),
  };
}
