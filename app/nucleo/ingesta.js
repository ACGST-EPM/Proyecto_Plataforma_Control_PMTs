/**
 * INGESTA — de archivos sueltos a analisis completo.
 *
 * Usa el motor aprobado en la Etapa 1 tal cual: no reimplementa ni una linea de
 * lectura de KML, de ZIP ni de calculo. Lo unico que anade es la orquestacion
 * y la traduccion de diagnosticos a un lenguaje que entienda una persona que no
 * es tecnica.
 *
 * NUNCA convierte un error en "0 resultados". Un archivo que falla se cuenta,
 * se nombra y se explica.
 */
import { analizar } from '../../motor/src/nucleo/index.js';
import { aFilaPmt, LECTURA } from './modelo.js';
import { estadoArchivo } from './resumen.js';

export const EXTENSIONES = ['.kml', '.kmz'];

export function extensionAceptada(nombre) {
  const n = (nombre ?? '').toLowerCase();
  return EXTENSIONES.some((e) => n.endsWith(e));
}

/**
 * Convierte los File del navegador a lo que espera el motor.
 * Un KML se pasa como texto; un KMZ como bytes.
 */
export async function prepararArchivos(files) {
  const salida = [];
  for (const f of files) {
    const nombre = f.name ?? String(f);
    if (!extensionAceptada(nombre)) {
      salida.push({ nombre, datos: null, rechazado: 'no es un archivo .kml ni .kmz' });
      continue;
    }
    try {
      const buf = await f.arrayBuffer();
      salida.push({ nombre, datos: new Uint8Array(buf) });
    } catch (e) {
      salida.push({ nombre, datos: null, rechazado: `no se pudo leer del disco: ${e?.message ?? e}` });
    }
  }
  return salida;
}

/**
 * Ejecuta el analisis. Devuelve SIEMPRE un objeto utilizable, incluso si todo
 * fallo: en ese caso viene con la lista de motivos, no vacio y en silencio.
 */
export async function procesar(archivos, config = {}) {
  const validos = archivos.filter((a) => a.datos !== null);
  const rechazados = archivos.filter((a) => a.datos === null)
    .map((a) => ({ nombre: a.nombre, ok: false, errores: [a.rechazado], placemarks: 0 }));

  if (!validos.length) {
    return {
      analisis: null, filas: [], relaciones: [], porId: new Map(),
      archivos: rechazados,
      error: 'Ninguno de los archivos seleccionados se pudo usar.',
    };
  }

  const analisis = await analizar(validos, config);
  const filas = analisis.registros.map(aFilaPmt);
  const porId = new Map(filas.map((x) => [x.id, x]));
  const leidos = [...(analisis.archivos ?? []), ...rechazados];

  return { analisis, filas, relaciones: analisis.relaciones ?? [], porId, archivos: leidos, error: null };
}

/**
 * Traduce los diagnosticos tecnicos a frases que se entiendan sin saber de
 * programacion. El texto original NUNCA se pierde: viaja en `tecnico` para el
 * panel de detalle.
 */
const TRADUCCIONES = [
  [/no supera la comprobacion de integridad/i, 'El archivo esta danado o fue modificado despues de crearse.'],
  [/NetworkLink/i, 'El archivo enlaza a otros documentos que no se pueden seguir: parte de su contenido NO se analizo.'],
  [/no contiene ningun \.kml/i, 'El KMZ no lleva dentro ningun mapa que se pueda leer.'],
  [/no contiene ningun <Placemark>/i, 'El archivo no contiene ningun trazado.'],
  [/el archivo pesa|demasiado grande|limite es/i, 'El archivo supera el tamano maximo admitido.'],
  [/coordenada con un numero ilegible|coordenada mal formada/i, 'Hay coordenadas mal escritas: ese trazado se dejo fuera del calculo.'],
  [/fuera del rango terrestre/i, 'Hay coordenadas imposibles (fuera del planeta).'],
  [/geometria completa descartada/i, 'El trazado tenia una parte invalida y se excluyo entero, para no dibujar algo que nadie trazo.'],
  [/falta el campo obligatorio "(\w+)"/i, 'Falta un dato obligatorio en la descripcion del trazado.'],
  [/fecha inexistente en el calendario/i, 'Hay una fecha que no existe en el calendario.'],
  [/hora invalida|hora no valida|zona horaria/i, 'Hay una hora mal escrita: la vigencia de ese trazado no se pudo interpretar.'],
  [/no se pudo leer el KML|no se pudo leer/i, 'El archivo no se pudo abrir.'],
  [/no evaluable espacialmente|fuera del dominio/i, 'Dos trazados estan demasiado separados para medir su distancia con precision.'],
  [/registro identico a otro/i, 'Hay trazados repetidos identicos dentro del mismo archivo.'],
  [/identificador .* viene repetido/i, 'El archivo reutiliza un mismo identificador para trazados distintos.'],
  [/no es un archivo/i, 'Ese archivo no es un KML ni un KMZ.'],
];

export function explicar(tecnico) {
  const t = String(tecnico ?? '');
  for (const [re, frase] of TRADUCCIONES) if (re.test(t)) return { simple: frase, tecnico: t };
  return { simple: t, tecnico: t };
}

/** Resumen por archivo, listo para pintar: estado, cuantos trazados y por que. */
export function diagnosticoArchivos(archivos) {
  return (archivos ?? []).map((a) => {
    const estado = estadoArchivo(a);
    const motivos = [...(a.errores ?? []), ...(a.motivosCobertura ?? []), ...(a.avisos ?? [])];
    return {
      nombre: a.nombre,
      estado,
      etiqueta: { [LECTURA.COMPLETA]: 'Completo', [LECTURA.PARCIAL]: 'Parcial', [LECTURA.FALLIDA]: 'No se pudo leer' }[estado],
      trazados: a.placemarks ?? 0,
      motivos: motivos.map(explicar),
    };
  });
}
