/**
 * ETAPA 2.4 — una prueba por defecto demostrado, y una por su CLASE de error.
 *
 * Los cinco defectos de esta etapa se reprodujeron antes de tocar nada. Estas
 * pruebas son la demostración de que cada uno está cerrado, y de que lo está
 * por su causa raíz y no por el ejemplo concreto que los encontró.
 *
 * No se tocan las pruebas de etapas anteriores: siguen siendo la garantía de
 * que lo ya cerrado no se ha vuelto a abrir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Proyecto from '../nucleo/proyecto.js';
import * as T from '../nucleo/tiempo.js';
import { resumir, frasePrincipal } from '../nucleo/resumen.js';
import { aFilaPmt } from '../nucleo/modelo.js';
import { pmtsACsv, csvCompatibleLegado } from '../nucleo/exportar.js';

const CONFIG = {
  umbralMetros: 120, toleranciaMinutos: 0, granularidadTemporal: 'instante',
  excluirMismoContrato: true, modoDistancia: 'real',
};

const trazado = (id, extra = {}) => ({
  id, frente: 'F ' + id, contrato: 'C-1', contratista: 'X', proyecto: 'P',
  municipio: 'Medellín', direccion: 'Cra 1', tipoCierre: 'parcial',
  inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
  inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 10, 18), vigenciaValida: true,
  geometria: { type: 'Point', coordinates: [-75.6, 6.2] },
  tipoGeometria: 'Point', tieneGeometria: true, analizable: true,
  origenArchivo: 'a.kmz', carpeta: null, avisos: [], ...extra,
});

const guardarYAbrir = (filas) => {
  const p = Proyecto.crearProyecto({
    filas, relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG, filtros: null, nombre: 'ida y vuelta', versionReglas: '1.2.0',
  });
  const r = Proyecto.leerProyecto(Proyecto.serializar(p));
  assert.equal(r.ok, true, r.motivo);
  return r;
};

/* ═══════════ D1 · UNA FECHA MALA NO SE LLEVA POR DELANTE A LA BUENA ═══════════
 *
 * Reproducido antes de corregir: `pmt_4bdd177c576cc2d3` tenía inicio
 * «2026-02-04 09:00:00» y un fin ilegible; al guardar y abrir, los DOS extremos
 * salían nulos. La clase de error —«un fallo parcial destruye la información
 * válida que lo acompaña»— se cierra modelando cada extremo por separado.
 */

test('D1: inicio válido + fin ilegible → se conserva el inicio', () => {
  const v = T.normalizarVigencia({ inicio: '2026-02-04 09:00:00', fin: 'no definida' });
  assert.equal(v.inicio, '2026-02-04 09:00:00', 'el inicio válido no se pierde');
  assert.equal(v.inicioMs, Date.UTC(2026, 1, 4, 9));
  assert.equal(v.inicioValido, true);
  assert.equal(v.fin, null);
  assert.equal(v.finMs, null);
  assert.equal(v.finValido, false);
  assert.equal(v.valida, false, 'sin los dos extremos NO se puede comparar en el tiempo');
  assert.equal(v.estado, 'incompleta');
});

test('D1: fin válido + inicio ilegible → se conserva el fin (simétrico)', () => {
  const v = T.normalizarVigencia({ inicio: '???', fin: '2026-02-10 18:00:00' });
  assert.equal(v.fin, '2026-02-10 18:00:00');
  assert.equal(v.finMs, Date.UTC(2026, 1, 10, 18));
  assert.equal(v.finValido, true);
  assert.equal(v.inicio, null);
  assert.equal(v.inicioValido, false);
  assert.equal(v.valida, false);
  assert.equal(v.estado, 'incompleta');
});

test('D1: los dos válidos → vigencia completa y utilizable', () => {
  const v = T.normalizarVigencia({ inicio: '2026-02-04 09:00:00', fin: '2026-02-10 18:00:00' });
  assert.equal(v.valida, true);
  assert.equal(v.estado, 'completa');
  assert.equal(v.inicioValido, true);
  assert.equal(v.finValido, true);
});

