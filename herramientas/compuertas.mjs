/**
 * COMPUERTAS DE ENTREGA — A..L.
 *
 * ══ PARA QUE SIRVE ════════════════════════════════════════════════════════
 *
 * Una lista de comprobacion escrita en un documento se cumple a ojo, y a ojo
 * se cumple siempre. Esto la EJECUTA: cada compuerta es una comprobacion real
 * sobre el codigo y los artefactos, y falla con un motivo concreto.
 *
 *   npm run compuertas
 *
 * Sale con codigo 1 si alguna falla, para que no se pueda entregar «con una
 * compuerta en rojo pero ya lo arreglo».
 *
 * NO sustituye a las pruebas: las pruebas comprueban que el codigo hace lo que
 * dice; las compuertas comprueban que el PRODUCTO cumple lo que se prometio.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

const resultados = [];
async function compuerta(letra, titulo, fn) {
  try {
    const detalle = await fn();
    resultados.push({ letra, titulo, ok: true, detalle: detalle ?? '' });
  } catch (e) {
    resultados.push({ letra, titulo, ok: false, detalle: e.message });
  }
}
const exigir = (cond, motivo) => { if (!cond) throw new Error(motivo); };

/**
 * Devuelve el CODIGO de un archivo, sin comentarios.
 *
 * Hace falta porque estas compuertas buscan palabras prohibidas, y este
 * proyecto documenta EXTENSAMENTE por que algo esta prohibido. Sin quitar los
 * comentarios, el parrafo que explica «por eso ya no se activa crossOrigin»
 * hace saltar la compuerta que vigila que no se active. La explicacion no es
 * la infraccion.
 */
function soloCodigo(texto) {
  const fuera = [];
  let enBloque = false;
  for (const linea of texto.split('\n')) {
    const abre = linea.lastIndexOf('/*'), cierra = linea.lastIndexOf('*/');
    const eraBloque = enBloque;
    if (!enBloque && abre !== -1 && cierra < abre) enBloque = true;
    else if (enBloque && cierra !== -1) enBloque = false;
    if (eraBloque || /^\s*[*]/.test(linea)) { fuera.push(''); continue; }
    fuera.push(linea.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/\/\*.*$/, ''));
  }
  return fuera;
}

/* ── A · Ningun secreto en codigo de cliente ── */
await compuerta('A', 'Ningún secreto viaja en el producto', () => {
  // Se miran los archivos QUE SE ENTREGAN, no el repositorio entero: un texto
  // de ejemplo dentro de un documento no es un secreto embarcado.
  const objetivos = ['dist/Plataforma_PMTs.html', 'dist/Vista_previa_Datos.html'];
  const patrones = [
    [/AIza[0-9A-Za-z_-]{35}/, 'clave de Google'],
    [/sk-[A-Za-z0-9]{20,}/, 'clave tipo sk-'],
    [/gh[pousr]_[A-Za-z0-9]{20,}/, 'token de GitHub'],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, 'JWT'],
    [/pk\.eyJ[A-Za-z0-9_-]{10,}/, 'token de Mapbox'],
    [/(api[_-]?key|apikey|password|contrasena|secret)\s*[:=]\s*['"][^'"]{12,}['"]/i, 'pareja clave/valor sospechosa'],
  ];
  let mirados = 0;
  for (const f of objetivos) {
    if (!existe(f)) continue;
    mirados++;
    const t = leer(f);
    for (const [re, que] of patrones) {
      const m = t.match(re);
      exigir(!m, `${f}: parece llevar ${que} — «${String(m?.[0]).slice(0, 24)}…»`);
    }
  }
  exigir(mirados > 0, 'no hay artefactos construidos que revisar: ejecute npm run construir');
  return `${mirados} artefacto(s) revisado(s) contra ${patrones.length} patrones`;
});

