/**
 * REPLICA DEL MOTOR LEGADO (proceso_pmt_qgis.py).
 *
 * ESTE ARCHIVO REPRODUCE ERRORES A PROPOSITO. No corrijas nada aqui.
 *
 * `proceso_pmt_qgis.py` permanece congelado como referencia y no se modifica.
 * Pero para poder comparar el motor nuevo contra el viejo sobre CUALQUIER
 * conjunto de KMZ - no solo sobre el CSV publicado una vez - hace falta poder
 * ejecutar el comportamiento viejo aqui. Eso es lo que hace esta replica.
 *
 * Fidelidad verificada: sobre los 8 KMZ reales de 01_KMZ_Entrada produce las
 * mismas 708 filas que el reporte_dinamico.csv publicado, sin una sola
 * diferencia. La prueba esta en test/replica-legado.test.mjs.
 *
 * Comportamientos del legado que se replican deliberadamente:
 *  1. Colchon de 0.0011 grados aplicado a AMBAS geometrias y luego cruce, lo
 *     que duplica el umbral efectivo (~243 m en lugar de los 120 m del nombre).
 *  2. Comparacion temporal solo por fecha, descartando la hora.
 *  3. Extremos temporales inclusivos.
 *  4. "Interferencia real" = cercania + traslape de fechas, sin comprobar
 *     nunca que las geometrias se toquen.
 *  5. Duracion del trazado con daysTo (un PMT de un dia son 0 dias) frente a
 *     daysTo+1 en las filas de interferencia.
 *  6. Clasificacion Diurno/Nocturno con la heuristica original.
 *  7. Filas de cercania con fechas "N/A" y municipio "Varios".
 *  8. Fechas inexistentes en el calendario tratadas como fecha ausente.
 */

const RE_FECHA = /\d{4}-\d{2}-\d{2}/;
const RE_HORA = /\d{2}:\d{2}(:\d{2})?/;

/** Equivale a la funcion ex() del script legado. */
export function ex(campo, texto) {
  const m = new RegExp(`${campo}:\\s*([^|]+)`, 'i').exec(texto ?? '');
  return m ? m[1].trim() : 'No definido';
}

export function extraerFechaYHora(texto) {
  if (!texto || texto === 'No definido') return ['N/A', ''];
  const t = String(texto).trim();
  const f = RE_FECHA.exec(t);
  const h = RE_HORA.exec(t);
  return [f ? f[0] : 'N/A', h ? h[0] : ''];
}

export function determinarHorario(horaI, horaF) {
  if (!horaI && !horaF) return '24 horas';
  const a = horaI ? parseInt(horaI.slice(0, 2), 10) : 0;
  const b = horaF ? parseInt(horaF.slice(0, 2), 10) : 23;
  if (Number.isNaN(a) || Number.isNaN(b)) return '24 horas';
  if ((a >= 18 && a <= 23) || (a >= 0 && a <= 3) || (b >= 18 && b <= 23) || (b >= 0 && b <= 4)) return 'Nocturno';
  if (a >= 4 && a <= 17) return 'Diurno';
  return '24 horas';
}

/** Equivale a QDate.fromString(s,'yyyy-MM-dd'): null si la fecha no existe. */
export function fechaLegado(s) {
  if (!s || s === 'N/A') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, Y, M, D] = m.map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  if (d.getUTCFullYear() !== Y || d.getUTCMonth() !== M - 1 || d.getUTCDate() !== D) return null;
  return d.getTime();
}

const MS_DIA = 86400000;
const dias = (a, b) => Math.round((b - a) / MS_DIA);

/** Colchon del legado, en grados. El bug esta en que se aplica a los dos lados. */
export const COLCHON_GRADOS = 0.0011;

function distPuntoSegmentoPlano(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = 0;
  if (L2 > 0) { t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; }
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function ccw(a, b, c) { return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]); }
function distSegSeg(p, q, r, s) {
  const dp = p[0] === q[0] && p[1] === q[1];
  const dr = r[0] === s[0] && r[1] === s[1];
  if (!dp && !dr && ccw(p, r, s) !== ccw(q, r, s) && ccw(p, q, r) !== ccw(p, q, s)) return 0;
  return Math.min(
    distPuntoSegmentoPlano(p, r, s), distPuntoSegmentoPlano(q, r, s),
    distPuntoSegmentoPlano(r, p, q), distPuntoSegmentoPlano(s, p, q)
  );
}
/**
 * Distancia EN GRADOS entre dos listas de vertices, tal y como la mediria el
 * cruce de buffers de QGIS. Se trabaja en grados, no en metros, porque el
 * colchon del legado es isotropo en grados.
 */
function distanciaGrados(A, B) {
  let min = Infinity;
  const na = Math.max(1, A.length - 1), nb = Math.max(1, B.length - 1);
  for (let i = 0; i < na; i++) {
    const p = A[i], q = A[i + 1] ?? A[i];
    for (let j = 0; j < nb; j++) {
      const r = B[j], s = B[j + 1] ?? B[j];
      const d = distSegSeg(p, q, r, s);
      if (d < min) min = d;
      if (min === 0) return 0;
    }
  }
  return min;
}

