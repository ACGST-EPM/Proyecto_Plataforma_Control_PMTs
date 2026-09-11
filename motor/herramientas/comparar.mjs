/**
 * Comparador legado vs motor nuevo, en linea de comandos.
 *
 * Uso:
 *   node herramientas/comparar.mjs <carpeta-con-kmz> [csv-legado-publicado]
 *
 * Ejecuta cuatro perfiles sobre los MISMOS archivos, de modo que cada
 * diferencia se pueda atribuir a una sola causa:
 *
 *   1. REPLICA LEGADO   umbral ~243 m en grados, solo fecha  -> reproduce QGIS
 *   2. NUEVO, legado    umbral 243 m reales, solo fecha      -> aisla la MEDIDA
 *   3. NUEVO, 120 m     umbral 120 m reales, solo fecha      -> aisla el UMBRAL
 *   4. NUEVO, completo  umbral 120 m reales, fecha + hora    -> aisla el TIEMPO
 */

import { readFile } from 'node:fs/promises';
import { cargarCarpeta, leerCsv, pad, num } from './comun.mjs';
import { extraerKml } from '../src/io/zip.js';
import { leerKml } from '../src/io/kml.js';
import { analizarLegado } from '../src/legado/replica.js';
import { analizar, ejecutarLegado, PERFIL_LEGADO } from '../src/nucleo/index.js';
import { cotejarFidelidad, resumirCotejo } from '../src/legado/cotejo.js';
import { repartir, porBandaDeDistancia, combinacionDe } from '../src/nucleo/provisional.js';

const SEP = String.fromCharCode(1);

const PERFILES = [
  { clave: 'B', titulo: 'NUEVO · medida real, umbral 243,2 m, solo fecha',
    config: { umbralMetros: 121.6, modoDistancia: 'legado', granularidadTemporal: 'dia' } },
  { clave: 'C', titulo: 'NUEVO · umbral 120 m reales, solo fecha',
    config: { umbralMetros: 120, modoDistancia: 'real', granularidadTemporal: 'dia' } },
  { clave: 'D', titulo: 'NUEVO · umbral 120 m reales, fecha + hora  (CONFIGURACION APROBADA)',
    config: { umbralMetros: 120, modoDistancia: 'real', granularidadTemporal: 'instante' } },
];

function parDe(rel) {
  // Clave simetrica del par, independiente del orden de lectura.
  return [rel.idA, rel.idB].sort().join(SEP);
}

function tabla(titulo, filas) {
  console.log('\n' + titulo);
  console.log('-'.repeat(titulo.length));
  for (const [k, v] of filas) console.log('  ' + pad(k, 52) + num(v, 8));
}

const ruta = process.argv[2];
const csvLegado = process.argv[3];
if (!ruta) {
  console.error('Uso: node herramientas/comparar.mjs <carpeta-con-kmz> [csv-legado.csv]');
  process.exit(1);
}

const archivos = await cargarCarpeta(ruta);
console.log('='.repeat(78));
console.log('COMPARACION MOTOR LEGADO  vs  MOTOR NUEVO');
console.log('='.repeat(78));
console.log(`\nArchivos leidos: ${archivos.length}`);
for (const a of archivos) console.log('  · ' + a.nombre);

// ---------- 1. Replica del legado ----------
let placemarks = [];
const erroresLectura = [];
for (const a of archivos) {
  try {
    const { texto, otrosKml, avisos } = await extraerKml(a.datos);
    if (otrosKml.length) erroresLectura.push(`${a.nombre}: ${avisos.join('; ')}`);
    const r = leerKml(texto, a.nombre);
    if (r.errores.length) erroresLectura.push(`${a.nombre}: ${r.errores.join('; ')}`);
    if (!r.coberturaCompleta) erroresLectura.push(`${a.nombre}: ${r.motivosCobertura.join('; ')}`);
    placemarks = placemarks.concat(r.placemarks);
  } catch (e) {
    erroresLectura.push(`${a.nombre}: ${e.message}`);
  }
}
const legado = analizarLegado(placemarks);
tabla('1 · REPLICA DEL MOTOR LEGADO (reproduce QGIS, errores incluidos)', [
  ['Trazados normales', legado.resumen['Trazado Normal']],
  ['Cercanias', legado.resumen['Cercanía']],
  ['Interferencias', legado.resumen.Interferencia],
  ['Total de filas', legado.filas.length],
]);

