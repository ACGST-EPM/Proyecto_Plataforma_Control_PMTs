/**
 * RESUMEN — las cifras que la pantalla ensena arriba del todo.
 *
 * Regla innegociable de esta etapa: "no hay relacion" y "no se pudo analizar"
 * son DOS numeros distintos y nunca se suman. Todo lo que no se pudo evaluar
 * sale con su propio contador y su propio color.
 */
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL, LECTURA } from './modelo.js';

/**
 * MODELO DE RESUMEN ÚNICO.
 *
 * ══ POR QUÉ ════════════════════════════════════════════════════════════════
 *
 * El informe calculaba sus tarjetas por su cuenta, filtrando `relaciones`, y las
 * tablas de detalle usaban otra colección. Resultado medido: la tabla mostraba
 * 1 pareja no evaluable y la tarjeta decía 0, porque los pares no evaluables NO
 * están en `relaciones` — el motor los devuelve aparte, precisamente para que no
 * se confundan con relaciones normales.
 *
 * La clase de error es «dos sitios calculando la misma cifra». Se elimina
 * haciendo que el tablero, el informe y las exportaciones llamen todos a
 * `resumir()` con el MISMO alcance. Si una tarjeta y su tabla difieren, es que
 * se les pasó un alcance distinto, y eso es visible en la llamada.
 *
 * ══ EL ALCANCE VIAJA CON LAS CIFRAS ════════════════════════════════════════
 *
 * Con un filtro puesto, las tarjetas decían 2 PMT y 2 contratos mientras la
 * tabla y el informe decían 1 y 1. Las dos cosas eran ciertas —una contaba lo
 * CARGADO y la otra lo VISIBLE— pero en la pantalla no se distinguían, así que
 * parecían un error de la herramienta.
 *
 * La clase de error es «una cifra sin alcance». Se elimina haciendo que el
 * alcance sea parte del resumen y no un dato que hay que recordar aparte:
 *
 *   `pmts`         PMT del alcance que se ha pedido (lo que se está viendo).
 *   `pmtsCargados` PMT cargados en total, venga o no filtrado.
 *   `filtrado`     true si el alcance pedido es menor que el total.
 *
 * INVARIANTE: mismo alcance ⇒ mismas cifras. Tablero, pestañas, informe y
 * exportaciones llaman todos a `resumir()`; si dos números difieren es porque
 * se pidieron alcances distintos, y eso se ve escrito en la pantalla.
 *
 * @param {object|null} analisis    resultado del motor (para la calidad de la entrada)
 * @param {Array} filas             PMT del alcance
 * @param {Array} relaciones        relaciones del alcance
 * @param {Array} [noEvaluables]    pares del alcance que NO se pudieron medir
 * @param {{total?:number}} [opciones] `total` = PMT cargados, para situar el alcance
 */
export function resumir(analisis, filas, relaciones, noEvaluables = [], opciones = {}) {
  const c = analisis?.calidad ?? {};
  const est = analisis?.estadisticas ?? {};

  let contacto = 0, cercania = 0, aLaVez = 0, contactoALaVez = 0;
  let espacialNoEval = 0, temporalNoEval = 0;
  for (const r of relaciones) {
    const e = estadoEspacial(r), t = estadoTemporal(r);
    if (e === ESPACIAL.CONTACTO) contacto++;
    if (e === ESPACIAL.CERCANIA) cercania++;
    if (e === ESPACIAL.NO_EVALUABLE) espacialNoEval++;
    if (t === TEMPORAL.COINCIDE) aLaVez++;
    if (t === TEMPORAL.NO_EVALUABLE) temporalNoEval++;
    if (e === ESPACIAL.CONTACTO && t === TEMPORAL.COINCIDE) contactoALaVez++;
  }

  const cargados = Number.isInteger(opciones.total) ? opciones.total : filas.length;

  return {
    pmts: filas.length,
    // ALCANCE: siempre presente, para que ninguna cifra viaje sin él.
    pmtsCargados: cargados,
    filtrado: filas.length !== cargados,
    contratos: new Set(filas.map((x) => x.contrato).filter(Boolean)).size,
    contratistas: new Set(filas.map((x) => x.contratista).filter(Boolean)).size,
    municipios: new Set(filas.map((x) => x.municipio).filter(Boolean)).size,
    relaciones: relaciones.length,
    contacto, cercania, aLaVez, contactoALaVez,
    // Los pares no evaluables llegan en su propia colección: NO están en
    // `relaciones`. Se cuentan de ahí, que es la única fuente correcta.
    espacialNoEval: espacialNoEval + (noEvaluables?.length ?? 0),
    temporalNoEval,
    noEvaluables: noEvaluables ?? [],
    // Calidad de la entrada
    archivosCompletos: c.archivosCompletos ?? 0,
    archivosParciales: c.archivosParciales ?? 0,
    archivosFallidos: c.archivosFallidos ?? 0,
    sinGeometria: c.sinGeometria ?? 0,
    sinVigenciaValida: c.sinVigenciaValida ?? 0,
    sinContrato: c.sinContrato ?? 0,
    sinMunicipio: c.sinMunicipio ?? 0,
    duplicados: c.duplicadosExactos ?? 0,
    conAvisos: c.conAvisos ?? 0,
    msTotal: est.msTotalProceso ?? est.msTotal ?? 0,
  };
}

