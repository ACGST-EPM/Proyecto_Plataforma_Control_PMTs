/**
 * PROYECTOS `.pmt.json` — guardar y volver a abrir un analisis.
 *
 * POR QUE
 * Sin esto el producto condena a la usuaria a volver a buscar y arrastrar los
 * ocho KMZ cada vez que abre la aplicacion, y a perder los filtros que tenia
 * puestos. Un proyecto guarda el estado completo en UN archivo que ella maneja
 * como cualquier otro documento: lo guarda donde quiera, lo comparte por correo
 * o lo deja en una carpeta del equipo.
 *
 * QUE GUARDA Y QUE NO
 * Guarda los TRAZADOS YA NORMALIZADOS, no los KMZ originales: pesa mucho menos
 * y se abre al instante. Guarda tambien la configuracion del analisis, los
 * filtros y los diagnosticos, de modo que al abrirlo se ve exactamente lo mismo
 * que se veia al guardarlo.
 *
 * NO guarda: contrasenas, claves, direcciones de servidores internos ni nada
 * que no viniera dentro de los propios KMZ. Es un archivo con los mismos datos
 * operativos que los KMZ de entrada, asi que se custodia igual que ellos: NO se
 * sube al repositorio publico.
 *
 * VERSIONADO
 * Todo proyecto lleva `esquema`. Al abrir se valida, y si el archivo es de una
 * version mas nueva que la que entiende esta aplicacion se dice claramente en
 * vez de intentar adivinar. Es lo que permite cambiar el formato mas adelante
 * sin dejar inservibles los proyectos ya guardados.
 */

export const ESQUEMA = 1;
export const EXTENSION = '.pmt.json';
const MARCA = 'plataforma-pmt-epm';

/** Construye el objeto de proyecto a partir del estado actual. */
export function crearProyecto({ filas, relaciones, archivos, config, filtros, nombre }) {
  return {
    marca: MARCA,
    esquema: ESQUEMA,
    nombre: (nombre ?? '').trim() || 'Proyecto PMT',
    creado: new Date().toISOString(),
    aplicacion: 'Plataforma de Control y Articulacion de PMTs',
    config,
    archivos: (archivos ?? []).map((a) => ({
      nombre: a.nombre,
      estadoLectura: a.estadoLectura ?? (a.ok === false ? 'fallida' : 'completa'),
      placemarks: a.placemarks ?? 0,
      errores: a.errores ?? [],
      motivosCobertura: a.motivosCobertura ?? [],
      avisos: a.avisos ?? [],
    })),
    filtros: filtros ?? null,
    // Los trazados normalizados. La geometria va tal cual (GeoJSON estandar).
    trazados: (filas ?? []).map((x) => ({
      id: x.id, frente: x.frente, contrato: x.contrato, contratista: x.contratista,
      proyecto: x.proyecto, municipio: x.municipio, direccion: x.direccion,
      tipoCierre: x.tipoCierre, inicio: x.inicio, fin: x.fin,
      inicioMs: x.inicioMs, finMs: x.finMs, vigenciaValida: x.vigenciaValida,
      tipoGeometria: x.tipoGeometria, tieneGeometria: x.tieneGeometria,
      analizable: x.analizable, origenArchivo: x.origenArchivo, carpeta: x.carpeta,
      avisos: x.avisos ?? [], geometria: x.geometria,
    })),
    relaciones: relaciones ?? [],
  };
}

export function serializar(proyecto) {
  return JSON.stringify(proyecto, null, 1);
}

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Lee y VALIDA un proyecto. Nunca lanza: devuelve el motivo por escrito.
 * Es la puerta por la que entra un archivo que alguien pudo editar a mano.
 */
export function leerProyecto(texto) {
  let d;
  try {
    d = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch (e) {
    return { ok: false, motivo: 'El archivo no es un proyecto valido: no se pudo leer su contenido.' };
  }
  if (!esObjeto(d)) return { ok: false, motivo: 'El archivo no contiene un proyecto.' };
  if (d.marca !== MARCA) {
    return { ok: false, motivo: 'Este archivo no es un proyecto de la Plataforma de PMTs.' };
  }
  if (!Number.isInteger(d.esquema)) {
    return { ok: false, motivo: 'El proyecto no dice con que version se guardo.' };
  }
  if (d.esquema > ESQUEMA) {
    return {
      ok: false,
      motivo: `Este proyecto se guardo con una version mas reciente de la aplicacion ` +
        `(formato ${d.esquema}; esta entiende hasta el ${ESQUEMA}). Actualice la aplicacion para abrirlo.`,
    };
  }
  if (!Array.isArray(d.trazados)) {
    return { ok: false, motivo: 'El proyecto no contiene ningun trazado.' };
  }

  // Saneado: se descarta lo que no encaje, en vez de dejarlo entrar a medias.
  const avisos = [];
  const trazados = [];
  for (const t of d.trazados) {
    if (!esObjeto(t) || typeof t.id !== 'string') { avisos.push('Se descarto un trazado sin identificador.'); continue; }
    if (t.geometria !== null && t.geometria !== undefined && !esObjeto(t.geometria)) {
      avisos.push(`El trazado "${t.frente ?? t.id}" traia una geometria ilegible y se descarto.`);
      t.geometria = null;
    }
    trazados.push({ ...t, avisos: Array.isArray(t.avisos) ? t.avisos : [] });
  }
  if (!trazados.length) return { ok: false, motivo: 'El proyecto no contiene ningun trazado utilizable.' };

  const relaciones = Array.isArray(d.relaciones) ? d.relaciones.filter(esObjeto) : [];
  if (Array.isArray(d.relaciones) && relaciones.length !== d.relaciones.length) {
    avisos.push('Se descartaron relaciones con formato incorrecto.');
  }

  return {
    ok: true,
    proyecto: {
      nombre: typeof d.nombre === 'string' ? d.nombre : 'Proyecto PMT',
      creado: typeof d.creado === 'string' ? d.creado : null,
      esquema: d.esquema,
      config: esObjeto(d.config) ? d.config : {},
      archivos: Array.isArray(d.archivos) ? d.archivos.filter(esObjeto) : [],
      filtros: esObjeto(d.filtros) ? d.filtros : null,
      trazados,
      relaciones,
    },
    avisos,
  };
}

/** Nombre de archivo sugerido, sin caracteres que molesten en Windows. */
export function nombreArchivo(nombre) {
  const limpio = String(nombre ?? 'Proyecto PMT').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Proyecto PMT';
  return `${limpio} ${new Date().toISOString().slice(0, 10)}${EXTENSION}`;
}
