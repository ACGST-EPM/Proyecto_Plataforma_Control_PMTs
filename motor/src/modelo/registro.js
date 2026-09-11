/**
 * REGISTRO: la unidad de datos del motor.
 *
 * Un registro es "un frente de obra con una vigencia concreta y una geometria
 * concreta". Es lo que el motor compara, lo que el mapa dibuja y lo que la
 * tabla lista. Todo lo demas (categorias, colores, alertas) se deriva de aqui.
 *
 * El registro guarda los HECHOS y sus AVISOS DE CALIDAD por separado. Nunca se
 * rellena un dato ausente con un valor inventado sin dejar constancia.
 */

import { leerDescripcion } from '../io/descripcion.js';
import { leerVigencia } from '../tiempo/intervalo.js';
import { calcularId } from './identidad.js';
import { caja, descomponer } from '../geo/geometria.js';

/**
 * Convierte un placemark leido del KML en un registro canonico.
 * @param {object} pm salida de leerKml()
 * @param {{finInclusivoDiaCompleto?:boolean}} [opciones]
 */
export function aRegistro(pm, opciones = {}) {
  const avisos = [...pm.avisos];
  const desc0 = leerDescripcion(pm.descripcion);
  const { campos, eraHtml } = desc0;
  avisos.push(...desc0.avisos);

  const frente = (pm.nombre ?? '').trim();
  if (!frente) avisos.push('el trazado no tiene nombre de frente');

  const vigencia = leerVigencia(campos.fecha_inicio, campos.fecha_fin, opciones);
  avisos.push(...vigencia.avisos);

  const erroresGeom = [];
  const desc = descomponer(pm.geometria, erroresGeom);
  avisos.push(...erroresGeom);
  const tieneGeometria = !!(desc.puntos.length || desc.lineas.length || desc.poligonos.length);
  if (!tieneGeometria) avisos.push('el registro no tiene geometria utilizable: queda fuera del analisis espacial');

  const tipoCierre = (campos.tipo_cierre ?? '').toLowerCase() || null;
  // El identificador se calcula con los VALORES CRUDOS de la descripcion, no
  // con la vigencia ya normalizada. Motivo: si se derivara de la vigencia
  // normalizada, cambiar un parametro del motor (por ejemplo la granularidad
  // temporal) cambiaria todos los identificadores y seria imposible comparar
  // dos configuraciones registro a registro. El identificador describe el DATO
  // DE ENTRADA, no como lo interpreta esta ejecucion.
  const { id, origen: origenId, huellaContenido } = calcularId(
    {
      contrato: campos.contrato, frente, tipoCierre,
      direccion: campos.direccion,
      inicio: campos.fecha_inicio, fin: campos.fecha_fin,
    },
    pm.geometria,
    pm.idExplicito
  );

  return {
    id,
    origenId,
    huellaContenido,
    origenArchivo: pm.origen,
    indiceEnArchivo: pm.indice,
    carpeta: pm.carpeta,
    frente: frente || null,
    contrato: campos.contrato ?? null,
    contratista: campos.contratista ?? null,
    proyecto: campos.proyecto ?? null,
    municipio: campos.municipio ?? null,
    direccion: campos.direccion ?? null,
    tipoCierre,
    vigencia,
    geometria: pm.geometria ?? null,
    tipoGeometria: pm.geometria?.type ?? null,
    caja: caja(pm.geometria),
    tieneGeometria,
    analizable: tieneGeometria && vigencia.valida && !!campos.contrato,
    descripcionEraHtml: eraHtml,
    duplicadoExacto: false,
    idRepetidoEnOrigen: false,
    avisos,
  };
}

/** Resumen de calidad de un conjunto de registros, para mostrar al usuario. */
export function resumenCalidad(registros) {
  const r = {
    total: registros.length,
    analizables: 0,
    sinGeometria: 0,
    sinContrato: 0,
    sinVigenciaValida: 0,
    sinMunicipio: 0,
    sinNombre: 0,
    duplicadosExactos: 0,
    conAvisos: 0,
    porTipoGeometria: {},
    porTipoCierre: {},
    porContrato: {},
    avisosFrecuentes: {},
  };
  for (const x of registros) {
    if (x.analizable) r.analizables++;
    if (!x.tieneGeometria) r.sinGeometria++;
    if (!x.contrato) r.sinContrato++;
    if (!x.vigencia.valida) r.sinVigenciaValida++;
    if (!x.municipio) r.sinMunicipio++;
    if (!x.frente) r.sinNombre++;
    if (x.duplicadoExacto) r.duplicadosExactos++;
    if (x.avisos.length) r.conAvisos++;
    const tg = x.tipoGeometria ?? '(sin geometria)';
    r.porTipoGeometria[tg] = (r.porTipoGeometria[tg] ?? 0) + 1;
    const tc = x.tipoCierre ?? '(sin tipo)';
    r.porTipoCierre[tc] = (r.porTipoCierre[tc] ?? 0) + 1;
    const co = x.contrato ?? '(sin contrato)';
    r.porContrato[co] = (r.porContrato[co] ?? 0) + 1;
    for (const a of x.avisos) {
      const clave = a.replace(/"[^"]*"/g, '"..."').replace(/\d+/g, 'N');
      r.avisosFrecuentes[clave] = (r.avisosFrecuentes[clave] ?? 0) + 1;
    }
  }
  return r;
}
