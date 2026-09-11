/**
 * RESUMEN — las cifras que la pantalla ensena arriba del todo.
 *
 * Regla innegociable de esta etapa: "no hay relacion" y "no se pudo analizar"
 * son DOS numeros distintos y nunca se suman. Todo lo que no se pudo evaluar
 * sale con su propio contador y su propio color.
 */
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL, LECTURA } from './modelo.js';

export function resumir(analisis, filas, relaciones) {
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

  return {
    pmts: filas.length,
    contratos: new Set(filas.map((x) => x.contrato).filter(Boolean)).size,
    contratistas: new Set(filas.map((x) => x.contratista).filter(Boolean)).size,
    municipios: new Set(filas.map((x) => x.municipio).filter(Boolean)).size,
    relaciones: relaciones.length,
    contacto, cercania, aLaVez, contactoALaVez,
    espacialNoEval: espacialNoEval + (est.paresNoEvaluablesEspacialmente ?? 0),
    temporalNoEval,
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
  if (!r.pmts) return 'No se encontro ningun PMT en los archivos seleccionados.';
  const partes = [`Se analizaron ${r.pmts} PMT de ${r.contratos} contrato(s).`];
  if (r.relaciones === 0) partes.push('No se encontro ninguna relacion entre contratos distintos.');
  else {
    partes.push(`Se encontraron ${r.relaciones} relacion(es) entre contratos distintos, ` +
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
