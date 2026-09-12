/**
 * TRAZABILIDAD DE LA BASELINE.
 *
 * Estas pruebas existen para que dentro de seis meses se pueda responder
 * «¿qué versión produjo este archivo y con qué reglas?» mirando el archivo, no
 * una conversación. Y para que nadie pueda romper, sin enterarse, el formato
 * legado, que es lo único que no puede cambiar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as V from '../nucleo/version.js';
import * as Export from '../nucleo/exportar.js';
import * as Proyecto from '../nucleo/proyecto.js';
import { CONFIG_POR_DEFECTO, REGLAS_CANONICAS } from '../../motor/src/nucleo/config.js';

const CONFIG = {
  umbralMetros: 120, toleranciaMinutos: 0, granularidadTemporal: 'instante',
  excluirMismoContrato: true, modoDistancia: 'real',
};
const FILA = {
  id: 'pmt_x', frente: 'F', contrato: 'C-1', contratista: 'X', proyecto: 'P',
  municipio: 'Medellín', direccion: 'Cra 1', tipoCierre: 'parcial',
  inicio: '2026-03-01 06:00:00', fin: '2026-03-10 18:00:00',
  inicioMs: Date.UTC(2026, 2, 1, 6), finMs: Date.UTC(2026, 2, 10, 18), vigenciaValida: true,
  geometria: { type: 'Point', coordinates: [-75.6, 6.2] },
  tipoGeometria: 'Point', tieneGeometria: true, analizable: true,
  origenArchivo: 'a.kmz', carpeta: null, avisos: [],
};

const SEMVER = /^\d+\.\d+\.\d+$/;

test('las tres versiones existen y son versionado semántico', () => {
  assert.match(V.VERSION_APP, SEMVER);
  assert.match(V.VERSION_MOTOR, SEMVER);
  assert.match(V.VERSION_REGLAS, SEMVER);
  assert.equal(typeof V.ESQUEMA_PROYECTO, 'number');
});

test('los PARÁMETROS APROBADOS siguen siendo los aprobados', () => {
  // Si alguna de estas cambia, cambian las cifras publicadas: entonces hay que
  // subir VERSION_REGLAS Y actualizar la baseline de regresión, a la vez.
  assert.equal(CONFIG_POR_DEFECTO.umbralMetros, 120);
  assert.equal(CONFIG_POR_DEFECTO.toleranciaMinutos, 0);
  assert.equal(CONFIG_POR_DEFECTO.granularidadTemporal, 'instante');
  assert.equal(CONFIG_POR_DEFECTO.excluirMismoContrato, true);
  assert.equal(CONFIG_POR_DEFECTO.modoDistancia, 'real');
  assert.equal(CONFIG_POR_DEFECTO.finInclusivoDiaCompleto, false);
  assert.equal(REGLAS_CANONICAS.dominioEspacialKm, 50);
});

test('el sello de procedencia lleva TODO lo necesario para reproducir', () => {
  const s = V.selloProcedencia(CONFIG, { alcance: '14 de 460 PMT (filtrado)' });
  for (const k of ['aplicacion', 'motor', 'reglas', 'esquemaProyecto', 'generadoEn', 'parametros']) {
    assert.ok(s[k] !== undefined && s[k] !== null, `falta ${k} en el sello`);
  }
  assert.equal(s.parametros.umbralMetros, 120);
  assert.equal(s.parametros.dominioEspacialKm, 50);
  assert.equal(s.alcance, '14 de 460 PMT (filtrado)');
  // Y NO lleva nada que no deba salir de la máquina.
  const texto = JSON.stringify(s);
  assert.ok(!/https?:\/\//.test(texto), 'el sello no puede llevar direcciones');
  assert.ok(!/@/.test(texto), 'el sello no puede llevar correos');
});

test('el GeoJSON exportado se puede identificar por sí solo', () => {
  const gj = Export.aGeoJson([FILA], CONFIG, { alcance: 'todo' });
  assert.equal(gj.type, 'FeatureCollection');
  assert.equal(gj.features.length, 1, 'el sello no puede alterar el contenido');
  assert.equal(gj.procedencia.reglas, V.VERSION_REGLAS);
  assert.equal(gj.procedencia.parametros.umbralMetros, 120);
  // Sigue siendo GeoJSON válido: los miembros propios son un extra permitido.
  assert.ok(Array.isArray(gj.features));
  assert.ok(gj.features[0].geometry && gj.features[0].properties);
});

test('el KML exportado lleva el sello en la descripción del documento', () => {
  const kml = Export.aKml([FILA], 'PMT', CONFIG, { alcance: 'todo' });
  assert.ok(kml.includes(`reglas v${V.VERSION_REGLAS}`), kml.slice(0, 400));
  assert.ok(kml.includes('umbral 120 m'));
  assert.ok(kml.includes('<Placemark>'), 'y sigue trayendo los trazados');
  // Sin caracteres que rompan el XML.
  assert.ok(!/<description>[^<]*[<>]/.test(kml.split('<Placemark>')[0].replace('<description>', '')));
});

test('INVARIANTE: el CSV legado sigue teniendo 11 columnas EXACTAS y ningún extra', () => {
  const csv = Export.csvCompatibleLegado([FILA], []);
  const lineas = csv.replace(/^﻿/, '').trim().split('\r\n');
  const cab = lineas[0].split(';');
  assert.deepEqual(cab, ['CATEGORIA', 'CONTRATO', 'CONTRATISTA', 'MUNICIPIO', 'FRENTE',
    'DIRECCION', 'ESTADO_CIERRE', 'HORARIO', 'FECHA_INICIO', 'FECHA_FIN', 'DURACION_DIAS']);
  assert.equal(cab.length, 11);
  // La PRIMERA línea tiene que ser la cabecera: ningún sello puede desplazarla.
  assert.ok(!/Plataforma de PMTs/.test(lineas[0]), 'el sello NO puede ir dentro del CSV legado');
  assert.equal(lineas[1].split(';').length, 11);
});

test('el nombre del archivo lleva la procedencia que el CSV no puede llevar dentro', () => {
  const n = Export.nombreConProcedencia('PMT', 'csv', { fecha: new Date('2026-09-12T00:00:00Z') });
  assert.equal(n, `PMT_2026-09-12_app-${V.VERSION_APP}_reglas-${V.VERSION_REGLAS}.csv`);
  // Sin caracteres que molesten en Windows.
  assert.ok(!/[\\/:*?"<>|]/.test(n), n);
});

test('el proyecto guarda las TRES versiones y las devuelve al abrirlo', () => {
  const p = Proyecto.crearProyecto({
    filas: [FILA], relaciones: [], noEvaluables: [], archivos: [],
    config: CONFIG, filtros: null, nombre: 'baseline',
    versionReglas: V.VERSION_REGLAS, versionApp: V.VERSION_APP, versionMotor: V.VERSION_MOTOR,
  });
  assert.equal(p.motor.versionReglas, V.VERSION_REGLAS);
  assert.equal(p.motor.versionApp, V.VERSION_APP);
  assert.equal(p.motor.versionMotor, V.VERSION_MOTOR);

  const r = Proyecto.leerProyecto(Proyecto.serializar(p));
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.proyecto.versionReglas, V.VERSION_REGLAS);
  assert.equal(r.proyecto.versionApp, V.VERSION_APP);
  assert.equal(r.proyecto.versionMotor, V.VERSION_MOTOR);
  // Un proyecto viejo, sin las versiones nuevas, sigue abriéndose.
  const viejo = JSON.parse(Proyecto.serializar(p));
  delete viejo.motor.versionApp; delete viejo.motor.versionMotor; delete viejo.huella;
  const r2 = Proyecto.leerProyecto(JSON.stringify(viejo));
  assert.equal(r2.ok, true, r2.motivo);
  assert.equal(r2.proyecto.versionApp, null, 'lo que no vino se dice que no vino');
});
