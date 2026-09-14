/**
 * Pruebas de la logica de la aplicacion (Etapa 2).
 *
 * Solo cubren los modulos PUROS de `app/nucleo/`: filtrado, exportacion,
 * resumen e ingesta. La parte que toca el DOM se prueba en navegador real.
 *
 * Ninguna de estas pruebas usa datos reales de EPM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { aFilaPmt, estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL, TIPOS_CIERRE, LECTURA, simbologiaDe, SIMBOLOGIA_CIERRE } from '../nucleo/modelo.js';
import * as Filtro from '../nucleo/filtrado.js';
import * as Export from '../nucleo/exportar.js';
import { resumir, frasePrincipal, estadoArchivo } from '../nucleo/resumen.js';
import { extensionAceptada, procesar, explicar, diagnosticoArchivos } from '../nucleo/ingesta.js';
import * as F from '../../motor/fixtures/index.mjs';

const d = (c, o = {}) => F.descripcion({
  inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00',
  contrato: c, municipio: 'Medellin', ...o,
});
const kmz = (nombre, pms) => ({ nombre, datos: F.kmz(pms) });

const fila = (o = {}) => ({
  id: 'x', frente: 'F', contrato: 'CW1', contratista: 'CT', proyecto: 'P', municipio: 'M',
  direccion: 'Calle 1', tipoCierre: 'total', inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00',
  inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 30, 18), vigenciaValida: true,
  tipoGeometria: 'Point', tieneGeometria: true, analizable: true, origenArchivo: 'a.kmz',
  avisos: [], geometria: { type: 'Point', coordinates: [-75.6, 6.2] }, ...o,
});

// ───────────────────────────── MODELO ─────────────────────────────

test('MODELO: la lista de tipos de cierre es EXACTAMENTE la del contrato vigente', () => {
  // Ni uno mas ni uno menos. "ingreso" y "salida" por separado se retiraron:
  // no hay decision aprobada que los separe de "ingreso y salida".
  assert.deepEqual([...TIPOS_CIERRE], ['total', 'parcial', 'ingreso y salida']);
});

test('MODELO: cada tipo de cierre tiene simbologia propia y distinguible', () => {
  const vistos = new Set();
  for (const t of [...TIPOS_CIERRE, '(sin dato)']) {
    const s = simbologiaDe(t);
    assert.ok(s.color && s.etiqueta, t);
    // No puede depender solo del color: color + grosor + patron tienen que
    // formar una combinacion unica, para quien no distinga los colores.
    const firma = `${s.color}|${s.grosor}|${s.guion}`;
    assert.ok(!vistos.has(firma), `la simbologia de "${t}" se repite`);
    vistos.add(firma);
  }
  assert.equal(simbologiaDe('ingreso y salida').marcador, true, 'lleva marcador propio, como en QGIS');
  assert.equal(simbologiaDe('total').marcador, false);
});

test('MODELO: un tipo desconocido no rompe el mapa, cae en "sin dato"', () => {
  for (const t of [null, undefined, '', 'inventado', 'TOTAL ']) {
    assert.ok(simbologiaDe(t).color, String(t));
  }
  assert.equal(simbologiaDe('TOTAL').etiqueta, 'Cierre total', 'no distingue mayusculas');
});

test('MODELO: "no evaluable" nunca se confunde con "no hay"', () => {
  assert.equal(estadoEspacial({ espacialEvaluable: false }), ESPACIAL.NO_EVALUABLE);
  assert.equal(estadoEspacial({ distanciaMetros: null }), ESPACIAL.NO_EVALUABLE);
  assert.equal(estadoEspacial({ distanciaMetros: 0, intersecanFisicamente: true }), ESPACIAL.CONTACTO);
  assert.equal(estadoEspacial({ distanciaMetros: 50, intersecanFisicamente: false, dentroDelUmbral: true }), ESPACIAL.CERCANIA);
  assert.equal(estadoEspacial({ distanciaMetros: 500, intersecanFisicamente: false, dentroDelUmbral: false }), ESPACIAL.FUERA);
  assert.equal(estadoTemporal({ traslapeEvaluable: false, hayTraslapeTemporal: false }), TEMPORAL.NO_EVALUABLE);
  assert.equal(estadoTemporal({ traslapeEvaluable: true, hayTraslapeTemporal: false }), TEMPORAL.NO_COINCIDE);
});

// ───────────────────────────── FILTRADO ─────────────────────────────

test('FILTRO: sin filtros no se descarta nada', () => {
  const filas = [fila(), fila({ id: 'y', contrato: 'CW2' })];
  assert.equal(Filtro.filtrarPmts(filas, Filtro.filtrosVacios()).length, 2);
  assert.equal(Filtro.hayFiltrosActivos(Filtro.filtrosVacios()), false);
});

test('FILTRO: todas las capacidades del tablero historico, mas proyecto y tipo de cierre', () => {
  const filas = [
    fila({ id: 'a', contrato: 'CW1', contratista: 'X', proyecto: 'P1', municipio: 'Medellin', frente: 'F1', tipoCierre: 'total' }),
    fila({ id: 'b', contrato: 'CW2', contratista: 'Y', proyecto: 'P2', municipio: 'Envigado', frente: 'F2', tipoCierre: 'parcial' }),
  ];
  const f = Filtro.filtrosVacios();
  for (const [campo, valor, esperado] of [
    ['contrato', 'CW1', 'a'], ['contratista', 'Y', 'b'], ['proyecto', 'P1', 'a'],
    ['municipio', 'Envigado', 'b'], ['frente', 'F1', 'a'], ['tipoCierre', 'parcial', 'b'],
  ]) {
    const r = Filtro.filtrarPmts(filas, { ...f, [campo]: [valor] });
    assert.equal(r.length, 1, campo);
    assert.equal(r[0].id, esperado, campo);
  }
});

test('FILTRO: seleccion multiple dentro de un mismo campo suma, no resta', () => {
  const filas = [fila({ id: 'a', contrato: 'CW1' }), fila({ id: 'b', contrato: 'CW2' }), fila({ id: 'c', contrato: 'CW3' })];
  const r = Filtro.filtrarPmts(filas, { ...Filtro.filtrosVacios(), contrato: ['CW1', 'CW3'] });
  assert.deepEqual(r.map((x) => x.id), ['a', 'c']);
});

test('FILTRO: el rango de fechas admite solapamiento parcial, no solo contencion', () => {
  const f = fila({ inicioMs: Date.UTC(2026, 2, 10), finMs: Date.UTC(2026, 2, 20) });
  assert.ok(Filtro.tocaRango(f, '2026-03-15', '2026-04-01'), 'empieza antes y termina dentro');
  assert.ok(Filtro.tocaRango(f, '2026-03-01', '2026-03-12'), 'empieza dentro y termina despues');
  assert.ok(Filtro.tocaRango(f, '2026-03-12', '2026-03-15'), 'contenido dentro del rango');
  assert.ok(!Filtro.tocaRango(f, '2026-05-01', '2026-05-30'), 'sin ninguna coincidencia');
});

test('FILTRO: un PMT sin vigencia valida NO se esconde al filtrar por fecha', () => {
  // No se puede afirmar que quede fuera de un rango que no se puede comparar.
  const malo = fila({ id: 'malo', vigenciaValida: false, inicioMs: null, finMs: null });
  const r = Filtro.filtrarPmts([malo], { ...Filtro.filtrosVacios(), desde: '2030-01-01', hasta: '2030-12-31' });
  assert.equal(r.length, 1, 'se conserva para que se vea que existe y que no se pudo evaluar');
});

test('FILTRO: la busqueda libre mira todos los campos de texto', () => {
  const filas = [fila({ id: 'a', direccion: 'Carrera 80 con 30' }), fila({ id: 'b', direccion: 'Calle 10' })];
  const r = Filtro.filtrarPmts(filas, { ...Filtro.filtrosVacios(), texto: 'carrera 80' });
  assert.deepEqual(r.map((x) => x.id), ['a']);
});

test('FILTRO: las relaciones se filtran por HECHOS, sin ninguna criticidad', () => {
  const claves = Filtro.CLAVES_RELACION.map(([k]) => k);
  const texto = JSON.stringify(Filtro.CLAVES_RELACION).toLowerCase();
  for (const prohibida of ['critic', 'alto', 'medio', 'bajo', 'severidad', 'prioridad']) {
    assert.ok(!texto.includes(prohibida), `la palabra "${prohibida}" no puede aparecer todavia`);
  }
  const rel = (o) => ({ idA: 'a', idB: 'b', ...o });
  const contacto = rel({ distanciaMetros: 0, intersecanFisicamente: true, traslapeEvaluable: true, hayTraslapeTemporal: true });
  const lejos = rel({ distanciaMetros: 500, intersecanFisicamente: false, dentroDelUmbral: false, traslapeEvaluable: true, hayTraslapeTemporal: false });
  const f = Filtro.filtrosVacios();
  assert.equal(Filtro.filtrarRelaciones([contacto, lejos], { ...f, relacion: ['contacto'] }).length, 1);
  assert.equal(Filtro.filtrarRelaciones([contacto, lejos], { ...f, relacion: ['contacto-a-la-vez'] }).length, 1);
  assert.ok(claves.includes('espacial-no-evaluable') && claves.includes('temporal-no-evaluable'));
});

test('FILTRO: una relacion sobrevive si CUALQUIERA de sus dos extremos esta visible', () => {
  const rel = { idA: 'a', idB: 'b', distanciaMetros: 10, intersecanFisicamente: false, dentroDelUmbral: true, traslapeEvaluable: true, hayTraslapeTemporal: true };
  const f = Filtro.filtrosVacios();
  assert.equal(Filtro.filtrarRelaciones([rel], f, new Set(['a'])).length, 1, 'ver con quien choca mi contrato');
  assert.equal(Filtro.filtrarRelaciones([rel], f, new Set(['z'])).length, 0);
});

test('FILTRO: las opciones de cada desplegable salen ordenadas y con su recuento', () => {
  const filas = [fila({ contrato: 'CW2' }), fila({ contrato: 'CW1' }), fila({ contrato: 'CW1' }), fila({ contrato: null })];
  const op = Filtro.opcionesDe(filas, 'contrato');
  assert.deepEqual(op.map((x) => x.valor), ['(sin dato)', 'CW1', 'CW2']);
  assert.equal(op.find((x) => x.valor === 'CW1').n, 2);
});

test('FILTRO: vigentes en un instante, y rango temporal de los datos', () => {
  const a = fila({ id: 'a', inicioMs: Date.UTC(2026, 0, 1), finMs: Date.UTC(2026, 0, 31) });
  const b = fila({ id: 'b', inicioMs: Date.UTC(2026, 5, 1), finMs: Date.UTC(2026, 5, 30) });
  const sin = fila({ id: 'sin', vigenciaValida: false, inicioMs: null, finMs: null });
  assert.deepEqual(Filtro.vigentesEn([a, b, sin], Date.UTC(2026, 0, 15)).map((x) => x.id), ['a']);
  assert.deepEqual(Filtro.vigentesEn([a, b, sin], Date.UTC(2026, 3, 1)).map((x) => x.id), []);
  const r = Filtro.rangoTemporal([a, b, sin]);
  assert.equal(r.min, Date.UTC(2026, 0, 1));
  assert.equal(r.max, Date.UTC(2026, 5, 30));
  assert.equal(Filtro.rangoTemporal([sin]), null);
});

// ───────────────────────────── EXPORTACION ─────────────────────────────

test('EXPORTA: el CSV legado conserva EXACTAMENTE sus 11 columnas', () => {
  const csv = Export.csvCompatibleLegado([fila()], []);
  const cab = csv.replace(Export.BOM, '').split('\r\n')[0].split(';');
  assert.deepEqual(cab, [...Export.COLUMNAS_LEGADO]);
  assert.equal(cab.length, 11);
});

test('EXPORTA: el CSV escapa separadores y comillas sin romper la fila', () => {
  const csv = Export.pmtsACsv([fila({ direccion: 'Calle 1; con "comillas"', frente: 'a\nb' })]);
  const lineas = csv.replace(Export.BOM, '').split('\r\n');
  assert.equal(lineas.length, 2, 'el salto de linea interno no puede partir la fila');
  assert.ok(lineas[1].includes('"Calle 1; con ""comillas"""'));
});

test('EXPORTA: el CSV lleva BOM para que Excel no destroce las tildes', () => {
  assert.ok(Export.pmtsACsv([fila({ municipio: 'Medellín' })]).startsWith('﻿'));
});

test('EXPORTA: GeoJSON valido con todas las propiedades del modelo', () => {
  const g = Export.aGeoJson([fila()]);
  assert.equal(g.type, 'FeatureCollection');
  assert.equal(g.features.length, 1);
  assert.equal(g.features[0].geometry.type, 'Point');
  for (const k of ['id', 'frente', 'contrato', 'contratista', 'proyecto', 'municipio', 'tipo_cierre', 'fecha_inicio', 'fecha_fin']) {
    assert.ok(k in g.features[0].properties, `falta ${k}`);
  }
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(g)));
});

test('EXPORTA: un PMT sin geometria no entra al GeoJSON ni al KML, pero si al CSV', () => {
  const sin = fila({ id: 'sg', geometria: null, tieneGeometria: false });
  assert.equal(Export.aGeoJson([sin]).features.length, 0);
  assert.ok(!Export.aKml([sin]).includes('Placemark'));
  assert.ok(Export.pmtsACsv([sin]).includes('sg'), 'en el CSV si, para que conste que existe');
});

test('EXPORTA: el KML sale con el formato invariante y se puede volver a cargar', async () => {
  const kmlTexto = Export.aKml([fila({ frente: 'F1' })]);
  assert.ok(kmlTexto.includes('fecha_inicio: 2026-03-01 06:00:00 | fecha_fin:'));
  assert.ok(kmlTexto.includes('tipo_cierre: total'));
  assert.ok(kmlTexto.includes('contrato: CW1'));
  // La prueba de verdad: el motor lo vuelve a leer sin perder nada.
  const r = await procesar([{ nombre: 'vuelta.kml', datos: kmlTexto }], {});
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].contrato, 'CW1');
  assert.equal(r.filas[0].frente, 'F1');
  assert.equal(r.filas[0].tipoCierre, 'total');
  assert.equal(r.filas[0].inicio, '2026-03-01 06:00:00');
});

test('EXPORTA: el KML escapa el XML y no se corrompe con caracteres especiales', () => {
  const k = Export.aKml([fila({ frente: 'A & B <raro>', direccion: 'x"y' })]);
  assert.ok(k.includes('A &amp; B &lt;raro&gt;'));
  assert.ok(!/<raro>/.test(k));
});

test('EXPORTA: los tres tipos de geometria de los datos reales sobreviven al KML', () => {
  const linea = fila({ geometria: { type: 'LineString', coordinates: [[-75.6, 6.2], [-75.5, 6.3]] } });
  const pol = fila({ geometria: { type: 'Polygon', coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.2]]] } });
  assert.ok(Export.aKml([linea]).includes('<LineString>'));
  assert.ok(Export.aKml([pol]).includes('<outerBoundaryIs>'));
  assert.ok(Export.aKml([fila()]).includes('<Point>'));
});

// ───────────────────────────── RESUMEN ─────────────────────────────

test('RESUMEN: "no se pudo analizar" va en su propio contador, nunca sumado', () => {
  const rels = [
    { idA: 'a', idB: 'b', distanciaMetros: 0, intersecanFisicamente: true, traslapeEvaluable: true, hayTraslapeTemporal: true },
    { idA: 'c', idB: 'd', distanciaMetros: 50, intersecanFisicamente: false, dentroDelUmbral: true, traslapeEvaluable: false, hayTraslapeTemporal: false },
    { idA: 'e', idB: 'f', espacialEvaluable: false, distanciaMetros: null, traslapeEvaluable: true, hayTraslapeTemporal: false },
  ];
  const r = resumir({ calidad: {}, estadisticas: {} }, [fila()], rels);
  assert.equal(r.contacto, 1);
  assert.equal(r.cercania, 1);
  assert.equal(r.espacialNoEval, 1);
  assert.equal(r.temporalNoEval, 1);
  assert.equal(r.aLaVez, 1, 'solo la primera coincide de verdad');
  assert.equal(r.contactoALaVez, 1);
});

test('RESUMEN: la frase principal avisa de lo no evaluable ANTES de dar nada por bueno', () => {
  const base = { pmts: 10, contratos: 2, relaciones: 0, aLaVez: 0, contacto: 0 };
  const limpia = frasePrincipal({ ...base, espacialNoEval: 0, temporalNoEval: 0, archivosParciales: 0, archivosFallidos: 0 });
  assert.ok(limpia.includes('No se encontro ninguna relacion'));
  assert.ok(!limpia.includes('Atencion'));
  const sucia = frasePrincipal({ ...base, espacialNoEval: 3, temporalNoEval: 0, archivosParciales: 1, archivosFallidos: 0 });
  assert.ok(sucia.includes('Atencion'));
  assert.ok(sucia.includes('no se pudo comprobar'), sucia);
});

test('RESUMEN: sin PMT lo dice, en vez de ensenar ceros tranquilizadores', () => {
  assert.ok(frasePrincipal({ pmts: 0 }).includes('No se encontro ningun PMT'));
});

test('RESUMEN: el estado de cada archivo distingue completo, parcial y fallido', () => {
  assert.equal(estadoArchivo({ ok: true, motivosCobertura: [] }), LECTURA.COMPLETA);
  assert.equal(estadoArchivo({ ok: true, motivosCobertura: ['NetworkLink'] }), LECTURA.PARCIAL);
  assert.equal(estadoArchivo({ ok: false, errores: ['roto'] }), LECTURA.FALLIDA);
});

// ───────────────────────────── INGESTA ─────────────────────────────

test('INGESTA: acepta .kml y .kmz, rechaza lo demas diciendolo', () => {
  assert.ok(extensionAceptada('a.kmz') && extensionAceptada('A.KML'));
  assert.ok(!extensionAceptada('a.zip') && !extensionAceptada('a.pdf') && !extensionAceptada('a'));
});

test('INGESTA: un KMZ se procesa de principio a fin sin pasar por QGIS', async () => {
  const r = await procesar([kmz('a.kmz', [
    F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000])),
    F.placemark('B', d('CW2'), F.punto([-75.6000, 6.2005])),
  ])], { umbralMetros: 120 });
  assert.equal(r.error, null);
  assert.equal(r.filas.length, 2);
  assert.equal(r.relaciones.length, 1);
  assert.ok(r.relaciones[0].distanciaMetros < 120);
});

test('INGESTA: un KML suelto tambien, sin empaquetar', async () => {
  const texto = F.documentoKml([F.placemark('A', d('CW1'), F.punto([-75.6, 6.2]))]);
  const r = await procesar([{ nombre: 'suelto.kml', datos: texto }], {});
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].contrato, 'CW1');
});

test('INGESTA: varios archivos a la vez, y las relaciones cruzan entre ellos', async () => {
  const r = await procesar([
    kmz('uno.kmz', [F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000]))]),
    kmz('dos.kmz', [F.placemark('B', d('CW2'), F.punto([-75.6000, 6.2005]))]),
  ], { umbralMetros: 120 });
  assert.equal(r.filas.length, 2);
  assert.equal(r.relaciones.length, 1, 'la relacion cruza dos archivos distintos');
  assert.deepEqual([...new Set(r.filas.map((x) => x.origenArchivo))].sort(), ['dos.kmz', 'uno.kmz']);
});

test('INGESTA: mezcla de KML y KMZ en la misma seleccion', async () => {
  const r = await procesar([
    kmz('a.kmz', [F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000]))]),
    { nombre: 'b.kml', datos: F.documentoKml([F.placemark('B', d('CW2'), F.punto([-75.6000, 6.2005]))]) },
  ], { umbralMetros: 120 });
  assert.equal(r.filas.length, 2);
  assert.equal(r.relaciones.length, 1);
});

test('INGESTA: un archivo roto NO impide procesar los buenos, y se reporta', async () => {
  const r = await procesar([
    kmz('bueno.kmz', [
      F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000])),
      F.placemark('B', d('CW2'), F.punto([-75.6000, 6.2005])),
    ]),
    { nombre: 'roto.kmz', datos: new Uint8Array([1, 2, 3, 4]) },
  ], { umbralMetros: 120 });
  assert.equal(r.filas.length, 2, 'los buenos se procesan igual');
  assert.equal(r.relaciones.length, 1);
  const diag = diagnosticoArchivos(r.archivos);
  assert.equal(diag.find((x) => x.nombre === 'bueno.kmz').estado, LECTURA.COMPLETA);
  assert.equal(diag.find((x) => x.nombre === 'roto.kmz').estado, LECTURA.FALLIDA);
});

test('INGESTA: si TODO falla, se dice; no se devuelve un cero en silencio', async () => {
  const r = await procesar([{ nombre: 'x.txt', datos: null, rechazado: 'no es un archivo .kml ni .kmz' }], {});
  assert.equal(r.filas.length, 0);
  assert.ok(r.error, 'tiene que haber un motivo explicito');
  assert.equal(diagnosticoArchivos(r.archivos)[0].estado, LECTURA.FALLIDA);
});

test('INGESTA: un archivo parcial se marca PARCIAL, no completo', async () => {
  const texto = '<?xml version="1.0"?><kml><Document>' +
    '<NetworkLink><Link><href>otro.kml</href></Link></NetworkLink>' +
    `<Placemark><name>A</name><description>${d('CW1')}</description>` +
    '<Point><coordinates>-75.6,6.2,0</coordinates></Point></Placemark></Document></kml>';
  const r = await procesar([{ nombre: 'parcial.kml', datos: texto }], {});
  assert.equal(r.filas.length, 1, 'lo que si se pudo leer se conserva');
  const diag = diagnosticoArchivos(r.archivos)[0];
  assert.equal(diag.estado, LECTURA.PARCIAL);
  assert.ok(diag.motivos.some((m) => /NO se analizo/i.test(m.simple)), JSON.stringify(diag.motivos));
});

test('INGESTA: los diagnosticos se traducen sin perder el texto tecnico', () => {
  const e = explicar('"doc.kml" no supera la comprobacion de integridad (CRC-32): el contenido no coincide');
  assert.ok(e.simple.includes('danado'));
  assert.ok(e.tecnico.includes('CRC-32'), 'el original se conserva para el panel tecnico');
  const sinTraduccion = explicar('mensaje que nadie previo');
  assert.equal(sinTraduccion.simple, sinTraduccion.tecnico, 'si no hay traduccion, se muestra tal cual');
});

test('INGESTA: la regla de mismo contrato se respeta de extremo a extremo', async () => {
  const r = await procesar([kmz('m.kmz', [
    F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000])),
    F.placemark('B', d('CW1'), F.punto([-75.6000, 6.2005])),
  ])], { umbralMetros: 120 });
  assert.equal(r.filas.length, 2);
  assert.equal(r.relaciones.length, 0, 'dos frentes del mismo contrato no interfieren entre si');
});

test('INGESTA: volver a procesar reemplaza el resultado, no lo acumula', async () => {
  const uno = await procesar([kmz('a.kmz', [F.placemark('A', d('CW1'), F.punto([-75.6, 6.2]))])], {});
  const dos = await procesar([kmz('b.kmz', [F.placemark('B', d('CW2'), F.punto([-75.5, 6.3]))])], {});
  assert.equal(uno.filas.length, 1);
  assert.equal(dos.filas.length, 1);
  assert.equal(dos.filas[0].frente, 'B', 'la segunda carga no arrastra la primera');
});

test('INGESTA: los parametros aprobados llegan de verdad al motor', async () => {
  const pms = [
    F.placemark('A', d('CW1'), F.punto([-75.6000, 6.2000])),
    F.placemark('B', d('CW2'), F.punto([-75.6000, 6.2015])),   // ~167 m
  ];
  const a120 = await procesar([kmz('u.kmz', pms)], { umbralMetros: 120 });
  const a243 = await procesar([kmz('u.kmz', pms)], { umbralMetros: 243 });
  assert.equal(a120.relaciones.length, 0, 'a 120 m no se relacionan');
  assert.equal(a243.relaciones.length, 1, 'a 243 m si: el umbral se respeta');
});

test('INGESTA: fecha Y hora, con tolerancia 0, es lo que se aplica', async () => {
  // Mismo dia, jornadas opuestas: con solo fecha coincidirian; con hora no.
  const pms = [
    F.placemark('A', d('CW1', { inicio: '2026-03-01 06:00:00', fin: '2026-03-01 12:00:00' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', d('CW2', { inicio: '2026-03-01 14:00:00', fin: '2026-03-01 20:00:00' }), F.punto([-75.6000, 6.2005])),
  ];
  const r = await procesar([kmz('t.kmz', pms)], { umbralMetros: 120 });
  assert.equal(r.relaciones.length, 1);
  assert.equal(r.relaciones[0].hayTraslapeTemporal, false, 'con hora real NO coinciden');
  assert.equal(r.relaciones[0].traslapeEvaluable, true);
});

// ───────────────── FILTROS CRUZADOS (facetados) — regresion de Etapa 2.1 ─────────────────

const universo = () => [
  fila({ id: '1', contrato: 'CW1', contratista: 'ACME', proyecto: 'P1', municipio: 'Medellin', frente: 'F1', tipoCierre: 'total' }),
  fila({ id: '2', contrato: 'CW1', contratista: 'ACME', proyecto: 'P1', municipio: 'Medellin', frente: 'F2', tipoCierre: 'parcial' }),
  fila({ id: '3', contrato: 'CW2', contratista: 'BETA', proyecto: 'P2', municipio: 'Envigado', frente: 'F3', tipoCierre: 'total' }),
  fila({ id: '4', contrato: 'CW3', contratista: 'GAMA', proyecto: 'P3', municipio: 'Itagui', frente: 'F4', tipoCierre: 'ingreso y salida' }),
];
const valores = (ops) => ops.map((o) => o.valor);

test('FACETADO: elegir un contrato reduce contratistas, municipios y frentes compatibles', () => {
  const f = { ...Filtro.filtrosVacios(), contrato: ['CW1'] };
  const ops = Filtro.opcionesFacetadas(universo(), f);
  assert.deepEqual(valores(ops.contratista), ['ACME'], 'solo el contratista de CW1');
  assert.deepEqual(valores(ops.municipio), ['Medellin']);
  assert.deepEqual(valores(ops.frente), ['F1', 'F2']);
  assert.deepEqual(valores(ops.proyecto), ['P1']);
});

test('FACETADO: la lista del propio campo NO se autolimita', () => {
  // Es la regla que permite seguir marcando mas valores del mismo campo.
  const f = { ...Filtro.filtrosVacios(), contrato: ['CW1'] };
  const ops = Filtro.opcionesFacetadas(universo(), f);
  assert.deepEqual(valores(ops.contrato), ['CW1', 'CW2', 'CW3'], 'los tres contratos siguen disponibles');
  assert.equal(ops.contrato.find((o) => o.valor === 'CW1').seleccionado, true);
});

test('FACETADO: el cruce funciona en las dos direcciones', () => {
  const f = { ...Filtro.filtrosVacios(), municipio: ['Envigado'] };
  const ops = Filtro.opcionesFacetadas(universo(), f);
  assert.deepEqual(valores(ops.contrato), ['CW2'], 'elegir municipio reduce contratos');
  assert.deepEqual(valores(ops.frente), ['F3']);
  assert.deepEqual(valores(ops.municipio), ['Envigado', 'Itagui', 'Medellin'], 'pero no a si mismo');
});

test('FACETADO: seleccion multiple dentro de un campo amplia el resto', () => {
  const f = { ...Filtro.filtrosVacios(), contrato: ['CW1', 'CW2'] };
  const ops = Filtro.opcionesFacetadas(universo(), f);
  assert.deepEqual(valores(ops.contratista), ['ACME', 'BETA']);
  assert.deepEqual(valores(ops.municipio), ['Envigado', 'Medellin']);
});

test('FACETADO: una seleccion existente NO desaparece aunque deje de ser compatible', () => {
  // Regla 2. Si el usuario marca CW1 y luego Envigado (incompatibles), CW1
  // tiene que seguir visible y marcado para que pueda deshacerlo.
  const f = { ...Filtro.filtrosVacios(), contrato: ['CW1'], municipio: ['Envigado'] };
  const ops = Filtro.opcionesFacetadas(universo(), f);
  const cw1 = ops.contrato.find((o) => o.valor === 'CW1');
  assert.ok(cw1, 'CW1 sigue en la lista');
  assert.equal(cw1.seleccionado, true);
  assert.equal(cw1.n, 0, 'con recuento 0, para que se vea que ya no casa con nada');
});

test('FACETADO: la lista que el usuario esta tocando se marca para no repintarla', () => {
  const ops = Filtro.opcionesFacetadas(universo(), Filtro.filtrosVacios(), 'contrato');
  assert.equal(ops.contrato.enUso, true);
  assert.ok(!ops.municipio.enUso);
});

test('FACETADO: los recuentos reflejan el cruce, no el total', () => {
  const sinFiltro = Filtro.opcionesFacetadas(universo(), Filtro.filtrosVacios());
  assert.equal(sinFiltro.tipoCierre.find((o) => o.valor === 'total').n, 2);
  const conFiltro = Filtro.opcionesFacetadas(universo(), { ...Filtro.filtrosVacios(), municipio: ['Medellin'] });
  assert.equal(conFiltro.tipoCierre.find((o) => o.valor === 'total').n, 1);
});

test('FACETADO: cubre los seis campos y ninguno queda fuera', () => {
  const ops = Filtro.opcionesFacetadas(universo(), Filtro.filtrosVacios());
  assert.deepEqual(Object.keys(ops).sort(), [...Filtro.CAMPOS_FACETADOS].sort());
  for (const c of Filtro.CAMPOS_FACETADOS) assert.ok(ops[c].length > 0, c);
});

test('FACETADO: el rango de fechas estrecha TODAS las listas, incluida la del propio campo', () => {
  // El rango de fechas no es una faceta: es un filtro transversal. La regla de
  // "no autolimitarse" protege al campo frente a SU PROPIA seleccion, no frente
  // al resto de filtros. Por eso aqui CW2 si desaparece de la lista de
  // contratos: esta fuera del periodo que el usuario pidio ver.
  const filas = [
    fila({ id: 'a', contrato: 'CW1', frente: 'F1', inicioMs: Date.UTC(2026, 0, 1), finMs: Date.UTC(2026, 0, 31) }),
    fila({ id: 'b', contrato: 'CW2', frente: 'F2', inicioMs: Date.UTC(2026, 6, 1), finMs: Date.UTC(2026, 6, 31) }),
  ];
  const conRango = Filtro.opcionesFacetadas(filas, { ...Filtro.filtrosVacios(), desde: '2026-01-01', hasta: '2026-02-01' });
  assert.deepEqual(valores(conRango.contrato), ['CW1']);
  assert.deepEqual(valores(conRango.frente), ['F1']);
  const sinRango = Filtro.opcionesFacetadas(filas, Filtro.filtrosVacios());
  assert.deepEqual(valores(sinRango.contrato), ['CW1', 'CW2'], 'sin rango vuelven los dos');
});

test('FACETADO: la busqueda libre tambien estrecha las listas', () => {
  const ops = Filtro.opcionesFacetadas(universo(), { ...Filtro.filtrosVacios(), texto: 'BETA' });
  assert.deepEqual(valores(ops.contrato), ['CW2']);
  assert.deepEqual(valores(ops.municipio), ['Envigado']);
});
