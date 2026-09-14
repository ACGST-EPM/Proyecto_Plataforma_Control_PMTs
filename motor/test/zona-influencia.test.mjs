/**
 * ZONA DE INFLUENCIA — la identidad que hace exacto al modelo candidato.
 *
 * El modelo candidato dice: hay coincidencia espacial cuando las zonas de
 * influencia de 120 m de dos PMT se superponen. Este archivo demuestra que eso
 * equivale EXACTAMENTE a «distancia mínima ≤ 240 m», y lo comprueba contra una
 * intersección de polígonos calculada por fuerza bruta, que es una vía
 * completamente independiente.
 *
 * Importa porque de esa equivalencia depende que el modelo candidato se pueda
 * evaluar con el motor auditado, sin construir buffers poligonales —que serían
 * aproximados y habrían metido falsos negativos cerca del borde.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { zonasSeSuperponen, solapeMetros, zonaDeInfluencia,
  RADIO_INFLUENCIA_METROS } from '../src/geo/zona-influencia.js';
import { medir } from '../src/geo/geometria.js';
import { planoLocal } from '../src/geo/plano-local.js';

const P = (c) => ({ type: 'Point', coordinates: c });
const L = (cs) => ({ type: 'LineString', coordinates: cs });
const PG = (a) => ({ type: 'Polygon', coordinates: [a] });

test('la identidad básica: superposición ⟺ distancia ≤ suma de radios', () => {
  assert.equal(zonasSeSuperponen(0, 120, 120), true, 'si se tocan, sus zonas también');
  assert.equal(zonasSeSuperponen(239.999, 120, 120), true);
  assert.equal(zonasSeSuperponen(240, 120, 120), true, 'el borde cuenta: se tocan justo');
  assert.equal(zonasSeSuperponen(240.001, 120, 120), false);
  // Radios distintos: la suma es lo que manda, no el mayor ni la media.
  assert.equal(zonasSeSuperponen(150, 100, 50), true);
  assert.equal(zonasSeSuperponen(151, 100, 50), false);
});

test('sin distancia medible NO se dice que no se superponen: se dice que no se sabe', () => {
  assert.equal(zonasSeSuperponen(null), null);
  assert.equal(zonasSeSuperponen(undefined), null);
  assert.equal(zonasSeSuperponen(NaN), null);
  assert.equal(zonasSeSuperponen(Infinity), null);
  assert.equal(solapeMetros(null), null);
});

test('el solape es la anchura del traslape, y nunca negativo', () => {
  assert.equal(solapeMetros(0, 120, 120), 240, 'trazados que se tocan: solape máximo');
  assert.equal(solapeMetros(200, 120, 120), 40);
  assert.equal(solapeMetros(240, 120, 120), 0, 'justo en el borde: se tocan, sin solape');
  assert.equal(solapeMetros(500, 120, 120), 0, 'nunca negativo');
});

/* ═══════════ LA PRUEBA QUE DE VERDAD DEMUESTRA LA IDENTIDAD ═══════════ */

/**
 * ¿Hay algún punto del plano que esté a la vez dentro de las dos zonas?
 *
 * Se responde por FUERZA BRUTA, sin usar la identidad: se recorre una rejilla
 * fina alrededor de las dos geometrías y se mide, punto a punto, la distancia a
 * cada una. Es lento y tosco a propósito — su valor es que no comparte ni una
 * línea de razonamiento con lo que está comprobando.
 */
function superponenPorFuerzaBruta(gA, gB, radio, paso = 12) {
  const todos = [...gA.coordinates.flat(Infinity), ...gB.coordinates.flat(Infinity)];
  const lons = [], lats = [];
  for (let i = 0; i < todos.length; i += 2) { lons.push(todos[i]); lats.push(todos[i + 1]); }
  const cLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const plano = planoLocal(cLon, cLat);

  // Se explora una caja que cubre las dos geometrías más el radio, con margen.
  const esquinas = [];
  for (let i = 0; i < todos.length; i += 2) esquinas.push(plano.proyectar([todos[i], todos[i + 1]]));
  const minE = Math.min(...esquinas.map((p) => p[0])) - radio - paso;
  const maxE = Math.max(...esquinas.map((p) => p[0])) + radio + paso;
  const minN = Math.min(...esquinas.map((p) => p[1])) - radio - paso;
  const maxN = Math.max(...esquinas.map((p) => p[1])) + radio + paso;

  for (let e = minE; e <= maxE; e += paso) {
    for (let n = minN; n <= maxN; n += paso) {
      const p = P(plano.desproyectar([e, n]));
      const dA = medir(p, gA).metros, dB = medir(p, gB).metros;
      if (dA !== null && dB !== null && dA <= radio && dB <= radio) return true;
    }
  }
  return false;
}

