/**
 * Empaqueta la aplicacion en UN SOLO archivo .html que funciona con doble clic:
 * sin servidor, sin instalar nada y sin descargar nada de internet.
 *
 * POR QUE HACE FALTA
 * Los modulos de JavaScript no se pueden cargar desde `file://`: el navegador
 * los bloquea por seguridad. Y el objetivo de la Etapa 2 es justamente que una
 * persona no tecnica abra un archivo y ya este trabajando.
 *
 * COMO LO RESUELVE, sin empaquetadores externos
 * Es el mismo mecanismo ya probado en el verificador de la Etapa 1: mete el
 * texto de cada modulo dentro del HTML y, al abrirse la pagina, los convierte
 * en URLs de tipo blob reescribiendo los `import`. El navegador ejecuta modulos
 * ES de verdad, con su aislamiento de nombres intacto, asi que el codigo que
 * corre es EXACTAMENTE el mismo que prueban las pruebas.
 *
 * Ademas incrusta el CSS propio, Leaflet (JS + CSS) y sus iconos como data:URI,
 * de modo que el archivo no hace una sola peticion de red para funcionar. La
 * unica peticion opcional son las teselas del mapa de fondo, y la aplicacion
 * funciona sin ellas.
 *
 * Uso:  node herramientas/construir-app.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const APP = join(RAIZ, 'app');
const ENTRADA = 'app.js';
const SALIDA = join(RAIZ, 'dist', 'Plataforma_PMTs.html');

const RE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

/**
 * Recorre el grafo de modulos desde la entrada. Acepta rutas que salgan de
 * `app/` (el motor vive en `motor/`), asi que las claves se normalizan contra
 * la raiz del repositorio.
 */
async function recolectar(entradaRel) {
  const modulos = new Map();
  const pendientes = [entradaRel];
  while (pendientes.length) {
    const rel = pendientes.pop();
    if (modulos.has(rel)) continue;
    let texto;
    try {
      texto = await readFile(join(APP, rel), 'utf8');
    } catch {
      throw new Error(`no se encontro el modulo "${rel}"`);
    }
    const deps = [];
    for (const m of texto.matchAll(RE_IMPORT)) {
      const spec = m[1];
      if (!spec.startsWith('.')) {
        throw new Error(`${rel} importa "${spec}", que no es una ruta relativa. ` +
          `La aplicacion tiene que ser autocontenida: sin paquetes de npm en tiempo de ejecucion.`);
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

/* ── Recursos que hay que incrustar ── */
const css = await readFile(join(APP, 'estilos.css'), 'utf8');
const leafletJs = await readFile(join(APP, 'vendor', 'leaflet', 'leaflet.js'), 'utf8');
let leafletCss = await readFile(join(APP, 'vendor', 'leaflet', 'leaflet.css'), 'utf8');

// Los iconos de Leaflet se referencian por URL relativa; se convierten a
// data:URI para que el archivo no dependa de la carpeta `images/`.
const iconos = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png'];
for (const nombre of iconos) {
  try {
    const b = await readFile(join(APP, 'vendor', 'leaflet', 'images', nombre));
    const uri = `data:image/png;base64,${b.toString('base64')}`;
    leafletCss = leafletCss.split(`images/${nombre}`).join(uri);
  } catch { /* si falta un icono, Leaflet dibuja igual las geometrias */ }
}

let html = await readFile(join(APP, 'index.html'), 'utf8');

const cargador = `<script type="module">
/* Cargador autocontenido generado por herramientas/construir-app.mjs
   No editar a mano: se regenera con  npm run construir-app  */
(function () {
  const FUENTES = ${JSON.stringify(fuentes).replace(/<\//g, '<\\/')};
  const ORDEN = ${JSON.stringify(orden)};
  const urls = Object.create(null);
  function rutaDe(base, spec) {
    // Misma semantica que posix.normalize en Node, que es lo que usa el
    // empaquetador para generar las claves: un ".." que no tiene nada que
    // subir SE CONSERVA. La aplicacion vive en app/ e importa el motor con
    // "../motor/...", asi que perder ese ".." rompia toda la resolucion.
    const partes = base.split('/').slice(0, -1).concat(spec.split('/'));
    const pila = [];
    for (const p of partes) {
      if (p === '.' || p === '') continue;
      if (p === '..' && pila.length && pila[pila.length - 1] !== '..') pila.pop();
      else pila.push(p);
    }
    return pila.join('/');
  }
  for (const rel of ORDEN) {
    const texto = FUENTES[rel].replace(/(from\\s*)(['"])(\\.[^'"]*)\\2/g, function (_, pre, c, spec) {
      const destino = rutaDe(rel, spec);
      const u = urls[destino];
      if (!u) throw new Error('dependencia no resuelta: ' + destino + ' (desde ' + rel + ')');
      return pre + c + u + c;
    });
    urls[rel] = URL.createObjectURL(new Blob([texto], { type: 'text/javascript' }));
  }
  import(urls[${JSON.stringify(ENTRADA)}]).catch(function (e) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="margin:20px;padding:16px;border-left:4px solid #c62828;background:#fdecea;font-family:sans-serif">' +
      '<b>La aplicacion no pudo arrancar.</b><br>' + String(e && e.message || e) + '</div>');
  });
})();
</script>`;

/**
 * Sustituye una marca por contenido LITERAL.
 *
 * OJO: hay que pasar una funcion como reemplazo. Si se pasa una cadena,
 * `String.replace` interpreta `$$`, `$&`, `$\`` y `$'` como patrones: el `$$`
 * de `ui/dom.js` se convertia en un solo `$` y el modulo acababa declarando dos
 * veces la misma constante. Con una funcion, el texto entra tal cual.
 */
function incrustar(texto, marca, contenido) {
  if (!texto.includes(marca)) throw new Error(`no se encontro la marca a sustituir: ${marca}`);
  return texto.replace(marca, () => contenido);
}

html = incrustar(html, '<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', `<style>\n${leafletCss}\n</style>`);
html = incrustar(html, '<link rel="stylesheet" href="estilos.css">', `<style>\n${css}\n</style>`);
html = incrustar(html, '<script src="vendor/leaflet/leaflet.js"></script>', `<script>\n${leafletJs}\n</script>`);
html = incrustar(html, '<script type="module" src="app.js"></script>', cargador);

for (const resto of ['vendor/leaflet/leaflet.css', 'estilos.css', 'vendor/leaflet/leaflet.js', 'src="app.js"']) {
  if (html.includes(resto)) throw new Error(`quedo una referencia externa sin incrustar: ${resto}`);
}

await mkdir(dirname(SALIDA), { recursive: true });
await writeFile(SALIDA, html, 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`Aplicacion construida: ${relative(RAIZ, SALIDA)}`);
console.log(`  modulos incluidos    : ${orden.length}`);
console.log(`  tamano final         : ${kb(Buffer.byteLength(html))}`);
console.log(`  peticiones de red    : ninguna para funcionar (solo teselas opcionales del mapa)`);
console.log('\nOrden de carga:');
for (const r of orden) console.log('  · ' + r);
