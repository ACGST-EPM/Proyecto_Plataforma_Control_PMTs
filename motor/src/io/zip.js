/**
 * Lector de archivos ZIP (un KMZ es un ZIP con un .kml dentro).
 *
 * SIN DEPENDENCIAS. Se apoya en `DecompressionStream('deflate-raw')`, que es
 * parte de la plataforma web y esta disponible tanto en los navegadores
 * actuales como en Node 18+. Eso evita arrastrar una libreria de compresion
 * (JSZip pesa ~95 KB) y mantiene abierta la opcion de entregar el producto
 * final como un unico archivo portable.
 *
 * ── ARCHIVOS NO CONFIABLES ─────────────────────────────────────────────────
 *
 * Los KMZ los envian contratistas externos, asi que el lector trata cada
 * archivo como potencialmente hostil o simplemente roto:
 *
 *  · INTEGRIDAD: se comprueba el CRC-32 de cada entrada que se extrae. Antes no
 *    se comprobaba, y un archivo con el contenido alterado se leia como bueno.
 *  · LIMITES: tamano del archivo, tamano de cada entrada ya descomprimida,
 *    total descomprimido y factor de expansion. Sin ellos, un ZIP de 60 KB
 *    puede convertirse en 60 MB en memoria (ratio medido: 1029 a 1) y dejar
 *    la pagina colgada.
 *  · SOLO LO NECESARIO: se descomprime unicamente la entrada que se va a usar.
 *    El directorio se lee entero, pero los datos no.
 *  · ERRORES CONTROLADOS: todo fallo sale como excepcion con texto entendible,
 *    y los flujos de descompresion se cierran sin dejar promesas sueltas.
 *
 * Los limites son generosos frente a los datos reales (el KMZ mas grande de
 * produccion ocupa 66 KB y se descomprime a ~250 KB) y se pueden ajustar.
 */

const FIRMA_EOCD = 0x06054b50;
const FIRMA_EOCD64_LOC = 0x07064b50;
const FIRMA_CEN = 0x02014b50;
const FIRMA_LOC = 0x04034b50;

/** Limites por defecto. Generosos frente a los datos reales, pero acotados. */
export const LIMITES_POR_DEFECTO = Object.freeze({
  /** Tamano maximo del propio archivo .kmz. 64 MB. */
  bytesArchivo: 64 * 1024 * 1024,
  /** Tamano maximo de UNA entrada ya descomprimida. 64 MB. */
  bytesEntradaDescomprimida: 64 * 1024 * 1024,
  /** Tamano maximo descomprimido acumulado en una lectura. 128 MB. */
  bytesTotalDescomprimido: 128 * 1024 * 1024,
  /** Factor maximo de expansion de una entrada. */
  factorExpansion: 400,
  /** Numero maximo de entradas en el archivo. */
  entradas: 10000,
});

export function hayDescompresor() {
  return typeof DecompressionStream === 'function';
}

