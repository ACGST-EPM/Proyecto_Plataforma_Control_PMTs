/**
 * Lector XML minimo y comun a Node y navegador.
 *
 * Por que no se usa DOMParser: DOMParser solo existe en el navegador. Si el
 * motor lo usara alli y otra cosa en Node, las pruebas dejarian de demostrar
 * como se comporta el producto real. Un unico lector propio garantiza que el
 * verificador, las pruebas y el futuro tablero leen los KML exactamente igual.
 *
 * Alcance deliberadamente pequeno: KML es XML sencillo (elementos, texto, CDATA,
 * atributos y espacios de nombres). No se implementan DTD, entidades propias ni
 * procesamiento de esquemas, porque KML no los necesita y ampliar el alcance
 * solo anadiria superficie de fallo.
 *
 * La salida se valida contra un lector independiente (xml.dom.minidom de Python)
 * sobre los 8 KMZ reales; ver motor/test/xml.test.mjs y el informe de la etapa.
 */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#?[\w]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

/**
 * @typedef {object} Nodo
 * @property {string} nombre    nombre local, sin prefijo de espacio de nombres
 * @property {string} nombreCompleto
 * @property {Record<string,string>} atributos
 * @property {Nodo[]} hijos
 * @property {string} texto     texto directo del elemento, con CDATA ya resuelto
 */

function nuevoNodo(nombreCompleto) {
  const nombre = nombreCompleto.includes(':')
    ? nombreCompleto.slice(nombreCompleto.indexOf(':') + 1)
    : nombreCompleto;
  return { nombre, nombreCompleto, atributos: {}, hijos: [] };
}

function leerAtributos(s, nodo) {
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) nodo.atributos[m[1]] = decodificar(m[3] ?? m[4] ?? '');
}

/**
 * Convierte un texto XML en un arbol de nodos.
 * Lanza Error con un mensaje claro si el documento esta mal formado.
 * @param {string} xml
 * @returns {Nodo} nodo raiz artificial que contiene el elemento documento
 */
export function analizarXml(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('el documento XML esta vacio');
  }
  const raiz = nuevoNodo('#documento');
  const pila = [raiz];
  let i = 0;
  const n = xml.length;
  let elementosCerrados = 0;

  while (i < n) {
    const abre = xml.indexOf('<', i);
    if (abre === -1) { agregarTexto(pila, xml.slice(i)); break; }
    if (abre > i) agregarTexto(pila, xml.slice(i, abre));

    // Bloques que no son elementos
    if (xml.startsWith('<!--', abre)) {
      const f = xml.indexOf('-->', abre + 4);
      if (f === -1) throw new Error('comentario XML sin cerrar');
      i = f + 3; continue;
    }
    if (xml.startsWith('<![CDATA[', abre)) {
      const f = xml.indexOf(']]>', abre + 9);
      if (f === -1) throw new Error('bloque CDATA sin cerrar');
      // El contenido de CDATA es literal: no se decodifican entidades.
      agregarTextoCrudo(pila, xml.slice(abre + 9, f));
      i = f + 3; continue;
    }
    if (xml.startsWith('<?', abre)) {
      const f = xml.indexOf('?>', abre + 2);
      if (f === -1) throw new Error('instruccion de proceso sin cerrar');
      i = f + 2; continue;
    }
    if (xml.startsWith('<!', abre)) {
      const f = xml.indexOf('>', abre + 2);
      if (f === -1) throw new Error('declaracion XML sin cerrar');
      i = f + 1; continue;
    }

    const cierra = xml.indexOf('>', abre);
    if (cierra === -1) throw new Error('etiqueta sin cerrar cerca de la posicion ' + abre);
    let cuerpo = xml.slice(abre + 1, cierra);

    if (cuerpo[0] === '/') {
      // Etiqueta de cierre
      const nombre = cuerpo.slice(1).trim();
      if (pila.length <= 1) throw new Error(`cierre inesperado de <${nombre}>`);
      const actual = pila[pila.length - 1];
      if (actual.nombreCompleto !== nombre) {
        throw new Error(`se esperaba cerrar <${actual.nombreCompleto}> pero llego </${nombre}>`);
      }
      pila.pop();
      elementosCerrados++;
      i = cierra + 1; continue;
    }

    const autoCierra = cuerpo.endsWith('/');
    if (autoCierra) cuerpo = cuerpo.slice(0, -1);
    const esp = cuerpo.search(/[\s]/);
    const nombreCompleto = (esp === -1 ? cuerpo : cuerpo.slice(0, esp)).trim();
    if (!nombreCompleto) throw new Error('etiqueta sin nombre en la posicion ' + abre);
    const nodo = nuevoNodo(nombreCompleto);
    if (esp !== -1) leerAtributos(cuerpo.slice(esp), nodo);
    pila[pila.length - 1].hijos.push(nodo);
    if (!autoCierra) pila.push(nodo); else elementosCerrados++;
    i = cierra + 1;
  }

  if (pila.length > 1) {
    throw new Error(`el documento termina sin cerrar <${pila[pila.length - 1].nombreCompleto}>`);
  }
  if (elementosCerrados === 0) throw new Error('no se encontro ningun elemento XML');
  return raiz;
}

/* El texto se guarda como nodos hijo para conservar el orden real en que
   aparece entre los elementos. Asi `textoDe` devuelve exactamente lo que hay
   en el documento, tambien cuando hay etiquetas intercaladas. */
function agregarTextoCrudo(pila, trozo) {
  if (pila.length <= 1 || !trozo) return;
  pila[pila.length - 1].hijos.push({ nombre: '#texto', nombreCompleto: '#texto', valor: trozo, hijos: [], atributos: {} });
}

function agregarTexto(pila, trozo) {
  if (pila.length <= 1 || !trozo) return;
  agregarTextoCrudo(pila, decodificar(trozo));
}

/** Todos los descendientes con ese nombre local, en orden de aparicion. */
export function buscarTodos(nodo, nombre, acc = []) {
  for (const h of nodo.hijos) {
    if (h.nombre === nombre) acc.push(h);
    buscarTodos(h, nombre, acc);
  }
  return acc;
}

/** Hijos DIRECTOS con ese nombre local. */
export function hijos(nodo, nombre) {
  return nodo.hijos.filter((h) => h.nombre === nombre);
}

/** Primer descendiente con ese nombre local, o null. */
export function buscarUno(nodo, nombre) {
  for (const h of nodo.hijos) {
    if (h.nombre === nombre) return h;
    const s = buscarUno(h, nombre);
    if (s) return s;
  }
  return null;
}

/** Texto de un nodo, incluido el de sus descendientes, en orden de aparicion. */
export function textoDe(nodo) {
  if (!nodo) return '';
  if (nodo.nombre === '#texto') return nodo.valor;
  let t = '';
  for (const h of nodo.hijos) t += textoDe(h);
  return t.trim();
}

/** Texto de un nodo sin recortar los espacios de los extremos. */
export function textoCrudoDe(nodo) {
  if (!nodo) return '';
  if (nodo.nombre === '#texto') return nodo.valor;
  let t = '';
  for (const h of nodo.hijos) t += textoCrudoDe(h);
  return t;
}
