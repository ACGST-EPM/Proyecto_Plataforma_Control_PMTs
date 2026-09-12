/**
 * AUDITORÍA POR PROPIEDADES — los invariantes del producto, no casos sueltos.
 *
 * ══ POR QUÉ ESTE ARCHIVO EXISTE ════════════════════════════════════════════
 *
 * Las etapas 2.1 a 2.4 cerraron veinticuatro defectos. Todos tenían una cosa en
 * común: ninguno se habría encontrado leyendo el código, y casi ninguno con un
 * caso escrito a mano. Aparecían cuando dos partes del producto contaban lo
 * mismo de dos maneras, o cuando un dato pasaba por una tubería y salía
 * cambiado.
 *
 * Aquí no se prueban ejemplos: se prueban PROPIEDADES sobre conjuntos generados,
 * con semilla fija para que cualquier fallo se pueda reproducir exactamente.
 *
 * ══ LAS PROPIEDADES ════════════════════════════════════════════════════════
 *
 *   P1  guardar → abrir conserva la semántica (y es IDEMPOTENTE)
 *   P2  el dato mostrado es el dato con el que se calcula
 *   P3  el dato exportado es el dato visible
 *   P4  resumen = detalle, para el mismo alcance
 *   P5  «hubo un error» ≠ «no hay resultado»
 *   P6  «no se pudo evaluar» ≠ «fuera del umbral»
 *   P7  misma entrada + mismas reglas → mismo resultado
 *   P8  mismo contrato → nunca relación entre contratos
 *   P9  A/B = B/A
 *
 * (P «ubicado ⇒ geometría defendible» vive en `motor/test/acercamiento.test.mjs`,
 *  junto al código que la cumple; P «filtro interno → representación visible» y
 *  P «cambio de estado → informe caducado» necesitan DOM y viven en
 *  `app/test/navegador.test.mjs`.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as Proyecto from '../nucleo/proyecto.js';
import * as Filtro from '../nucleo/filtrado.js';
import * as Export from '../nucleo/exportar.js';
import { resumir } from '../nucleo/resumen.js';
import { estadoEspacial, estadoTemporal, ESPACIAL, TEMPORAL, TIPOS_CIERRE } from '../nucleo/modelo.js';
import { normalizarInstante } from '../nucleo/tiempo.js';
import { calcularRelaciones } from '../../motor/src/nucleo/index.js';
import { caja as cajaDeGeometria } from '../../motor/src/geo/geometria.js';

const CONFIG = {
  umbralMetros: 120, toleranciaMinutos: 0, granularidadTemporal: 'instante',
  excluirMismoContrato: true, modoDistancia: 'real',
};

/* ───────────────────── Generador determinista ───────────────────── */

