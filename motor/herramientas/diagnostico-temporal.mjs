/**
 * Diagnostico: comprueba que la granularidad temporal esta llegando de verdad
 * al calculo, y mide cuantas relaciones cambian de estado al pasar de comparar
 * solo fechas a comparar fecha + hora.
 *
 * Uso: node herramientas/diagnostico-temporal.mjs <carpeta-con-kmz>
 */
import { cargarCarpeta, pad, num } from './comun.mjs';
import { analizar } from '../src/nucleo/index.js';

const SEP = String.fromCharCode(1);
const ruta = process.argv[2];
const archivos = await cargarCarpeta(ruta);

const dia = await analizar(archivos, { umbralMetros: 120, granularidadTemporal: 'dia' });
const ins = await analizar(archivos, { umbralMetros: 120, granularidadTemporal: 'instante' });

console.log('1 · LA OPCION LLEGA AL CALCULO');
console.log('  Se comprueba sobre un registro concreto que la vigencia cambia de forma.');
const ejemplo = ins.registros.find((r) => r.vigencia.valida && /\d\d:\d\d/.test(r.vigencia.inicio ?? ''));
const mismoDia = dia.registros.find((r) => r.id.split('~')[0] === ejemplo.id.split('~')[0]) ?? dia.registros[ejemplo ? ins.registros.indexOf(ejemplo) : 0];
console.log(`    frente ................ ${ejemplo.frente}`);
console.log(`    granularidad 'instante' ${ejemplo.vigencia.inicio}  ->  ${ejemplo.vigencia.fin}   (${ejemplo.vigencia.granularidad})`);
console.log(`    granularidad 'dia' .... ${mismoDia.vigencia.inicio}  ->  ${mismoDia.vigencia.fin}   (${mismoDia.vigencia.granularidad})`);
const distintas = ins.registros.filter((r, i) => r.vigencia.inicio !== dia.registros[i].vigencia.inicio ||
                                                 r.vigencia.fin !== dia.registros[i].vigencia.fin).length;
console.log(`    registros cuya vigencia cambia de forma: ${distintas} de ${ins.registros.length}`);

console.log('\n2 · EFECTO SOBRE LAS RELACIONES');
const clave = (r) => [r.idA, r.idB].sort().join(SEP);
const mDia = new Map(dia.relaciones.map((r) => [clave(r), r]));
const mIns = new Map(ins.relaciones.map((r) => [clave(r), r]));
let cambian = 0, soloDia = 0, soloIns = 0, igualEstado = 0;
const ejemplos = [];
for (const [k, a] of mDia) {
  const b = mIns.get(k);
  if (!b) { soloDia++; continue; }
  if (a.hayTraslapeTemporal !== b.hayTraslapeTemporal) {
    cambian++;
    if (ejemplos.length < 5) ejemplos.push([a, b]);
  } else igualEstado++;
}
for (const k of mIns.keys()) if (!mDia.has(k)) soloIns++;
console.log(`  ${pad('relaciones con solo fecha', 46)}${num(dia.relaciones.length, 6)}`);
console.log(`  ${pad('relaciones con fecha + hora', 46)}${num(ins.relaciones.length, 6)}`);
console.log(`  ${pad('mismo par, mismo estado de traslape', 46)}${num(igualEstado, 6)}`);
console.log(`  ${pad('mismo par, CAMBIA el estado de traslape', 46)}${num(cambian, 6)}`);
console.log(`  ${pad('par presente solo con solo-fecha', 46)}${num(soloDia, 6)}`);
console.log(`  ${pad('par presente solo con fecha+hora', 46)}${num(soloIns, 6)}`);
for (const [a, b] of ejemplos) {
  console.log(`    · ${a.frenteA} / ${a.frenteB}: dia=${a.hayTraslapeTemporal} instante=${b.hayTraslapeTemporal}`);
}

console.log('\n3 · POR QUE: MARGEN DE LOS TRASLAPES');
const margenes = [];
for (const r of ins.relaciones) if (r.hayTraslapeTemporal) margenes.push(r.traslapeDias);
margenes.sort((x, y) => x - y);
const cuenta = (f) => margenes.filter(f).length;
console.log(`  traslapes de 1 solo dia ........... ${num(cuenta((d) => d === 1), 5)}`);
console.log(`  traslapes de 2 a 7 dias ........... ${num(cuenta((d) => d >= 2 && d <= 7), 5)}`);
console.log(`  traslapes de mas de 7 dias ........ ${num(cuenta((d) => d > 7), 5)}`);
console.log(`  traslape mas corto ................ ${num(margenes[0] ?? 0, 5)} dia(s)`);
console.log('  Un traslape solo puede cambiar de estado si dependia del ultimo dia');
console.log('  o del primero. Cuanto mas largos son los traslapes, menos casos frontera hay.');

console.log('\n4 · CASOS FRONTERA PRESENTES EN LOS DATOS');
let finMedianoche = 0, mismoDiaDistintaJornada = 0;
for (const r of ins.registros) {
  if (r.vigencia.fin && r.vigencia.fin.endsWith('00:00:00')) finMedianoche++;
}
for (const r of ins.relaciones) {
  if (!r.hayTraslapeTemporal && r.traslapeEvaluable && r.motivoSinTraslape !== 'no coinciden en el tiempo') {
    mismoDiaDistintaJornada++;
  }
}
console.log(`  registros cuya vigencia termina a las 00:00:00 ... ${num(finMedianoche, 5)}`);
console.log(`  relaciones cuyas vigencias solo se tocan ......... ${num(ins.relaciones.filter((r) => r.vigenciasContiguas).length, 5)}`);
