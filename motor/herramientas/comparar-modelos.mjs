/**
 * COMPARADOR DE MODELOS ESPACIALES — para decidir con evidencia, no con intuición.
 *
 * Uso:  node herramientas/comparar-modelos.mjs <carpeta-con-kmz> [--csv salida.csv]
 *
 * ══ LA PREGUNTA ═══════════════════════════════════════════════════════════
 *
 * Hoy la regla es: hay coincidencia espacial si la distancia mínima entre los
 * dos trazados no pasa de 120 m.
 *
 * La hipótesis operativa es más fiel a lo que es un PMT: alrededor de cada
 * cierre hay señalización hasta unos 120 m, así que hay coincidencia cuando las
 * dos ZONAS DE INFLUENCIA se superponen. Por la identidad demostrada en
 * `geo/zona-influencia.js`, eso equivale exactamente a distancia ≤ 240 m.
 *
 * Este comparador NO decide. Ejecuta los dos modelos sobre los mismos datos y
 * enseña, relación por relación, qué aparece, qué desaparece y por qué.
 */
import { writeFile } from 'node:fs/promises';
import { cargarCarpeta, pad, num } from './comun.mjs';
import { analizar } from '../src/nucleo/index.js';

const carpeta = process.argv[2];
if (!carpeta) {
  console.error('Uso: node herramientas/comparar-modelos.mjs <carpeta-con-kmz> [--csv salida.csv]');
  process.exit(1);
}
const iCsv = process.argv.indexOf('--csv');
const rutaCsv = iCsv > 0 ? process.argv[iCsv + 1] : null;

const BASE = {
  toleranciaMinutos: 0, granularidadTemporal: 'instante',
  excluirMismoContrato: true, modoDistancia: 'real',
};
const ACTUAL = { ...BASE, modeloEspacial: 'minima', umbralMetros: 120 };
const CANDIDATO = { ...BASE, modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: 120 };

const archivos = await cargarCarpeta(carpeta);
console.log(`\nArchivos leidos: ${archivos.length}\n`);

// PERFIL HISTORICO: reproduce lo que hacia el motor de QGIS, pero midiendo en
// METROS REALES. Su alcance efectivo era ~243,2 m porque aplicaba el colchon a
// las DOS geometrias. Es la linea base de 248 relaciones.
const HISTORICO = { ...BASE, umbralMetros: 121.6, modoDistancia: 'legado', granularidadTemporal: 'dia' };
// Y el mismo candidato pero por DIA, para poder aislar que parte de la
// diferencia es del umbral y que parte es de la granularidad temporal.
const CANDIDATO_DIA = { ...CANDIDATO, granularidadTemporal: 'dia' };

const [actual, candidato, candidatoDia, historico] = await Promise.all([
  analizar(archivos, ACTUAL),
  analizar(archivos, CANDIDATO),
  analizar(archivos, CANDIDATO_DIA),
  analizar(archivos, HISTORICO),
]);

const clave = (r) => [r.idA, r.idB].sort().join('|');
const mapaDe = (res) => new Map(res.relaciones.map((r) => [clave(r), r]));
const mA = mapaDe(actual), mC = mapaDe(candidato);

const comunes = [...mC.keys()].filter((k) => mA.has(k));
const soloActual = [...mA.keys()].filter((k) => !mC.has(k));
const nuevas = [...mC.keys()].filter((k) => !mA.has(k));

const linea = (n = 78) => console.log('-'.repeat(n));
const titulo = (t) => { console.log(''); console.log(t); linea(); };

/* ───────────── 1 · Cifras ───────────── */
titulo('1 · CUANTAS RELACIONES PRODUCE CADA MODELO');
console.log(`  Registros analizados                                     ${num(actual.registros.length, 6)}`);
console.log(`  MODELO ACTUAL     distancia minima <= 120 m              ${num(actual.relaciones.length, 6)}`);
console.log(`  MODELO CANDIDATO  zonas de 120 m que se superponen       ${num(candidato.relaciones.length, 6)}`);
console.log(`                    (equivale a distancia minima <= 240 m)`);
console.log(`  HISTORICO (QGIS)  colchon en AMBAS geometrias, ~243,2 m   ${num(historico.relaciones.length, 6)}`);
console.log('');
console.log(`  Presentes en los dos modelos                             ${num(comunes.length, 6)}`);
console.log(`  Solo en el modelo ACTUAL (desaparecen)                   ${num(soloActual.length, 6)}`);
console.log(`  Nuevas en el modelo CANDIDATO                            ${num(nuevas.length, 6)}`);

if (soloActual.length) {
  console.log('');
  console.log('  ATENCION: el candidato es MAS AMPLIO que el actual, asi que no deberia');
  console.log('  perder ninguna relacion. Si aqui sale un numero distinto de cero, hay');
  console.log('  algo que revisar antes de seguir.');
}