// Cotejo alerta por alerta entre los dos caminos de reproduccion del legado.
{
  const motorLegado = await analizar(archivos, PERFIL_LEGADO);
  const c = cotejarFidelidad({ ...legado, errores: erroresLectura, coberturaCompleta: !erroresLectura.length }, motorLegado);
  tabla('1a · COTEJO ALERTA POR ALERTA (replica vs motor nuevo en perfil legado)', [
    ['Alertas en la replica de QGIS', c.alertasReplica],
    ['Alertas en el motor nuevo (perfil legado)', c.alertasMotor],
    ['Coinciden en par, frentes, categoria y periodo', c.coincidentes],
    ['Solo en la replica', c.soloReplica.length],
    ['Solo en el motor nuevo', c.soloMotor.length],
    ['Trazados leidos coinciden', c.trazadosCoinciden ? 'si' : 'NO'],
    ['Veredicto', c.completo ? 'FIDELIDAD COMPROBADA UNO A UNO' : 'NO SE PUEDE AFIRMAR FIDELIDAD'],
  ]);
  console.log('\n  ' + resumirCotejo(c));
  for (const x of c.soloReplica.slice(0, 5)) console.log('    solo replica: ' + Object.values(x).join(' · '));
  for (const x of c.soloMotor.slice(0, 5)) console.log('    solo motor  : ' + Object.values(x).join(' · '));
}

if (csvLegado) {
  const pub = leerCsv(await readFile(csvLegado, 'utf8')).slice(1);
  const A = new Map(), B = new Map();
  for (const f of legado.filas) A.set(f.join(SEP), (A.get(f.join(SEP)) ?? 0) + 1);
  for (const f of pub) B.set(f.join(SEP), (B.get(f.join(SEP)) ?? 0) + 1);
  let iguales = 0, soloA = 0, soloB = 0;
  for (const [k, v] of A) { const w = B.get(k) ?? 0; iguales += Math.min(v, w); soloA += Math.max(0, v - w); }
  for (const [k, v] of B) { const w = A.get(k) ?? 0; soloB += Math.max(0, v - w); }
  tabla('1b · FIDELIDAD DE LA REPLICA frente al CSV realmente publicado', [
    ['Filas del CSV publicado', pub.length],
    ['Filas identicas', iguales],
    ['Solo en la replica', soloA],
    ['Solo en el CSV publicado', soloB],
    ['Veredicto', soloA === 0 && soloB === 0 ? 'REPRODUCCION EXACTA' : 'HAY DIFERENCIAS'],
  ]);
}

// ---------- 2-4. Perfiles del motor nuevo ----------
const resultados = {};
for (const p of PERFILES) {
  const r = await analizar(archivos, p.config);
  resultados[p.clave] = r;
  const rep = repartir(r.relaciones);
  tabla(`${p.clave === 'B' ? 2 : p.clave === 'C' ? 3 : 4} · ${p.titulo}`, [
    ['Registros leidos', r.registros.length],
    ['Registros analizables', r.calidad.analizables],
    ['Relaciones dentro del umbral', r.relaciones.length],
    ['Pares no evaluables espacialmente', r.estadisticas.paresNoEvaluablesEspacialmente],
    ['Pares evaluados fuera del umbral', r.estadisticas.paresEvaluadosFueraDelUmbral],
    ['Archivos completos / parciales / fallidos', `${r.calidad.archivosCompletos} / ${r.calidad.archivosParciales} / ${r.calidad.archivosFallidos}`],
    ['  con traslape temporal', r.relaciones.filter((x) => x.hayTraslapeTemporal).length],
    ['  sin traslape temporal', r.relaciones.filter((x) => !x.hayTraslapeTemporal && x.traslapeEvaluable).length],
    ['  no evaluables por fechas', r.relaciones.filter((x) => !x.traslapeEvaluable).length],
    ['  con interseccion fisica (0 m)', r.relaciones.filter((x) => x.intersecanFisicamente).length],
    ['tiempo de calculo (ms)', r.estadisticas.msTotalProceso],
  ]);
  console.log('\n  Combinaciones PROVISIONALES (sin regla de negocio aprobada):');
  console.log(`    A interseccion + traslape .......... ${num(rep.A, 5)}`);
  console.log(`    B interseccion sin traslape ........ ${num(rep.B, 5)}`);
  console.log(`    C proximidad + traslape ............ ${num(rep.C, 5)}`);
  console.log(`    D proximidad sin traslape .......... ${num(rep.D, 5)}`);
  console.log(`    E sin evaluar por fechas ........... ${num(rep.E, 5)}`);
  console.log('\n  Reparto por distancia real:');
  for (const [k, v] of Object.entries(porBandaDeDistancia(r.relaciones))) {
    console.log(`    ${pad(k, 30)} ${num(v, 5)}`);
  }
}

