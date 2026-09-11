/**
 * Inventario automatico de una carpeta de KMZ/KML.
 *
 * Responde a la pregunta "que hay realmente aqui dentro" antes de analizar
 * nada, y clasifica una muestra representativa de cada caso que aparezca:
 * tipos de cierre, geometrias, revigencias, descripciones en HTML, datos
 * incompletos y anomalias.
 *
 * Uso: node herramientas/inventario.mjs <carpeta>
 */
import { cargarCarpeta, pad, num } from './comun.mjs';
import { leerArchivo } from '../src/nucleo/index.js';
import { desambiguar } from '../src/modelo/identidad.js';
import { resumenCalidad } from '../src/modelo/registro.js';

const ruta = process.argv[2];
if (!ruta) { console.error('Uso: node herramientas/inventario.mjs <carpeta>'); process.exit(1); }

const archivos = await cargarCarpeta(ruta);
const informes = [];
let registros = [];
for (const a of archivos) {
  const inf = await leerArchivo(a);
  informes.push(inf);
  registros = registros.concat(inf.registros);
}
desambiguar(registros);
const cal = resumenCalidad(registros);

const linea = (s = '') => console.log(s);
const titulo = (t) => { linea(); linea(t); linea('-'.repeat(t.length)); };

linea('='.repeat(78));
linea('INVENTARIO DE LA CARPETA DE ENTRADA');
linea('='.repeat(78));

titulo('1 · ARCHIVOS');
linea(`  ${pad('archivo', 48)}${num('placemarks', 12)}${num('estado', 10)}`);
for (const i of informes) {
  linea(`  ${pad(i.nombre, 48)}${num(i.placemarks, 12)}${num(i.ok ? 'OK' : 'FALLA', 10)}`);
  for (const e of i.errores) linea(`      ! ${e}`);
  for (const a of i.avisos) linea(`      · ${a}`);
}
linea(`  ${pad('TOTAL', 48)}${num(registros.length, 12)}`);

titulo('2 · GEOMETRIAS PRESENTES');
const todos = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
for (const t of todos) {
  const n = cal.porTipoGeometria[t] ?? 0;
  linea(`  ${pad(t, 26)}${num(n, 6)}${n === 0 ? '   (no aparece en estos datos)' : ''}`);
}
const sinGeom = cal.porTipoGeometria['(sin geometria)'] ?? 0;
if (sinGeom) linea(`  ${pad('(sin geometria)', 26)}${num(sinGeom, 6)}`);
linea(`  vertices totales: ${registros.reduce((a, r) => a + contarVertices(r.geometria), 0)}`);

titulo('3 · TIPOS DE CIERRE');
for (const [k, v] of Object.entries(cal.porTipoCierre).sort((a, b) => b[1] - a[1])) {
  linea(`  ${pad(k, 26)}${num(v, 6)}`);
}

titulo('4 · CONTRATOS');
for (const [k, v] of Object.entries(cal.porContrato).sort((a, b) => b[1] - a[1])) {
  linea(`  ${pad(k, 26)}${num(v, 6)} frentes`);
}

titulo('5 · REVIGENCIAS (mismo contrato y frente, distintas fechas)');
const porFrente = new Map();
for (const r of registros) {
  const k = `${r.contrato} | ${r.frente}`;
  if (!porFrente.has(k)) porFrente.set(k, []);
  porFrente.get(k).push(r);
}
const conVarias = [...porFrente.entries()].filter(([, v]) => v.length > 1);
linea(`  frentes distintos ................. ${num(porFrente.size, 6)}`);
linea(`  frentes con mas de una vigencia ... ${num(conVarias.length, 6)}`);
linea(`  registros que son revigencia ...... ${num(conVarias.reduce((a, [, v]) => a + v.length - 1, 0), 6)}`);
for (const [k, v] of conVarias.sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
  linea(`    ${pad(k, 44)} ${v.length} vigencias`);
  for (const r of v.slice(0, 4)) linea(`        ${r.vigencia.inicio} -> ${r.vigencia.fin}   id ${r.id.slice(0, 14)}`);
}