/* ── B · Ninguna criticidad inventada ── */
await compuerta('B', 'El producto no clasifica criticidad', () => {
  const fuentes = [...listar('app', /\.js$/), ...listar('motor/src', /\.js$/)];
  const prohibidas = /(['"`])\s*(cr[ií]tic[oa]s?|severidad|prioridad alta|nivel alto|urgencia)\s*\1/i;
  const malos = [];
  for (const f of fuentes) {
    const t = leer(f);
    // Solo se busca en CADENAS DE TEXTO: un comentario que explica por que NO
    // se clasifica criticidad es exactamente lo que queremos conservar.
    soloCodigo(t).forEach((linea, i) => {
      if (prohibidas.test(linea)) malos.push(`${f}:${i + 1}: ${linea.trim().slice(0, 80)}`);
    });
  }
  exigir(malos.length === 0, 'aparece vocabulario de criticidad:\n  ' + malos.join('\n  '));
  return `${fuentes.length} archivos revisados`;
});

/* ── C · Invariantes de formato ── */
await compuerta('C', 'Los formatos pactados no se han movido', async () => {
  const { CAMPOS } = await import('../motor/src/io/descripcion.js');
  const { COLUMNAS_LEGADO } = await import('../app/nucleo/exportar.js');
  const { TIPOS_CIERRE_CANONICOS } = await import('../app/nucleo/catalogos.js');

  exigir(COLUMNAS_LEGADO.length === 11, `el CSV legado tiene ${COLUMNAS_LEGADO.length} columnas, no 11`);
  exigir(COLUMNAS_LEGADO.join(',') ===
    'CATEGORIA,CONTRATO,CONTRATISTA,MUNICIPIO,FRENTE,DIRECCION,ESTADO_CIERRE,HORARIO,FECHA_INICIO,FECHA_FIN,DURACION_DIAS',
  'las columnas del CSV legado han cambiado de nombre o de orden');

  exigir(TIPOS_CIERRE_CANONICOS.length === 3, 'tipo_cierre tiene que ser una lista de EXACTAMENTE tres');
  exigir(TIPOS_CIERRE_CANONICOS.join('|') === 'total|parcial|ingreso y salida',
    'la lista cerrada de tipo_cierre ha cambiado: ' + TIPOS_CIERRE_CANONICOS.join(', '));

  // Los ocho campos historicos siguen PRIMERO y con el mismo nombre: los tres
  // documentales se anadieron AL FINAL para no mover ninguna posicion.
  const historicos = ['fecha_inicio', 'fecha_fin', 'tipo_cierre', 'direccion',
    'municipio', 'contrato', 'contratista', 'proyecto'];
  const nombres = CAMPOS.map((c) => c.nombre ?? c);
  exigir(historicos.every((h, i) => nombres[i] === h),
    'el orden de los campos de la Descripción ha cambiado: ' + nombres.slice(0, 8).join(', '));
  return `CSV legado 11 columnas · tipo_cierre 3 valores · Descripción ${nombres.length} campos`;
});

/* ── D · La marca EPM sigue siendo la marca EPM ── */
await compuerta('D', 'Los colores corporativos no se han cambiado', () => {
  const css = leer('app/estilos.css');
  for (const [v, c] of [['--epm-verde', '#009300'], ['--epm-lima', '#b7c200'], ['--epm-naranja', '#d56b00']]) {
    exigir(new RegExp(`${v}:\\s*${c}`, 'i').test(css), `${v} ya no vale ${c}`);
  }
  return 'verde #009300 · lima #b7c200 · naranja #d56b00';
});

/* ── E · El modelo espacial vigente NO se ha sustituido en silencio ── */
await compuerta('E', 'El modelo espacial candidato sigue siendo candidato', async () => {
  const { CONFIG_POR_DEFECTO, alcanceMetros } = await import('../motor/src/nucleo/config.js');
  exigir(CONFIG_POR_DEFECTO.modeloEspacial === 'minima',
    `el modelo por defecto es «${CONFIG_POR_DEFECTO.modeloEspacial}»: se habría sustituido sin validación humana`);
  exigir(CONFIG_POR_DEFECTO.umbralMetros === 120, 'el umbral aprobado es 120 m');
  exigir(alcanceMetros(CONFIG_POR_DEFECTO) === 120, 'el alcance por defecto ya no son 120 m');
  exigir(alcanceMetros({ ...CONFIG_POR_DEFECTO, modeloEspacial: 'zonasDeInfluencia' }) === 240,
    'el modelo candidato tiene que llegar a 240 m cuando se pide expresamente');
  return 'por defecto 120 m (mínima) · candidato disponible a 240 m, no aplicado';
});

/* ── F · «Pendiente» nunca es un dato ── */
await compuerta('F', '«Pendiente» es un estado derivado, nunca un código', async () => {
  const { normalizarCodigoDocumental, estadoDocumental } = await import('../motor/src/modelo/documental.js');
  for (const relleno of ['Pendiente', 'PENDIENTE', ' pendiente ', 'N/A', '—'.replace('—', '-'), 'por definir', '0']) {
    const r = normalizarCodigoDocumental(relleno, 'x');
    exigir(r.codigo === null, `«${relleno}» se guardó como código: ${r.codigo}`);
    exigir(!!r.aviso, `«${relleno}» se descartó EN SILENCIO: descartar sin avisar es peor que aceptarlo`);
  }
  const e = estadoDocumental({ resolucionPmt: 'RES-1' });
  exigir(e.resumen === '1/3', 'el resumen documental tiene que ser n/3: ' + e.resumen);
  exigir(e.pendientes.length === 2, 'los pendientes se derivan de lo que falta');
  return 'los rellenos se descartan CON aviso; el estado se deriva';
});

/* ── G · La lectura operativa no puede inventar una coincidencia ── */
await compuerta('G', '«No se pudo comprobar» nunca se convierte en un hecho', async () => {
  const { lecturaOperativa, OPERATIVO } = await import('../app/nucleo/modelo.js');
  const base = { distanciaMetros: 50, dentroDelUmbral: true, intersecanFisicamente: false,
    espacialEvaluable: true, traslapeEvaluable: true, hayTraslapeTemporal: true };
  exigir(lecturaOperativa({ ...base, espacialEvaluable: false }) === OPERATIVO.NO_EVALUABLE,
    'sin poder medir el espacio no se puede afirmar nada');
  exigir(lecturaOperativa({ ...base, traslapeEvaluable: false }) === OPERATIVO.NO_EVALUABLE,
    'sin poder decidir las fechas no hay articulación');
  exigir(lecturaOperativa({ ...base, distanciaMetros: null }) !== OPERATIVO.SIN_COINCIDENCIA,
    'no medible JAMÁS puede leerse como «sin coincidencia»');
  return 'las cuatro lecturas respetan «no sé» ≠ «no»';
});

/* ── H · La aplicación no depende de internet ── */
await compuerta('H', 'La aplicación funciona sin internet', () => {
  exigir(existe('dist/Plataforma_PMTs.html'), 'falta dist/Plataforma_PMTs.html: ejecute npm run construir');
  const t = leer('dist/Plataforma_PMTs.html');
  // Ninguna etiqueta puede CARGAR codigo o estilos de fuera. Las URL de
  // teselas del mapa base son otra cosa: el mapa se degrada solo y lo dice.
  const cargas = [...t.matchAll(/<(script|link)[^>]*(src|href)\s*=\s*["']https?:\/\/[^"']+/gi)];
  exigir(cargas.length === 0, 'el artefacto carga recursos externos:\n  ' +
    cargas.map((m) => m[0].slice(0, 90)).join('\n  '));
  // OJO: Leaflet trae `crossOrigin` como OPCION suya, y esta vendorizado, asi
  // que buscarlo en el artefacto siempre lo encuentra. Lo que no puede pasar es
  // que NOSOTROS se lo pasemos al mapa base: se mira nuestro codigo.
  for (const f of ['app/nucleo/mapas-base.js', 'app/ui/mapa.js']) {
    const malas = soloCodigo(leer(f))
      .map((l, i) => (/crossOrigin/.test(l) ? `${i + 1}: ${l.trim()}` : null)).filter(Boolean);
    exigir(malas.length === 0,
      `${f} le pasa crossOrigin al mapa base: fue la causa exacta del mapa en blanco\n  ` + malas.join('\n  '));
  }
  exigir(t.includes('L.tileLayer') || t.includes('tileLayer'), 'Leaflet tiene que ir dentro');
  return `artefacto de ${(t.length / 1024 / 1024).toFixed(2)} MB, autocontenido`;
});

/* ── I · Datos operativos fuera del repositorio ── */
await compuerta('I', 'Ningún dato operativo o personal está versionado', () => {
  const prohibidos = [/^01_KMZ_Entrada\//, /reporte_dinamico\.csv$/, /crudo_.*\.json$/, /\.pmt\.json$/];
  const seguidos = ejecutar('git ls-files').split('\n').filter(Boolean);
  const malos = seguidos.filter((f) => prohibidos.some((re) => re.test(f)));
  exigir(malos.length === 0, 'hay datos operativos versionados:\n  ' + malos.join('\n  '));
  // Y el .gitignore tiene que seguir protegiendolos: sin eso, el proximo `git
  // add -A` los mete sin que nadie se entere.
  const ig = existe('.gitignore') ? leer('.gitignore') : '';
  for (const patron of ['01_KMZ_Entrada', 'reporte_dinamico.csv', 'crudo_', '.pmt.json']) {
    exigir(ig.includes(patron), `.gitignore ya no protege «${patron}»`);
  }
  return `${seguidos.length} archivos versionados, ninguno con datos operativos`;
});

/* ── J · Procedencia en todo lo que sale ── */
await compuerta('J', 'Toda cifra que sale lleva su procedencia', async () => {
  const V = await import('../app/nucleo/version.js');
  const semver = /^\d+\.\d+\.\d+$/;
  for (const k of ['VERSION_APP', 'VERSION_MOTOR', 'VERSION_REGLAS']) {
    exigir(semver.test(V[k]), `${k} no es versionado semántico: ${V[k]}`);
  }
  const { nombreConProcedencia } = await import('../app/nucleo/exportar.js');
  const n = nombreConProcedencia('relaciones', 'csv', { fecha: new Date(Date.UTC(2026, 0, 2)) });
  exigir(n.includes(V.VERSION_REGLAS.replace(/\./g, '-')) || n.includes(V.VERSION_REGLAS),
    `el nombre del archivo no lleva la versión de reglas: ${n}`);
  exigir(/2026-01-02/.test(n), `el nombre del archivo no lleva la fecha: ${n}`);
  return `app ${V.VERSION_APP} · motor ${V.VERSION_MOTOR} · reglas ${V.VERSION_REGLAS}`;
});

/* ── K · El oráculo de regresión sigue en su sitio ── */
await compuerta('K', 'El oráculo del motor de QGIS no se ha borrado', () => {
  exigir(existe('proceso_pmt_qgis.py'), 'falta proceso_pmt_qgis.py, que es el oráculo de regresión');
  exigir(existe('motor/src/legado/replica.js'), 'falta la réplica del motor legado');
  exigir(existe('motor/test/auditoria-codex.test.mjs'),
    'faltan las pruebas adversarias de la auditoría independiente');
  const t = leer('motor/test/auditoria-codex.test.mjs');
  const n = (t.match(/^test\(/gm) ?? []).length;
  exigir(n >= 13, `la auditoría independiente dejó 13 hallazgos y solo quedan ${n} pruebas`);
  return `${n} pruebas adversarias conservadas`;
});

/* ── L · Todo se puede reconstruir desde un clon limpio ── */
await compuerta('L', 'La baseline se puede reproducir', () => {
  exigir(existe('BASELINE.md'), 'falta BASELINE.md');
  exigir(existe('motor/package-lock.json'),
    'falta motor/package-lock.json: sin él `npm ci` falla y se pierden pruebas');
  const pkg = JSON.parse(leer('package.json'));
  for (const s of ['preparar', 'test', 'construir', 'test:navegador']) {
    exigir(pkg.scripts?.[s], `falta el punto de entrada «npm run ${s}»`);
  }
  return 'npm run preparar · npm test · npm run construir · npm run test:navegador';
});

/* ── M · Reactivar reutiliza el trazado, sin excepción ── */
await compuerta('M', 'Reactivar reutiliza el trazado exactamente', async () => {
  const Id = await import('../app/nucleo/identidad-pmt.js');
  const origen = {
    id: 'x', contrato: 'CW1', frente: 'F', tipoCierre: 'total',
    resolucionPmt: 'RES-1',
    geometria: { type: 'LineString', coordinates: [[-75.612345678, 6.212345678], [-75.6, 6.2]] },
  };
  const r = Id.prepararReactivacion(origen, { inicio: '2026-01-01 00:00:00', fin: '2026-01-10 00:00:00' });
  exigir(r.ok, 'no se pudo preparar la reactivación: ' + r.motivo);
  exigir(Id.mismaGeometria(r.datos.geometria, origen.geometria),
    'la reactivación NO reutiliza el trazado exacto');
  // Ni un decimal: se compara el texto, que es lo más duro que se puede pedir.
  exigir(JSON.stringify(r.datos.geometria) === JSON.stringify(origen.geometria),
    'la geometría cambió de representación al reactivar');
  // Y es una COPIA: tocar la nueva no puede alterar la anterior.
  r.datos.geometria.coordinates[0][0] = -99;
  exigir(origen.geometria.coordinates[0][0] === -75.612345678,
    'reactivar comparte el objeto en vez de clonarlo: editar una activación tocaría la otra');
  // Los documentos NO se heredan.
  exigir(r.datos.resolucionPmt === null,
    'una resolución ampara unas fechas: no puede heredarse a una vigencia nueva');
  return 'trazado idéntico, clonado, y sin heredar documentos';
});

/* ── N · Un solo reloj: nadie clasifica con Date.now() por su cuenta ── */
await compuerta('N', 'La clasificación temporal usa UNA sola fecha de referencia', () => {
  // `Date.now()` solo puede aparecer donde se PRODUCE la referencia, o donde se
  // sella un archivo (procedencia, nombre de exportación, marca de creación).
  // En cualquier otro sitio significa que una parte de la pantalla clasifica
  // contra hoy mientras otra clasifica contra la fecha del recorrido.
  const permitidos = new Set([
    'app/nucleo/temporalidad.js',   // la produce
    'app/nucleo/version.js',        // sella procedencia
    'app/nucleo/exportar.js',       // nombre de archivo
    'app/nucleo/proyecto.js',       // fecha de creación del proyecto
  ]);
  // `= Date.now()` como VALOR POR DEFECTO de un parámetro está permitido en
  // cualquier sitio, y es justamente el patrón que queremos: quien llama PUEDE
  // inyectar la fecha, así que la función se puede probar y no impone su reloj.
  // Lo que se persigue es lo contrario: un `Date.now()` incrustado en medio de
  // una comparación, donde nadie puede sustituirlo.
  const porDefecto = /=\s*Date\.now\(\)/;
  const malos = [];
  for (const f of listar('app', /\.js$/)) {
    const rel = f.replace(/\\/g, '/');
    if (permitidos.has(rel)) continue;
    // El PROTOTIPO es una maqueta con su propio banco de pruebas: genera
    // contenido falso con la hora, que no clasifica nada.
    if (rel.startsWith('app/prototipo/')) continue;
    soloCodigo(leer(f)).forEach((linea, i) => {
      if (!/\bDate\.now\(\)|new Date\(\)\.getTime\(\)/.test(linea)) return;
      if (porDefecto.test(linea)) return;
      malos.push(`${f}:${i + 1}: ${linea.trim().slice(0, 70)}`);
    });
  }
  // `app.js` puede usarlo UNA vez, dentro de `fechaReferencia()`, y esa llamada
  // va a `Temporal.referencia()`, que tiene su propio `ahora` inyectable.
  exigir(malos.length === 0,
    'hay relojes sueltos fuera del único punto de referencia:\n  ' + malos.join('\n  '));
  return 'la referencia se produce en un solo sitio; los demás la reciben inyectada';
});

/* ── O · El histórico no se borra: el alcance es una vista ── */
await compuerta('O', 'Ocultar históricos nunca borra un hecho', async () => {
  const T = await import('../app/nucleo/temporalidad.js');
  const { filtrarPmts, filtrosVacios } = await import('../app/nucleo/filtrado.js');
  const viejo = {
    id: 'v', contrato: 'CW1', vigenciaValida: true,
    inicioMs: Date.UTC(2020, 0, 1), finMs: Date.UTC(2020, 1, 1),
    inicio: '2020-01-01 00:00:00', fin: '2020-02-01 00:00:00',
  };
  const filas = [viejo];
  const hoy = T.referencia({ ahora: Date.UTC(2026, 8, 14) });

  const operativo = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO }, hoy);
  exigir(operativo.length === 0, 'un PMT de 2020 no puede ser operativo en 2026');

  const todo = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.TODO }, hoy);
  exigir(todo.length === 1, 'el histórico tiene que seguir estando en «Todo»');

  const entonces = T.referencia({ origen: T.ORIGEN.ELEGIDA, ms: Date.UTC(2020, 0, 15) });
  const enSuFecha = filtrarPmts(filas, { ...filtrosVacios(), alcance: T.ALCANCE.OPERATIVO }, entonces);
  exigir(enSuFecha.length === 1, 'volver a su fecha tiene que devolverlo entero');

  // Y el objeto es EL MISMO: no se ha recortado ni reescrito nada.
  exigir(enSuFecha[0].geometria === viejo.geometria || enSuFecha[0] === viejo,
    'el alcance temporal no puede alterar el dato, solo decidir si se enseña');
  return 'fuera de la vista operativa, intacto en el histórico, entero al volver a su fecha';
});

/* ── utilidades ── */
function listar(dir, re, acc = []) {
  const raiz = path.join(RAIZ, dir);
  if (!fs.existsSync(raiz)) return acc;
  for (const e of fs.readdirSync(raiz, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'vendor', 'dist', '.git'].includes(e.name)) continue;
      listar(rel, re, acc);
    } else if (re.test(e.name)) acc.push(rel);
  }
  return acc;
}
function ejecutar(cmd) {
  return execSync(cmd, { cwd: RAIZ, encoding: 'utf8' });
}

/* ── informe ── */
const fallan = resultados.filter((r) => !r.ok);
console.log('\n  COMPUERTAS DE ENTREGA\n  ' + '─'.repeat(70));
for (const r of resultados) {
  console.log(`  ${r.ok ? '✔' : '✘'} ${r.letra} · ${r.titulo}`);
  if (r.detalle) console.log(`      ${r.detalle.replace(/\n/g, '\n      ')}`);
}
console.log('  ' + '─'.repeat(70));
console.log(`  ${resultados.length - fallan.length}/${resultados.length} compuertas pasan\n`);
process.exit(fallan.length ? 1 : 0);