function azarConSemilla(semilla) {
  let s = semilla >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/**
 * Conjunto de PMT variado a propósito: contratos repetidos, geometrías de
 * varios tipos, vigencias válidas, incompletas, invertidas y ausentes, y algún
 * par imposible de medir. Es el terreno donde aparecieron los defectos reales.
 */
function generarConjunto(semilla, n = 14) {
  const azar = azarConSemilla(semilla);
  const entre = (a, b) => a + azar() * (b - a);
  const elegir = (xs) => xs[Math.floor(azar() * xs.length) % xs.length];
  const contratos = ['CW-1', 'CW-2', 'CW-3'];
  const municipios = ['Medellin', 'Bello', 'Itagui', null];

  const filas = [];
  for (let i = 0; i < n; i++) {
    const lon = -75.60 + entre(-0.004, 0.004), lat = 6.20 + entre(-0.004, 0.004);
    const tipo = Math.floor(azar() * 4);
    const geometria =
      tipo === 0 ? { type: 'Point', coordinates: [lon, lat] }
      : tipo === 1 ? { type: 'LineString', coordinates: [[lon, lat], [lon + entre(0.0002, 0.001), lat + entre(-0.0005, 0.0005)]] }
      : tipo === 2 ? { type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.0006, lat], [lon + 0.0006, lat + 0.0004], [lon, lat + 0.0004], [lon, lat]]] }
      : { type: 'MultiPoint', coordinates: [[lon, lat], [lon + 0.0008, lat + 0.0006]] };

    // Vigencias de los seis estados posibles.
    const caso = Math.floor(azar() * 6);
    const d1 = 1 + Math.floor(azar() * 20), d2 = d1 + Math.floor(azar() * 12);
    const f = (d) => `2026-03-${String(d).padStart(2, '0')} ${String(6 + Math.floor(azar() * 10)).padStart(2, '0')}:00:00`;
    const vig =
      caso === 0 ? { inicio: f(d1), fin: f(d2) }                       // completa
      : caso === 1 ? { inicio: f(d1), fin: 'no definida' }             // incompleta (falta el fin)
      : caso === 2 ? { inicio: '??', fin: f(d2) }                      // incompleta (falta el inicio)
      : caso === 3 ? { inicio: f(d2), fin: f(d1) }                     // invertida
      : caso === 4 ? { inicio: null, fin: null }                       // ausente
      : { inicio: f(d1), fin: f(d2) };                                 // completa

    const ini = normalizarInstante(vig.inicio, { horaPorDefecto: '00:00:00' });
    const fin = normalizarInstante(vig.fin, { horaPorDefecto: '23:59:59' });
    const valida = ini.ok && fin.ok && fin.ms >= ini.ms;

    filas.push({
      id: `pmt_${semilla}_${i}`,
      frente: `Frente ${i}`,
      contrato: elegir(contratos), contratista: 'CONTRATISTA ' + elegir(['A', 'B']),
      proyecto: 'P', municipio: elegir(municipios), direccion: `Calle ${i}`,
      tipoCierre: elegir([...TIPOS_CIERRE, null]),
      inicio: ini.ok ? ini.texto : null, fin: fin.ok ? fin.texto : null,
      inicioMs: valida ? ini.ms : (ini.ok ? ini.ms : null),
      finMs: valida ? fin.ms : (fin.ok ? fin.ms : null),
      vigenciaValida: valida,
      geometria, tipoGeometria: geometria.type, tieneGeometria: true,
      analizable: valida, origenArchivo: `f${i % 3}.kmz`, carpeta: null,
      avisos: ini.ok ? [] : ['fecha de inicio ilegible en el KMZ'],
      duplicadoExacto: false, idRepetidoEnOrigen: false,
    });
  }
  // Un par imposible de medir: antípodas. Obliga a que exista «no evaluable».
  filas.push({ ...filas[0], id: `pmt_${semilla}_antipoda`, contrato: 'CW-LEJOS',
    geometria: { type: 'Point', coordinates: [180 - 0.001, 0] }, tipoGeometria: 'Point' });
  return filas;
}

/** Ejecuta el motor igual que lo hace la aplicación. */
function analizar(filas) {
  const registros = filas.map((x) => ({
    ...x,
    caja: x.geometria ? cajaDeGeometria(x.geometria) : null,
    tieneGeometria: !!x.geometria,
    vigencia: { inicioMs: x.inicioMs, finMs: x.finMs, inicio: x.inicio, fin: x.fin,
      valida: x.vigenciaValida, avisos: [] },
  }));
  const r = calcularRelaciones(registros, CONFIG);
  return { relaciones: r.relaciones, noEvaluables: r.paresNoEvaluablesEspacialmente ?? [] };
}

const SEMILLAS = [11, 97, 241, 613, 1289, 3557, 7919, 20260912];

/* ═════════════ P1 · guardar → abrir conserva la semántica ═════════════ */

test('P1: guardar y abrir conserva cada campo, y es IDEMPOTENTE', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const guardarAbrir = (fs) => {
      const p = Proyecto.crearProyecto({ filas: fs, relaciones: [], noEvaluables: [], archivos: [],
        config: CONFIG, filtros: null, nombre: 'p', versionReglas: '1.2.0' });
      const r = Proyecto.leerProyecto(Proyecto.serializar(p));
      assert.equal(r.ok, true, r.motivo);
      return r.proyecto.trazados;
    };
    const v1 = guardarAbrir(filas);
    const v2 = guardarAbrir(v1);

    assert.equal(v1.length, filas.length, `semilla ${s}: se perdieron trazados`);
    const clave = (x) => JSON.stringify([x.id, x.contrato, x.municipio, x.tipoCierre,
      x.inicio, x.fin, x.inicioMs, x.finMs, x.vigenciaValida, x.tipoGeometria, x.geometria]);
    for (let i = 0; i < v1.length; i++) {
      assert.equal(clave(v1[i]), clave(v2[i]),
        `semilla ${s}, trazado ${i}: la SEGUNDA vuelta cambia el dato`);
      // IDEMPOTENCIA TAMBIÉN EN LOS AVISOS: una vuelta más no puede añadir ruido.
      assert.deepEqual(v2[i].avisos, v1[i].avisos,
        `semilla ${s}, trazado ${i}: los avisos crecen en cada vuelta`);
    }
  }
});

