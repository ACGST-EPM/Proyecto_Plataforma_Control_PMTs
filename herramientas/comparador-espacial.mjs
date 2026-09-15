#!/usr/bin/env node
/**
 * COMPARADOR DE MODELOS ESPACIALES — reproducible, sobre los datos que se le den.
 *
 * ══ QUE PREGUNTA RESPONDE ═════════════════════════════════════════════════
 *
 * Hay dos formas de decir «estos dos PMT comparten espacio»:
 *
 *   · MODELO VIGENTE (`minima`): la distancia minima entre los dos trazados es
 *     <= 120 m.
 *   · MODELO CANDIDATO (`zonasDeInfluencia`): cada PMT tiene una zona de
 *     senalizacion de 120 m y hay coincidencia si las dos zonas se superponen.
 *     Por la identidad demostrada en `motor/src/geo/zona-influencia.js`, eso es
 *     EXACTAMENTE distancia <= 240 m. No es una aproximacion.
 *
 * Y una tercera de referencia: lo que veia el sistema QGIS anterior, con su
 * colchon en GRADOS (~243,2 m a esta latitud).
 *
 * ══ QUE NO HACE ══════════════════════════════════════════════════════════
 *
 * NO declara ganador. Produce las cifras para que EPM decida, porque no es una
 * decision tecnica: el modelo candidato no cuesta mas tiempo de maquina —se
 * calculan las mismas distancias— pero produce bastantes mas relaciones, y ese
 * coste lo paga quien tiene que leerlas y convocar reuniones.
 *
 * ══ COMO SE USA ══════════════════════════════════════════════════════════
 *
 *   node herramientas/comparador-espacial.mjs <carpeta-o-zip-con-KMZ>
 *
 * Los datos NO se versionan y no salen de aqui: la herramienta solo imprime
 * agregados (recuentos y bandas de distancia), nunca contenido de los archivos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analizar } from '../motor/src/nucleo/index.js';
import { VERSION_REGLAS } from '../motor/src/nucleo/config.js';

const UMBRAL = 120;
const RADIO = 120;
const LEGADO = 243.2;   // 0.0011 grados de colchon a la latitud de los datos

/** Lee los KMZ/KML de una carpeta, o de dentro de un .zip. */
async function cargar(origen) {
  const st = fs.statSync(origen);
  if (st.isDirectory()) {
    return fs.readdirSync(origen)
      .filter((n) => /\.(kmz|kml)$/i.test(n))
      .map((n) => ({ nombre: n, datos: new Uint8Array(fs.readFileSync(path.join(origen, n))) }));
  }
  if (/\.zip$/i.test(origen)) {
    // Se descomprime a un temporal del sistema, NUNCA dentro del repositorio:
    // estos archivos llevan datos de obra reales.
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'pmt-cmp-'));
    const { execFileSync } = await import('node:child_process');
    execFileSync('unzip', ['-qo', origen, '-d', tmp]);
    const salida = fs.readdirSync(tmp)
      .filter((n) => /\.(kmz|kml)$/i.test(n))
      .map((n) => ({ nombre: n, datos: new Uint8Array(fs.readFileSync(path.join(tmp, n))) }));
    salida.limpiar = () => fs.rmSync(tmp, { recursive: true, force: true });
    return salida;
  }
  return [{ nombre: path.basename(origen), datos: new Uint8Array(fs.readFileSync(origen)) }];
}

const clave = (r) => [r.idA, r.idB].sort().join('||');

