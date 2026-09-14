/**
 * VALIDACIÓN AL CAPTURAR — prevenir el error en el origen, no detectarlo después.
 *
 * ══ TRES NIVELES, Y LA DIFERENCIA IMPORTA ═════════════════════════════════
 *
 *   ERROR        impide guardar. Sin esto, el PMT no significa nada: no se
 *                sabe de qué contrato es, cuándo ocurre o dónde está.
 *   ADVERTENCIA  deja guardar y pide revisión. El dato es utilizable pero algo
 *                no cuadra, y quien captura sabe cosas que la herramienta no.
 *   INFORMACIÓN  solo orienta. No pide nada.
 *
 * Confundirlos tiene un coste concreto: si todo es error, la gente busca la
 * manera de saltárselo —escribiendo cualquier cosa en la casilla— y acabamos
 * con datos peores que si no hubiéramos validado. Si todo es advertencia, nadie
 * las lee.
 *
 * ══ LO QUE NO SE VALIDA, A PROPÓSITO ══════════════════════════════════════
 *
 * No se inventan restricciones jurídicas ni operativas: no sabemos cuánto puede
 * durar un PMT, ni si una obra puede empezar en domingo, ni qué formato tiene
 * un código de resolución. Inventarlas rechazaría datos legítimos y haría
 * desconfiar del resto de avisos.
 */
import { normalizarInstante } from './tiempo.js';
import { validarGeometria } from './geojson.js';
import { derivarDeContrato, TIPOS_CIERRE_CANONICOS } from './catalogos.js';
import { normalizarCodigoDocumental, DOCUMENTOS } from '../../motor/src/modelo/documental.js';

export const NIVEL = Object.freeze({
  ERROR: 'error',
  ADVERTENCIA: 'advertencia',
  INFORMACION: 'informacion',
});

const aviso = (nivel, campo, texto, ayuda = null) => ({ nivel, campo, texto, ayuda });

/**
 * Valida un PMT en captura.
 *
 * @param {object} pmt        lo que hay escrito en el formulario
 * @param {object} catalogo   datos maestros de EPM
 * @param {{existentes?:Array}} [contexto]  PMT ya cargados, para detectar duplicados
 * @returns {{avisos:Array, sePuedeGuardar:boolean, errores:number, advertencias:number}}
 */