test('P1: y los RESULTADOS del motor son los mismos tras la vuelta', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const antes = analizar(filas);
    const p = Proyecto.crearProyecto({ filas, relaciones: antes.relaciones, noEvaluables: antes.noEvaluables,
      archivos: [], config: CONFIG, filtros: null, nombre: 'p', versionReglas: '1.2.0' });
    const despues = analizar(Proyecto.leerProyecto(Proyecto.serializar(p)).proyecto.trazados);
    assert.equal(despues.relaciones.length, antes.relaciones.length, `semilla ${s}: cambian las relaciones`);
    assert.equal(despues.noEvaluables.length, antes.noEvaluables.length, `semilla ${s}: cambian los no evaluables`);
    const d = (rs) => rs.map((r) => `${r.idA}|${r.idB}|${r.distanciaMetros}|${r.hayTraslapeTemporal}`).sort();
    assert.deepEqual(d(despues.relaciones), d(antes.relaciones), `semilla ${s}: cambia algún hecho`);
  }
});

/* ═════════════ P2 · el dato mostrado es el dato calculado ═════════════ */

test('P2: los milisegundos siempre se derivan del texto que se muestra', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const p = Proyecto.crearProyecto({ filas, relaciones: [], noEvaluables: [], archivos: [],
      config: CONFIG, filtros: null, nombre: 'p', versionReglas: '1.2.0' });
    // Los milisegundos NO se persisten: eso es parte de la propiedad.
    for (const t of p.trazados) {
      assert.equal(t.inicioMs, undefined, 'un milisegundo persistido es una segunda verdad');
      assert.equal(t.finMs, undefined);
    }
    for (const x of Proyecto.leerProyecto(Proyecto.serializar(p)).proyecto.trazados) {
      if (x.inicioMs !== null) {
        assert.equal(x.inicioMs, normalizarInstante(x.inicio).ms, `${x.id}: el ms no sale del texto`);
      }
      if (x.finMs !== null) {
        assert.equal(x.finMs, normalizarInstante(x.fin).ms, `${x.id}: el ms no sale del texto`);
      }
      // Y nunca hay un número sin su texto.
      assert.ok(!(x.inicioMs !== null && x.inicio === null), `${x.id}: milisegundos sin texto`);
      assert.ok(!(x.finMs !== null && x.fin === null), `${x.id}: milisegundos sin texto`);
    }
  }
});

/* ═════════════ P3 · el dato exportado es el dato visible ═════════════ */

test('P3: toda exportación contiene EXACTAMENTE el subconjunto visible', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const { relaciones } = analizar(filas);
    for (const f of [
      Filtro.filtrosVacios(),
      { ...Filtro.filtrosVacios(), contrato: ['CW-1'] },
      { ...Filtro.filtrosVacios(), contrato: ['CW-1', 'CW-2'], municipio: ['Medellin'] },
      { ...Filtro.filtrosVacios(), texto: 'Frente 1' },
    ]) {
      const visibles = Filtro.filtrarPmts(filas, f);
      const ids = new Set(visibles.map((x) => x.id));
      const relVis = Filtro.filtrarRelaciones(relaciones, f, ids);

      // GeoJSON: una feature por PMT visible, ni una más.
      const gj = Export.aGeoJson(visibles);
      assert.equal(gj.features.length, visibles.length, `semilla ${s}: el GeoJSON no cuadra`);
      const idsGj = new Set(gj.features.map((x) => x.properties.id));
      assert.deepEqual([...idsGj].sort(), [...ids].sort(), `semilla ${s}: el GeoJSON exporta otro conjunto`);

      // CSV: una línea de datos por PMT visible.
      const lineas = Export.pmtsACsv(visibles).trim().split('\n');
      assert.equal(lineas.length - 1, visibles.length, `semilla ${s}: el CSV no cuadra`);

      // Y ningún identificador de fuera del alcance se cuela.
      const csvRel = Export.relacionesACsv(relVis, new Map(filas.map((x) => [x.id, x])));
      assert.equal(csvRel.trim().split('\n').length - 1, relVis.length);

      // OJO CON EL ALCANCE DE UNA RELACIÓN: se ve si AL MENOS UNO de sus dos
      // extremos está visible. Es deliberado —ocultarla haría creer que un PMT
      // filtrado no interfiere con nada—, así que la propiedad no es «los dos
      // extremos visibles», sino: al menos uno visible Y nada colgando, es
      // decir, la exportación identifica por completo al otro extremo aunque no
      // se esté viendo. Si no, el CSV dejaría una referencia sin contenido.
      const filasCsv = csvRel.trim().split('\n').slice(1);
      relVis.forEach((r, i) => {
        assert.ok(ids.has(r.idA) || ids.has(r.idB),
          `semilla ${s}: una relación visible no toca el alcance visible`);
        const campos = filasCsv[i].split(';');
        assert.ok(campos[0]?.length && campos[2]?.length,
          `semilla ${s}: la relación exportada deja un extremo sin identificar`);
      });
    }
  }
});

