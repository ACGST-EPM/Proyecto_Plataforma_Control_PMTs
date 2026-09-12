/**
 * IDENTIDAD DE LO QUE PRODUJO UN RESULTADO.
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * Dentro de seis meses alguien mirará un PDF o un CSV de esta plataforma y
 * preguntará: «¿qué versión produjo esto, y con qué reglas?». Hasta ahora la
 * respuesta vivía en una conversación. Eso no es trazabilidad.
 *
 * Aquí se declaran las TRES versiones que importan, y son tres porque cambian
 * por motivos distintos y a ritmos distintos:
 *
 *   VERSION_APP      lo que ve y hace la persona: pantallas, filtros, informe.
 *                    Puede subir sin que cambie ni una cifra.
 *   VERSION_MOTOR    la implementación del cálculo: cómo se mide y se compara.
 *                    Puede subir por una corrección interna que no mueve cifras.
 *   VERSION_REGLAS   lo que se considera una interferencia: umbral, criterio
 *                    temporal, exclusiones. **Solo sube si cambian las cifras.**
 *                    Vive en el motor (`motor/src/nucleo/config.js`) porque es
 *                    el motor quien las aplica.
 *
 * ══ CÓMO SE NUMERAN (versionado semántico, con un significado concreto) ════
 *
 *   MAYOR  cambia lo que la herramienta considera una interferencia, o deja de
 *          poder abrirse un archivo guardado con la versión anterior.
 *   MENOR  capacidad nueva que no cambia ninguna cifra ya publicada.
 *   PARCHE corrección que no cambia ninguna cifra ya publicada.
 *
 * Regla práctica para no equivocarse: **si una cifra publicada se mueve, sube
 * `VERSION_REGLAS`**, y entonces la baseline de regresión debe actualizarse a
 * la vez, con su explicación. Si ninguna cifra se mueve, `VERSION_REGLAS` NO se
 * toca, por mucho código que haya cambiado.
 */
import { VERSION_REGLAS, REGLAS_CANONICAS } from '../../motor/src/nucleo/config.js';
import { ESQUEMA as ESQUEMA_PROYECTO } from './proyecto.js';

/** Versión de la aplicación (interfaz, informe, exportaciones). */
export const VERSION_APP = '2.4.0';

/** Versión del motor de cálculo (implementación). */
export const VERSION_MOTOR = '1.2.0';

export { VERSION_REGLAS, REGLAS_CANONICAS, ESQUEMA_PROYECTO };

/**
 * Sello de procedencia: lo que hay que saber para reproducir un resultado.
 *
 * Va en el proyecto, en el informe y en las exportaciones. Es deliberadamente
 * corto: si ocupa media página nadie lo lee, y si falta un dato no sirve.
 *
 * NO lleva nada personal ni ninguna dirección interna: solo versiones, fecha y
 * los parámetros del análisis.
 *
 * @param {object} config configuración del análisis con la que se calculó
 * @param {{alcance?:string, generadoEn?:string}} [extra]
 */
export function selloProcedencia(config, extra = {}) {
  return {
    aplicacion: VERSION_APP,
    motor: VERSION_MOTOR,
    reglas: VERSION_REGLAS,
    esquemaProyecto: ESQUEMA_PROYECTO,
    generadoEn: extra.generadoEn ?? new Date().toISOString(),
    alcance: extra.alcance ?? null,
    parametros: {
      umbralMetros: config?.umbralMetros ?? null,
      toleranciaMinutos: config?.toleranciaMinutos ?? null,
      granularidadTemporal: config?.granularidadTemporal ?? null,
      excluirMismoContrato: config?.excluirMismoContrato ?? null,
      modoDistancia: config?.modoDistancia ?? null,
      dominioEspacialKm: REGLAS_CANONICAS.dominioEspacialKm,
    },
  };
}

/**
 * El mismo sello en UNA LÍNEA, para encabezar un CSV o una exportación donde no
 * cabe un objeto. Sin caracteres que rompan un CSV.
 */
export function selloEnUnaLinea(config, extra = {}) {
  const s = selloProcedencia(config, extra);
  const p = s.parametros;
  return `Plataforma de PMTs v${s.aplicacion} · motor v${s.motor} · reglas v${s.reglas} · ` +
    `umbral ${p.umbralMetros} m · tolerancia ${p.toleranciaMinutos} min · ${p.granularidadTemporal} · ` +
    `${p.excluirMismoContrato ? 'excluye mismo contrato' : 'NO excluye mismo contrato'} · ` +
    `generado ${s.generadoEn.slice(0, 19).replace('T', ' ')} UTC` +
    (s.alcance ? ` · ${s.alcance}` : '');
}
