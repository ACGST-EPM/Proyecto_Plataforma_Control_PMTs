/**
 * Vigencias y traslape temporal.
 *
 * REGLA APLICADA (y por qué):
 *   Dos vigencias se traslapan si  max(inicios) < min(fines) - tolerancia.
 *   Es decir, se exige traslape de DURACIÓN POSITIVA. Dos vigencias que solo
 *   se tocan en un instante (una termina justo cuando la otra empieza) NO se
 *   consideran traslapadas, pero se marcan aparte como `contiguas`, porque
 *   operativamente eso puede importar y no queremos perder el dato.
 *
 * El motor legado comparaba SOLO fechas y de forma inclusiva en ambos extremos
 * (inicio1 <= fin2 && inicio2 <= fin1), lo que equivale a tratar la fecha de
 * fin como el día completo. Ese comportamiento está disponible aquí mediante
 * la opción `finInclusivoDiaCompleto`, para poder comparar ambos criterios sin
 * tocar el cálculo.
 */

import { leerInstante, formatear, MS_DIA, MS_MINUTO } from './instante.js';

/**
 * Construye una vigencia a partir de los textos del KMZ.
 * @param {string} textoInicio
 * @param {string} textoFin
 * @param {{finInclusivoDiaCompleto?: boolean, granularidadTemporal?: 'instante'|'dia'}} [opciones]
 */
export function leerVigencia(textoInicio, textoFin, opciones = {}) {
  const ini = leerInstante(textoInicio, { horaPorDefecto: '00:00:00' });
  const fin = leerInstante(textoFin, { horaPorDefecto: '23:59:59' });
  const avisos = [
    ...ini.avisos.map((a) => `fecha_inicio: ${a}`),
    ...fin.avisos.map((a) => `fecha_fin: ${a}`),
  ];

  let msIni = ini.ms;
  let msFin = fin.ms;
  let finExtendido = false;

  // Granularidad 'dia': descarta la hora por completo y trata cada vigencia
  // como dias calendario completos. Es exactamente lo que hacia el motor
  // legado, y existe aqui solo para poder comparar ambos criterios.
  if (opciones.granularidadTemporal === 'dia') {
    if (msIni !== null) msIni = Math.floor(msIni / MS_DIA) * MS_DIA;
    if (msFin !== null) msFin = Math.floor(msFin / MS_DIA) * MS_DIA + MS_DIA - 1000;
  }
  if (opciones.granularidadTemporal !== 'dia' && opciones.finInclusivoDiaCompleto && msFin !== null) {
    // Lleva el fin al último instante de su día, replicando el criterio legado.
    const inicioDelDia = Math.floor(msFin / MS_DIA) * MS_DIA;
    if (msFin === inicioDelDia) { msFin = inicioDelDia + MS_DIA - 1000; finExtendido = true; }
  }

  let valida = msIni !== null && msFin !== null;
  if (valida && msFin < msIni) {
    avisos.push('fecha_fin anterior a fecha_inicio');
    valida = false;
  }
  return {
    inicioMs: msIni, finMs: msFin,
    inicio: formatear(msIni), fin: formatear(msFin),
    granularidad: opciones.granularidadTemporal ?? 'instante',
    tieneHoraInicio: ini.tieneHora, tieneHoraFin: fin.tieneHora,
    finExtendidoADiaCompleto: finExtendido,
    valida, avisos,
  };
}

/**
 * Hechos del traslape entre dos vigencias. No clasifica nada.
 * @param {object} v1
 * @param {object} v2
 * @param {{toleranciaMinutos?: number}} [opciones] tolerancia por defecto 0
 */
export function traslape(v1, v2, opciones = {}) {
  const tol = (opciones.toleranciaMinutos ?? 0) * MS_MINUTO;
  if (!v1.valida || !v2.valida) {
    return {
      hayTraslape: false, contiguas: false, evaluable: false,
      inicioMs: null, finMs: null, inicio: null, fin: null,
      duracionMs: 0, duracionDias: 0, duracionHoras: 0,
      motivo: 'alguna de las dos vigencias no tiene fechas utilizables',
    };
  }
  const ini = Math.max(v1.inicioMs, v2.inicioMs);
  const fin = Math.min(v1.finMs, v2.finMs);
  const bruto = fin - ini;
  const hay = bruto > tol;
  const contiguas = !hay && bruto >= -tol && bruto <= tol;
  return {
    hayTraslape: hay,
    contiguas,
    evaluable: true,
    inicioMs: hay ? ini : null,
    finMs: hay ? fin : null,
    inicio: hay ? formatear(ini) : null,
    fin: hay ? formatear(fin) : null,
    duracionMs: hay ? bruto : 0,
    // Días calendario cubiertos por el traslape, ambos extremos incluidos.
    duracionDias: hay ? Math.floor(fin / MS_DIA) - Math.floor(ini / MS_DIA) + 1 : 0,
    duracionHoras: hay ? Math.round((bruto / 3600000) * 100) / 100 : 0,
    motivo: hay ? null : (contiguas ? 'las vigencias solo se tocan en un instante' : 'no coinciden en el tiempo'),
  };
}