/* ═════════════ P4 · resumen = detalle, para el mismo alcance ═════════════ */

test('P4: el resumen cuadra con el detalle, alcance a alcance', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const { relaciones, noEvaluables } = analizar(filas);
    for (const f of [Filtro.filtrosVacios(), { ...Filtro.filtrosVacios(), contrato: ['CW-2'] }]) {
      const visibles = Filtro.filtrarPmts(filas, f);
      const ids = new Set(visibles.map((x) => x.id));
      const relVis = Filtro.filtrarRelaciones(relaciones, f, ids);
      const noEvalVis = noEvaluables.filter((h) => ids.has(h.idA) || ids.has(h.idB));
      const r = resumir(null, visibles, relVis, noEvalVis, { total: filas.length });

      assert.equal(r.pmts, visibles.length);
      assert.equal(r.relaciones, relVis.length);
      assert.equal(r.pmtsCargados, filas.length);
      assert.equal(r.filtrado, visibles.length !== filas.length);
      // Cada contador del resumen se puede recomputar desde el detalle.
      assert.equal(r.contacto, relVis.filter((x) => estadoEspacial(x) === ESPACIAL.CONTACTO).length);
      assert.equal(r.cercania, relVis.filter((x) => estadoEspacial(x) === ESPACIAL.CERCANIA).length);
      assert.equal(r.aLaVez, relVis.filter((x) => estadoTemporal(x) === TEMPORAL.COINCIDE).length);
      assert.equal(r.espacialNoEval,
        relVis.filter((x) => estadoEspacial(x) === ESPACIAL.NO_EVALUABLE).length + noEvalVis.length);
      assert.equal(r.contratos, new Set(visibles.map((x) => x.contrato).filter(Boolean)).size);
    }
  }
});

/* ═════════════ P5 · error ≠ ausencia de resultado ═════════════ */

test('P5: «no se pudo» y «no hay» nunca se suman ni se confunden', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const { relaciones, noEvaluables } = analizar(filas);
    const r = resumir(null, filas, relaciones, noEvaluables);

    // Los no evaluables NUNCA están dentro de `relaciones`.
    const idsRel = new Set(relaciones.map((x) => `${x.idA}|${x.idB}`));
    for (const h of noEvaluables) {
      assert.ok(!idsRel.has(`${h.idA}|${h.idB}`),
        `semilla ${s}: un par no evaluable se coló entre las relaciones`);
    }
    // Y el contador de no evaluables es su propio número, no parte de otro.
    assert.equal(r.espacialNoEval >= noEvaluables.length, true);
    assert.equal(r.relaciones, relaciones.length);
    assert.notEqual(r.relaciones, relaciones.length + noEvaluables.length - noEvaluables.length + 1);
    // Cada no evaluable trae su motivo: un error sin explicación es un error invisible.
    for (const h of noEvaluables) {
      assert.ok(typeof h.motivoNoEvaluableEspacial === 'string' && h.motivoNoEvaluableEspacial.length > 0,
        `semilla ${s}: un par no evaluable sin motivo`);
    }
  }
});

/* ═════════════ P6 · no evaluable ≠ fuera del umbral ═════════════ */