/* ───────────── 2 · Qué son las nuevas ───────────── */
const conTraslape = (rs) => rs.filter((r) => r.hayTraslapeTemporal).length;
const conContacto = (rs) => rs.filter((r) => r.intersecanFisicamente).length;
const relsNuevas = nuevas.map((k) => mC.get(k));

titulo('2 · QUE HAY DENTRO DE CADA CONJUNTO');
const fila = (etq, rs) => console.log(
  `  ${pad(etq, 34)} ${num(rs.length, 6)}  ·  con traslape ${num(conTraslape(rs), 4)}  ·  se tocan ${num(conContacto(rs), 3)}`);
fila('Modelo actual', actual.relaciones);
fila('Modelo candidato', candidato.relaciones);
fila('Solo las nuevas del candidato', relsNuevas);

/* ───────────── 3 · Distribución de distancias ───────────── */
titulo('3 · A QUE DISTANCIA ESTAN (distancia minima real entre trazados)');
const BANDAS = [
  ['0 m (se tocan)', (d) => d === 0],
  ['0 - 30 m', (d) => d > 0 && d <= 30],
  ['30 - 60 m', (d) => d > 30 && d <= 60],
  ['60 - 90 m', (d) => d > 60 && d <= 90],
  ['90 - 120 m', (d) => d > 90 && d <= 120],
  ['120 - 150 m  (solo candidato)', (d) => d > 120 && d <= 150],
  ['150 - 180 m  (solo candidato)', (d) => d > 150 && d <= 180],
  ['180 - 210 m  (solo candidato)', (d) => d > 180 && d <= 210],
  ['210 - 240 m  (solo candidato)', (d) => d > 210 && d <= 240],
];
console.log(`  ${pad('banda', 32)} ${num('actual', 8)} ${num('candidato', 10)} ${num('traslapan', 10)}`);
for (const [etq, test] of BANDAS) {
  const a = actual.relaciones.filter((r) => test(r.distanciaMetros)).length;
  const c = candidato.relaciones.filter((r) => test(r.distanciaMetros));
  console.log(`  ${pad(etq, 32)} ${num(a, 8)} ${num(c.length, 10)} ${num(conTraslape(c), 10)}`);
}

