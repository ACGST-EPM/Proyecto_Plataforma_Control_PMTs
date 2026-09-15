/**
 * PUNTO DE ENTRADA UNICO DE LA GESTION DE FUENTES.
 *
 * Existe para que quien use la tuberia importe UNA cosa y no cinco, y para que
 * se vea de un vistazo qué ofrece: observar un origen, compararlo con lo que
 * había, decidir qué hacer y dejarlo anotado.
 *
 * No añade logica: solo reexporta. Si algun dia hay que cambiar como se
 * reparten las piezas por dentro, quien las use no se entera.
 */
export { huellaDe, huellaCorta, mismaHuella, ALGORITMO } from './huella.js';
export { proveedorLocal, proveedorSimulado, observarTodo, validarProveedor } from './proveedores.js';
export { observarFuente, crearInventario, compararInventarios, planDeActualizacion,
  diferenciasDeRegistros, serializarInventario, leerInventario, idFuente,
  CAMBIO, ESQUEMA_INVENTARIO } from './inventario.js';
export { crearBitacora, anotar, anotarSincronizacion, ultimas, serializarBitacora,
  leerBitacora, HECHO, ESQUEMA_BITACORA } from './auditoria.js';
export { revisar, aplicar, explicarSincronizacion } from './sincronizacion.js';