test('D1: los dos ilegibles → nada que conservar, y se dice', () => {
  const v = T.normalizarVigencia({ inicio: 'x', fin: 'y' });
  assert.equal(v.valida, false);
  assert.equal(v.estado, 'ilegible', 'no es lo mismo «no vino» que «vino y no se entiende»');
  assert.equal(v.inicio, null);
  assert.equal(v.fin, null);
  assert.equal(v.avisos.length, 2, 'un aviso por cada extremo');
});

test('D1: inicio posterior al fin → los dos textos se conservan, sin milisegundos', () => {
  const v = T.normalizarVigencia({ inicio: '2026-02-20 09:00:00', fin: '2026-02-10 18:00:00' });
  assert.equal(v.estado, 'invertida');
  assert.equal(v.valida, false);
  assert.equal(v.inicio, '2026-02-20 09:00:00');
  assert.equal(v.fin, '2026-02-10 18:00:00');
  assert.equal(v.inicioMs, null, 'como intervalo no existe: ninguna duración calculable');
  assert.equal(v.finMs, null);
  assert.ok(v.avisos.some((a) => /anterior a la de inicio/.test(a)));
});

test('D1: sin ninguna de las dos fechas → estado «ausente», no «incompleta»', () => {
  const v = T.normalizarVigencia({ inicio: null, fin: null });
  assert.equal(v.estado, 'ausente');
  assert.equal(v.valida, false);
});

test('D1: la contradicción texto/milisegundos sigue invalidando (invariante 2.3)', () => {
  const v = T.normalizarVigencia({
    inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
    inicioMs: Date.UTC(2030, 2, 1, 6), finMs: Date.UTC(2030, 2, 10, 18),
  });
  assert.equal(v.valida, false);
  assert.equal(v.estado, 'incoherente');
  assert.equal(v.inicio, '2026-03-01 06:00:00', 'el texto canónico se conserva');
  assert.equal(v.inicioMs, null, 'y no se calcula con la fecha inventada');
});

test('D1: IDA Y VUELTA — cada combinación sobrevive a guardar y abrir', () => {
  const casos = [
    ['inicio válido, fin ilegible', { inicio: '2026-02-04 09:00:00', fin: null },
      { inicio: '2026-02-04 09:00:00', fin: null, valida: false }],
    ['fin válido, inicio ilegible', { inicio: null, fin: '2026-02-10 18:00:00' },
      { inicio: null, fin: '2026-02-10 18:00:00', valida: false }],
    ['los dos válidos', { inicio: '2026-02-04 09:00:00', fin: '2026-02-10 18:00:00' },
      { inicio: '2026-02-04 09:00:00', fin: '2026-02-10 18:00:00', valida: true }],
    ['los dos ausentes', { inicio: null, fin: null },
      { inicio: null, fin: null, valida: false }],
    ['inicio posterior al fin', { inicio: '2026-02-20 09:00:00', fin: '2026-02-10 18:00:00' },
      { inicio: '2026-02-20 09:00:00', fin: '2026-02-10 18:00:00', valida: false }],
  ];
  for (const [etq, entrada, esperado] of casos) {
    const r = guardarYAbrir([trazado('a', { ...entrada, inicioMs: null, finMs: null, vigenciaValida: false })]);
    const x = r.proyecto.trazados[0];
    assert.equal(x.inicio, esperado.inicio, `${etq}: el inicio no sobrevivió`);
    assert.equal(x.fin, esperado.fin, `${etq}: el fin no sobrevivió`);
    assert.equal(x.vigenciaValida, esperado.valida, `${etq}: la validez cambió al guardar y abrir`);
  }
});

