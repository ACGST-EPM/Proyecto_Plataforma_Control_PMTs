/**
 * DATOS DE DEMOSTRACION — sinteticos, para poder enseñar la plataforma.
 *
 * ══ PARA QUE ══════════════════════════════════════════════════════════════
 *
 * Socializar la herramienta con un area, con TI o con un contratista obliga hoy
 * a abrirla con los KMZ reales de EPM: direcciones, contratistas y fechas de
 * obra delante de quien quiza no deba verlos. Eso es un problema de gobierno
 * del dato, no de comodidad.
 *
 * Este generador produce un KMZ que NO CONTIENE NI UN DATO REAL y que, aun asi,
 * permite enseñar todo lo que hay que enseñar:
 *
 *   · varios contratos y contratistas (nombres inventados);
 *   · una ARTICULACION clara: dos contratos, mismo sitio, fechas solapadas;
 *   · una COINCIDENCIA ESPACIAL: mismo sitio, momentos distintos;
 *   · un PMT HISTORICO, para enseñar la bandeja frente al historico;
 *   · un PMT PROGRAMADO, para enseñar lo que viene;
 *   · seguimiento documental en sus tres estados;
 *   · los tres tipos de cierre.
 *
 * ══ LO QUE NO HACE ════════════════════════════════════════════════════════
 *
 * No copia nada de `01_KMZ_Entrada`, ni de `crudo_*.json`, ni del CSV. Las
 * coordenadas son de una zona generica del Valle de Aburra desplazada a
 * proposito, y los nombres son inventados. Si algun dia coincidiera con algo
 * real seria por azar, no por copia.
 *
 *   node herramientas/generar-demo.mjs [salida.kmz]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as F from '../motor/fixtures/index.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const salida = process.argv[2] ?? path.join(AQUI, '..', 'dist', 'PMT_demostracion.kmz');

const DIA = 86400000;
const hoy = Date.now();
const f = (dias, hora = '07:00:00') =>
  new Date(hoy + dias * DIA).toISOString().slice(0, 10) + ' ' + hora;

/** Contratos inventados. Ninguno existe. */
const CONTRATOS = {
  DEMO_A: { contrato: 'DEMO-2026-A', contratista: 'Constructora Demostracion S.A.S', proyecto: 'RENOVACION_RED_DEMO' },
  DEMO_B: { contrato: 'DEMO-2026-B', contratista: 'Obras Ejemplo y Cia', proyecto: 'COLECTOR_DEMO' },
  DEMO_C: { contrato: 'DEMO-2025-C', contratista: 'Ingenieria Muestra Ltda', proyecto: 'TANQUE_DEMO' },
};

/** Base del area: una zona generica, desplazada a proposito de cualquier obra real. */
const LON = -75.5750, LAT = 6.2450;
const p = (dx, dy) => [+(LON + dx * 0.0009).toFixed(6), +(LAT + dy * 0.0009).toFixed(6)];

const casos = [
  // ── 1 · ARTICULACION: dos contratos, mismo sitio, fechas solapadas ──
  { n: 'DEMO_CALLE_PRINCIPAL', c: 'DEMO_A', tipo: 'total',
    dir: 'Calle Demostracion con Carrera Ejemplo',
    i: f(-3), fin: f(25, '18:00:00'),
    docs: { resolucionPmt: 'DEMO-RES-1001', permisoRotura: 'DEMO-PR-2001', cierrePermisoRotura: 'DEMO-CR-3001' },
    g: F.linea([p(0, 0), p(1.2, 0)]) },
  { n: 'DEMO_CRUCE_NORTE', c: 'DEMO_B', tipo: 'parcial',
    dir: 'Carrera Ejemplo entre Calle Demostracion y Calle Muestra',
    i: f(5), fin: f(35, '18:00:00'),
    docs: { resolucionPmt: 'DEMO-RES-1002' },
    g: F.linea([p(0.6, 0.35), p(1.8, 0.35)]) },

  // ── 2 · COINCIDENCIA ESPACIAL: mismo sitio, momentos distintos ──
  { n: 'DEMO_ANDEN_SUR', c: 'DEMO_B', tipo: 'parcial',
    dir: 'Calle Muestra con Carrera Prueba',
    i: f(90), fin: f(120, '18:00:00'),
    docs: {},
    g: F.linea([p(0.2, -0.4), p(1.4, -0.4)]) },

  // ── 3 · INGRESO Y SALIDA de obra ──
  { n: 'DEMO_ACCESO_OBRA', c: 'DEMO_A', tipo: 'ingreso y salida',
    dir: 'Acceso de vehiculos, Calle Demostracion',
    i: f(-3), fin: f(25, '18:00:00'),
    docs: { resolucionPmt: 'DEMO-RES-1001' },
    g: F.punto(p(0.3, 0.15)) },

  // ── 4 · HISTORICO: termino hace meses ──
  { n: 'DEMO_OBRA_TERMINADA', c: 'DEMO_C', tipo: 'total',
    dir: 'Carrera Antigua con Calle Pasada',
    i: f(-210), fin: f(-150, '18:00:00'),
    docs: { resolucionPmt: 'DEMO-RES-0901', permisoRotura: 'DEMO-PR-0902', cierrePermisoRotura: 'DEMO-CR-0903' },
    g: F.linea([p(0.4, 0.2), p(1.6, 0.2)]) },

  // ── 5 · PROGRAMADO: empieza dentro de meses ──
  { n: 'DEMO_PROGRAMADO_2027', c: 'DEMO_C', tipo: 'total',
    dir: 'Calle Futura con Carrera Proxima',
    i: f(200), fin: f(260, '18:00:00'),
    docs: {},
    g: F.linea([p(3.5, 2.2), p(4.7, 2.2)]) },

  // ── 6 · Lejos de todo: para que no TODO salga relacionado ──
  { n: 'DEMO_SECTOR_APARTE', c: 'DEMO_B', tipo: 'parcial',
    dir: 'Calle Lejana',
    i: f(-1), fin: f(40, '18:00:00'),
    docs: { permisoRotura: 'DEMO-PR-2099' },
    g: F.linea([p(9, 8), p(10.2, 8)]) },
];

const placemarks = casos.map((k) => {
  const c = CONTRATOS[k.c];
  return F.placemark(k.n, F.descripcion({
    inicio: k.i, fin: k.fin, tipo: k.tipo, direccion: k.dir,
    municipio: 'Municipio Demostracion',
    contrato: c.contrato, contratista: c.contratista, proyecto: c.proyecto,
    ...k.docs,
  }), k.g);
});

await writeFile(salida, Buffer.from(F.kmz(placemarks)));

console.log(`\n  DATOS DE DEMOSTRACION generados\n  ${'─'.repeat(58)}`);
console.log(`  archivo ........ ${salida}`);
console.log(`  PMT ............ ${casos.length}`);
console.log(`  contratos ...... ${Object.keys(CONTRATOS).length} (inventados)`);
console.log(`  contiene ....... articulacion · coincidencia espacial · historico`);
console.log(`                   programado · ingreso y salida · los 3 estados documentales`);
console.log(`\n  NINGUN DATO REAL. Nada se copio de 01_KMZ_Entrada ni de ningun`);
console.log(`  archivo de produccion. Se puede enseñar a quien sea.\n`);
