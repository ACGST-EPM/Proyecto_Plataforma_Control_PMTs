/**
 * Tiempo: lectura de instantes, casos frontera y traslape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leerInstante, formatear } from '../src/tiempo/instante.js';
import { leerVigencia, traslape } from '../src/tiempo/intervalo.js';

const v = (a, b, o) => leerVigencia(a, b, o);

test('lectura basica de fecha y hora', () => {
  const i = leerInstante('2026-03-10 06:30:00');
  assert.equal(i.iso, '2026-03-10 06:30:00');
  assert.equal(i.tieneHora, true);
  assert.deepEqual(i.avisos, []);
});

test('acepta la variante con T y sin segundos', () => {
  assert.equal(leerInstante('2026-03-10T06:30').iso, '2026-03-10 06:30:00');
  assert.equal(leerInstante('2026-3-5 6:30:00').iso, '2026-03-05 06:30:00');
});

test('24:00:00 es el final del dia, no un error', () => {
  const i = leerInstante('2026-03-10 24:00:00');
  assert.equal(i.iso, '2026-03-11 00:00:00');
  assert.ok(i.avisos.some((a) => a.includes('24:00:00')));
});

test('una hora absurda se normaliza y se avisa, no se descarta', () => {
  const i = leerInstante('2026-03-10 27:15:00');
  assert.equal(i.iso, '2026-03-11 03:15:00');
  assert.ok(i.avisos.some((a) => a.includes('fuera de rango')));
});

test('una fecha inexistente en el calendario se rechaza con nombre y apellido', () => {
  // 2026 no es bisiesto: el 29 de febrero no existe. Este caso esta en los
  // datos reales y el motor legado lo tragaba en silencio.
  const i = leerInstante('2026-02-29 08:00:00');
  assert.equal(i.ms, null);
  assert.ok(i.avisos.some((a) => a.includes('inexistente')), i.avisos.join('; '));
  assert.equal(leerInstante('2026-04-31').ms, null);
  assert.equal(leerInstante('2026-13-01').ms, null);
  assert.equal(leerInstante('2024-02-29 08:00:00').iso, '2024-02-29 08:00:00'); // 2024 si es bisiesto
});

test('texto ausente o ilegible no lanza excepcion', () => {
  for (const t of [null, undefined, '', '   ', 'No definido', 'N/A', 'proximamente', 42]) {
    const i = leerInstante(t);
    assert.equal(i.ms, null);
    assert.ok(i.avisos.length > 0);
  }
});

test('sin hora: inicio a las 00:00 y fin al final del dia, con aviso', () => {
  const x = v('2026-03-10', '2026-03-12');
  assert.equal(x.inicio, '2026-03-10 00:00:00');
  assert.equal(x.fin, '2026-03-12 23:59:59');
  assert.ok(x.avisos.some((a) => a.includes('sin hora')));
});

test('fin anterior a inicio invalida la vigencia', () => {
  const x = v('2026-03-20 08:00:00', '2026-03-10 08:00:00');
  assert.equal(x.valida, false);
  assert.ok(x.avisos.some((a) => a.includes('anterior')));
});

test('traslape parcial', () => {
  const t = traslape(v('2026-03-01 00:00:00', '2026-03-15 00:00:00'),
                     v('2026-03-10 00:00:00', '2026-03-20 00:00:00'));
  assert.equal(t.hayTraslape, true);
  assert.equal(t.inicio, '2026-03-10 00:00:00');
  assert.equal(t.fin, '2026-03-15 00:00:00');
  assert.equal(t.duracionDias, 6);
});

test('intervalos identicos', () => {
  const a = v('2026-03-01 06:00:00', '2026-03-15 18:00:00');
  const t = traslape(a, v('2026-03-01 06:00:00', '2026-03-15 18:00:00'));
  assert.equal(t.hayTraslape, true);
  assert.equal(t.inicio, '2026-03-01 06:00:00');
  assert.equal(t.fin, '2026-03-15 18:00:00');
});

test('uno contenido dentro del otro', () => {
  const t = traslape(v('2026-03-01 00:00:00', '2026-03-31 00:00:00'),
                     v('2026-03-10 00:00:00', '2026-03-12 00:00:00'));
  assert.equal(t.hayTraslape, true);
  assert.equal(t.inicio, '2026-03-10 00:00:00');
  assert.equal(t.fin, '2026-03-12 00:00:00');
});

test('sin ninguna coincidencia', () => {
  const t = traslape(v('2026-03-01 00:00:00', '2026-03-05 00:00:00'),
                     v('2026-03-10 00:00:00', '2026-03-15 00:00:00'));
  assert.equal(t.hayTraslape, false);
  assert.equal(t.contiguas, false);
  assert.equal(t.motivo, 'no coinciden en el tiempo');
});

test('extremos que solo se tocan: no es traslape, pero se marca como contiguo', () => {
  const t = traslape(v('2026-03-01 00:00:00', '2026-03-10 12:00:00'),
                     v('2026-03-10 12:00:00', '2026-03-20 00:00:00'));
  assert.equal(t.hayTraslape, false);
  assert.equal(t.contiguas, true);
  assert.ok(t.motivo.includes('instante'));
});

test('MISMO DIA, JORNADAS SIN TRASLAPE: el caso que el motor legado fallaba', () => {
  // Manana 06:00-12:00 frente a noche 18:00-23:00 del mismo dia.
  const manana = v('2026-03-10 06:00:00', '2026-03-10 12:00:00');
  const noche = v('2026-03-10 18:00:00', '2026-03-10 23:00:00');
  assert.equal(traslape(manana, noche).hayTraslape, false);

  // Con granularidad de dia (el criterio legado) SI se consideran traslapadas.
  const mananaDia = v('2026-03-10 06:00:00', '2026-03-10 12:00:00', { granularidadTemporal: 'dia' });
  const nocheDia = v('2026-03-10 18:00:00', '2026-03-10 23:00:00', { granularidadTemporal: 'dia' });
  assert.equal(traslape(mananaDia, nocheDia).hayTraslape, true);
});

test('mismo dia con jornadas que SI se solapan', () => {
  const t = traslape(v('2026-03-10 06:00:00', '2026-03-10 14:00:00'),
                     v('2026-03-10 12:00:00', '2026-03-10 20:00:00'));
  assert.equal(t.hayTraslape, true);
  assert.equal(t.duracionHoras, 2);
  assert.equal(t.duracionDias, 1);
});

test('la tolerancia por defecto es 0 y no se inventa ningun margen', () => {
  const a = v('2026-03-10 06:00:00', '2026-03-10 12:00:00');
  const b = v('2026-03-10 12:30:00', '2026-03-10 20:00:00');
  assert.equal(traslape(a, b).hayTraslape, false);
  // Con 60 minutos de tolerancia configurada, tampoco: la tolerancia EXIGE mas
  // traslape, no lo regala. 30 minutos de separacion siguen sin ser traslape.
  assert.equal(traslape(a, b, { toleranciaMinutos: 60 }).hayTraslape, false);
  // Y un traslape corto deja de contar si se exige mas de su duracion.
  const c = v('2026-03-10 11:00:00', '2026-03-10 20:00:00'); // 1 h de traslape
  assert.equal(traslape(a, c).hayTraslape, true);
  assert.equal(traslape(a, c, { toleranciaMinutos: 120 }).hayTraslape, false);
});

test('si alguna vigencia no es valida, el traslape no es evaluable', () => {
  const t = traslape(v('2026-02-29 08:00:00', '2026-03-10 08:00:00'), v('2026-03-01 00:00:00', '2026-03-20 00:00:00'));
  assert.equal(t.evaluable, false);
  assert.equal(t.hayTraslape, false);
  assert.ok(t.motivo.includes('no tiene fechas utilizables'));
});

test('granularidad de dia: convierte la vigencia en dias completos', () => {
  const x = v('2026-03-10 21:30:00', '2026-03-12 04:00:00', { granularidadTemporal: 'dia' });
  assert.equal(x.inicio, '2026-03-10 00:00:00');
  assert.equal(x.fin, '2026-03-12 23:59:59');
  assert.equal(x.granularidad, 'dia');
});

test('finInclusivoDiaCompleto solo actua cuando el fin es exactamente medianoche', () => {
  const a = v('2026-03-10 08:00:00', '2026-10-01 00:00:00', { finInclusivoDiaCompleto: true });
  assert.equal(a.fin, '2026-10-01 23:59:59');
  assert.equal(a.finExtendidoADiaCompleto, true);
  const b = v('2026-03-10 08:00:00', '2026-10-01 17:00:00', { finInclusivoDiaCompleto: true });
  assert.equal(b.fin, '2026-10-01 17:00:00');
  assert.equal(b.finExtendidoADiaCompleto, false);
});

test('no depende de la zona horaria del equipo', () => {
  // Se comprueba que el resultado es aritmetica de calendario pura: el texto
  // que entra y el que sale coinciden, sin desplazamientos por UTC ni horario
  // de verano.
  for (const t of ['2026-01-01 00:00:00', '2026-06-15 12:34:56', '2026-12-31 23:59:59']) {
    assert.equal(leerInstante(t).iso, t);
  }
  assert.equal(formatear(leerInstante('2026-03-29 02:30:00').ms), '2026-03-29 02:30:00');
});
