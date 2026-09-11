/**
 * Identificadores estables: lo que reemplaza al "nombre del frente como llave"
 * que usaba el sistema legado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularId, canonizarGeometria, hash64, desambiguar } from '../src/modelo/identidad.js';
import { analizar } from '../src/nucleo/index.js';
import * as F from '../fixtures/index.mjs';

const base = {
  contrato: 'CW1', frente: 'PMT_01', tipoCierre: 'total', direccion: 'Calle 1',
  inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
};
const geom = { type: 'LineString', coordinates: [[-75.60, 6.20], [-75.59, 6.21]] };
const id = (c = {}, g = geom) => calcularId({ ...base, ...c }, g).id;

test('el mismo contenido da siempre el mismo identificador', () => {
  assert.equal(id(), id());
  assert.equal(id(), calcularId({ ...base }, JSON.parse(JSON.stringify(geom))).id);
});

test('MISMO FRENTE CON OTRA VIGENCIA es otro registro', () => {
  assert.notEqual(id(), id({ inicio: '2026-05-01 06:00:00', fin: '2026-05-10 18:00:00' }));
});

test('NOMBRES IGUALES en contratos distintos son registros distintos', () => {
  assert.notEqual(id(), id({ contrato: 'CW2' }));
});

test('MISMOS DATOS con geometria distinta son registros distintos', () => {
  const otra = { type: 'LineString', coordinates: [[-75.60, 6.20], [-75.58, 6.22]] };
  assert.notEqual(id(), id({}, otra));
});

test('cambiar direccion, tipo de cierre o nombre cambia el identificador', () => {
  assert.notEqual(id(), id({ direccion: 'Calle 2' }));
  assert.notEqual(id(), id({ tipoCierre: 'parcial' }));
  assert.notEqual(id(), id({ frente: 'PMT_02' }));
});

test('no depende del orden de lectura, del archivo ni del reloj', () => {
  const a = id();
  const b = calcularId({ ...base }, geom).id;
  assert.equal(a, b);
  assert.match(a, /^pmt_[0-9a-f]{16}$/);
});

test('un identificador propio dentro del KMZ tiene prioridad', () => {
  const r = calcularId(base, geom, 'PMT-0001');
  assert.equal(r.id, 'PMT-0001');
  assert.ok(r.origen.includes('explicito'));
});

test('ruido de coma flotante por debajo del centimetro no cambia el identificador', () => {
  const g1 = { type: 'LineString', coordinates: [[-75.6000000, 6.2000000], [-75.59, 6.21]] };
  const g2 = { type: 'LineString', coordinates: [[-75.60000000004, 6.20000000003], [-75.59, 6.21]] };
  assert.equal(id({}, g1), id({}, g2));
});

test('la canonizacion cubre todos los tipos de geometria', () => {
  assert.ok(canonizarGeometria({ type: 'Point', coordinates: [-75.6, 6.2] }).startsWith('Point['));
  assert.ok(canonizarGeometria({ type: 'MultiPolygon', coordinates: [[[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.2]]]] }).startsWith('MultiPolygon['));
  assert.ok(canonizarGeometria({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] }).startsWith('GC['));
  assert.equal(canonizarGeometria(null), 'sin-geometria');
});

test('el resumen distribuye bien y no colisiona en un volumen realista', () => {
  const vistos = new Set();
  for (let i = 0; i < 20000; i++) vistos.add(hash64(`registro-${i}-CW${i % 13}`));
  assert.equal(vistos.size, 20000);
});

test('duplicados exactos se conservan, se marcan y quedan distinguibles', () => {
  const regs = [
    { id: 'pmt_a', avisos: [] }, { id: 'pmt_a', avisos: [] },
    { id: 'pmt_a', avisos: [] }, { id: 'pmt_b', avisos: [] },
  ];
  const n = desambiguar(regs);
  assert.equal(n, 2);
  assert.deepEqual(regs.map((r) => r.id), ['pmt_a', 'pmt_a~2', 'pmt_a~3', 'pmt_b']);
  assert.equal(new Set(regs.map((r) => r.id)).size, 4);
  assert.ok(regs[1].avisos[0].includes('identico a otro'));
  assert.equal(regs[1].duplicadoExacto, true);
});

test('los identificadores NO cambian al cambiar la configuracion del motor', async () => {
  // Requisito para poder comparar dos ejecuciones registro a registro.
  const archivo = {
    nombre: 'a.kmz',
    datos: F.kmz([
      F.placemark('A', F.descripcion({ inicio: '2026-03-01 21:00:00', fin: '2026-03-10 04:00:00', contrato: 'CW1' }), F.punto([-75.60, 6.20])),
      F.placemark('B', F.descripcion({ inicio: '2026-03-05 06:00:00', fin: '2026-03-20 18:00:00', contrato: 'CW2' }), F.punto([-75.6000, 6.2005])),
    ]),
  };
  const a = await analizar([archivo], { granularidadTemporal: 'dia', umbralMetros: 120 });
  const b = await analizar([archivo], { granularidadTemporal: 'instante', umbralMetros: 250 });
  assert.deepEqual(a.registros.map((r) => r.id), b.registros.map((r) => r.id));
});

test('nombres donde uno es prefijo del otro NO se confunden', () => {
  // Este es el caso que rompia la sincronia mapa-tabla del tablero legado:
  // en los datos reales hay 26 pares asi.
  const a = id({ frente: 'CLPA ET2 4 1' });
  const b = id({ frente: 'CLPA ET2 4 10' });
  assert.notEqual(a, b);
  assert.ok(!a.includes(b) && !b.includes(a));
});