export function validarPmt(pmt, catalogo, contexto = {}) {
  const a = [];
  const t = (v) => (typeof v === 'string' ? v.trim() : '');

  /* ── 1 · Identidad: de qué contrato es ── */
  const contrato = t(pmt.contrato).toUpperCase();
  if (!contrato) {
    a.push(aviso(NIVEL.ERROR, 'contrato', 'Elija el contrato.',
      'Sin contrato, el PMT no puede entrar en el análisis de interferencias entre contratos.'));
  } else {
    const d = derivarDeContrato(catalogo, contrato);
    if (!d) {
      a.push(aviso(NIVEL.ERROR, 'contrato', `El contrato «${contrato}» no está en el catálogo de EPM.`,
        'El catálogo lo mantiene EPM. Si el contrato es nuevo, hay que añadirlo allí primero.'));
    } else {
      // Contratista y proyecto NO se piden: se derivan. Si llegan escritos y no
      // coinciden, manda el catálogo, y se dice.
      for (const [campo, esperado] of [['contratista', d.contratista], ['proyecto', d.proyecto]]) {
        const dado = t(pmt[campo]);
        if (dado && esperado && dado !== esperado) {
          a.push(aviso(NIVEL.ADVERTENCIA, campo,
            `Se escribió «${dado}» pero el catálogo dice «${esperado}» para ${contrato}.`,
            'Manda el catálogo de EPM. Se guardará el valor del catálogo.'));
        }
      }
      const mun = t(pmt.municipio);
      if (mun && d.municipios.length && !d.municipios.includes(mun)) {
        a.push(aviso(NIVEL.ADVERTENCIA, 'municipio',
          `${contrato} no tiene declarado el municipio «${mun}».`,
          `En el catálogo figura: ${d.municipios.join(', ')}. Puede ser correcto si la obra se amplió.`));
      }
    }
  }

  /* ── 2 · Qué es ── */
  if (!t(pmt.frente)) {
    a.push(aviso(NIVEL.ERROR, 'frente', 'Escriba el nombre del frente.',
      'Es como se identifica este PMT en las tablas y en el informe.'));
  }
  const tipo = t(pmt.tipoCierre).toLowerCase();
  if (!tipo) {
    a.push(aviso(NIVEL.ERROR, 'tipoCierre', 'Elija el tipo de cierre.'));
  } else if (!TIPOS_CIERRE_CANONICOS.includes(tipo)) {
    a.push(aviso(NIVEL.ERROR, 'tipoCierre', `«${pmt.tipoCierre}» no es un tipo de cierre válido.`,
      `Los tipos son exactamente tres: ${TIPOS_CIERRE_CANONICOS.join(', ')}.`));
  }
  if (!t(pmt.direccion)) {
    a.push(aviso(NIVEL.ADVERTENCIA, 'direccion', 'No se escribió la dirección.',
      'Sin ella, quien lea el informe tiene que ir al mapa para saber dónde es.'));
  }

  /* ── 3 · Cuándo ── */
  const ini = normalizarInstante(pmt.inicio, { horaPorDefecto: '00:00:00' });
  const fin = normalizarInstante(pmt.fin, { horaPorDefecto: '23:59:59' });
  if (!ini.ok) {
    a.push(aviso(NIVEL.ERROR, 'inicio', 'La fecha de inicio no es válida.', ini.motivo));
  }
  if (!fin.ok) {
    a.push(aviso(NIVEL.ERROR, 'fin', 'La fecha de fin no es válida.', fin.motivo));
  }
  if (ini.ok && fin.ok) {
    if (fin.ms < ini.ms) {
      a.push(aviso(NIVEL.ERROR, 'fin', 'La fecha de fin es anterior a la de inicio.'));
    } else if (fin.ms === ini.ms) {
      a.push(aviso(NIVEL.ADVERTENCIA, 'fin', 'El inicio y el fin son el mismo instante.',
        'Una vigencia de duración cero no se solapa con ninguna otra.'));
    }
    // INFORMACION, no advertencia: una obra puede durar dos años y no nos
    // corresponde decir cuanto es «mucho».
    const dias = Math.round((fin.ms - ini.ms) / 86400000);
    if (dias > 365) {
      a.push(aviso(NIVEL.INFORMACION, 'fin', `La vigencia dura ${dias} días (más de un año).`));
    }
  }

  /* ── 4 · Dónde ── */
  const g = validarGeometria(pmt.geometria);
  if (!pmt.geometria) {
    a.push(aviso(NIVEL.ERROR, 'geometria', 'Dibuje el trazado del cierre en el mapa.',
      'Sin geometría, el PMT no puede compararse con ningún otro.'));
  } else if (!g.ok) {
    a.push(aviso(NIVEL.ERROR, 'geometria', 'La geometría no es válida.', g.motivo));
  } else if (pmt.geometria.type === 'Point' && tipo && tipo !== 'ingreso y salida') {
    // Es una observacion util, no un error: un punto puede ser legitimo.
    a.push(aviso(NIVEL.ADVERTENCIA, 'geometria',
      'El cierre es de tipo «' + tipo + '» pero se dibujó un punto.',
      'Un cierre total o parcial suele ser un tramo de vía (una línea). Un punto es ' +
      'lo habitual en «ingreso y salida».'));
  }

  /* ── 5 · Documentos ── */
  for (const d of DOCUMENTOS) {
    const r = normalizarCodigoDocumental(pmt[d.clave], d.etiqueta);
    if (r.aviso) {
      a.push(aviso(NIVEL.ADVERTENCIA, d.clave, r.aviso,
        'Deje la casilla vacía: el estado saldrá «Pendiente», que es lo que significa.'));
    }
  }
  const sinDocs = DOCUMENTOS.every((d) => !normalizarCodigoDocumental(pmt[d.clave]).codigo);
  if (sinDocs) {
    a.push(aviso(NIVEL.INFORMACION, 'resolucionPmt',
      'Todavía no hay ningún código documental.',
      'En un PMT recién creado es lo normal. Se pueden añadir después.'));
  }

  /* ── 6 · Duplicados ── */
  const existentes = contexto.existentes ?? [];
  const igual = existentes.find((x) =>
    x.id !== pmt.id &&
    String(x.contrato ?? '').toUpperCase() === contrato &&
    t(x.frente).toLowerCase() === t(pmt.frente).toLowerCase() &&
    x.inicio === (ini.ok ? ini.texto : pmt.inicio));
  if (igual) {
    a.push(aviso(NIVEL.ADVERTENCIA, 'frente',
      `Ya hay un PMT del contrato ${contrato} con el frente «${pmt.frente}» y la misma fecha de inicio.`,
      'Puede ser una revigencia legítima. Si no lo es, revise antes de guardar.'));
  }

  const errores = a.filter((x) => x.nivel === NIVEL.ERROR).length;
  const advertencias = a.filter((x) => x.nivel === NIVEL.ADVERTENCIA).length;
  return { avisos: a, errores, advertencias, sePuedeGuardar: errores === 0 };
}

/**
 * Aplica el catálogo al PMT: rellena lo que se DERIVA del contrato.
 *
 * Se hace al guardar, no al escribir, para que el valor guardado sea siempre el
 * del catálogo aunque alguien haya tocado el formulario.
 */
export function aplicarCatalogo(pmt, catalogo) {
  const d = derivarDeContrato(catalogo, pmt.contrato);
  if (!d) return { ...pmt };
  return { ...pmt, contratista: d.contratista, proyecto: d.proyecto };
}