/** Vertices que el legado veria de una geometria (solo el primer Point/LineString). */
function verticesLegado(geom) {
  if (!geom) return [];
  if (geom.type === 'Point') return [geom.coordinates];
  if (geom.type === 'LineString') return geom.coordinates;
  if (geom.type === 'MultiPoint') return [geom.coordinates[0]];          // el legado tomaba solo la primera
  if (geom.type === 'MultiLineString') return geom.coordinates[0] ?? []; // idem
  if (geom.type === 'GeometryCollection') return verticesLegado(geom.geometries?.[0]);
  return []; // poligonos y demas: el legado los descartaba
}

/**
 * Ejecuta el analisis legado sobre placemarks ya leidos del KML.
 * @param {Array} placemarks salida de leerKml()
 * @returns {{filas:Array<Array<string>>, resumen:object}}
 */
export function analizarLegado(placemarks) {
  const filas = [];
  const frentes = [];

  for (const pm of placemarks) {
    const desc = pm.descripcion ?? '';
    const nombre = pm.nombre ?? 'None'; // el legado producia el texto "None" si faltaba
    const contrato = ex('contrato', desc);
    const contratista = ex('contratista', desc);
    const municipio = ex('municipio', desc);
    const tipoCierre = ex('tipo_cierre', desc).toUpperCase();
    const direccion = ex('direccion', desc);
    const [fi, hi] = extraerFechaYHora(ex('fecha_inicio', desc));
    const [ff, hf] = extraerFechaYHora(ex('fecha_fin', desc));
    const horario = determinarHorario(hi, hf);
    const di = fechaLegado(fi), df = fechaLegado(ff);
    const duracion = di !== null && df !== null ? dias(di, df) : 0;

    filas.push(['Trazado Normal', contrato, contratista, municipio, nombre, direccion,
      tipoCierre, horario, fi, ff, String(duracion)]);
    frentes.push({ geom: verticesLegado(pm.geometria), frente: nombre, contrato, contratista, ini: fi, fin: ff });
  }

  const UMBRAL = 2 * COLCHON_GRADOS;
  const cajas = frentes.map((f) => {
    if (!f.geom.length) return null;
    const xs = f.geom.map((c) => c[0]), ys = f.geom.map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });

  for (let i = 0; i < frentes.length; i++) {
    for (let j = i + 1; j < frentes.length; j++) {
      const f1 = frentes[i], f2 = frentes[j];
      if (f1.contrato === f2.contrato) continue;
      const c1 = cajas[i], c2 = cajas[j];
      if (!c1 || !c2) continue;
      if (c1[0] - UMBRAL > c2[2] || c2[0] - UMBRAL > c1[2] ||
          c1[1] - UMBRAL > c2[3] || c2[1] - UMBRAL > c1[3]) continue;
      if (distanciaGrados(f1.geom, f2.geom) > UMBRAL) continue;

      const d1i = fechaLegado(f1.ini), d1f = fechaLegado(f1.fin);
      const d2i = fechaLegado(f2.ini), d2f = fechaLegado(f2.fin);
      const validas = d1i !== null && d1f !== null && d2i !== null && d2f !== null;
      const solapa = validas && d1i <= d2f && d2i <= d1f;

      if (solapa) {
        const ini = Math.max(d1i, d2i), fin = Math.min(d1f, d2f);
        filas.push(['Interferencia', `${f1.contrato} vs ${f2.contrato}`,
          `${f1.contratista} vs ${f2.contratista}`, 'Varios',
          `${f1.frente} / ${f2.frente}`, 'Ver Mapa',
          'INTERFERENCIA REAL (CRÍTICA)', 'Varios',
          new Date(ini).toISOString().slice(0, 10), new Date(fin).toISOString().slice(0, 10),
          String(dias(ini, fin) + 1)]);
      } else {
        filas.push(['Cercanía', `${f1.contrato} vs ${f2.contrato}`,
          `${f1.contratista} vs ${f2.contratista}`, 'Varios',
          `${f1.frente} / ${f2.frente}`, 'Ver Mapa',
          'CERCANÍA ESPACIAL', 'Varios', 'N/A', 'N/A', '0']);
      }
    }
  }

  const resumen = { 'Trazado Normal': 0, 'Cercanía': 0, Interferencia: 0 };
  for (const f of filas) resumen[f[0]]++;
  return { filas, resumen };
}

export const COLUMNAS_CSV = ['CATEGORIA', 'CONTRATO', 'CONTRATISTA', 'MUNICIPIO', 'FRENTE',
  'DIRECCION', 'ESTADO_CIERRE', 'HORARIO', 'FECHA_INICIO', 'FECHA_FIN', 'DURACION_DIAS'];