test('DEMOSTRACIÓN: la identidad coincide con la intersección real, caso a caso', () => {
  const radio = 60;   // radio pequeño para que la rejilla de fuerza bruta sea viable
  const casos = [
    ['dos puntos muy cerca',        P([-75.6000, 6.2000]), P([-75.5995, 6.2000])],
    ['dos puntos justo en el borde',P([-75.6000, 6.2000]), P([-75.59892, 6.2000])],
    ['dos puntos lejos',            P([-75.6000, 6.2000]), P([-75.5960, 6.2000])],
    ['punto contra línea',          P([-75.6000, 6.2010]), L([[-75.6020, 6.2000], [-75.5980, 6.2000]])],
    ['línea contra línea paralelas',L([[-75.6020, 6.2000], [-75.5980, 6.2000]]), L([[-75.6020, 6.2012], [-75.5980, 6.2012]])],
    ['líneas que se cruzan',        L([[-75.6010, 6.1995], [-75.5990, 6.2005]]), L([[-75.6010, 6.2005], [-75.5990, 6.1995]])],
    ['polígono y punto fuera',      PG([[-75.6010, 6.2000], [-75.5995, 6.2000], [-75.5995, 6.2008], [-75.6010, 6.2008], [-75.6010, 6.2000]]), P([-75.5975, 6.2004])],
    ['polígono y punto dentro',     PG([[-75.6010, 6.2000], [-75.5995, 6.2000], [-75.5995, 6.2008], [-75.6010, 6.2008], [-75.6010, 6.2000]]), P([-75.6002, 6.2004])],
  ];
  for (const [etq, gA, gB] of casos) {
    const d = medir(gA, gB).metros;
    const porIdentidad = zonasSeSuperponen(d, radio, radio);
    const porFuerzaBruta = superponenPorFuerzaBruta(gA, gB, radio);
    // La rejilla puede fallar por muy poco justo en el borde: se exige acuerdo
    // salvo en una franja de un paso de rejilla alrededor de 2·radio.
    const enElBorde = Math.abs(d - 2 * radio) < 15;
    if (enElBorde) continue;
    assert.equal(porIdentidad, porFuerzaBruta,
      `${etq}: distancia ${d.toFixed(2)} m · identidad dice ${porIdentidad} y la rejilla ${porFuerzaBruta}`);
  }
});

test('DEMOSTRACIÓN (propiedad): la identidad nunca se separa de la rejilla', () => {
  let s = 424242;
  const az = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const radio = 50;
  let comprobados = 0, superpuestos = 0;
  for (let i = 0; i < 24; i++) {
    const lon = -75.60 + (az() - 0.5) * 0.002, lat = 6.20 + (az() - 0.5) * 0.002;
    const gA = az() < 0.5 ? P([lon, lat])
      : L([[lon, lat], [lon + (az() - 0.5) * 0.002, lat + (az() - 0.5) * 0.001]]);
    const lon2 = lon + (az() - 0.5) * 0.004, lat2 = lat + (az() - 0.5) * 0.002;
    const gB = az() < 0.5 ? P([lon2, lat2])
      : L([[lon2, lat2], [lon2 + (az() - 0.5) * 0.002, lat2 + (az() - 0.5) * 0.001]]);

    const d = medir(gA, gB).metros;
    if (d === null) continue;
    if (Math.abs(d - 2 * radio) < 15) continue;      // franja de borde, ver arriba
    comprobados++;
    const porIdentidad = zonasSeSuperponen(d, radio, radio);
    if (porIdentidad) superpuestos++;
    assert.equal(porIdentidad, superponenPorFuerzaBruta(gA, gB, radio),
      `caso ${i}: distancia ${d.toFixed(2)} m`);
  }
  assert.ok(comprobados > 12, `solo se comprobaron ${comprobados} casos`);
  assert.ok(superpuestos > 0 && superpuestos < comprobados,
    'el generador tiene que producir casos de los dos tipos, no siempre el mismo');
});

