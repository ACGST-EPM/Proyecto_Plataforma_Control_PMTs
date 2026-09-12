/**
 * HUELLAS DE CONTENIDO — para saber si algo cambió, no para demostrar quién lo cambió.
 *
 * ══ LA DISTINCIÓN QUE HAY QUE TENER CLARA ═════════════════════════════════
 *
 * Una huella de contenido sirve para responder «¿esto es lo mismo que tenía
 * ayer?». No sirve para responder «¿alguien lo manipuló a propósito?»: quien
 * edita un archivo puede recalcular la huella. En este proyecto eso ya está
 * dicho del `.pmt.json` y se repite aquí porque es fácil de olvidar.
 *
 * ══ DOS IMPLEMENTACIONES, Y POR QUÉ ═══════════════════════════════════════
 *
 * SHA-256 mediante `crypto.subtle`, que está en el navegador y en Node sin
 * instalar nada. Es el estándar, no colisiona en la práctica y no añade
 * dependencias al producto, que tiene que seguir siendo un archivo portable.
 *
 * Si `crypto.subtle` no está disponible —un navegador antiguo, un contexto que
 * el navegador no considera de confianza—, se usa un respaldo propio de 128
 * bits. NO es criptográfico y se declara como tal en el resultado, para que
 * nada lo presente como algo que no es.
 *
 * @module
 */

/** Algoritmo que se pudo usar realmente. Viaja con la huella, siempre. */
export const ALGORITMO = Object.freeze({
  SHA256: 'sha-256',
  RESPALDO: 'respaldo-128-no-criptografico',
});

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Respaldo de 128 bits: cuatro acumuladores FNV-1a con semillas distintas.
 *
 * Un solo acumulador de 32 bits colisiona a las pocas decenas de miles de
 * entradas (paradoja del cumpleaños); con cuatro y semillas distintas el
 * espacio es de 128 bits, más que suficiente para distinguir versiones de unos
 * cuantos miles de archivos. Sigue sin ser criptográfico: se puede construir
 * una colisión a propósito, y por eso se etiqueta.
 */
function respaldo128(bytes) {
  const semillas = [0x811c9dc5, 0x01000193, 0x85ebca6b, 0xc2b2ae35];
  const h = [...semillas];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h[0] = Math.imul(h[0] ^ b, 0x01000193) >>> 0;
    h[1] = Math.imul(h[1] + b + i, 0x85ebca6b) >>> 0;
    h[2] = Math.imul(h[2] ^ (b + (i & 0xff)), 0xc2b2ae35) >>> 0;
    h[3] = (Math.imul(h[3] ^ b, 0x27220a95) + (i * 2654435761 >>> 0)) >>> 0;
  }
  // La longitud entra en la huella: sin ella, dos contenidos que solo difieren
  // en ceros al final podrían coincidir.
  h[3] = Math.imul(h[3] ^ bytes.length, 0x01000193) >>> 0;
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

const aBytes = (datos) =>
  datos instanceof Uint8Array ? datos
  : datos instanceof ArrayBuffer ? new Uint8Array(datos)
  : new TextEncoder().encode(String(datos));

/**
 * Huella del contenido.
 *
 * @param {Uint8Array|ArrayBuffer|string} datos
 * @returns {Promise<{valor:string, algoritmo:string, bytes:number, criptografica:boolean}>}
 */
export async function huellaDe(datos) {
  const bytes = aBytes(datos);
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    try {
      // `slice()` fuerza un ArrayBuffer propio: algunas vistas comparten buffer
      // con otras y `digest` mediría de más.
      const d = await subtle.digest('SHA-256', bytes.slice().buffer);
      return { valor: hex(d), algoritmo: ALGORITMO.SHA256, bytes: bytes.length, criptografica: true };
    } catch { /* sin subtle utilizable: se usa el respaldo, declarándolo */ }
  }
  return { valor: respaldo128(bytes), algoritmo: ALGORITMO.RESPALDO, bytes: bytes.length, criptografica: false };
}

/**
 * ¿Son la misma cosa?
 *
 * Dos huellas calculadas con algoritmos distintos NO se pueden comparar: decir
 * «son distintas» sería tan falso como decir «son iguales». Se devuelve
 * `null`, que significa «no se puede saber», y quien llame decide qué hacer.
 *
 * @returns {boolean|null}
 */
export function mismaHuella(a, b) {
  if (!a || !b) return null;
  if (a.algoritmo !== b.algoritmo) return null;
  return a.valor === b.valor && a.bytes === b.bytes;
}

/** Forma corta para enseñar en pantalla, sin prometer más de lo que es. */
export const huellaCorta = (h) => (h ? `${h.valor.slice(0, 12)}…` : '—');