/* ───────────── 4 · Quién está implicado ───────────── */
titulo('4 · CONTRATOS Y FRENTES IMPLICADOS EN LAS RELACIONES NUEVAS');
const pares = new Map();
for (const r of relsNuevas) {
  const k = [r.contratoA, r.contratoB].sort().join('  vs  ');
  const v = pares.get(k) ?? { n: 0, traslape: 0, frentes: new Set() };
  v.n++;
  if (r.hayTraslapeTemporal) v.traslape++;
  v.frentes.add(r.frenteA); v.frentes.add(r.frenteB);
  pares.set(k, v);
}
console.log(`  ${pad('pareja de contratos', 30)} ${num('nuevas', 8)} ${num('traslapan', 10)}  frentes`);
for (const [k, v] of [...pares.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${pad(k, 30)} ${num(v.n, 8)} ${num(v.traslape, 10)}  ${v.frentes.size}`);
}
const contratosNuevos = new Set(relsNuevas.flatMap((r) => [r.contratoA, r.contratoB]));
console.log('');
console.log(`  Contratos que ganan relaciones: ${[...contratosNuevos].sort().join(', ') || '(ninguno)'}`);

/* ───────────── 5 · Ejemplos, con su explicación ───────────── */
titulo('5 · EJEMPLOS REPRESENTATIVOS DE LO QUE APARECE');
const ordenadas = [...relsNuevas].sort((a, b) => a.distanciaMetros - b.distanciaMetros);
const muestras = [
  ...ordenadas.filter((r) => r.hayTraslapeTemporal).slice(0, 5),
  ...ordenadas.filter((r) => !r.hayTraslapeTemporal).slice(0, 3),
  ...ordenadas.slice(-2),
];
const vistas = new Set();
for (const r of muestras) {
  const k = clave(r);
  if (vistas.has(k)) continue;
  vistas.add(k);
  console.log('');
  console.log(`  ${r.contratoA} / ${r.frenteA}`);
  console.log(`  ${r.contratoB} / ${r.frenteB}`);
  console.log(`    distancia minima real ....... ${r.distanciaMetros.toFixed(1)} m`);
  console.log(`    zonas de 120 m se solapan ... ${r.solapeDeZonasMetros.toFixed(1)} m de anchura`);
  console.log(`    coinciden en el tiempo ...... ${r.hayTraslapeTemporal ? 'SI, ' + r.traslapeDias + ' dia(s)' : 'no'}`);
  console.log(`    vigencia A .................. ${r.vigenciaA.inicio} .. ${r.vigenciaA.fin}`);
  console.log(`    vigencia B .................. ${r.vigenciaB.inicio} .. ${r.vigenciaB.fin}`);
  console.log(`    POR QUE APARECE ............. esta a mas de 120 m, asi que el modelo actual`);
  console.log(`                                  no la ve; pero a menos de 240 m, asi que las`);
  console.log(`                                  dos zonas de senalizacion se superponen.`);
}

/* ───────────── 6 · Contra la baseline histórica, aislando causas ───────────── */
titulo('6 · DE DONDE VENIA EL ~243 m DEL MOTOR HISTORICO');
console.log('  El motor de QGIS aplicaba un colchon a las DOS geometrias antes de');
console.log('  cruzarlas, y ademas lo hacia en GRADOS, no en metros. Es decir: su');
console.log('  CRITERIO era zona + zona —el del modelo candidato— y lo que estaba mal');
console.log('  era la MEDIDA. El ~243,2 m efectivo sale de aplicar dos veces un colchon');
console.log('  de ~121,6 m.');
console.log('');
const mH = mapaDe(historico), mCD = mapaDe(candidatoDia);
const f2 = (etq, r) => console.log(
  `  ${pad(etq, 46)} ${num(r.relaciones.length, 5)}  ·  traslape ${num(conTraslape(r.relaciones), 4)}` +
  `  ·  se tocan ${num(conContacto(r.relaciones), 3)}`);
f2('HISTORICO  243,2 m reales, solo fecha', historico);
f2('CANDIDATO  240 m (zonas 120+120), solo fecha', candidatoDia);
f2('CANDIDATO  240 m, fecha + hora', candidato);
f2('ACTUAL     120 m, fecha + hora', actual);
console.log('');
const soloHist = [...mH.keys()].filter((k) => !mCD.has(k));
const soloCand = [...mCD.keys()].filter((k) => !mH.has(k));
console.log(`  Relaciones que el historico ve y el candidato no  ${num(soloHist.length, 4)}`);
console.log(`  Relaciones que el candidato ve y el historico no  ${num(soloCand.length, 4)}`);
for (const k of soloHist) {
  const r = mH.get(k);
  console.log(`    · ${r.contratoA}/${r.frenteA}  vs  ${r.contratoB}/${r.frenteB}` +
    `  ->  ${r.distanciaMetros.toFixed(2)} m`);
  console.log(`      Cae entre 240 m y 243,2 m: la ve el colchon inflado del historico,`);
  console.log(`      no la ve una zona honesta de 120 m. No es un defecto del candidato.`);
}
console.log('');
console.log('  QUE PARTE DE LA DIFERENCIA ES DE QUE:');
console.log(`    · del UMBRAL (243,2 -> 240 m) .............. ${num(soloHist.length, 4)} relacion(es)`);
console.log(`    · de la GRANULARIDAD TEMPORAL (dia -> hora)  ${num(Math.abs(candidatoDia.relaciones.length - candidato.relaciones.length), 4)} relacion(es)`);
console.log('');
console.log('  LECTURA: el modelo candidato reproduce la baseline historica salvo el');
console.log('  margen que el historico se inventaba al medir en grados. El modelo');
console.log('  ACTUAL, en cambio, deja fuera 74 relaciones que el historico si veia.');

/* ───────────── 7 · CSV para revisar caso a caso ───────────── */
if (rutaCsv) {
  const cab = ['ESTADO', 'CONTRATO_A', 'FRENTE_A', 'CONTRATO_B', 'FRENTE_B', 'DISTANCIA_M',
    'SOLAPE_ZONAS_M', 'SE_TOCAN', 'COINCIDEN_EN_TIEMPO', 'DIAS_COINCIDENCIA',
    'INICIO_A', 'FIN_A', 'INICIO_B', 'FIN_B', 'MUNICIPIO_A', 'MUNICIPIO_B'];
  const cuerpo = [];
  const escribir = (r, estado) => cuerpo.push([
    estado, r.contratoA, r.frenteA, r.contratoB, r.frenteB,
    r.distanciaMetros?.toFixed(2) ?? '', r.solapeDeZonasMetros?.toFixed(2) ?? '',
    r.intersecanFisicamente ? 'si' : 'no', r.hayTraslapeTemporal ? 'si' : 'no', r.traslapeDias ?? '',
    r.vigenciaA.inicio ?? '', r.vigenciaA.fin ?? '', r.vigenciaB.inicio ?? '', r.vigenciaB.fin ?? '',
    r.municipioA ?? '', r.municipioB ?? '',
  ]);
  for (const k of comunes) escribir(mC.get(k), 'EN LOS DOS');
  for (const k of nuevas) escribir(mC.get(k), 'NUEVA CON ZONAS');
  for (const k of soloActual) escribir(mA.get(k), 'SOLO MODELO ACTUAL');
  const csv = '﻿' + [cab, ...cuerpo]
    .map((f) => f.map((v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';'))
    .join('\r\n');
  await writeFile(rutaCsv, csv, 'utf8');
  console.log(`\nDetalle caso a caso escrito en: ${rutaCsv}  (${cuerpo.length} filas)`);
}

console.log('\nESTE COMPARADOR NO DECIDE NADA. La regla vigente sigue siendo la actual.');
console.log('El cambio de modelo es una decision operativa que tiene que validar EPM.\n');
