/**
 * IDENTIFICADOR ESTABLE DE REGISTRO.
 *
 * El motor legado usaba el NOMBRE DEL FRENTE como si fuera una llave. No lo es:
 * en los datos reales hay 148 registros que comparten nombre con otro (son
 * revigencias del mismo frente) y 26 pares de nombres donde uno es prefijo del
 * otro. Por eso el tablero encendia en el mapa frentes que nadie habia pedido.
 *
 * Aqui la identidad se deriva del CONTENIDO del registro:
 *
 *     id = "pmt_" + hash( contrato, frente, tipo_cierre, direccion,
 *                         fecha_inicio CRUDA, fecha_fin CRUDA,
 *                         geometria canonica )
 *
 * Se usan los textos TAL COMO VIENEN en el KMZ, no la vigencia ya normalizada.
 * Asi el identificador describe el dato de entrada y no la interpretacion que
 * hace una configuracion concreta del motor: cambiar un parametro (por ejemplo
 * comparar por dia en lugar de por instante) no altera ningun identificador, y
 * por eso el verificador puede emparejar dos ejecuciones registro a registro.
 *
 * Propiedades que se obtienen y por que bastan para sincronizar mapa, tabla,
 * filtros y alertas:
 *
 *  - DETERMINISTA: el mismo KMZ produce siempre el mismo id, en cualquier
 *    equipo y en cualquier ejecucion. No depende de la hora, del nombre del
 *    archivo, del orden de lectura ni de un contador global.
 *  - DISTINGUE REVIGENCIAS: el mismo frente con otras fechas es otro id, que es
 *    exactamente lo que queremos: son dos cierres distintos de la via.
 *  - DISTINGUE HOMONIMOS: dos frentes con el mismo nombre en contratos distintos
 *    o con geometria distinta obtienen ids distintos.
 *  - TOLERA DUPLICADOS EXACTOS: si un KMZ trae dos placemarks identicos en todo
 *    (ocurre en los datos reales), el segundo recibe el sufijo "~2". Asi no se
 *    pierde ninguno y siguen siendo distinguibles.
 *
 * LIMITE CONOCIDO, documentado a proposito: si alguien corrige la direccion o
 * mueve un vertice, el id cambia, porque para el motor eso es otro registro.
 * Para tener identidad estable a traves de ediciones haria falta que el
 * generador escribiera un identificador propio dentro del KMZ. El lector ya
 * respeta ese identificador si aparece en ExtendedData como `pmt:id`, asi que
 * la mejora es compatible hacia atras y se puede activar mas adelante.
 */

const OFFSET = 0xcbf29ce484222325n;
const PRIMO = 0x100000001b3n;
const M64 = 0xffffffffffffffffn;

/** Separador interno entre campos al armar el texto que se va a resumir. */
const SEP = String.fromCharCode(1);