test('D1: el defecto exacto de la auditoría — pmt_4bdd177c576cc2d3', () => {
  const fila = trazado('pmt_4bdd177c576cc2d3', {
    inicio: '2026-02-04 09:00:00', fin: null,
    inicioMs: null, finMs: null, vigenciaValida: false,
    avisos: ['fecha de fin ilegible en el KMZ'],
  });
  const x = guardarYAbrir([fila]).proyecto.trazados[0];
  assert.equal(x.inicio, '2026-02-04 09:00:00', 'ANTES: salía null');
  assert.equal(x.inicioMs, Date.UTC(2026, 1, 4, 9));
  assert.equal(x.inicioValido, true);
  assert.equal(x.vigenciaEstado, 'incompleta');
  assert.equal(x.vigenciaValida, false, 'el motor sigue dejándolo fuera del traslape');
});

test('D1: una vigencia incompleta no se cuela en el análisis temporal', () => {
  // Lo que cambia es lo que se CONSERVA, no lo que se CALCULA.
  const x = guardarYAbrir([trazado('a', {
    inicio: '2026-02-04 09:00:00', fin: null, inicioMs: null, finMs: null, vigenciaValida: false,
  })]).proyecto.trazados[0];
  assert.equal(x.vigenciaValida, false);
  assert.equal(x.finMs, null, 'no se inventa un fin para poder comparar');
  assert.equal(x.analizable, false, 'sin vigencia utilizable no entra en el análisis');
});

test('D1: la fecha conservada llega a las exportaciones', () => {
  const fila = {
    ...trazado('a'), inicio: '2026-02-04 09:00:00', fin: null,
    inicioMs: Date.UTC(2026, 1, 4, 9), finMs: null, vigenciaValida: false,
  };
  assert.ok(pmtsACsv([fila]).includes('2026-02-04 09:00:00'), 'el CSV de PMT la lleva');
  assert.ok(csvCompatibleLegado([fila], []).includes('2026-02-04'), 'el CSV legado también');
  const duracion = csvCompatibleLegado([fila], []).trim().split('\n')[1].split(';').pop();
  assert.equal(duracion, '0', 'sin fin no hay duración que calcular, y no sale negativa');
});

/* ═══════════ D3 · NINGUNA CIFRA SIN ALCANCE ═══════════
 *
 * Reproducido: con un filtro puesto, las tarjetas decían 2 PMT y 2 contratos y
 * la tabla y el informe decían 1 y 1. Las dos eran ciertas; la pantalla no
 * decía de qué conjunto hablaba cada una.
 */

test('D3: el alcance viaja dentro del resumen', () => {
  const filas = [trazado('a'), trazado('b', { contrato: 'C-2' })];
  const total = resumir(null, filas, [], []);
  const visible = resumir(null, [filas[0]], [], [], { total: filas.length });

  assert.equal(total.filtrado, false);
  assert.equal(total.pmts, 2);
  assert.equal(total.pmtsCargados, 2);

  assert.equal(visible.filtrado, true);
  assert.equal(visible.pmts, 1, 'las tarjetas cuentan lo visible');
  assert.equal(visible.contratos, 1);
  assert.equal(visible.pmtsCargados, 2, 'y el total sigue disponible, sin mezclarse');
});

test('D3: INVARIANTE — mismo alcance, mismas cifras', () => {
  const filas = [trazado('a'), trazado('b', { contrato: 'C-2' }), trazado('c', { contrato: 'C-3' })];
  const rel = [{ idA: 'a', idB: 'b', distanciaMetros: 10, intersecanFisicamente: false,
    hayTraslapeTemporal: true, distanciaEvaluable: true, traslapeEvaluable: true }];
  for (const visibles of [filas, [filas[0]], [filas[0], filas[1]], []]) {
    const ids = new Set(visibles.map((x) => x.id));
    const relVis = rel.filter((r) => ids.has(r.idA) && ids.has(r.idB));
    const a = resumir(null, visibles, relVis, [], { total: filas.length });
    const b = resumir(null, visibles, relVis, [], { total: filas.length });
    assert.deepEqual(a, b, 'dos llamadas con el mismo alcance tienen que dar lo mismo');
    assert.equal(a.pmts, visibles.length);
    assert.equal(a.relaciones, relVis.length);
    assert.equal(a.pmtsCargados, filas.length);
  }
});