// ---------- 5. Atribucion de las diferencias ----------
console.log('\n' + '='.repeat(78));
console.log('5 · DE DONDE VIENE CADA DIFERENCIA');
console.log('='.repeat(78));
const nRel = (k) => resultados[k].relaciones.length;
const nInt = (k) => resultados[k].relaciones.filter((x) => x.hayTraslapeTemporal).length;
const legadoAlertas = legado.resumen['Cercanía'] + legado.resumen.Interferencia;

console.log(`
  Alertas del motor legado ............................. ${num(legadoAlertas, 6)}
    de las cuales "INTERFERENCIA REAL (CRITICA)" ....... ${num(legado.resumen.Interferencia, 6)}

  a) Cambio por MEDIR BIEN la distancia (perfil 2)
     alertas .......................................... ${num(nRel('B'), 6)}   (${signo(nRel('B') - legadoAlertas)})
     con traslape ..................................... ${num(nInt('B'), 6)}   (${signo(nInt('B') - legado.resumen.Interferencia)})

  b) Cambio por CORREGIR EL UMBRAL 243 m -> 120 m (perfil 3)
     alertas .......................................... ${num(nRel('C'), 6)}   (${signo(nRel('C') - nRel('B'))})
     con traslape ..................................... ${num(nInt('C'), 6)}   (${signo(nInt('C') - nInt('B'))})

  c) Cambio por USAR FECHA + HORA (perfil 4)
     alertas .......................................... ${num(nRel('D'), 6)}   (${signo(nRel('D') - nRel('C'))})
     con traslape ..................................... ${num(nInt('D'), 6)}   (${signo(nInt('D') - nInt('C'))})

  d) Separacion entre proximidad e interseccion fisica
     relaciones con contacto fisico real .............. ${num(resultados.D.relaciones.filter((x) => x.intersecanFisicamente).length, 6)}
     el motor legado nunca comprobo esto: llamaba
     "INTERFERENCIA REAL" a todo lo que estuviera cerca
     con fechas traslapadas.
`);

function signo(n) { return n === 0 ? 'sin cambio' : (n > 0 ? `+${n}` : `${n}`); }

// ---------- 6. Calidad de los datos ----------
const cal = resultados.D.calidad;
tabla('6 · CALIDAD DE LOS DATOS DE ENTRADA', [
  ['Registros totales', cal.total],
  ['Analizables (geometria + fechas + contrato)', cal.analizables],
  ['Sin geometria utilizable', cal.sinGeometria],
  ['Sin vigencia valida', cal.sinVigenciaValida],
  ['Sin contrato', cal.sinContrato],
  ['Sin municipio', cal.sinMunicipio],
  ['Sin nombre de frente', cal.sinNombre],
  ['Duplicados exactos desambiguados', cal.duplicadosExactos],
  ['Con al menos un aviso', cal.conAvisos],
]);
console.log('\n  Geometrias por tipo:');
for (const [k, v] of Object.entries(cal.porTipoGeometria)) console.log(`    ${pad(k, 30)} ${num(v, 5)}`);
console.log('\n  Avisos mas frecuentes:');
const top = Object.entries(cal.avisosFrecuentes).sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [k, v] of top) console.log(`    ${num(v, 5)}  ${k.slice(0, 66)}`);