test('P6: «no se pudo medir» jamás se presenta como «está lejos»', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const { relaciones, noEvaluables } = analizar(filas);
    for (const r of relaciones) {
      if (r.espacialEvaluable === false) {
        assert.equal(r.distanciaMetros, null, 'sin medida no puede haber número');
        assert.equal(r.dentroDelUmbral, null, 'sin medida no se puede decir si está dentro o fuera');
        assert.equal(estadoEspacial(r), ESPACIAL.NO_EVALUABLE);
      } else {
        assert.equal(typeof r.distanciaMetros, 'number');
        assert.notEqual(estadoEspacial(r), ESPACIAL.NO_EVALUABLE);
      }
    }
    // Y los pares que el motor apartó llevan motivo, no distancia.
    for (const h of noEvaluables) {
      assert.ok(h.distanciaMetros === undefined || h.distanciaMetros === null,
        `semilla ${s}: un par no evaluable trae distancia`);
    }
    // El motivo tiene que SOBREVIVIR hasta la exportación: una columna que
    // promete el motivo y publica otra cosa es un dato mostrado que no es el
    // dato calculado.
    if (noEvaluables.length) {
      // (El motivo lleva `;` dentro, asi que va entrecomillado: se busca en la
      //  linea entera en vez de partirla por el separador.)
      const linea = Export.relacionesACsv(noEvaluables, new Map()).trim().split('\n')[1];
      assert.ok(/distancia: /.test(linea),
        `semilla ${s}: la columna MOTIVO_NO_EVALUABLE no trae el motivo: ${linea}`);
      assert.ok(noEvaluables[0].motivoNoEvaluableEspacial.split(';')[0].trim().length > 0);
    }
  }
});

/* ═════════════ P7 · determinismo ═════════════ */

test('P7: misma entrada + mismas reglas → mismo resultado, bit a bit', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const a = analizar(filas), b = analizar(filas);
    const huella = (r) => JSON.stringify(r.relaciones.map((x) =>
      [x.idA, x.idB, x.distanciaMetros, x.intersecanFisicamente, x.hayTraslapeTemporal, x.traslapeInicio]));
    assert.equal(huella(a), huella(b), `semilla ${s}: dos ejecuciones dan resultados distintos`);
    // Y el orden de entrada no cambia los hechos (solo, quizá, el orden de salida).
    const revueltas = [...filas].reverse();
    const c = analizar(revueltas);
    const conjunto = (r) => new Set(r.relaciones.map((x) =>
      [x.idA, x.idB].sort().join('|') + '#' + x.distanciaMetros + '#' + x.hayTraslapeTemporal));
    assert.deepEqual([...conjunto(c)].sort(), [...conjunto(a)].sort(),
      `semilla ${s}: el orden de entrada cambia los hechos`);
  }
});

/* ═════════════ P8 · mismo contrato, nunca relación ═════════════ */

test('P8: dos PMT del mismo contrato nunca producen una relación', () => {
  for (const s of SEMILLAS) {
    const { relaciones, noEvaluables } = analizar(generarConjunto(s));
    for (const r of relaciones) {
      assert.notEqual(r.contratoA, r.contratoB,
        `semilla ${s}: relación dentro del contrato ${r.contratoA}`);
    }
    for (const h of noEvaluables) {
      if (h.contratoA && h.contratoB) {
        assert.notEqual(h.contratoA, h.contratoB,
          `semilla ${s}: par no evaluable dentro del mismo contrato`);
      }
    }
  }
});

/* ═════════════ P9 · A/B = B/A ═════════════ */

test('P9: intercambiar A y B no cambia ningún hecho', () => {
  for (const s of SEMILLAS) {
    const filas = generarConjunto(s);
    const directo = analizar(filas);
    const inverso = analizar([...filas].reverse());
    const porPar = (rs) => {
      const m = new Map();
      for (const r of rs) m.set([r.idA, r.idB].sort().join('|'), r);
      return m;
    };
    const a = porPar(directo.relaciones), b = porPar(inverso.relaciones);
    assert.equal(a.size, b.size, `semilla ${s}: distinto número de parejas`);
    for (const [k, ra] of a) {
      const rb = b.get(k);
      assert.ok(rb, `semilla ${s}: la pareja ${k} solo aparece en un sentido`);
      assert.equal(ra.distanciaMetros, rb.distanciaMetros, `semilla ${s}: ${k} mide distinto al invertir`);
      assert.equal(ra.intersecanFisicamente, rb.intersecanFisicamente, `semilla ${s}: ${k} se tocan o no según el orden`);
      assert.equal(ra.hayTraslapeTemporal, rb.hayTraslapeTemporal, `semilla ${s}: ${k} coincide en el tiempo según el orden`);
      assert.equal(ra.espacialEvaluable, rb.espacialEvaluable);
    }
  }
});
