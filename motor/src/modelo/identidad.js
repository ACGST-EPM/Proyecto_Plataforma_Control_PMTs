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
  if (idExplicito) return { id: String(idExplicito), origen: 'explicito en el KMZ' };
  const partes = [
    campos.contrato ?? '', campos.frente ?? '', campos.tipoCierre ?? '',
    campos.direccion ?? '', campos.inicio ?? '', campos.fin ?? '',  // fechas crudas
    canonizarGeometria(geom),
  ];
  return { id: 'pmt_' + hash64(partes.join(SEP)), origen: 'derivado del contenido' };
}

/**
 * Anade sufijos a los identificadores repetidos de una lista de registros.
 * Modifica los registros en el sitio y devuelve cuantos duplicados encontro.
 */
export function desambiguar(registros) {
  const vistos = new Map();
  let duplicados = 0;
  for (const r of registros) {
    const n = (vistos.get(r.id) ?? 0) + 1;
    vistos.set(r.id, n);
    if (n > 1) {
      duplicados++;
      r.avisos.push(`registro identico a otro del mismo origen (copia ${n}); se le anadio el sufijo ~${n}`);
      r.id = `${r.id}~${n}`;
      r.duplicadoExacto = true;
    }
  }
  return duplicados;
}
