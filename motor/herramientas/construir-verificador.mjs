/**
 * Empaqueta el verificador en UN SOLO archivo .html que funciona con doble clic,
 * sin internet, sin servidor y sin instalar nada.
 *
 * Por que hace falta: los modulos de JavaScript no se pueden cargar desde
 * `file://`, el navegador los bloquea. Y el objetivo del proyecto es que una
 * persona no tecnica pueda abrir el archivo y ya.
 *
 * Como lo resuelve, sin empaquetadores externos: mete el texto de cada modulo
 * dentro del HTML y, al abrirse la pagina, los convierte en URLs de tipo blob
 * reescribiendo los `import` para que apunten a ellas. El navegador acaba
 * ejecutando modulos ES de verdad, con su mismo aislamiento de nombres, asi que
 * NO hay riesgo de que dos funciones distintas con el mismo nombre se pisen.
 * El codigo que se ejecuta es exactamente el mismo que prueban las pruebas.
 *
 * Uso: node herramientas/construir-verificador.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const ENTRADA = 'src/nucleo/index.js';
const PLANTILLA = join(RAIZ, 'verificador', 'verificador.html');
const SALIDA = join(RAIZ, 'dist', 'verificador.html');

const RE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

/** Recorre el grafo de dependencias desde la entrada. */
async function recolectar(entrada) {
  const modulos = new Map();
  const pendientes = [entrada];
  while (pendientes.length) {
    const rel = pendientes.pop();
    if (modulos.has(rel)) continue;
    const texto = await readFile(join(RAIZ, rel), 'utf8');
    const deps = [];
    for (const m of texto.matchAll(RE_IMPORT)) {
      const spec = m[1];
      if (!spec.startsWith('.')) {
        throw new Error(`${rel} importa "${spec}", que no es una ruta relativa. El verificador tiene que ser autocontenido.`);
      }
      const abs = posix.normalize(posix.join(posix.dirname(rel), spec));
      deps.push([spec, abs]);
      pendientes.push(abs);
    }
    modulos.set(rel, { texto, deps });
  }
  return modulos;
}

/** Orden topologico: primero las dependencias. Detecta ciclos. */
function ordenar(modulos, entrada) {
  const orden = [];
  const estado = new Map();
  const visitar = (rel, camino) => {
    const e = estado.get(rel);
    if (e === 'listo') return;
    if (e === 'visitando') throw new Error(`ciclo de importaciones: ${[...camino, rel].join(' -> ')}`);
    estado.set(rel, 'visitando');
    for (const [, abs] of modulos.get(rel).deps) visitar(abs, [...camino, rel]);
    estado.set(rel, 'listo');
    orden.push(rel);
  };
  visitar(entrada, []);
  return orden;
}

const modulos = await recolectar(ENTRADA);
const orden = ordenar(modulos, ENTRADA);

const fuentes = {};
for (const rel of orden) fuentes[rel] = modulos.get(rel).texto;

const plantilla = await readFile(PLANTILLA, 'utf8');

const cargador = `
<script>
/* Cargador autocontenido generado por herramientas/construir-verificador.mjs
   No editar a mano: se regenera con  npm run construir  */
window.__MOTOR_PMT__ = (function () {
  const FUENTES = ${JSON.stringify(fuentes, null, 0).replace(/<\//g, '<\\/')};
  const ORDEN = ${JSON.stringify(orden)};
  const urls = Object.create(null);
  function rutaDe(base, spec) {
    const partes = base.split('/').slice(0, -1).concat(spec.split('/'));
    const pila = [];
    for (const p of partes) {
      if (p === '.' || p === '') continue;
      if (p === '..') pila.pop(); else pila.push(p);
    }
    return pila.join('/');
  }
  for (const rel of ORDEN) {
    let texto = FUENTES[rel];
    texto = texto.replace(/(from\\s*)(['"])(\\.[^'"]*)\\2/g, function (_, pre, c, spec) {
      const destino = rutaDe(rel, spec);
      const u = urls[destino];
      if (!u) throw new Error('dependencia no resuelta: ' + destino + ' (desde ' + rel + ')');
      return pre + c + u + c;
    });
    urls[rel] = URL.createObjectURL(new Blob([texto], { type: 'text/javascript' }));
  }
  return import(urls[${JSON.stringify(ENTRADA)}]);
})();
</script>`;

if (!plantilla.includes('<!--MOTOR-->')) {
  throw new Error('la plantilla del verificador debe contener el marcador <!--MOTOR-->');
}
const html = plantilla.replace('<!--MOTOR-->', cargador);

await mkdir(dirname(SALIDA), { recursive: true });
await writeFile(SALIDA, html, 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`Verificador construido: ${relative(RAIZ, SALIDA)}`);
console.log(`  modulos incluidos : ${orden.length}`);
console.log(`  tamano final      : ${kb(Buffer.byteLength(html))}`);
console.log(`  dependencias externas: ninguna`);
console.log('\nOrden de carga:');
for (const r of orden) console.log('  · ' + r);