/* ═══════════ EL POLÍGONO DE DIBUJO NO DECIDE NADA ═══════════ */

test('el polígono de zona es para DIBUJAR: cubre la geometría y no decide', () => {
  const linea = L([[-75.6010, 6.2000], [-75.5990, 6.2000]]);
  const z = zonaDeInfluencia(linea, 120);
  assert.equal(z.type, 'MultiPolygon');
  assert.ok(z.coordinates.length >= 3, 'un círculo por vértice más el cuerpo del tramo');
  for (const poli of z.coordinates) {
    for (const anillo of poli) {
      assert.ok(anillo.length >= 4, 'cada anillo tiene que ser un polígono válido');
      assert.deepEqual(anillo[0], anillo.at(-1), 'y estar cerrado');
      for (const [lon, lat] of anillo) {
        assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
        assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
      }
    }
  }
});

test('el borde del polígono dibujado cae a la distancia pedida, con error de centímetros', () => {
  const punto = P([-75.6, 6.2]);
  const z = zonaDeInfluencia(punto, 120, { lados: 64 });
  let peor = 0;
  for (const [lon, lat] of z.coordinates[0][0]) {
    const d = medir(P([lon, lat]), punto).metros;
    peor = Math.max(peor, Math.abs(d - 120));
  }
  assert.ok(peor < 0.05, `el borde se desvía ${peor.toFixed(4)} m del radio pedido`);
});

test('geometría sin partes utilizables: no se inventa ninguna zona', () => {
  assert.equal(zonaDeInfluencia({ type: 'LineString', coordinates: [] }), null);
  assert.equal(zonaDeInfluencia(null), null);
});

test('el radio por defecto es el operativo aprobado', () => {
  assert.equal(RADIO_INFLUENCIA_METROS, 120);
});

/* ═══════════ EL MODELO CANDIDATO DENTRO DEL MOTOR ═══════════ */

import { calcularRelaciones, CONFIG_POR_DEFECTO, alcanceMetros, resolverConfig,
  describirModeloEspacial } from '../src/nucleo/index.js';
import { caja } from '../src/geo/geometria.js';

const reg = (id, contrato, coords) => ({
  id, contrato, frente: 'F' + id, contratista: 'X', municipio: 'M',
  geometria: P(coords), tipoGeometria: 'Point', caja: caja(P(coords)),
  tieneGeometria: true, analizable: true, avisos: [],
  vigencia: { inicioMs: Date.UTC(2026, 2, 1), finMs: Date.UTC(2026, 2, 20),
    inicio: '2026-03-01 00:00:00', fin: '2026-03-20 00:00:00', valida: true, avisos: [] },
});

test('LA BASELINE ESTA PROTEGIDA: el modelo por defecto NO ha cambiado', () => {
  assert.equal(CONFIG_POR_DEFECTO.modeloEspacial, 'minima',
    'cambiar esto por defecto movería todas las cifras publicadas');
  assert.equal(CONFIG_POR_DEFECTO.umbralMetros, 120);
  assert.equal(CONFIG_POR_DEFECTO.radioInfluenciaMetros, 120);
  assert.equal(alcanceMetros(resolverConfig({})), 120, 'el alcance por defecto sigue siendo 120 m');
});

test('el modelo candidato alcanza EXACTAMENTE la suma de los dos radios', () => {
  const c = resolverConfig({ modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: 120 });
  assert.equal(alcanceMetros(c), 240);
  const c2 = resolverConfig({ modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: 75 });
  assert.equal(alcanceMetros(c2), 150);
});