/** FNV-1a de 64 bits. Sincronico, sin dependencias, igual en Node y navegador. */
export function hash64(texto) {
  let h = OFFSET;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h ^= BigInt(c & 0xff);
    h = (h * PRIMO) & M64;
    h ^= BigInt(c >> 8);
    h = (h * PRIMO) & M64;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * Texto canonico de una geometria: redondea a 7 decimales (~1 cm) para que un
 * re-exportado del mismo trazado no cambie el identificador por ruido de coma
 * flotante, y conserva el orden de los vertices.
 */
export function canonizarGeometria(geom) {
  if (!geom || !geom.type) return 'sin-geometria';
  const r = (n) => (Number.isFinite(n) ? n.toFixed(7) : 'x');
  const rec = (c) => (Array.isArray(c[0]) ? `(${c.map(rec).join(' ')})` : `${r(c[0])},${r(c[1])}`);
  if (geom.type === 'GeometryCollection') {
    return `GC[${(geom.geometries ?? []).map(canonizarGeometria).join(';')}]`;
  }
  return `${geom.type}[${geom.coordinates ? rec(geom.coordinates) : ''}]`;
}

/**
 * Calcula el identificador de un registro.
 * @param {object} campos {contrato, frente, tipoCierre, direccion, inicio, fin}
 * @param {object} geom geometria GeoJSON
 * @param {string} [idExplicito] identificador que venia dentro del KMZ, si lo habia
 */
export function calcularId(campos, geom, idExplicito) {
  const partes = [
    campos.contrato ?? '', campos.frente ?? '', campos.tipoCierre ?? '',
    campos.direccion ?? '', campos.inicio ?? '', campos.fin ?? '',  // fechas crudas
    canonizarGeometria(geom),
  ];
  // La huella del contenido se calcula SIEMPRE, tambien cuando el KMZ trae un
  // identificador propio: es lo que permite distinguir "dos copias del mismo
  // registro" de "dos registros distintos con el identificador repetido".
  const huellaContenido = 'c_' + hash64(partes.join(SEP));
  if (idExplicito) {
    return { id: String(idExplicito), origen: 'explicito en el KMZ', huellaContenido };
  }
  return { id: 'pmt_' + hash64(partes.join(SEP)), origen: 'derivado del contenido', huellaContenido };
}

/**
 * Garantiza que TODOS los registros acaben con un identificador distinto.
 *
 * Dos casos que hay que distinguir, y que antes se confundian:
 *
 *  a) DUPLICADO REAL: dos registros con exactamente el mismo contenido. Como el
 *     identificador se deriva del contenido, coinciden. Es el caso que aparece
 *     en los datos reales (tres placemarks identicos dentro de un mismo KMZ).
 *
 *  b) IDENTIFICADOR REPETIDO: dos registros DISTINTOS que traen el mismo
 *     `pmt:id` escrito dentro del KMZ. Aqui el contenido no es igual: lo que
 *     esta mal es el archivo, que reutiliza un identificador.
 *
 * Antes se marcaban los dos casos como "duplicado exacto" solo porque el id
 * coincidia. Y ademas el sufijo podia chocar: la entrada `x`, `x`, `x~2`
 * producia `x`, `x~2`, `x~2`, es decir, seguia habiendo repetidos. Ahora el
 * sufijo se busca hasta encontrar uno libre.
 *
 * Un sufijo libre, ademas, no puede robarle el identificador a otro registro.
 * Con la entrada `x`, `x`, `x~2` el segundo registro NO puede quedarse con
 * `x~2`, porque ese identificador es el que el tercero trae escrito de origen.
 * Si se lo quedara, el tercero tendria que renombrarse y se le acusaria de
 * traer "un identificador repetido en el KMZ" cuando el suyo era unico: el
 * choque lo habriamos provocado nosotros. Por eso los identificadores de
 * origen se reservan antes de repartir sufijos.
 *
 * @param {Array} registros con {id, huellaContenido, avisos}
 * @returns {{duplicadosExactos:number, idsRepetidos:number}}
 */
export function desambiguar(registros) {
  const usados = new Set();
  const porHuella = new Map();
  // Identificadores que vienen de origen: ningun sufijo sintetico puede ocuparlos.
  const deOrigen = new Set(registros.map((r) => r.id));
  let duplicadosExactos = 0;
  let idsRepetidos = 0;

  for (const r of registros) {
    const huella = r.huellaContenido ?? r.id;
    const original = r.id;

    if (!usados.has(original)) {
      usados.add(original);
      porHuella.set(huella, (porHuella.get(huella) ?? 0) + 1);
      continue;
    }

    // El identificador ya estaba cogido. ¿Mismo contenido u otro contenido?
    const mismoContenido = porHuella.has(huella);
    let n = (porHuella.get(huella) ?? 1) + 1;
    let candidato = `${original}~${n}`;
    while (usados.has(candidato) || deOrigen.has(candidato)) { n++; candidato = `${original}~${n}`; }

    if (mismoContenido) {
      duplicadosExactos++;
      r.duplicadoExacto = true;
      r.avisos.push(`registro identico a otro del mismo origen (copia ${n}); se le anadio el sufijo ~${n}`);
    } else {
      idsRepetidos++;
      r.idRepetidoEnOrigen = true;
      r.avisos.push(
        `el identificador "${original}" viene repetido en el KMZ para registros distintos; ` +
        `se le anadio el sufijo ~${n} para poder distinguirlos`
      );
    }
    r.id = candidato;
    usados.add(candidato);
    porHuella.set(huella, n);
  }

  return { duplicadosExactos, idsRepetidos };
}
