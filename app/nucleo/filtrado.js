/**
 * FILTRADO — logica pura, sin DOM, para poder probarla automaticamente.
 *
 * Conserva todas las capacidades del tablero historico (contratista, contrato,
 * frente, municipio, estado de interferencia y rango de fechas) y anade las
 * dos que faltaban: PROYECTO y TIPO DE CIERRE.
 *
 * Regla de diseno: un filtro vacio no filtra. Nunca se deja al usuario delante
 * de una tabla vacia sin saber por que.
 */
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL } from './modelo.js';

/** Filtros en blanco: no descartan nada. */
export function filtrosVacios() {
  return {
    contratista: [], contrato: [], proyecto: [], municipio: [],
    frente: [], tipoCierre: [], relacion: [],
    desde: null, hasta: null, texto: '',
  };
}

export function hayFiltrosActivos(f) {
  return ['contratista', 'contrato', 'proyecto', 'municipio', 'frente', 'tipoCierre', 'relacion']
    .some((k) => f[k]?.length) || !!f.desde || !!f.hasta || !!(f.texto ?? '').trim();
}

const enLista = (lista, valor) => !lista?.length || lista.includes(valor ?? '(sin dato)');

/**
 * Solapamiento con el rango de fechas pedido. Un PMT entra si su vigencia toca
 * el rango en algun punto; no hace falta que este contenido entero.
 *
 * Un PMT SIN vigencia valida NO se descarta por fecha: no se puede afirmar que
 * quede fuera de un rango que no se puede comparar. Se conserva y se marca.
 */
export function tocaRango(fila, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!fila.vigenciaValida || fila.inicioMs === null || fila.finMs === null) return true;
  const d = desde ? Date.parse(desde + 'T00:00:00Z') : -Infinity;
  const h = hasta ? Date.parse(hasta + 'T23:59:59Z') : Infinity;
  return fila.inicioMs <= h && fila.finMs >= d;
}

const norm = (s) => (s ?? '').toString().toLowerCase();

function coincideTexto(fila, texto) {
  const t = norm(texto).trim();
  if (!t) return true;
  return [fila.frente, fila.contrato, fila.contratista, fila.proyecto, fila.municipio, fila.direccion]
    .some((v) => norm(v).includes(t));
}

/** Aplica los filtros a la lista de PMT. */
export function filtrarPmts(filas, f) {
  return filas.filter((x) =>
    enLista(f.contratista, x.contratista) &&
    enLista(f.contrato, x.contrato) &&
    enLista(f.proyecto, x.proyecto) &&
    enLista(f.municipio, x.municipio) &&
    enLista(f.frente, x.frente) &&
    enLista(f.tipoCierre, x.tipoCierre) &&
    tocaRango(x, f.desde, f.hasta) &&
    coincideTexto(x, f.texto));
}

/**
 * Claves de relacion disponibles. Son HECHOS, no niveles de criticidad:
 * aqui no aparece la palabra "critico" ni ninguna jerarquia operativa.
 */
export const CLAVES_RELACION = Object.freeze([
  ['contacto', 'Se tocan fisicamente'],
  ['cercania', 'Cerca, sin tocarse'],
  ['a-la-vez', 'Coinciden en el tiempo'],
  ['contacto-a-la-vez', 'Se tocan Y coinciden en el tiempo'],
  ['espacial-no-evaluable', 'No se pudo analizar la distancia'],
  ['temporal-no-evaluable', 'No se pudo analizar el tiempo'],
]);

function cumpleClave(rel, clave) {
  const e = estadoEspacial(rel), t = estadoTemporal(rel);
  switch (clave) {
    case 'contacto': return e === ESPACIAL.CONTACTO;
    case 'cercania': return e === ESPACIAL.CERCANIA;
    case 'a-la-vez': return t === TEMPORAL.COINCIDE;
    case 'contacto-a-la-vez': return e === ESPACIAL.CONTACTO && t === TEMPORAL.COINCIDE;
    case 'espacial-no-evaluable': return e === ESPACIAL.NO_EVALUABLE;
    case 'temporal-no-evaluable': return t === TEMPORAL.NO_EVALUABLE;
    default: return true;
  }
}

/**
 * Filtra relaciones. Una relacion sobrevive si CUALQUIERA de sus dos extremos
 * pasa el filtro de PMT: si el usuario mira un contrato, quiere ver con quien
 * choca ese contrato, no solo las parejas donde ambos lados coinciden.
 */
export function filtrarRelaciones(relaciones, f, idsVisibles) {
  return relaciones.filter((r) => {
    if (idsVisibles && !(idsVisibles.has(r.idA) || idsVisibles.has(r.idB))) return false;
    if (f.relacion?.length && !f.relacion.some((c) => cumpleClave(r, c))) return false;
    return true;
  });
}

/** Valores disponibles para poblar cada desplegable, ya ordenados. */
export function opcionesDe(filas, campo) {
  const vistos = new Map();
  for (const x of filas) {
    const v = x[campo] ?? '(sin dato)';
    vistos.set(v, (vistos.get(v) ?? 0) + 1);
  }
  return [...vistos.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es'))
    .map(([valor, n]) => ({ valor, n }));
}

/**
 * PMT vigentes en un instante dado. Es lo que mueve el recorrido temporal.
 * Un PMT sin vigencia valida NO es "vigente": no se puede afirmar que lo sea.
 */
export function vigentesEn(filas, ms) {
  return filas.filter((x) => x.vigenciaValida && x.inicioMs !== null && x.finMs !== null &&
    x.inicioMs <= ms && x.finMs >= ms);
}

/** Rango temporal que cubren los datos cargados, para encuadrar el recorrido. */
export function rangoTemporal(filas) {
  let min = Infinity, max = -Infinity;
  for (const x of filas) {
    if (!x.vigenciaValida || x.inicioMs === null || x.finMs === null) continue;
    if (x.inicioMs < min) min = x.inicioMs;
    if (x.finMs > max) max = x.finMs;
  }
  return Number.isFinite(min) ? { min, max } : null;
}