async function main() {
  const origen = process.argv[2];
  if (!origen || !fs.existsSync(origen)) {
    console.error('Uso: node herramientas/comparador-espacial.mjs <carpeta-o-zip-con-KMZ>');
    process.exit(2);
  }
  const archivos = await cargar(origen);
  if (!archivos.length) { console.error('No se encontro ningun .kmz ni .kml.'); process.exit(2); }

  const t0 = performance.now();
  const vigente = await analizar(archivos, { umbralMetros: UMBRAL, modeloEspacial: 'minima' });
  const msVigente = performance.now() - t0;

  const t1 = performance.now();
  const candidato = await analizar(archivos, {
    umbralMetros: UMBRAL, modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: RADIO });
  const msCandidato = performance.now() - t1;

  // La referencia historica se obtiene con el umbral del legado, SIN reproducir
  // su modo de distancia: aqui solo interesa cuantas parejas caian dentro.
  const historico = await analizar(archivos, { umbralMetros: LEGADO, modeloEspacial: 'minima' });

  const A = new Map(vigente.relaciones.map((r) => [clave(r), r]));
  const B = new Map(candidato.relaciones.map((r) => [clave(r), r]));
  const H = new Map(historico.relaciones.map((r) => [clave(r), r]));

  const soloA = [...A.keys()].filter((k) => !B.has(k));
  const nuevas = [...B.keys()].filter((k) => !A.has(k));
  const conTraslape = nuevas.filter((k) => (B.get(k).traslapeDias ?? 0) > 0);

  // Bandas de distancia de lo que el candidato añade.
  const bandas = { '120-150': 0, '150-180': 0, '180-210': 0, '210-240': 0 };
  for (const k of nuevas) {
    const d = B.get(k).distanciaMetros;
    if (d === null || d === undefined) continue;
    if (d <= 150) bandas['120-150']++;
    else if (d <= 180) bandas['150-180']++;
    else if (d <= 210) bandas['180-210']++;
    else bandas['210-240']++;
  }

  // Parejas de contratos que ganan relaciones. Los contratos NO son datos
  // personales y son lo que hace falta para valorar el impacto operativo.
  const porPareja = new Map();
  for (const k of nuevas) {
    const r = B.get(k);
    const p = [r.contratoA, r.contratoB].sort().join(' ↔ ');
    porPareja.set(p, (porPareja.get(p) ?? 0) + 1);
  }

  const l = (s = '') => console.log(s);
  l('═'.repeat(74));
  l('  COMPARADOR DE MODELOS ESPACIALES');
  l(`  reglas ${VERSION_REGLAS} · ${archivos.length} archivo(s) · ${vigente.registros.length} PMT`);
  l('═'.repeat(74));
  l();
  l(`  Modelo VIGENTE     distancia minima <= ${UMBRAL} m ............ ${String(A.size).padStart(5)} relaciones`);
  l(`  Modelo CANDIDATO   zonas de ${RADIO}+${RADIO} m = dist <= ${2 * RADIO} m ... ${String(B.size).padStart(5)} relaciones`);
  l(`  Referencia QGIS    dist <= ${LEGADO} m (colchon en grados) .. ${String(H.size).padStart(5)} relaciones`);
  l();
  l(`  Comunes a los dos modelos ......................... ${String([...A.keys()].filter((k) => B.has(k)).length).padStart(5)}`);
  l(`  Solo en el VIGENTE (deberia ser 0) ................ ${String(soloA.length).padStart(5)}`);
  l(`  Que añade el CANDIDATO ............................ ${String(nuevas.length).padStart(5)}`);
  l(`     de ellas, con coincidencia TEMPORAL ............ ${String(conTraslape.length).padStart(5)}`);
  l();
  l('  Distancia de las que añade:');
  for (const [b, n] of Object.entries(bandas)) l(`     ${b} m ......................................... ${String(n).padStart(5)}`);
  l();
  l('  Parejas de contratos que ganan relaciones:');
  for (const [p, n] of [...porPareja].sort((x, y) => y[1] - x[1])) {
    l(`     ${p.padEnd(28)} ${String(n).padStart(4)}`);
  }
  l();
  l('  Coste de calculo (no es el coste que importa):');
  l(`     vigente ${msVigente.toFixed(0)} ms · candidato ${msCandidato.toFixed(0)} ms`);
  l(`     Se calculan las MISMAS distancias: lo que crece es la salida, no el calculo.`);
  l();
  l('  ESTO NO DECIDE NADA. El coste del modelo candidato no lo paga la maquina:');
  l('  lo paga quien tiene que leer las relaciones que añade y convocar a la gente.');
  l('  La sustitucion definitiva de la regla de 120 m es una DECISION DE NEGOCIO');
  l('  pendiente de EPM.');
  l('═'.repeat(74));

  archivos.limpiar?.();
}

main().catch((e) => { console.error(e); process.exit(1); });
