/**
 * DATOS MAESTROS — lo que EPM gobierna y el contratista no escribe.
 *
 * ══ EL PROBLEMA QUE RESUELVE ══════════════════════════════════════════════
 *
 * En cuanto se admite texto libre para el nombre de una organización, aparecen
 * cuatro organizaciones donde hay una:
 *
 *     MEXICHEM · Mexichem · MEXICHEM S.A. · MEXICHEM SAS
 *
 * Y entonces «cuántos PMT tiene este contratista» deja de tener respuesta. No
 * es un problema de disciplina de quien escribe: es un problema de diseño. Si
 * un dato se puede derivar, no se pide.
 *
 * ══ LA REGLA ══════════════════════════════════════════════════════════════
 *
 *   EPM GOBIERNA          contratos, y de cada contrato: contratista, proyecto
 *                         y municipios donde puede operar. También la lista
 *                         cerrada de tipos de cierre.
 *
 *   EL CONTRATISTA APORTA lo que solo él sabe: la geometría del cierre, el
 *                         nombre del frente, la dirección, la vigencia, el tipo
 *                         de cierre (eligiéndolo, no escribiéndolo) y los
 *                         códigos documentales cuando existan.
 *
 * Elegir el contrato DETERMINA contratista y proyecto: no se preguntan. Eso
 * elimina la clase entera de error, no un caso concreto.
 *
 * ══ LO QUE ESTO NO ES ═════════════════════════════════════════════════════
 *
 * NO es control de acceso. Que la interfaz no deje escribir un contratista no
 * impide que alguien edite el KMZ a mano. Es gobierno del DATO, no seguridad:
 * sirve para que la información que entra por el camino normal sea coherente.
 * El control real de quién puede hacer qué necesita identidad corporativa y
 * está documentado como dependencia, no simulado aquí.
 */

/** Versión del formato del catálogo. Se guarda con él. */
export const ESQUEMA_CATALOGO = 1;

/** Tipos de cierre: lista CERRADA del proyecto. Son exactamente tres. */
export const TIPOS_CIERRE_CANONICOS = Object.freeze(['total', 'parcial', 'ingreso y salida']);

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Normaliza un nombre para COMPARAR, no para guardar.
 *
 * Quita acentos, mayúsculas, puntuación y las formas societarias, que son lo
 * que más varía: «MEXICHEM S.A.», «Mexichem SAS» y «MEXICHEM» dan la misma
 * clave. Se usa solo para detectar duplicados y avisar; el valor que se guarda
 * es siempre el que EPM escribió en el catálogo.
 */
export function claveDeNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?a\.?s?|ltda|e\.?s\.?p|s\.?a\.?s\.?|sas|sa|consorcio|union temporal|ut)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Lee y valida un catálogo de contratos.
 *
 * Nunca lanza. Un catálogo con problemas NO se rechaza entero: se conserva lo
 * utilizable y se dice qué se descartó. Quedarse sin catálogo por una fila mala
 * dejaría a la usuaria sin poder crear nada.
 */
export function leerCatalogo(datos) {
  let d;
  try { d = typeof datos === 'string' ? JSON.parse(datos) : datos; }
  catch { return { ok: false, motivo: 'El catálogo no se pudo leer: no es un JSON válido.' }; }

  // Se admite tanto la forma antigua (un array suelto, que es lo que hay hoy en
  // `contratos_db.json`) como la nueva con metadatos. Romper el archivo que ya
  // existe para estrenar un formato seria gratuito.
  const lista = Array.isArray(d) ? d : Array.isArray(d?.contratos) ? d.contratos : null;
  if (!lista) return { ok: false, motivo: 'El catálogo no contiene una lista de contratos.' };

  const avisos = [];
  const contratos = [];
  const vistos = new Set();
  const porContratista = new Map();

  for (const [i, c] of lista.entries()) {
    const contrato = texto(c?.contrato).toUpperCase();
    if (!contrato) { avisos.push(`Fila ${i + 1}: sin código de contrato; se descarta.`); continue; }
    if (vistos.has(contrato)) {
      avisos.push(`El contrato ${contrato} aparece más de una vez; se conserva el primero.`);
      continue;
    }
    const contratista = texto(c?.contratista);
    const proyecto = texto(c?.proyecto);
    if (!contratista) avisos.push(`${contrato}: sin contratista. No se podrá derivar al crear un PMT.`);
    if (!proyecto) avisos.push(`${contrato}: sin proyecto.`);

    const municipios = Array.isArray(c?.municipios)
      ? c.municipios.map(texto).filter(Boolean)
      : texto(c?.municipio) ? [texto(c.municipio)] : [];
    if (!municipios.length) avisos.push(`${contrato}: sin municipios declarados.`);

    vistos.add(contrato);
    contratos.push({ contrato, contratista, proyecto, municipios });

    // Detección de nombres que probablemente son la misma organización.
    const k = claveDeNombre(contratista);
    if (k) {
      if (!porContratista.has(k)) porContratista.set(k, new Set());
      porContratista.get(k).add(contratista);
    }
  }

  // AVISO, NO CORRECCION. Unificar nombres por nuestra cuenta seria decidir por
  // EPM que dos organizaciones son la misma, y eso no nos corresponde.
  const posiblesDuplicados = [];
  for (const [k, formas] of porContratista) {
    if (formas.size > 1) {
      posiblesDuplicados.push({ clave: k, formas: [...formas].sort() });
      avisos.push(`«${[...formas].join('», «')}» parecen la misma organización escrita de ` +
        `${formas.size} maneras. Conviene unificarlas en el catálogo.`);
    }
  }

  if (!contratos.length) return { ok: false, motivo: 'El catálogo no contiene ningún contrato utilizable.' };
  return {
    ok: true,
    catalogo: {
      esquema: ESQUEMA_CATALOGO,
      contratos,
      tiposCierre: [...TIPOS_CIERRE_CANONICOS],
      actualizado: texto(d?.actualizado) || null,
    },
    avisos,
    posiblesDuplicados,
  };
}

/** Datos que quedan DETERMINADOS al elegir un contrato. */
export function derivarDeContrato(catalogo, contrato) {
  const c = catalogo?.contratos?.find((x) => x.contrato === String(contrato ?? '').toUpperCase());
  if (!c) return null;
  return { contratista: c.contratista, proyecto: c.proyecto, municipios: [...c.municipios] };
}

/** Opciones para los menús: nunca texto libre donde hay catálogo. */
export function opcionesDeCatalogo(catalogo) {
  return {
    contratos: (catalogo?.contratos ?? []).map((c) => c.contrato).sort(),
    tiposCierre: catalogo?.tiposCierre ?? [...TIPOS_CIERRE_CANONICOS],
  };
}

/** Serializa el catálogo con sus metadatos, para que EPM lo publique. */
export function serializarCatalogo(catalogo) {
  return JSON.stringify({
    esquema: ESQUEMA_CATALOGO,
    actualizado: new Date().toISOString().slice(0, 10),
    nota: 'Catalogo maestro gobernado por EPM. Los contratistas NO lo editan: ' +
      'eligen de el. Ver app/nucleo/catalogos.js.',
    contratos: catalogo.contratos,
  }, null, 1);
}
