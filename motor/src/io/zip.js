/**
 * Lector de archivos ZIP (un KMZ es un ZIP con un .kml dentro).
 *
 * SIN DEPENDENCIAS. Se apoya en `DecompressionStream('deflate-raw')`, que es
 * parte de la plataforma web y esta disponible tanto en los navegadores
 * actuales como en Node 18+. Eso evita arrastrar una libreria de compresion
 * (JSZip pesa ~95 KB) y mantiene abierta la opcion de entregar el producto
 * final como un unico archivo portable.
 *
 * Si el entorno no ofreciera DecompressionStream, `leerZip` lo dice con un
 * mensaje claro en lugar de fallar de forma oscura.
 *
 * Todo error de formato se convierte en una excepcion con texto entendible:
 * quien llama decide si eso tumba un archivo o el proceso entero. En este
 * motor, un KMZ roto nunca detiene a los demas.
 */

const FIRMA_EOCD = 0x06054b50;
const FIRMA_EOCD64_LOC = 0x07064b50;
const FIRMA_CEN = 0x02014b50;
const FIRMA_LOC = 0x04034b50;

export function hayDescompresor() {
  return typeof DecompressionStream === 'function';
}

/**
 * @param {ArrayBuffer|Uint8Array} datos contenido del .kmz
 * @returns {Promise<Array<{nombre:string, bytes:Uint8Array}>>}
 */
export async function leerZip(datos) {
  const u8 = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (u8.byteLength < 22) throw new Error('el archivo es demasiado pequeno para ser un ZIP/KMZ');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // El directorio central se localiza desde el final del archivo.
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

  // ZIP64: cuando hay mas de 65535 entradas o el archivo supera 4 GB.
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

  const entradas = [];
  let p = inicioCen;
  for (let k = 0; k < nEntradas; k++) {
    if (p + 46 > u8.byteLength || dv.getUint32(p, true) !== FIRMA_CEN) {
      throw new Error(`directorio central danado en la entrada ${k + 1} de ${nEntradas}`);
    }
    const metodo = dv.getUint16(p + 10, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const tamOriginal = dv.getUint32(p + 24, true);
    const lNombre = dv.getUint16(p + 28, true);
    const lExtra = dv.getUint16(p + 30, true);
    const lComent = dv.getUint16(p + 32, true);
    const despLocal = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + lNombre));
    entradas.push({ nombre, metodo, tamComprimido, tamOriginal, despLocal });
    p += 46 + lNombre + lExtra + lComent;
  }

  const salida = [];
  for (const e of entradas) {
    if (e.nombre.endsWith('/')) continue; // carpeta
    const d = e.despLocal;
    if (d + 30 > u8.byteLength || dv.getUint32(d, true) !== FIRMA_LOC) {
      throw new Error(`cabecera local danada para "${e.nombre}"`);
    }
    const lNombre = dv.getUint16(d + 26, true);
    const lExtra = dv.getUint16(d + 28, true);
    const ini = d + 30 + lNombre + lExtra;
    const crudo = u8.subarray(ini, ini + e.tamComprimido);
    let bytes;
    if (e.metodo === 0) {
      bytes = crudo;
    } else if (e.metodo === 8) {
      if (!hayDescompresor()) {
        throw new Error('este navegador no puede descomprimir KMZ (falta DecompressionStream); actualicelo o use un .kml sin comprimir');
      }
      bytes = await inflar(crudo);
    } else {
      throw new Error(`"${e.nombre}" usa un metodo de compresion no soportado (${e.metodo})`);
    }
    salida.push({ nombre: e.nombre, bytes });
  }
  if (!salida.length) throw new Error('el ZIP/KMZ no contiene ningun archivo');
  return salida;
}

async function inflar(crudo) {
  const ds = new DecompressionStream('deflate-raw');
  const escritor = ds.writable.getWriter();
  escritor.write(crudo);
  escritor.close();
  const trozos = [];
  let total = 0;
  const lector = ds.readable.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value); total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) { out.set(t, o); o += t.byteLength; }
  return out;
}

/**
 * Extrae el KML principal de un KMZ.
 * Regla: se prefiere `doc.kml` en la raiz (convencion de Google Earth); si no
 * existe, el primer .kml del archivo. Si hay varios, se avisa.
 * @returns {{texto:string, nombre:string, avisos:string[]}}
 */
export async function extraerKml(datos) {
  const archivos = await leerZip(datos);
  const kmls = archivos.filter((a) => a.nombre.toLowerCase().endsWith('.kml'));
  if (!kmls.length) {
    throw new Error(`el KMZ no contiene ningun .kml (trae: ${archivos.map((a) => a.nombre).join(', ').slice(0, 120)})`);
  }
  const avisos = [];
  let elegido = kmls.find((a) => a.nombre.toLowerCase() === 'doc.kml') ?? kmls[0];
  if (kmls.length > 1) {
    avisos.push(`el KMZ trae ${kmls.length} archivos .kml; se usa "${elegido.nombre}" y se ignoran los demas`);
  }
  let texto = new TextDecoder('utf-8').decode(elegido.bytes);
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1); // marca de orden de bytes
  return { texto, nombre: elegido.nombre, avisos };
}