/**
 * Estado de lectura de un archivo.
 *
 * El motor ya distingue los tres casos en `estadoLectura`, asi que se usa ese
 * valor tal cual. OJO: el motor pone `ok: false` tambien en un archivo PARCIAL
 * —porque su cobertura no fue completa—, de modo que mirar solo `ok` haria
 * pasar por "no se pudo leer" un archivo del que si se aprovecharon trazados.
 * Son cosas distintas y el usuario tiene que poder distinguirlas.
 */
export function estadoArchivo(a) {
  const dicho = a.estadoLectura;
  if (dicho === 'parcial') return LECTURA.PARCIAL;
  if (dicho === 'fallida' || dicho === 'fallido') return LECTURA.FALLIDA;
  if (dicho === 'completa' || dicho === 'completo') return LECTURA.COMPLETA;
  // Sin estado declarado: se deduce, con el mismo criterio.
  if ((a.errores?.length ?? 0) > 0 && !(a.placemarks > 0)) return LECTURA.FALLIDA;
  if ((a.motivosCobertura?.length ?? 0) > 0) return LECTURA.PARCIAL;
  return a.ok === false ? LECTURA.FALLIDA : LECTURA.COMPLETA;
}

/**
 * Frase honesta para encabezar el resultado. Si algo no se pudo analizar, lo
 * dice ANTES de dar por bueno el resto: es exactamente lo contrario de
 * presentar un cero tranquilizador.
 */
export function frasePrincipal(r) {
  if (!r.pmts) {
    return r.filtrado && r.pmtsCargados
      ? `Ningun PMT de los ${r.pmtsCargados} cargados cumple los filtros puestos ahora mismo.`
      : 'No se encontro ningun PMT en los archivos seleccionados.';
  }
  const partes = [r.filtrado
    ? `Se estan mostrando ${r.pmts} PMT de ${r.contratos} contrato(s), de los ${r.pmtsCargados} cargados.`
    : `Se analizaron ${r.pmts} PMT de ${r.contratos} contrato(s).`];
  if (r.relaciones === 0) partes.push('No se encontro ninguna relacion entre contratos distintos.');
  else {
    partes.push(`Se ${r.filtrado ? 'muestran' : 'encontraron'} ${r.relaciones} relacion(es) entre contratos distintos, ` +
      `de las cuales ${r.aLaVez} coinciden tambien en el tiempo y ${r.contacto} llegan a tocarse.`);
  }
  const pendientes = [];
  if (r.espacialNoEval) pendientes.push(`${r.espacialNoEval} par(es) cuya distancia no se pudo determinar`);
  if (r.temporalNoEval) pendientes.push(`${r.temporalNoEval} par(es) cuyas fechas no permiten decidir`);
  if (r.archivosParciales) pendientes.push(`${r.archivosParciales} archivo(s) leido(s) solo en parte`);
  if (r.archivosFallidos) pendientes.push(`${r.archivosFallidos} archivo(s) que no se pudieron leer`);
  if (pendientes.length) {
    partes.push(`Atencion: hay ${pendientes.join(', ')}. Eso NO significa que no haya problema: ` +
      `significa que no se pudo comprobar.`);
  }
  return partes.join(' ');
}