/** Tabla CRC-32 (polinomio de ZIP), calculada una sola vez. */
let TABLA_CRC = null;
function crc32(bytes) {
  if (!TABLA_CRC) {
    TABLA_CRC = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Lee el DIRECTORIO del ZIP sin descomprimir nada.
 * @returns {{entradas:Array, u8:Uint8Array, dv:DataView}}
 */
function leerDirectorio(datos, limites) {
  const u8 = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (u8.byteLength < 22) throw new Error('el archivo es demasiado pequeno para ser un ZIP/KMZ');
  if (u8.byteLength > limites.bytesArchivo) {
    throw new Error(
      `el archivo pesa ${(u8.byteLength / 1048576).toFixed(1)} MB y el limite es ` +
      `${limites.bytesArchivo / 1048576} MB`
    );
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  let eocd = -1;
  const minimo = Math.max(0, u8.byteLength - 66000);
  for (let i = u8.byteLength - 22; i >= minimo; i--) {
    if (dv.getUint32(i, true) === FIRMA_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) {
    throw new Error('no es un ZIP valido: falta el directorio central (puede estar truncado o no ser un KMZ)');
  }

  let nEntradas = dv.getUint16(eocd + 10, true);
  let inicioCen = dv.getUint32(eocd + 16, true);

  if (nEntradas === 0xffff || inicioCen === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === FIRMA_EOCD64_LOC) {
      const desp = Number(dv.getBigUint64(loc + 8, true));
      nEntradas = Number(dv.getBigUint64(desp + 32, true));
      inicioCen = Number(dv.getBigUint64(desp + 48, true));
    } else {
      throw new Error('el ZIP declara formato ZIP64 pero no trae su localizador');
    }
  }
  if (nEntradas > limites.entradas) {
    throw new Error(`el ZIP declara ${nEntradas} entradas y el limite es ${limites.entradas}`);
  }

  const entradas = [];
  let p = inicioCen;
  for (let k = 0; k < nEntradas; k++) {
    if (p + 46 > u8.byteLength || dv.getUint32(p, true) !== FIRMA_CEN) {
      throw new Error(`directorio central danado en la entrada ${k + 1} de ${nEntradas}`);
    }
    const flags = dv.getUint16(p + 8, true);
    const metodo = dv.getUint16(p + 10, true);
    const crcEsperado = dv.getUint32(p + 16, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const tamOriginal = dv.getUint32(p + 24, true);
    const lNombre = dv.getUint16(p + 28, true);
    const lExtra = dv.getUint16(p + 30, true);
    const lComent = dv.getUint16(p + 32, true);
    const despLocal = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + lNombre));
    if (p + 46 + lNombre + lExtra + lComent > eocd) throw new Error('directorio central truncado');
    entradas.push({ nombre, flags, metodo, crcEsperado, tamComprimido, tamOriginal, despLocal, inicioCen });
    p += 46 + lNombre + lExtra + lComent;
  }
  return { entradas, u8, dv };
}

/** Extrae UNA entrada, comprobando limites e integridad. */
async function extraerEntrada(e, u8, dv, limites, estado) {
  if (e.tamOriginal > limites.bytesEntradaDescomprimida) {
    throw new Error(
      `"${e.nombre}" declara ${(e.tamOriginal / 1048576).toFixed(1)} MB descomprimidos y el limite ` +
      `es ${limites.bytesEntradaDescomprimida / 1048576} MB`
    );
  }
  if (e.tamComprimido > 0 && e.tamOriginal / e.tamComprimido > limites.factorExpansion) {
    throw new Error(
      `"${e.nombre}" se expande ${Math.round(e.tamOriginal / e.tamComprimido)} veces y el limite ` +
      `es ${limites.factorExpansion}: el archivo parece una bomba de descompresion`
    );
  }
  if (estado.total + e.tamOriginal > limites.bytesTotalDescomprimido) {
    throw new Error(
      `el contenido descomprimido supera el limite de ${limites.bytesTotalDescomprimido / 1048576} MB`
    );
  }

  const d = e.despLocal;
  if (d + 30 > u8.byteLength || dv.getUint32(d, true) !== FIRMA_LOC) {
    throw new Error(`cabecera local danada para "${e.nombre}"`);
  }
  const lNombre = dv.getUint16(d + 26, true);
  const lExtra = dv.getUint16(d + 28, true);
  const ini = d + 30 + lNombre + lExtra;
  if (ini + e.tamComprimido > e.inicioCen || ini + e.tamComprimido > u8.byteLength) {
    throw new Error(`"${e.nombre}" esta truncado: el archivo termina antes de sus datos`);
  }
  const flagsLocal = dv.getUint16(d + 6, true);
  if ((e.flags & 1) || (e.flags & 64)) throw new Error('ZIP cifrado no soportado');
  if (flagsLocal !== e.flags || dv.getUint16(d + 8, true) !== e.metodo ||
      new TextDecoder('utf-8').decode(u8.subarray(d + 30, d + 30 + lNombre)) !== e.nombre) {
    throw new Error('cabeceras local y central incoherentes');
  }
  // Bit 3: los valores locales pueden ser cero; el directorio central sigue
  // siendo obligatorio y SIEMPRE se contrasta contra el contenido extraido.
  if (!(e.flags & 8) && (dv.getUint32(d + 14, true) !== e.crcEsperado ||
      dv.getUint32(d + 18, true) !== e.tamComprimido || dv.getUint32(d + 22, true) !== e.tamOriginal)) {
    throw new Error('CRC o tamanos incoherentes entre cabeceras ZIP local y central');
  }
  const crudo = u8.subarray(ini, ini + e.tamComprimido);
  const maximoReal = Math.min(limites.bytesEntradaDescomprimida,
    limites.bytesTotalDescomprimido - estado.total, e.tamComprimido * limites.factorExpansion);

  let bytes;
  if (e.metodo === 0) {
    if (crudo.length > maximoReal) throw new Error('contenido almacenado supera el limite real de tamano');
    bytes = crudo;
  } else if (e.metodo === 8) {
    if (!hayDescompresor()) {
      throw new Error('este navegador no puede descomprimir KMZ (falta DecompressionStream); actualicelo o use un .kml sin comprimir');
    }
    bytes = await inflar(crudo, maximoReal, e.nombre);
  } else {
    throw new Error(`"${e.nombre}" usa un metodo de compresion no soportado (${e.metodo})`);
  }

  // INTEGRIDAD. El CRC viene en la cabecera del propio ZIP; si el contenido se
  // manipulo sin recalcularlo, aqui se detecta.
  if (bytes.length !== e.tamOriginal) throw new Error('tamano descomprimido real no coincide con el declarado');
  const crcReal = crc32(bytes);
  if (crcReal !== e.crcEsperado) {
    throw new Error(
      `"${e.nombre}" no supera la comprobacion de integridad (CRC-32): el contenido no coincide ` +
      `con el que declara el archivo. Puede estar corrupto o haber sido alterado.`
    );
  }
  estado.total += bytes.length;
  return bytes;
}

async function inflar(crudo, maximoBytes, nombre) {
  const ds = new DecompressionStream('deflate-raw');
  const escritor = ds.writable.getWriter();
  const lector = ds.readable.getReader();
  // Se encadena el rechazo de la escritura para que nunca quede una promesa
  // sin gestionar si el flujo se aborta.
  const escritura = escritor.write(crudo).then(() => escritor.close()).catch(() => {});
  const trozos = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximoBytes) {
        await lector.cancel().catch(() => {});
        throw new Error(
          `"${nombre}" supera el limite de tamano descomprimido mientras se lee: ` +
          `el archivo parece una bomba de descompresion`
        );
      }
      trozos.push(value);
    }
  } finally {
    await escritura;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) { out.set(t, o); o += t.byteLength; }
  return out;
}

