/**
 * COTEJO ENTRE LOS DOS CAMINOS DE REPRODUCCION DEL MOTOR LEGADO.
 *
 * Por que existe: el verificador declaraba "control de fidelidad superado"
 * comparando solo TOTALES. Dos resultados pueden sumar lo mismo y no tener
 * nada que ver: 84 interferencias aqui y 84 alli podrian ser 84 parejas
 * distintas. Un total que coincide no demuestra nada.
 *
 * Este modulo compara la IDENTIDAD de cada alerta, una a una:
 *   - el mismo par de contratos,
 *   - los mismos frentes,
 *   - la misma categoria del legado (Interferencia / Cercania),
 *   - y, en las interferencias, el mismo periodo de traslape.
 *
 * Solo se declara fidelidad si no falta ni sobra ni una sola alerta. Si algo no
 * cuadra, el resultado dice exactamente que se comprobo y que no, en lugar de
 * afirmar una equivalencia que no se ha demostrado.
 *
 * ── DOS COSAS DISTINTAS QUE NO HAY QUE CONFUNDIR ───────────────────────────
 *
 *   COINCIDENCIA ENTRE MOTORES: los dos caminos de reproduccion dan lo mismo.
 *   FIDELIDAD DEMOSTRADA:       ademas, la entrada se leyo entera y sin errores,
 *                               y todas sus geometrias son de un tipo cuya
 *                               equivalencia con QGIS se ha contrastado.
 *
 * Lo primero no implica lo segundo. Dos motores pueden coincidir porque ambos
 * fallaron igual: con un KML truncado los dos producen cero alertas y "cero
 * igual a cero" no demuestra nada. Por eso el cotejo recibe tambien los errores
 * de lectura y la cobertura, y solo declara fidelidad cuando las tres cosas
 * -coincidencia, lectura completa y alcance contrastado- se cumplen a la vez.
 *
 * Los dos caminos que se cotejan son:
 *   A) `legado/replica.js`, que reproduce el script de QGIS tal cual.
 *   B) el motor nuevo configurado con PERFIL_LEGADO.
 * Si ambos coinciden alerta por alerta, la comparacion que el verificador
 * presenta despues entre el motor viejo y el nuevo se puede creer.
 */

const SEP = String.fromCharCode(1);

/** Clave de identidad de una alerta. Es lo que se compara, no los totales. */
function claveReplica(fila) {
  const categoria = fila[0];
  const contratos = fila[1];
  const frentes = fila[4];
  // Las cercanias del legado no llevan fechas; las interferencias si.
  const periodo = categoria === 'Interferencia' ? `${fila[8]}..${fila[9]}` : '';
  return [categoria, contratos, frentes, periodo].join(SEP);
}

function claveMotor(rel) {
  const categoria = rel.hayTraslapeTemporal ? 'Interferencia' : 'Cercanía';
  const contratos = `${rel.contratoA} vs ${rel.contratoB}`;
  const frentes = `${rel.frenteA} / ${rel.frenteB}`;
  const periodo = rel.hayTraslapeTemporal
    ? `${(rel.traslapeInicio ?? '').slice(0, 10)}..${(rel.traslapeFin ?? '').slice(0, 10)}`
    : '';
  return [categoria, contratos, frentes, periodo].join(SEP);
}

