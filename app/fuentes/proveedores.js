/**
 * PROVEEDORES DE FUENTES — la frontera entre «de dónde viene» y «qué hacemos».
 *
 * ══ POR QUÉ EXISTE ESTA FRONTERA ══════════════════════════════════════════
 *
 * Hoy los KMZ los elige la usuaria con un selector de archivos. Mañana podrían
 * llegar de una carpeta corporativa. Si la aplicación y el motor supieran de
 * dónde vienen, cambiar el origen obligaría a tocarlo todo, y cada prueba
 * necesitaría el servicio real levantado.
 *
 * Así que el resto del producto solo conoce ESTE contrato. Nada más:
 *
 *   nombre                 cómo se llama este origen, para enseñarlo.
 *   listar()               qué hay ahí ahora. Sin descargar nada.
 *   leer(ruta)             los bytes de una de esas cosas.
 *   admiteNotificaciones   si puede avisar de un cambio, o hay que preguntar.
 *
 * `listar()` y `leer()` están separados a propósito: listar es barato y leer no.
 * Esa separación es justo lo que permite no reprocesar lo que no ha cambiado.
 *
 * ══ LO QUE ESTE ARCHIVO NO HACE ═══════════════════════════════════════════
 *
 * No habla con ningún servicio corporativo, ni tiene credenciales, ni sabe qué
 * es SharePoint. Cuando exista un adaptador corporativo será OTRO archivo que
 * cumpla este mismo contrato, y ni la interfaz ni el motor se enterarán.
 *
 * @module
 */
import { observarFuente } from './inventario.js';

/**
 * Comprueba que algo cumple el contrato. Útil para fallar pronto y con un
 * mensaje claro en vez de con un `undefined is not a function` a media faena.
 */
export function validarProveedor(p) {
  const faltan = ['nombre', 'listar', 'leer'].filter((k) => p?.[k] === undefined);
  if (faltan.length) return { ok: false, motivo: `al proveedor le falta: ${faltan.join(', ')}` };
  if (typeof p.listar !== 'function' || typeof p.leer !== 'function') {
    return { ok: false, motivo: 'listar y leer tienen que ser funciones' };
  }
  return { ok: true };
}

/**
 * PROVEEDOR LOCAL — los archivos que la usuaria elige. Es el de hoy.
 *
 * Recibe los `File` del selector y los expone con el mismo contrato que
 * tendría un origen remoto. Así el resto del código no distingue uno de otro,
 * y el camino de hoy es el mismo que el de mañana.
 */
export function proveedorLocal(archivos = []) {
  let items = archivos.map((f) => ({ nombre: f.name ?? f.nombre, file: f }));
  return {
    nombre: 'Archivos de este equipo',
    id: 'local',
    admiteNotificaciones: false,
    // Sin vigilancia de carpetas: el navegador no puede mirar una carpeta por
    // su cuenta, y prometerlo sería mentir.
    motivoSinNotificaciones: 'un archivo elegido a mano no avisa cuando cambia; ' +
      'hay que volver a elegirlo.',
    definir(nuevos) { items = nuevos.map((f) => ({ nombre: f.name ?? f.nombre, file: f })); },
    async listar() {
      return items.map((x) => ({
        ruta: x.nombre, nombre: x.nombre,
        bytesDeclarados: x.file?.size ?? null,
        modificado: x.file?.lastModified ? new Date(x.file.lastModified).toISOString() : null,
      }));
    },
    async leer(ruta) {
      const x = items.find((i) => i.nombre === ruta);
      if (!x) throw new Error(`no se encontró «${ruta}» entre los archivos elegidos`);
      const buf = x.file.arrayBuffer ? await x.file.arrayBuffer() : x.file.datos;
      return new Uint8Array(buf);
    },
  };
}

/**
 * PROVEEDOR SIMULADO — un origen «remoto» de laboratorio.
 *
 * Existe para poder construir y PROBAR toda la tubería de sincronización
 * —detectar, comparar, decidir, anotar— sin depender de ninguna decisión de TI
 * ni de ningún servicio real. Guarda los contenidos en memoria y deja
 * añadirlos, cambiarlos, moverlos y borrarlos, que es exactamente lo que pasa
 * en una carpeta compartida.
 *
 * NO es un adaptador corporativo disfrazado: no habla con nada. Es el banco de
 * pruebas donde se demuestra que la tubería funciona antes de enchufarla.
 */
export function proveedorSimulado(nombre = 'Origen simulado') {
  const contenidos = new Map();   // ruta -> { datos, modificado, etiqueta }
  let fallos = new Map();         // ruta -> Error, para probar lo que sale mal
  return {
    nombre, id: 'simulado',
    admiteNotificaciones: true,
    poner(ruta, datos, { modificado = new Date().toISOString(), etiqueta = null } = {}) {
      contenidos.set(ruta, {
        datos: typeof datos === 'string' ? new TextEncoder().encode(datos) : datos,
        modificado, etiqueta,
      });
      return this;
    },
    quitar(ruta) { contenidos.delete(ruta); return this; },
    mover(de, a) {
      const x = contenidos.get(de);
      if (x) { contenidos.set(a, x); contenidos.delete(de); }
      return this;
    },
    romper(ruta, mensaje = 'el origen no dejó leer este archivo') {
      fallos.set(ruta, new Error(mensaje)); return this;
    },
    arreglar(ruta) { fallos.delete(ruta); return this; },
    async listar() {
      return [...contenidos.entries()].map(([ruta, x]) => ({
        ruta, nombre: ruta.split('/').pop(),
        bytesDeclarados: x.datos.length, modificado: x.modificado, etiquetaRemota: x.etiqueta,
      }));
    },
    async leer(ruta) {
      if (fallos.has(ruta)) throw fallos.get(ruta);
      const x = contenidos.get(ruta);
      if (!x) throw new Error(`«${ruta}» ya no está en el origen`);
      return x.datos;
    },
  };
}

/**
 * Observa TODAS las fuentes de un proveedor: lista y calcula la huella de cada
 * una. Es el paso caro, y por eso se hace una sola vez y se reutiliza.
 *
 * Un archivo que no se deja leer NO tumba la sincronización: se anota como
 * rechazado y el resto sigue. Un lote no puede perderse entero por uno malo.
 */
export async function observarTodo(proveedor) {
  const v = validarProveedor(proveedor);
  if (!v.ok) throw new Error(v.motivo);
  const lista = await proveedor.listar();
  const observadas = [], rechazadas = [];
  for (const item of lista) {
    try {
      const datos = await proveedor.leer(item.ruta);
      observadas.push(await observarFuente({
        proveedor: proveedor.id ?? proveedor.nombre,
        ruta: item.ruta, nombre: item.nombre, datos,
        modificado: item.modificado ?? null, etiquetaRemota: item.etiquetaRemota ?? null,
      }));
    } catch (e) {
      rechazadas.push({ ruta: item.ruta, nombre: item.nombre ?? item.ruta,
        motivo: e?.message ?? String(e) });
    }
  }
  return { observadas, rechazadas };
}