titulo('6 · NOMBRES AMBIGUOS (el fallo de sincronia del tablero legado)');
const nombres = [...new Set(registros.map((r) => r.frente).filter(Boolean))].sort();
const prefijos = [];
for (const a of nombres) for (const b of nombres) if (a !== b && b.startsWith(a)) prefijos.push([a, b]);
linea(`  nombres de frente distintos ....... ${num(nombres.length, 6)}`);
linea(`  pares donde uno es prefijo del otro ${num(prefijos.length, 6)}`);
for (const [a, b] of prefijos.slice(0, 5)) linea(`    "${a}"  es prefijo de  "${b}"`);
linea('  (por eso el identificador no puede ser el nombre)');

titulo('7 · CALIDAD DE LOS DATOS');
linea(`  ${pad('registros totales', 44)}${num(cal.total, 6)}`);
linea(`  ${pad('analizables (geometria + fechas + contrato)', 44)}${num(cal.analizables, 6)}`);
linea(`  ${pad('sin geometria utilizable', 44)}${num(cal.sinGeometria, 6)}`);
linea(`  ${pad('sin vigencia valida', 44)}${num(cal.sinVigenciaValida, 6)}`);
linea(`  ${pad('sin contrato', 44)}${num(cal.sinContrato, 6)}`);
linea(`  ${pad('sin municipio', 44)}${num(cal.sinMunicipio, 6)}`);
linea(`  ${pad('sin nombre de frente', 44)}${num(cal.sinNombre, 6)}`);
linea(`  ${pad('duplicados exactos', 44)}${num(cal.duplicadosExactos, 6)}`);
linea(`  ${pad('descripcion en HTML', 44)}${num(registros.filter((r) => r.descripcionEraHtml).length, 6)}`);
linea(`  ${pad('con al menos un aviso', 44)}${num(cal.conAvisos, 6)}`);

titulo('8 · AVISOS POR FRECUENCIA');
for (const [k, v] of Object.entries(cal.avisosFrecuentes).sort((a, b) => b[1] - a[1])) {
  linea(`  ${num(v, 6)}  ${k.slice(0, 66)}`);
}

titulo('9 · REGISTROS CON ANOMALIA (muestra)');
const anomalos = registros.filter((r) => !r.analizable || r.avisos.some((a) => a.includes('inexistente') || a.includes('identico')));
linea(`  registros con anomalia: ${anomalos.length}`);
for (const r of anomalos.slice(0, 10)) {
  linea(`    ${pad(`${r.contrato} · ${r.frente}`, 40)} ${r.origenArchivo}`);
  for (const a of r.avisos) linea(`        - ${a}`);
}

titulo('10 · VIGENCIAS: FORMA DE LOS DATOS');
const conHora = registros.filter((r) => r.vigencia.tieneHoraInicio && r.vigencia.tieneHoraFin);
const medianoche = registros.filter((r) => r.vigencia.inicio?.endsWith('00:00:00') && r.vigencia.fin?.endsWith('00:00:00'));
const finMedianoche = registros.filter((r) => r.vigencia.fin?.endsWith('00:00:00'));
linea(`  ${pad('con hora explicita en inicio y fin', 52)}${num(conHora.length, 6)}`);
linea(`  ${pad('con 00:00 en inicio Y fin (hora no capturada)', 52)}${num(medianoche.length, 6)}`);
linea(`  ${pad('con fin exactamente a las 00:00', 52)}${num(finMedianoche.length, 6)}`);
const duraciones = registros
  .filter((r) => r.vigencia.valida)
  .map((r) => (r.vigencia.finMs - r.vigencia.inicioMs) / 86400000);
if (duraciones.length) {
  duraciones.sort((a, b) => a - b);
  linea(`  ${pad('duracion minima / mediana / maxima (dias)', 52)}` +
    `${duraciones[0].toFixed(1)} / ${duraciones[Math.floor(duraciones.length / 2)].toFixed(1)} / ${duraciones[duraciones.length - 1].toFixed(1)}`);
  linea(`  ${pad('vigencias de mas de un ano', 52)}${num(duraciones.filter((d) => d > 365).length, 6)}`);
}
linea();

function contarVertices(g) {
  if (!g) return 0;
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).reduce((a, x) => a + contarVertices(x), 0);
  const rec = (c) => (Array.isArray(c[0]) ? c.reduce((a, x) => a + rec(x), 0) : 1);
  return g.coordinates ? rec(g.coordinates) : 0;
}