function aMultiset(claves) {
  const m = new Map();
  for (const k of claves) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function legible(clave) {
  const [categoria, contratos, frentes, periodo] = clave.split(SEP);
  return { categoria, contratos, frentes, periodo: periodo || '(sin periodo)' };
}

/**
 * Coteja la replica del legado contra el motor nuevo en perfil legado.
 *
 * @param {object} replica      salida de ejecutarLegado()
 * @param {object} motorLegado   salida de analizar(..., PERFIL_LEGADO)
 * @returns {object} informe del cotejo
 */
export function cotejarFidelidad(replica, motorLegado) {
  const filasAlerta = replica.filas.filter((f) => f[0] !== 'Trazado Normal');
  const filasNormales = replica.filas.filter((f) => f[0] === 'Trazado Normal');

  const mReplica = aMultiset(filasAlerta.map(claveReplica));
  const mMotor = aMultiset(motorLegado.relaciones.map(claveMotor));

  let coincidentes = 0;
  const soloReplica = [];
  const soloMotor = [];
  for (const [k, n] of mReplica) {
    const m = mMotor.get(k) ?? 0;
    coincidentes += Math.min(n, m);
    for (let i = 0; i < n - m; i++) soloReplica.push(legible(k));
  }
  for (const [k, n] of mMotor) {
    const m = mReplica.get(k) ?? 0;
    for (let i = 0; i < n - m; i++) soloMotor.push(legible(k));
  }

  // Comprobaciones adicionales que tampoco dependen de totales sueltos.
  const trazadosCoinciden = filasNormales.length === motorLegado.registros.length;

  // ---- COBERTURA DE LA ENTRADA ----
  const archivos = motorLegado.archivos ?? [];
  const archivosConError = archivos.filter((a) => !a.ok);
  const erroresReplica = replica.errores ?? [];
  const placemarksLeidos = archivos.reduce((n, a) => n + (a.placemarks ?? 0), 0);
  const registrosSinGeometria = (motorLegado.registros ?? []).filter((r) => !r.tieneGeometria).length;

  const lecturaLimpia = archivosConError.length === 0 && erroresReplica.length === 0;
  const hayEntrada = (motorLegado.registros?.length ?? 0) > 0;

  // ---- ALCANCE GEOMETRICO CONTRASTADO ----
  const noContrastables = replica.noContrastables ?? [];
  const alcanceContrastado = noContrastables.length === 0;

  // COINCIDENCIA: los dos caminos dan lo mismo.
  const coinciden = soloReplica.length === 0 && soloMotor.length === 0 && trazadosCoinciden;

  // FIDELIDAD: ademas, la entrada se leyo entera y todas sus geometrias son de
  // un tipo cuya equivalencia con QGIS esta contrastada.
  const completo = coinciden && lecturaLimpia && hayEntrada && alcanceContrastado;

  return {
    completo,
    coinciden,
    lecturaLimpia,
    hayEntrada,
    alcanceContrastado,
    archivosConError: archivosConError.map((a) => ({ nombre: a.nombre, errores: a.errores })),
    erroresReplica,
    placemarksLeidos,
    registrosSinGeometria,
    noContrastables,
    // Que se comprobo exactamente, para poder decirlo sin exagerar.
    criterios: [
      'mismo par de contratos',
      'mismos frentes',
      'misma categoria del legado (Interferencia / Cercanía)',
      'mismo periodo de traslape en las interferencias',
      'mismo numero de trazados leidos',
      'todos los archivos se leyeron sin errores',
      'la entrada contiene al menos un registro',
      'todas las geometrias son de un tipo contrastado contra QGIS (Point y LineString)',
    ],
    alertasReplica: filasAlerta.length,
    alertasMotor: motorLegado.relaciones.length,
    coincidentes,
    soloReplica,
    soloMotor,
    trazadosReplica: filasNormales.length,
    trazadosMotor: motorLegado.registros.length,
    trazadosCoinciden,
    // Desglose por categoria, util como resumen pero NUNCA como prueba.
    porCategoria: {
      replica: {
        Interferencia: filasAlerta.filter((f) => f[0] === 'Interferencia').length,
        Cercanía: filasAlerta.filter((f) => f[0] === 'Cercanía').length,
      },
      motor: {
        Interferencia: motorLegado.relaciones.filter((r) => r.hayTraslapeTemporal).length,
        Cercanía: motorLegado.relaciones.filter((r) => !r.hayTraslapeTemporal).length,
      },
    },
  };
}

/** Resumen en una frase, honesto tanto si cuadra como si no. */
export function resumirCotejo(c) {
  if (c.completo) {
    return `Se leyeron ${c.trazadosMotor} trazados sin un solo error y se compararon ` +
      `${c.coincidentes} alertas una a una: coinciden todas en par de contratos, frentes, ` +
      `categoría y periodo. Ninguna falta y ninguna sobra. Todas las geometrías son de un tipo ` +
      `contrastado contra QGIS.`;
  }

  const partes = [];

  // Lo primero que hay que decir es si la entrada se pudo leer, porque sin eso
  // el resto de la comparacion no significa nada.
  if (!c.hayEntrada) {
    partes.push('No se pudo leer ningún trazado de la entrada, así que no hay nada que comparar:');
    partes.push('que los dos motores devuelvan cero no demuestra que sean equivalentes.');
  }
  if (c.archivosConError.length) {
    partes.push(`${c.archivosConError.length} archivo(s) no se pudieron leer completos ` +
      `(${c.archivosConError[0].nombre}: ${(c.archivosConError[0].errores[0] ?? '').slice(0, 80)}).`);
  }
  if (c.erroresReplica?.length) {
    partes.push(`La reproducción de QGIS también reportó ${c.erroresReplica.length} error(es) de lectura.`);
  }

  if (c.hayEntrada) {
    partes.push(`Se compararon ${c.alertasReplica} alertas del motor de QGIS contra ${c.alertasMotor} del motor nuevo en perfil legado.`);
    partes.push(`${c.coincidentes} coinciden en par, frentes, categoría y periodo.`);
    if (c.soloReplica.length) partes.push(`${c.soloReplica.length} aparecen solo en la reproducción de QGIS.`);
    if (c.soloMotor.length) partes.push(`${c.soloMotor.length} aparecen solo en el motor nuevo.`);
    if (!c.trazadosCoinciden) partes.push(`El número de trazados leídos no cuadra: ${c.trazadosReplica} frente a ${c.trazadosMotor}.`);
  }

  if (!c.alcanceContrastado) {
    const tipos = [...new Set(c.noContrastables.map((x) => x.tipo))].join(', ');
    partes.push(`Además, ${c.noContrastables.length} trazado(s) usan geometrías (${tipos}) cuya ` +
      `equivalencia con QGIS nunca se ha contrastado: la reproducción del motor viejo solo está ` +
      `demostrada para Point y LineString.`);
  }

  partes.push('Por eso NO se puede afirmar fidelidad demostrada respecto de QGIS.');
  return partes.join(' ');
}
