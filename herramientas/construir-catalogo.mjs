/**
 * Regenera `app/nucleo/catalogo-embebido.js` a partir de `contratos_db.json`.
 *
 * El maestro es el JSON, que es lo que EPM mantiene. Esto solo lo copia dentro
 * del codigo para que la aplicacion funcione sin internet y sin depender de que
 * el archivo este al lado.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(RAIZ, 'contratos_db.json');
const destino = join(RAIZ, 'app', 'nucleo', 'catalogo-embebido.js');

const crudo = await readFile(origen, 'utf8');
let datos;
try { datos = JSON.parse(crudo); }
catch (e) { console.error(`contratos_db.json no es un JSON valido: ${e.message}`); process.exit(1); }
if (!Array.isArray(datos) && !Array.isArray(datos?.contratos)) {
  console.error('contratos_db.json no contiene una lista de contratos.');
  process.exit(1);
}
const lista = Array.isArray(datos) ? datos : datos.contratos;

await writeFile(destino, `/**
 * CATALOGO MAESTRO EMBEBIDO.
 *
 * ══ POR QUE VA DENTRO DEL CODIGO ══════════════════════════════════════════
 *
 * La aplicacion tiene que funcionar con doble clic y sin internet. Si el
 * catalogo se leyera de un archivo suelto, crear un PMT dejaria de funcionar en
 * cuanto alguien moviera la carpeta.
 *
 * ══ COMO SE ACTUALIZA ═════════════════════════════════════════════════════
 *
 * Este archivo es una COPIA de \`contratos_db.json\`, que es el maestro que
 * gobierna EPM. Se regenera con \`npm run construir:catalogo\`. La aplicacion
 * ademas deja cargar un catalogo mas nuevo desde la interfaz, sin reconstruir
 * nada, para que una alta de contrato no dependa de un despliegue.
 *
 * NO CONTIENE NADA SENSIBLE: contrato, contratista, proyecto y municipios son
 * los mismos datos que ya viajan dentro de cada KMZ.
 *
 * NO EDITAR A MANO: se regenera. Edite \`contratos_db.json\`.
 * Generado el ${new Date().toISOString().slice(0, 10)} · ${lista.length} contrato(s).
 */
export const CATALOGO_EMBEBIDO = ${JSON.stringify(datos, null, 1)};
`, 'utf8');

console.log(`Catalogo embebido regenerado: ${lista.length} contrato(s).`);