/**
 * Lee TODAS las entradas de un ZIP. Se usa en pruebas y herramientas; el camino
 * normal del motor es `extraerKml`, que solo descomprime lo que necesita.
 */
export async function leerZip(datos, opciones = {}) {
  const limites = { ...LIMITES_POR_DEFECTO, ...(opciones.limites ?? {}) };
  const { entradas, u8, dv } = leerDirectorio(datos, limites);
  const estado = { total: 0 };
  const salida = [];
  for (const e of entradas) {
    if (e.nombre.endsWith('/')) continue;
    salida.push({ nombre: e.nombre, bytes: await extraerEntrada(e, u8, dv, limites, estado) });
  }
  if (!salida.length) throw new Error('el ZIP/KMZ no contiene ningun archivo');
  return salida;
}

/** Lista el contenido de un ZIP sin descomprimir nada. */
export async function listarZip(datos, opciones = {}) {
  const limites = { ...LIMITES_POR_DEFECTO, ...(opciones.limites ?? {}) };
  return leerDirectorio(datos, limites).entradas.map((e) => ({
    nombre: e.nombre, tamComprimido: e.tamComprimido, tamOriginal: e.tamOriginal, metodo: e.metodo,
  }));
}

/**
 * Decodifica bytes a texto detectando la codificacion por su marca de orden.
 * KML admite UTF-8 y UTF-16; Google Earth exporta a veces en UTF-16.
 */
export function decodificarTexto(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return { texto: new TextDecoder('utf-16le').decode(b.subarray(2)), codificacion: 'UTF-16LE' };
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return { texto: new TextDecoder('utf-16be').decode(b.subarray(2)), codificacion: 'UTF-16BE' };
  }
  let texto = new TextDecoder('utf-8').decode(b);
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  return { texto, codificacion: 'UTF-8' };
}

/**
 * Extrae el KML principal de un KMZ, descomprimiendo SOLO esa entrada.
 *
 * Regla: se prefiere `doc.kml` en la raiz (convencion de Google Earth); si no
 * existe, el primer .kml del archivo. Si hay varios, se avisa.
 *
 * @returns {{texto:string, nombre:string, codificacion:string, avisos:string[], otrosKml:string[]}}
 */
export async function extraerKml(datos, opciones = {}) {
  const limites = { ...LIMITES_POR_DEFECTO, ...(opciones.limites ?? {}) };
  const { entradas, u8, dv } = leerDirectorio(datos, limites);
  const kmls = entradas.filter((a) => a.nombre.toLowerCase().endsWith('.kml') && !a.nombre.endsWith('/'));
  if (!kmls.length) {
    const lista = entradas.map((a) => a.nombre).join(', ').slice(0, 120);
    throw new Error(`el KMZ no contiene ningun .kml (trae: ${lista})`);
  }
  const avisos = [];
  const elegido = kmls.find((a) => a.nombre.toLowerCase() === 'doc.kml') ?? kmls[0];
  const otrosKml = kmls.filter((a) => a !== elegido).map((a) => a.nombre);
  if (otrosKml.length) {
    avisos.push(
      `el KMZ trae ${kmls.length} archivos .kml; se procesa "${elegido.nombre}" y NO se procesan ` +
      `los demas (${otrosKml.join(', ')}). Si el documento principal los referencia, su contenido ` +
      `no entra en el analisis.`
    );
  }
  const estado = { total: 0 };
  const bytes = await extraerEntrada(elegido, u8, dv, limites, estado);
  const { texto, codificacion } = decodificarTexto(bytes);
  if (codificacion !== 'UTF-8') avisos.push(`el KML venia en ${codificacion}; se convirtio a texto`);
  return { texto, nombre: elegido.nombre, codificacion, avisos, otrosKml };
}
