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

import { leerInstante, formatear, inicioDelDiaDeclarado, MS_DIA, MS_MINUTO } from './instante.js';

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
  //
  // Se usa el DIA DECLARADO en el texto, no el dia al que apunta el instante
  // normalizado. La diferencia importa con 24:00:00: "2026-03-01 24:00:00" es
  // el final del 1 de marzo, asi que en granularidad de dia su dia es el 1,
  // no el 2. Es tambien lo que hacia el legado, que leia la fecha del texto.
  if (opciones.granularidadTemporal === 'dia') {
    const dIni = inicioDelDiaDeclarado(ini.diaDeclarado);
    const dFin = inicioDelDiaDeclarado(fin.diaDeclarado);
    if (msIni !== null && dIni !== null) msIni = dIni;
    if (msFin !== null && dFin !== null) msFin = dFin + MS_DIA - 1000;
  }

  // Fin inclusivo: lleva el fin al ultimo instante de su dia, replicando el
  // criterio legado para las vigencias cuya hora de fin es exactamente 00:00.
  //
  // NO se aplica cuando el fin venia escrito como 24:00:00: eso YA significa
  // "final de ese dia" y volver a extenderlo regalaria un dia entero. Era el
  // defecto reportado: "2026-03-01 24:00:00" acababa en "2026-03-02 23:59:59".
  if (opciones.granularidadTemporal !== 'dia' &&
      opciones.finInclusivoDiaCompleto &&
      msFin !== null &&
      fin.origenHora !== 'medianoche24') {
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
    estadoHoraInicio: ini.estadoHora, estadoHoraFin: fin.estadoHora,
    origenHoraInicio: ini.origenHora, origenHoraFin: fin.origenHora,
    diaDeclaradoInicio: ini.diaDeclarado, diaDeclaradoFin: fin.diaDeclarado,
    finExtendidoADiaCompleto: finExtendido,
    valida, avisos,
  };
}

/**
 * Hechos del traslape entre dos vigencias. No clasifica nada.
 *
 * DEFINICION EXACTA DE LA REGLA, identica en codigo, pruebas, documentacion y
 * texto de la interfaz:
 *
 *   Hay traslape cuando la coincidencia dura MAS DE CERO
 *   y AL MENOS los N minutos exigidos.
 *
 *   es decir:   duracion > 0   Y   duracion >= N
 *
 * Con el valor aprobado por defecto N = 0 la regla se reduce a "duracion > 0":
 * cualquier coincidencia real cuenta, y dos vigencias que solo se tocan en un
 * instante NO traslapan (se marcan aparte como `contiguas`).
 *
 * Con N = 120, dos vigencias que coincidan exactamente 120 minutos SI traslapan,
 * porque se exige "al menos", no "mas de".
 *
 * @param {object} v1
 * @param {object} v2
 * @param {{toleranciaMinutos?: number}} [opciones] minutos minimos exigidos; por defecto 0
 */
export function traslape(v1, v2, opciones = {}) {
  const minimoMs = (opciones.toleranciaMinutos ?? 0) * MS_MINUTO;
  if (!v1.valida || !v2.valida) {
    return {
      hayTraslape: false, contiguas: false, evaluable: false,
      inicioMs: null, finMs: null, inicio: null, fin: null,
      duracionMs: 0, duracionDias: 0, duracionHoras: 0,
      minimoExigidoMinutos: minimoMs / MS_MINUTO,
      motivo: 'alguna de las dos vigencias no tiene fechas utilizables',
    };
  }
  const ini = Math.max(v1.inicioMs, v2.inicioMs);
  const fin = Math.min(v1.finMs, v2.finMs);
  const bruto = fin - ini;

  const hay = bruto > 0 && bruto >= minimoMs;
  // Contiguas significa exactamente eso: una termina en el mismo instante en
  // que la otra empieza. No depende del minimo exigido.
  const contiguas = bruto === 0;

  let motivo = null;
  if (!hay) {
    if (contiguas) motivo = 'las vigencias solo se tocan en un instante';
    else if (bruto < 0) motivo = 'no coinciden en el tiempo';
    else motivo = `coinciden ${Math.round(bruto / MS_MINUTO)} min, menos de los ${minimoMs / MS_MINUTO} exigidos`;
  }

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
    minimoExigidoMinutos: minimoMs / MS_MINUTO,
    motivo,
  };
}