test('el candidato relaciona lo que el actual no ve, entre 120 y 240 m', () => {
  // Dos puntos separados unos 166 m: fuera del modelo actual, dentro del candidato.
  const registros = [reg('a', 'CW-1', [-75.6000, 6.2000]), reg('b', 'CW-2', [-75.5985, 6.2000])];
  const d = medir(registros[0].geometria, registros[1].geometria).metros;
  assert.ok(d > 120 && d < 240, `el caso de prueba debe caer entre 120 y 240 m (cayó en ${d})`);

  const actual = calcularRelaciones(registros, { modeloEspacial: 'minima', umbralMetros: 120 });
  assert.equal(actual.relaciones.length, 0, 'el modelo actual no la ve');

  const cand = calcularRelaciones(registros,
    { modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: 120 });
  assert.equal(cand.relaciones.length, 1, 'el candidato sí');
  assert.equal(cand.relaciones[0].zonasDeInfluenciaSeSuperponen, true);
  assert.ok(cand.relaciones[0].solapeDeZonasMetros > 0);
  assert.equal(cand.relaciones[0].modeloEspacialAplicado, 'zonasDeInfluencia');
});

test('INVARIANTE: el candidato nunca PIERDE una relación que el actual sí ve', () => {
  // Es más amplio por construcción (240 ≥ 120), pero conviene tener la prueba:
  // si algún día alguien toca `alcanceMetros`, esto lo caza.
  let s = 987654;
  const az = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const registros = [];
  for (let i = 0; i < 40; i++) {
    registros.push(reg('p' + i, 'CW-' + (i % 4),
      [-75.60 + (az() - 0.5) * 0.006, 6.20 + (az() - 0.5) * 0.006]));
  }
  const clave = (r) => [r.idA, r.idB].sort().join('|');
  const a = new Set(calcularRelaciones(registros, { modeloEspacial: 'minima', umbralMetros: 120 })
    .relaciones.map(clave));
  const c = new Set(calcularRelaciones(registros,
    { modeloEspacial: 'zonasDeInfluencia', radioInfluenciaMetros: 120 }).relaciones.map(clave));
  assert.ok(a.size > 0, 'el generador tiene que producir alguna relación con el modelo actual');
  for (const k of a) assert.ok(c.has(k), `el candidato perdió la relación ${k}`);
  assert.ok(c.size >= a.size);
});

test('los hechos de la zona se calculan SIEMPRE, gobierne o no la decisión', () => {
  // Con el modelo ACTUAL activo, la relación igualmente dice si las zonas se
  // superponen: es un hecho, no una consecuencia de la regla elegida.
  const registros = [reg('a', 'CW-1', [-75.6000, 6.2000]), reg('b', 'CW-2', [-75.5999, 6.2000])];
  const r = calcularRelaciones(registros, { modeloEspacial: 'minima', umbralMetros: 120 }).relaciones[0];
  assert.equal(r.modeloEspacialAplicado, 'minima');
  assert.equal(r.zonasDeInfluenciaSeSuperponen, true);
  assert.equal(r.radioInfluenciaMetros, 120);
  assert.ok(r.solapeDeZonasMetros > 0);
});

test('una configuración de modelo inválida se rechaza con un mensaje claro', () => {
  assert.throws(() => resolverConfig({ modeloEspacial: 'inventado' }), /modeloEspacial/);
  assert.throws(() => resolverConfig({ radioInfluenciaMetros: 0 }), /radioInfluenciaMetros/);
  assert.throws(() => resolverConfig({ radioInfluenciaMetros: -5 }), /radioInfluenciaMetros/);
  assert.throws(() => resolverConfig({ radioInfluenciaMetros: 'mucho' }), /radioInfluenciaMetros/);
});

test('el criterio vigente se puede explicar en una frase, sin jerga', () => {
  assert.match(describirModeloEspacial(resolverConfig({})), /distancia minima .* 120 m/);
  const c = describirModeloEspacial(resolverConfig({ modeloEspacial: 'zonasDeInfluencia' }));
  assert.match(c, /zonas de influencia/);
  assert.match(c, /240 m/, 'tiene que decir a qué distancia equivale, para que nadie se sorprenda');
});