if (erroresLectura.length) {
  console.log('\n  Errores de lectura de archivo:');
  for (const e of erroresLectura) console.log('    ! ' + e);
} else {
  console.log('\n  Ningun archivo fallo al leerse.');
}

// ---------- 7. Relaciones que aparecen o desaparecen ----------
//
// El emparejamiento se hace por IDENTIFICADOR ESTABLE de los dos registros, no
// por "contrato + nombre de frente". Antes se usaba el nombre, y eso junta en
// una sola clave todas las revigencias de un mismo frente: en los datos reales
// hay 93 frentes con mas de una vigencia y 148 registros que son revigencia, asi
// que el recuento salia mal. Con el identificador se conserva la multiplicidad:
// cada vigencia es un registro distinto y cada par cuenta por separado.
const claveId = (rel) => [rel.idA, rel.idB].sort().join(SEP);

function multiset(relaciones) {
  const m = new Map();
  for (const r of relaciones) {
    const k = claveId(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

const mLegado = multiset(resultados.B.relaciones);   // perfil legado del motor nuevo
const mNuevo = multiset(resultados.D.relaciones);    // configuracion aprobada

let enAmbos = 0;
const desaparecen = [];
const aparecen = [];
for (const [k, lista] of mLegado) {
  const otras = mNuevo.get(k) ?? [];
  enAmbos += Math.min(lista.length, otras.length);
  for (let i = otras.length; i < lista.length; i++) desaparecen.push(lista[i]);
}
for (const [k, lista] of mNuevo) {
  const otras = mLegado.get(k) ?? [];
  for (let i = otras.length; i < lista.length; i++) aparecen.push(lista[i]);
}

tabla('7 · EMPAREJAMIENTO REGISTRO A REGISTRO (por identificador estable)', [
  ['Relaciones del perfil legado', resultados.B.relaciones.length],
  ['Relaciones de la configuracion aprobada', resultados.D.relaciones.length],
  ['Presentes en ambos', enAmbos],
  ['Solo en el perfil legado (desaparecen)', desaparecen.length],
  ['Solo en la configuracion aprobada (aparecen)', aparecen.length],
]);

// Explicacion de CADA relacion que desaparece, por su causa medible.
const porCausa = { distancia: 0, tiempo: 0, otra: 0 };
const umbralNuevo = resultados.D.config.umbralMetros;
for (const rel of desaparecen) {
  if (rel.distanciaMetros !== null && rel.distanciaMetros > umbralNuevo) porCausa.distancia++;
  else if (rel.hayTraslapeTemporal === false) porCausa.tiempo++;
  else porCausa.otra++;
}
console.log('\n  Por que desaparece cada una:');
console.log(`    ${pad('estaban a mas de ' + umbralNuevo + ' m de distancia real', 52)}${num(porCausa.distancia, 6)}`);
console.log(`    ${pad('dejaron de coincidir al comparar fecha + hora', 52)}${num(porCausa.tiempo, 6)}`);
console.log(`    ${pad('otra causa (revisar)', 52)}${num(porCausa.otra, 6)}`);
const suma = porCausa.distancia + porCausa.tiempo + porCausa.otra;
console.log(`    ${pad('TOTAL explicado', 52)}${num(suma, 6)}  de ${desaparecen.length}`);

if (desaparecen.length) {
  console.log('\n  Ejemplos de alertas que el motor nuevo ya NO emite:');
  for (const rel of desaparecen.slice(0, 8)) {
    console.log(`    - ${rel.contratoA} vs ${rel.contratoB}  ·  ${rel.frenteA} / ${rel.frenteB}` +
      `  ·  ${rel.distanciaMetros} m  ·  vigencia ${rel.vigenciaA.inicio?.slice(0, 10)}..${rel.vigenciaA.fin?.slice(0, 10)}`);
  }
}
console.log('');