test('D3: la frase principal dice si está filtrado, y no engaña', () => {
  const filas = [trazado('a'), trazado('b', { contrato: 'C-2' })];
  const f = frasePrincipal(resumir(null, [filas[0]], [], [], { total: 2 }));
  assert.ok(/mostrando/.test(f), f);
  assert.ok(/de los 2 cargados/.test(f), f);

  const t = frasePrincipal(resumir(null, filas, [], []));
  assert.ok(/Se analizaron 2 PMT/.test(t), t);
  assert.ok(!/cargados/.test(t), 'sin filtros no hace falta distinguir dos alcances');
});

test('D3: filtrar hasta dejarlo vacío no se confunde con «no había nada»', () => {
  const vacio = frasePrincipal(resumir(null, [], [], [], { total: 460 }));
  assert.ok(/Ningun PMT de los 460 cargados/.test(vacio), vacio);
  const nada = frasePrincipal(resumir(null, [], [], []));
  assert.ok(/No se encontro ningun PMT/.test(nada), nada);
});

/* ═══════════ D5 · NINGÚN CONTADOR SIN EVIDENCIA ═══════════
 *
 * Reproducido: los 8 KMZ reales declaran 3 duplicados exactos; al guardar el
 * proyecto y volver a abrirlo el contador se iba a 0, aunque las tres copias
 * seguían en la tabla con su sufijo `~N`.
 */

test('D5: la marca de duplicado llega del motor a la fila de la interfaz', () => {
  const fila = aFilaPmt({ id: 'x~2', vigencia: {}, avisos: [], duplicadoExacto: true });
  assert.equal(fila.duplicadoExacto, true);
  const normal = aFilaPmt({ id: 'x', vigencia: {}, avisos: [] });
  assert.equal(normal.duplicadoExacto, false, 'sin marca, false explícito (nunca undefined)');
});

test('D5: los duplicados sobreviven a guardar y abrir', () => {
  const filas = [
    trazado('pmt_a'),
    trazado('pmt_a~2', { duplicadoExacto: true, avisos: ['registro identico a otro del mismo origen (copia 2)'] }),
    trazado('pmt_a~3', { duplicadoExacto: true, avisos: ['registro identico a otro del mismo origen (copia 3)'] }),
  ];
  const abiertos = guardarYAbrir(filas).proyecto.trazados;
  assert.equal(abiertos.filter((x) => x.duplicadoExacto).length, 2,
    'ANTES: al abrir el proyecto el contador se iba a 0');
  // El contador se reconstruye contando filas: tiene el mismo respaldo visible
  // que el usuario ve en la tabla.
  assert.equal(abiertos.filter((x) => x.duplicadoExacto).length,
    filas.filter((x) => x.duplicadoExacto).length, 'mismo número antes y después');
});

test('D5: una marca sin respaldo en el identificador se ignora', () => {
  // Quien edite el archivo no puede inflar el contador: la evidencia es el
  // sufijo `~N` que el motor pone a una copia, y está a la vista en la tabla.
  const r = guardarYAbrir([trazado('pmt_sin_sufijo', { duplicadoExacto: true })]);
  assert.equal(r.proyecto.trazados[0].duplicadoExacto, false);
  assert.ok(r.avisos.some((a) => /sin que su identificador lo respalde/.test(a)),
    JSON.stringify(r.avisos));
});

test('D5: un identificador repetido en origen no se cuenta como duplicado exacto', () => {
  const abiertos = guardarYAbrir([
    trazado('pmt_b'),
    trazado('pmt_b~2', { idRepetidoEnOrigen: true }),
  ]).proyecto.trazados;
  assert.equal(abiertos.filter((x) => x.duplicadoExacto).length, 0);
  assert.equal(abiertos.filter((x) => x.idRepetidoEnOrigen).length, 1);
});
