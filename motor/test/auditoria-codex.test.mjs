/**
 * PRUEBAS ADVERSARIAS DE LA RONDA 1.2
 *
 * Una por hallazgo de la auditoria independiente (Codex) sobre el commit
 * 4b59f89. Cada prueba esta escrita para FALLAR con el codigo anterior a la
 * correccion: en el comentario de cada bloque queda anotado que devolvia el
 * motor antes, medido de verdad al reproducir el hallazgo, no supuesto.
 *
 * No se usan datos reales de EPM en ningun caso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { medir, RADIO_DOMINIO_METROS } from '../src/geo/geometria.js';
import { cotaInferiorMetros, separacionLongitud } from '../src/geo/cajas.js';
import { leerInstante } from '../src/tiempo/instante.js';
import { leerVigencia } from '../src/tiempo/intervalo.js';
import { leerDescripcion } from '../src/io/descripcion.js';
import { leerCoordenadas, leerKml } from '../src/io/kml.js';
import { extraerKml, listarZip, LIMITES_POR_DEFECTO } from '../src/io/zip.js';
import { desambiguar } from '../src/modelo/identidad.js';
import { analizar, ejecutarLegado, cotejarFidelidad, resumirCotejo, PERFIL_LEGADO } from '../src/nucleo/index.js';
import * as F from '../fixtures/index.mjs';

const arch = (nombre, pms) => ({ nombre, datos: F.kmz(pms) });
const desc = (o) => F.descripcion({ municipio: 'Medellin', ...o });
const VIG = { inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00' };

// ─────────────────────────────────────────────────────────────────────────────
// H1 · La proyeccion se construye POR PAR DE PARTES, y hay un dominio declarado
// ─────────────────────────────────────────────────────────────────────────────

test('H1: dos geometrias antipodas NO se declaran en contacto', () => {
  // ANTES: metros = 0 e intersecan = true. El antipoda, proyectado en un plano
  // tangente comun, caia justo sobre el origen. Media Tierra de error.
  const a = { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] };
  const b = { type: 'Point', coordinates: [180, 0] };
  const r = medir(a, b);
  assert.equal(r.intersecan, false, 'jamas puede decir que se tocan');
  assert.equal(r.metros, null, 'no se inventa una distancia que no sabe medir');
  assert.equal(r.dominioValido, false);
  assert.ok(r.errores.some((e) => e.includes('dominio')), r.errores.join(' | '));
});

test('H1: un vertice lejano de un MultiPoint no mueve la medida del par cercano', () => {
  // ANTES: el origen del plano era el centro de TODO, asi que anadir un vertice
  // a 222 km cambiaba una medida de 120.010 m a 119.992 m (18,26 mm de deriva)
  // y podia cruzar el umbral de 120 m en el sentido equivocado.
  const linea = { type: 'LineString', coordinates: [[-75.60, 6.20], [-75.59, 6.20]] };
  const cerca = [-75.595, 6.2010787];
  const lejos = [-73.60, 6.20];                       // ~221 km al este
  const solo = medir(linea, { type: 'Point', coordinates: cerca });
  const conRuido = medir(linea, { type: 'MultiPoint', coordinates: [cerca, lejos] });
  assert.ok(solo.metros > 0 && conRuido.metros > 0);
  // Se exige coincidencia EXACTA, no "parecida": al construirse el plano para
  // cada par de partes, el vertice lejano no participa en la medida del par
  // cercano y el resultado tiene que salir bit a bit igual. Cualquier plano
  // compartido deja una deriva distinta de cero, por pequena que sea.
  assert.equal(conRuido.metros, solo.metros,
    `deriva ${Math.abs(solo.metros - conRuido.metros) * 1000} mm: la medida depende de un vertice lejano`);
});

test('H1: el dominio de la proyeccion es un numero declarado, no una suposicion', () => {
  assert.equal(RADIO_DOMINIO_METROS, 50000);
  // Dentro del dominio se mide; fuera se dice que no se mide.
  const dentro = medir({ type: 'Point', coordinates: [-75.6, 6.2] },
                       { type: 'Point', coordinates: [-75.6, 6.5] });      // ~33 km
  assert.equal(dentro.dominioValido, true);
  assert.ok(dentro.metros > 33000 && dentro.metros < 34000, String(dentro.metros));
  const fuera = medir({ type: 'Point', coordinates: [-75.6, 6.2] },
                      { type: 'Point', coordinates: [-75.6, 8.2] });       // ~221 km
  assert.equal(fuera.dominioValido, false);
  assert.equal(fuera.metros, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// H2 · El prefiltro no puede descartar pares que el calculo aceptaria
// ─────────────────────────────────────────────────────────────────────────────

test('H2: cerca del polo, la cota inferior sigue siendo inferior a la distancia real', () => {
  // ANTES: el coseno se recortaba a 0,01, asi que a 89,999 de latitud el
  // prefiltro creia que dos puntos separados 1,95 m estaban a ~1,1 km y los
  // tiraba antes de medirlos.
  const A = { minLon: 0, maxLon: 0, minLat: 89.999, maxLat: 89.999 };
  const B = { minLon: 1, maxLon: 1, minLat: 89.999, maxLat: 89.999 };
  const real = medir({ type: 'Point', coordinates: [0, 89.999] },
                     { type: 'Point', coordinates: [1, 89.999] }).metros;
  const cota = cotaInferiorMetros(A, B);
  assert.ok(real > 1 && real < 3, `distancia real esperada ~1,95 m, fue ${real}`);
  assert.ok(cota <= real, `la cota (${cota}) nunca puede superar la distancia real (${real})`);
  assert.ok(cota <= 120, 'con un umbral de 120 m este par tiene que sobrevivir al prefiltro');
});

test('H2: de extremo a extremo, el par polar produce relacion', async () => {
  const archivos = [arch('polo.kmz', [
    F.placemark('P1', desc({ ...VIG, contrato: 'CW1' }), F.punto([0, 89.999])),
    F.placemark('P2', desc({ ...VIG, contrato: 'CW2' }), F.punto([1, 89.999])),
  ])];
  const r = await analizar(archivos, { umbralMetros: 120 });
  assert.equal(r.relaciones.length, 1, 'el prefiltro se lo comia entero antes de la correccion');
  assert.ok(r.relaciones[0].distanciaMetros < 3);
});

test('H2: la separacion de longitudes se mide por el camino corto del circulo', () => {
  assert.equal(separacionLongitud(179.999, 180, -180, -179.999), 0);
  assert.ok(separacionLongitud(-179.999, -179.999, 179.999, 179.999) < 0.01);
});

// ─────────────────────────────────────────────────────────────────────────────
// H3 · Validacion temporal estricta: nada se convierte en silencio
// ─────────────────────────────────────────────────────────────────────────────

test('H3: horas imposibles se rechazan en vez de convertirse en 00:00', () => {
  // ANTES: "123:00", "12:3" y "99:99" caian en el camino "sin hora" y se
  // volvian 00:00:00 SIN un solo aviso.
  for (const texto of ['2026-03-01 123:00', '2026-03-01 12:3', '2026-03-01 99:99',
                       '2026-03-01 1a:00', '2026-03-01 12:00:99']) {
    const i = leerInstante(texto);
    assert.equal(i.ms, null, `"${texto}" no puede producir un instante`);
    assert.equal(i.estadoHora, 'invalida', texto);
    assert.ok(i.avisos.length > 0, `"${texto}" tiene que explicar por que falla`);
    assert.equal(i.diaDeclarado, '2026-03-01', 'el dia leido se conserva para el diagnostico');
  }
});

test('H3: 24:00:001 NO es "el dia siguiente"', () => {
  // ANTES: el prefijo "24:00:0" bastaba y se saltaba al 2 de marzo.
  const i = leerInstante('2026-03-01 24:00:001');
  assert.equal(i.ms, null);
  assert.equal(i.estadoHora, 'invalida');
  // La unica forma valida sigue funcionando:
  const ok = leerInstante('2026-03-01 24:00:00');
  assert.equal(ok.iso, '2026-03-02 00:00:00');
  assert.equal(ok.origenHora, 'medianoche24');
});

test('H3: una zona horaria se rechaza diciendo que es una zona horaria', () => {
  // ANTES: el sufijo se ignoraba en silencio y "10:00:00Z" valia como hora local.
  for (const sufijo of ['Z', ' UTC', '-05:00', '+0530', ' GMT']) {
    const i = leerInstante(`2026-03-01 10:00:00${sufijo}`);
    assert.equal(i.ms, null, sufijo);
    assert.ok(i.avisos.join(' ').includes('zona horaria'), `${sufijo}: ${i.avisos.join(' | ')}`);
  }
});

test('H3: una hora invalida invalida la vigencia entera, no la maquilla', () => {
  const v = leerVigencia('2026-03-01 25:00:00', '2026-03-10 18:00:00');
  assert.equal(v.valida, false);
  assert.equal(v.estadoHoraInicio, 'invalida');
  assert.ok(v.avisos.some((a) => a.startsWith('fecha_inicio:')));
});

// ─────────────────────────────────────────────────────────────────────────────
// H4 · 24:00:00 no se extiende dos veces
// ─────────────────────────────────────────────────────────────────────────────

test('H4: un fin escrito 24:00:00 no gana un dia extra con fin inclusivo', () => {
  // ANTES: "2026-03-01 24:00:00" + finInclusivoDiaCompleto -> 2026-03-02 23:59:59.
  const v = leerVigencia('2026-03-01 06:00:00', '2026-03-01 24:00:00',
    { finInclusivoDiaCompleto: true });
  assert.equal(v.fin, '2026-03-02 00:00:00');
  assert.equal(v.finExtendidoADiaCompleto, false);
  assert.equal(v.origenHoraFin, 'medianoche24');
});

test('H4: en granularidad de dia, 24:00:00 pertenece al dia que declara', () => {
  const v = leerVigencia('2026-03-01 06:00:00', '2026-03-01 24:00:00',
    { granularidadTemporal: 'dia' });
  assert.equal(v.fin, '2026-03-01 23:59:59', 'el dia declarado es el 1, no el 2');
  assert.equal(v.inicio, '2026-03-01 00:00:00');
});

test('H4: un fin escrito 00:00 SI se extiende (el comportamiento legado intacto)', () => {
  const v = leerVigencia('2026-03-01 06:00:00', '2026-03-05 00:00:00',
    { finInclusivoDiaCompleto: true });
  assert.equal(v.fin, '2026-03-05 23:59:59');
  assert.equal(v.finExtendidoADiaCompleto, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// H5 · No se inventan campos a partir de subcadenas
// ─────────────────────────────────────────────────────────────────────────────

test('H5: "subcontrato" dentro de otro campo no crea un contrato fantasma', () => {
  // ANTES: se buscaba la subcadena "contrato" en cualquier posicion y este
  // texto producia el contrato CW999, que no existe en ningun sitio.
  const t = 'fecha_inicio: 2026-03-01 06:00:00 | fecha_fin: 2026-03-10 18:00:00 | ' +
            'tipo_cierre: total | direccion: subcontrato: CW999 | municipio: Medellin | ' +
            'contratista: X | proyecto: Y';
  const r = leerDescripcion(t);
  assert.equal(r.campos.contrato, null, 'no hay campo contrato: en el texto');
  assert.equal(r.campos.direccion, 'subcontrato: CW999', 'el texto libre se conserva entero');
  assert.ok(r.avisos.some((a) => a.includes('falta el campo obligatorio "contrato"')), r.avisos.join(' | '));
});

test('H5: la clave tiene que estar al principio del segmento', () => {
  const r = leerDescripcion('fecha_inicio: 2026-03-01 | nota sobre el contrato: CW1');
  assert.equal(r.campos.contrato, null);
  assert.ok(r.avisos.some((a) => a.includes('no empiezan por una clave conocida')), r.avisos.join(' | '));
});

test('H5: una clave desconocida no se cuela como campo y se reporta', () => {
  const r = leerDescripcion('fecha_inicio: 2026-03-01 | contrato_padre: CW999');
  assert.equal(r.campos.contrato, null);
  assert.ok(r.avisos.some((a) => a.includes('no empiezan por una clave conocida')));
});

// ─────────────────────────────────────────────────────────────────────────────
// H6 · Los identificadores quedan UNICOS de verdad
// ─────────────────────────────────────────────────────────────────────────────

test('H6: un sufijo ya ocupado no produce dos registros con el mismo id', () => {
  // ANTES: ['x','x','x~2'] salia como ['x','x~2','x~2'] -> dos iguales.
  const regs = [
    { id: 'x', huellaContenido: 'A', avisos: [] },
    { id: 'x', huellaContenido: 'B', avisos: [] },
    { id: 'x~2', huellaContenido: 'C', avisos: [] },
  ];
  const r = desambiguar(regs);
  const ids = regs.map((x) => x.id);
  assert.equal(new Set(ids).size, 3, `ids repetidos: ${ids.join(', ')}`);
  assert.equal(r.duplicadosExactos, 0, 'ningun contenido se repite');
  assert.equal(r.idsRepetidos, 1, 'solo UN id venia repetido en el origen: el tercero era unico');
  assert.ok(ids.includes('x~2'), 'el registro que traia "x~2" de origen lo conserva');
  assert.equal(regs[2].id, 'x~2', 'el sufijo sintetico no le roba el id a nadie');
});

test('H6: contenido repetido y id repetido se cuentan por separado', () => {
  const regs = [
    { id: 'a', huellaContenido: 'H', avisos: [] },
    { id: 'a', huellaContenido: 'H', avisos: [] },   // copia identica
    { id: 'a', huellaContenido: 'OTRA', avisos: [] },// mismo id, otro contenido
  ];
  const r = desambiguar(regs);
  assert.equal(r.duplicadosExactos, 1);
  assert.equal(r.idsRepetidos, 1);
  assert.equal(new Set(regs.map((x) => x.id)).size, 3);
});

test('H6: dos registros con el mismo id explicito quedan distinguibles', async () => {
  const pm = (n) => F.placemark('F' + n, desc({ ...VIG, contrato: 'CW' + n }),
    F.punto([-75.6, 6.2 + n / 1000]), { extendedData: 'FIJO-1' });
  const r = await analizar([arch('a.kmz', [pm(1), pm(2)])], {});
  const ids = r.registros.map((x) => x.id);
  assert.equal(new Set(ids).size, 2, `ids: ${ids.join(', ')}`);
  assert.ok(ids.includes('FIJO-1'), `ids: ${ids.join(', ')}`);
  assert.ok(ids.some((x) => x.startsWith('FIJO-1~')), `ids: ${ids.join(', ')}`);
  assert.ok(r.registros.some((x) => x.idRepetidoEnOrigen === true));
});

// ─────────────────────────────────────────────────────────────────────────────
// H7 · Coordenadas ilegibles: se excluye la geometria, no se adivina
// ─────────────────────────────────────────────────────────────────────────────

test('H7: un numero con basura pegada NO se lee a medias', () => {
  // ANTES: parseFloat("0.002oops") devolvia 0.002 y el trazado seguia adelante
  // con una geometria falsa.
  const r = leerCoordenadas('0.002oops,0 1,1');
  assert.equal(r.valida, false);
  assert.ok(r.problemas.some((p) => p.includes('ilegible')), r.problemas.join(' | '));
});

test('H7: una linea con una coordenada ilegible pierde la geometria, no el registro', () => {
  const kml = F.documentoKml([
    F.placemark('L1', desc({ ...VIG, contrato: 'CW1' }),
      '<LineString><coordinates>-75.6,6.2 -75.59xx,6.21</coordinates></LineString>'),
  ]);
  const r = leerKml(kml, 'x.kml');
  assert.equal(r.placemarks.length, 1, 'el registro se conserva para poder corregirlo en origen');
  assert.equal(r.placemarks[0].geometria, null, 'pero no entra al calculo con datos inventados');
  assert.ok(r.placemarks[0].avisos.join(' ').length > 0);
});

test('H7: un hueco ilegible no convierte el poligono en otra cosa', () => {
  const kml = F.documentoKml([
    F.placemark('PG', desc({ ...VIG, contrato: 'CW1' }),
      F.poligono([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]],
                 [[[-75.598, 6.202], ['x', 6.202], [-75.596, 6.204], [-75.598, 6.202]]])),
  ]);
  const r = leerKml(kml, 'x.kml');
  const g = r.placemarks[0].geometria;
  assert.ok(g === null || g.type === 'Polygon', 'o se descarta o sigue siendo poligono');
  assert.ok(r.placemarks[0].avisos.length > 0, 'y en todo caso se avisa');
});

test('H7: coordenadas fuera del planeta se rechazan', () => {
  const r = leerCoordenadas('200,0 0,0');
  assert.equal(r.valida, false);
  assert.ok(r.problemas.some((p) => p.includes('fuera del rango terrestre')));
});

// ─────────────────────────────────────────────────────────────────────────────
// H8 · El KMZ se verifica y se acota
// ─────────────────────────────────────────────────────────────────────────────

test('H8: un KMZ manipulado se rechaza por CRC', async () => {
  // ANTES: el CRC-32 del ZIP no se comprobaba nunca (grep -c "crc" = 0 en zip.js),
  // asi que un byte cambiado entraba al analisis como si nada.
  const datos = F.kmz([F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6, 6.2]))]);
  const roto = Uint8Array.from(datos);
  const i = roto.indexOf(0x3c, 100);                 // el primer '<' del KML
  assert.ok(i > 0, 'el fixture tiene que traer el KML sin comprimir');
  roto[i + 1] ^= 0x20;                               // una letra cambiada
  await assert.rejects(() => extraerKml(roto), (e) => /CRC|integridad|dana/i.test(e.message));
  // El original sigue leyendose bien:
  assert.ok((await extraerKml(datos)).texto.includes('Placemark'));
});

test('H8: los limites del KMZ son explicitos y se aplican', async () => {
  for (const k of ['bytesArchivo', 'bytesEntradaDescomprimida', 'bytesTotalDescomprimido',
                   'factorExpansion', 'entradas']) {
    assert.ok(LIMITES_POR_DEFECTO[k] > 0, `el limite ${k} tiene que estar declarado`);
  }
  assert.ok(Object.isFrozen(LIMITES_POR_DEFECTO), 'nadie puede subirlos sobre la marcha');
  const datos = F.kmz([F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6, 6.2]))]);
  await assert.rejects(() => extraerKml(datos, { limites: { bytesArchivo: 10 } }),
    (e) => /grande|limite|lími/i.test(e.message));
  await assert.rejects(() => extraerKml(datos, { limites: { entradas: 0 } }),
    (e) => /entrada/i.test(e.message));
  await assert.rejects(() => extraerKml(datos, { limites: { bytesEntradaDescomprimida: 5 } }),
    (e) => /grande|limite|lími/i.test(e.message));
});

test('H8: listar el contenido de un KMZ no descomprime nada', async () => {
  const datos = F.kmz([F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6, 6.2]))]);
  const lista = await listarZip(datos);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nombre, 'doc.kml');
  assert.ok(typeof lista[0].tamOriginal === 'number');
  // Incluso con un limite de descompresion ridiculo, listar sigue funcionando.
  assert.equal((await listarZip(datos, { limites: { bytesEntradaDescomprimida: 1 } })).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// H9 · El control de fidelidad no puede aprobar una entrada que no se leyo
// ─────────────────────────────────────────────────────────────────────────────

test('H9: si no se pudo leer nada, el cotejo NO es superado', async () => {
  // ANTES: un <kml> truncado daba 0 alertas a cada lado, los totales cuadraban
  // y cotejo.completo salia true. Cero contra cero no demuestra equivalencia.
  const archivos = [{ nombre: 'roto.kmz', datos: '<kml><Document><Placemark>' }];
  const replica = await ejecutarLegado(archivos);
  const motor = await analizar(archivos, PERFIL_LEGADO);
  const c = cotejarFidelidad(replica, motor);
  assert.equal(c.completo, false);
  assert.equal(c.hayEntrada, false);
  assert.equal(c.lecturaLimpia, false);
  const texto = resumirCotejo(c);
  assert.ok(/no demuestra|no se puede/i.test(texto), texto);
});

test('H9: un archivo ilegible entre varios buenos tambien impide declarar fidelidad', async () => {
  const buenos = arch('bueno.kmz', [
    F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', desc({ ...VIG, contrato: 'CW2' }), F.punto([-75.6000, 6.2005])),
  ]);
  const archivos = [buenos, { nombre: 'roto.kmz', datos: new Uint8Array([1, 2, 3, 4]) }];
  const c = cotejarFidelidad(await ejecutarLegado(archivos), await analizar(archivos, PERFIL_LEGADO));
  assert.equal(c.hayEntrada, true, 'si se leyeron trazados…');
  assert.equal(c.lecturaLimpia, false, '…pero no toda la entrada');
  assert.equal(c.completo, false);
  assert.ok(c.archivosConError.length >= 1);
});

test('H9: el cotejo publica el estado de cada condicion por separado', () => {
  const c = cotejarFidelidad({ filas: [], resumen: {} }, { registros: [], relaciones: [] });
  for (const k of ['coinciden', 'lecturaLimpia', 'hayEntrada', 'alcanceContrastado', 'completo']) {
    assert.equal(typeof c[k], 'boolean', `falta el estado ${k}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// M1 · El alcance contrastado contra QGIS se declara, no se da por hecho
// ─────────────────────────────────────────────────────────────────────────────

test('M1: un poligono no es contrastable contra QGIS y el cotejo lo dice', async () => {
  // ANTES: la replica ignoraba los poligonos en silencio y el cotejo seguia
  // diciendo "superado" sobre una entrada que no habia comparado entera.
  const archivos = [arch('pg.kmz', [
    F.placemark('P1', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('PG', desc({ ...VIG, contrato: 'CW2' }),
      F.poligono([[-75.60, 6.20], [-75.59, 6.20], [-75.59, 6.21], [-75.60, 6.20]])),
  ])];
  const replica = await ejecutarLegado(archivos);
  assert.equal(replica.noContrastables.length, 1);
  assert.equal(replica.noContrastables[0].tipo, 'Polygon');
  const c = cotejarFidelidad(replica, await analizar(archivos, PERFIL_LEGADO));
  assert.equal(c.alcanceContrastado, false);
  assert.equal(c.completo, false, 'no se puede declarar fidelidad sobre lo que no se comparo');
  assert.ok(resumirCotejo(c).length > 0);
});

test('M1: solo con puntos y lineas el alcance SI queda contrastado', async () => {
  const archivos = [arch('ok.kmz', [
    F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', desc({ ...VIG, contrato: 'CW2' }), F.linea([[-75.6000, 6.2005], [-75.5990, 6.2005]])),
  ])];
  const c = cotejarFidelidad(await ejecutarLegado(archivos), await analizar(archivos, PERFIL_LEGADO));
  assert.equal(c.alcanceContrastado, true);
  assert.equal(c.completo, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 · Codificaciones y NetworkLink
// ─────────────────────────────────────────────────────────────────────────────

test('M2: un KML en UTF-16 se lee, no devuelve cero trazados', async () => {
  // ANTES: el texto se decodificaba siempre como UTF-8 y un KMZ en UTF-16
  // producia 0 registros sin un solo error visible.
  const kml = F.documentoKml([
    F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6, 6.2])),
  ]);
  const u16 = new Uint8Array(2 + kml.length * 2);
  u16[0] = 0xff; u16[1] = 0xfe;
  const dv = new DataView(u16.buffer);
  for (let i = 0; i < kml.length; i++) dv.setUint16(2 + i * 2, kml.charCodeAt(i), true);
  const r = await analizar([{ nombre: 'u16.kml', datos: u16 }], {});
  assert.equal(r.registros.length, 1);
  assert.equal(r.registros[0].contrato, 'CW1');
});

test('M2: un documento que solo tiene NetworkLink se reporta como error, no como exito', () => {
  // ANTES: 0 Placemark -> "0 frentes leidos" y ningun aviso: parecia un archivo vacio.
  const kml = '<?xml version="1.0"?><kml><Document>' +
    '<NetworkLink><Link><href>otro.kml</href></Link></NetworkLink>' +
    '</Document></kml>';
  const r = leerKml(kml, 'enlace.kml');
  assert.equal(r.placemarks.length, 0);
  assert.ok(r.errores.join(' ').includes('NetworkLink'), r.errores.join(' | '));
});

test('M2: con Placemarks propios, el NetworkLink es aviso y no tumba la lectura', () => {
  const kml = '<?xml version="1.0"?><kml><Document>' +
    '<NetworkLink><Link><href>otro.kml</href></Link></NetworkLink>' +
    `<Placemark><name>A</name><description>${desc({ ...VIG, contrato: 'CW1' })}</description>` +
    '<Point><coordinates>-75.6,6.2,0</coordinates></Point></Placemark>' +
    '</Document></kml>';
  const r = leerKml(kml, 'mixto.kml');
  assert.equal(r.placemarks.length, 1);
  assert.equal(r.errores.length, 0);
  assert.ok(r.avisosDocumento.join(' ').includes('NetworkLink'));
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 · Emparejar relaciones por identificador estable, no por nombre de frente
// ─────────────────────────────────────────────────────────────────────────────

test('M3: cada relacion trae los identificadores estables de sus dos extremos', async () => {
  // Es lo que permite al comparador decir "esta relacion desaparecio" sin
  // confundir dos frentes que se llaman igual en contratos distintos.
  const archivos = [arch('m3.kmz', [
    F.placemark('MISMO NOMBRE', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('MISMO NOMBRE', desc({ ...VIG, contrato: 'CW2' }), F.punto([-75.6000, 6.2005])),
    F.placemark('MISMO NOMBRE', desc({ ...VIG, contrato: 'CW3' }), F.punto([-75.6000, 6.2010])),
  ])];
  const r = await analizar(archivos, { umbralMetros: 120 });
  assert.equal(r.relaciones.length, 3);
  const claves = r.relaciones.map((x) => [x.idA, x.idB].sort().join('|'));
  assert.equal(new Set(claves).size, 3, 'tres parejas distintas, aunque los tres frentes se llamen igual');
  for (const rel of r.relaciones) {
    assert.ok(rel.idA && rel.idB && rel.idA !== rel.idB);
  }
});

test('M3: los identificadores no cambian al cambiar el umbral, asi que las dos corridas se emparejan', async () => {
  const archivos = [arch('m3b.kmz', [
    F.placemark('A', desc({ ...VIG, contrato: 'CW1' }), F.punto([-75.6000, 6.2000])),
    F.placemark('B', desc({ ...VIG, contrato: 'CW2' }), F.punto([-75.6000, 6.2015])),  // ~167 m
  ])];
  const corto = await analizar(archivos, { umbralMetros: 120 });
  const largo = await analizar(archivos, { umbralMetros: 243 });
  assert.equal(corto.relaciones.length, 0);
  assert.equal(largo.relaciones.length, 1);
  assert.deepEqual(corto.registros.map((x) => x.id), largo.registros.map((x) => x.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// M4 · "No se puede saber" nunca es "no coinciden"
// ─────────────────────────────────────────────────────────────────────────────

test('M4: una relacion con fechas inservibles queda como NO EVALUABLE, no como "sin traslape"', async () => {
  const archivos = [arch('m4.kmz', [
    F.placemark('A', desc({ inicio: '2026-03-01 06:00:00', fin: '2026-03-30 18:00:00', contrato: 'CW1' }),
      F.punto([-75.6000, 6.2000])),
    F.placemark('B', desc({ inicio: '2026-03-01 25:00:00', fin: 'No definido', contrato: 'CW2' }),
      F.punto([-75.6000, 6.2005])),
  ])];
  const r = await analizar(archivos, { umbralMetros: 120 });
  assert.equal(r.relaciones.length, 1);
  const rel = r.relaciones[0];
  assert.equal(rel.traslapeEvaluable, false, 'no se sabe');
  assert.equal(rel.hayTraslapeTemporal, false);
  assert.equal(rel.traslapeInicio, null);
  // Y el recuento lo separa: no puede sumarse a "sin coincidencia en el tiempo".
  assert.equal(r.estadisticas.noEvaluablesPorFechas, 1);
});

test('M4: una relacion realmente sin traslape NO se marca como no evaluable', async () => {
  const archivos = [arch('m4b.kmz', [
    F.placemark('A', desc({ inicio: '2026-01-01 06:00:00', fin: '2026-01-10 18:00:00', contrato: 'CW1' }),
      F.punto([-75.6000, 6.2000])),
    F.placemark('B', desc({ inicio: '2026-06-01 06:00:00', fin: '2026-06-10 18:00:00', contrato: 'CW2' }),
      F.punto([-75.6000, 6.2005])),
  ])];
  const r = await analizar(archivos, { umbralMetros: 120 });
  assert.equal(r.relaciones[0].traslapeEvaluable, true);
  assert.equal(r.relaciones[0].hayTraslapeTemporal, false);
  assert.equal(r.estadisticas.noEvaluablesPorFechas, 0);
});
