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
      // ══ CREAR NO ES LO MISMO QUE REACTIVAR O EDITAR ═══════════════════════
      //
      // Al CREAR, el contrato se ELIGE de una lista: que no esté en el catálogo
      // significa que se ha escrito algo que EPM no reconoce, y eso es un error
      // que hay que atajar en el origen. Ahí sí bloquea.
      //
      // Al REACTIVAR o EDITAR, el contrato YA ES UN HECHO: vino dentro de un
      // KMZ y el PMT existe. Bloquear aquí no impide un dato malo —el dato ya
      // está— sino una operación legítima. Medido: con el catálogo actual (3
      // contratos) y los KMZ reales, NINGÚN PMT sería reactivable. La
      // herramienta quedaría inservible para lo que se acaba de construir.
      //
      // Así que se avisa, con el mismo texto, y se deja seguir. Es exactamente
      // la diferencia entre ERROR y ADVERTENCIA: «no se puede trabajar con
      // esto» frente a «esto conviene arreglarlo, y usted sabe cosas que yo no».
      const preexistente = contexto.reactivando || contexto.editando;
      a.push(aviso(preexistente ? NIVEL.ADVERTENCIA : NIVEL.ERROR, 'contrato',
        `El contrato «${contrato}» no está en el catálogo de EPM.`,
        preexistente
          ? 'Este PMT ya existía con ese contrato, así que se puede continuar. Conviene añadirlo al ' +
            'catálogo maestro para que contratista y proyecto se deriven solos en adelante.'
          : 'El catálogo lo mantiene EPM. Si el contrato es nuevo, hay que añadirlo allí primero.'));
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

/**
 * Construye la FILA de un PMT capturado en la plataforma.
 *
 * ══ POR QUÉ ESTÁ AQUÍ Y NO EN `app.js` ═════════════════════════════════════
 *
 * Estaba dentro de `incorporarPmt()`, pegada al DOM, y por eso no se podía
 * probar sin abrir un navegador. Justo lo que hace esta función —normalizar la
 * vigencia, derivar el estado documental, decidir si el PMT es analizable— es
 * lo que tiene que sobrevivir a guardar el proyecto y volver a abrirlo. Una
 * lógica que no se puede probar en Node es una lógica que se prueba tarde.
 *
 * Un PMT nacido dentro pasa por las MISMAS reglas que uno que llega en un KMZ:
 * no es un dato privilegiado y no se le perdona nada.
 *
 * @param {object} pmt        lo capturado (ya validado)
 * @param {object} catalogo   datos maestros; el catálogo manda sobre el formulario
 * @param {{normalizarVigencia:Function, ahora?:number}} servicios
 */
export function filaDePmtCreado(pmt, catalogo, { normalizarVigencia, ahora = Date.now() }) {
  const completo = aplicarCatalogo(pmt, catalogo);
  const vig = normalizarVigencia({ inicio: completo.inicio, fin: completo.fin });
  // Los códigos documentales vuelven a normalizarse aquí: si alguien llega por
  // otro camino que no sea el formulario, «Pendiente» tampoco entra como dato.
  const docs = {};
  for (const d of DOCUMENTOS) {
    docs[d.clave] = normalizarCodigoDocumental(completo[d.clave], d.etiqueta).codigo;
  }
  return {
    id: completo.id ?? `pmt_local_${ahora.toString(36)}`,
    frente: completo.frente, contrato: completo.contrato, contratista: completo.contratista,
    proyecto: completo.proyecto, municipio: completo.municipio || null,
    direccion: completo.direccion || null, tipoCierre: completo.tipoCierre,
    inicio: vig.inicio, fin: vig.fin, inicioMs: vig.inicioMs, finMs: vig.finMs,
    vigenciaValida: vig.valida, vigenciaEstado: vig.estado,
    geometria: completo.geometria, tipoGeometria: completo.geometria?.type ?? null,
    tieneGeometria: !!completo.geometria,
    analizable: !!completo.geometria && vig.valida && !!completo.contrato,
    origenArchivo: 'creado en la plataforma', carpeta: null,
    avisos: vig.avisos ?? [],
    duplicadoExacto: false, idRepetidoEnOrigen: false,
    ...docs,
  };
}
