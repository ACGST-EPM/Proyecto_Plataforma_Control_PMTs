/**
 * CONTROLES — filtros cruzados y recorrido temporal.
 *
 * FILTROS CRUZADOS: cada lista se recalcula con los demas filtros aplicados
 * pero sin autolimitarse, lo ya marcado nunca se pierde y la lista que se esta
 * tocando no se repinta debajo del raton. La logica vive en
 * `nucleo/filtrado.js` (probada aparte); aqui solo esta el trato con el DOM.
 *
 * Se usan listas nativas `<select multiple>` en vez de Select2: sin jQuery, sin
 * CDN, accesibles con teclado sin configurar nada y con el mismo
 * comportamiento cruzado que tenia el tablero historico.
 */
import { $, $$, esc, num, crear, soloDia } from './dom.js';
import * as Filtro from '../nucleo/filtrado.js';
import { vigentesEnDia, rangoTemporal, limitesDelDia, dominioRecorrido } from '../nucleo/filtrado.js';
import { ALCANCE } from '../nucleo/temporalidad.js';
import { validarFechaCalendario } from '../nucleo/tiempo.js';

const ETIQUETAS = {
  contratista: 'Contratista', contrato: 'Contrato', proyecto: 'Proyecto',
  municipio: 'Municipio', frente: 'Frente', tipoCierre: 'Tipo de cierre',
};

let filtros = Filtro.filtrosVacios();
let todas = [];
let alCambiar = () => {};

export const actuales = () => filtros;

/**
 * Fija los filtros desde fuera (al abrir un proyecto). Sanea lo que llega: un
 * `.pmt.json` editado a mano no puede colar un filtro con forma imposible.
 */
export function fijarFiltros(f) {
  rechazados = [];
  const base = Filtro.filtrosVacios();
  if (!f || typeof f !== 'object') { filtros = base; return rechazados; }
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  // VALIDACION REAL DE CALENDARIO, no de formato: "2026-99-99" pasa cualquier
  // expresion regular y no existe. Un filtro que el <input type=date> no puede
  // representar quedaba activo con el campo vacio, y la tabla salia en cero sin
  // que nada lo explicara.
  const fecha = (v) => (validarFechaCalendario(v).ok ? v : null);
  filtros = {
    ...base,
    contratista: lista(f.contratista), contrato: lista(f.contrato), proyecto: lista(f.proyecto),
    municipio: lista(f.municipio), frente: lista(f.frente), tipoCierre: lista(f.tipoCierre),
    relacion: lista(f.relacion).filter((c) => Filtro.CLAVES_RELACION.some(([k]) => k === c)),
    documental: lista(f.documental).filter((c) => Filtro.CLAVES_DOCUMENTAL.some(([k]) => k === c)),
    desde: fecha(f.desde), hasta: fecha(f.hasta),
    texto: typeof f.texto === 'string' ? f.texto : '',
    // ══ ALCANCE TEMPORAL ════════════════════════════════════════════════
    //
    // Esta función RECONSTRUYE los filtros desde cero, y por eso todo lo que no
    // se nombre aquí se pierde. El alcance y el año se perdían en silencio: el
    // usuario pulsaba «Histórico» y la pantalla seguía en operativo, sin error
    // y sin explicación, porque el valor nuevo se descartaba a la entrada.
    //
    // Se valida contra la lista cerrada: un alcance inventado volvería a
    // operativo en vez de dejar un estado que ningún control puede representar.
    alcance: Object.values(ALCANCE).includes(f.alcance) ? f.alcance : base.alcance,
    anio: Number.isInteger(f.anio) ? f.anio : null,
  };
  // Un año sin alcance histórico sería un filtro activo que su control no
  // enseña: el selector de año solo existe dentro del alcance histórico.
  if (filtros.alcance !== ALCANCE.HISTORICO) filtros.anio = null;
  // Rango invertido: no se aplica a medias.
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    rechazados.push(`el rango de fechas estaba invertido (${filtros.desde} a ${filtros.hasta}); no se aplicó`);
    filtros.desde = null; filtros.hasta = null;
  }
  for (const [k, v] of Object.entries(f ?? {})) {
    if (['desde', 'hasta'].includes(k) && v && !filtros[k]) {
      rechazados.push(`la fecha «${v}» no existe en el calendario; ese filtro no se aplicó`);
    }
  }
  return rechazados;
}

/** Motivos por los que se descartó algo al restaurar filtros, para poder decirlo. */
let rechazados = [];
export const filtrosRechazados = () => [...rechazados];

/**
 * Devuelve los filtros y el recorrido a cero. `Empezar de nuevo` tiene que
 * llamar aqui: si no, un filtro del analisis anterior seguia aplicado sin que
 * su control existiera ya en pantalla, y el conjunto siguiente aparecia vacio
 * sin explicacion.
 */
export function reiniciarEstado() {
  parar();
  filtros = Filtro.filtrosVacios();
  todas = [];
  rango = null; filasRec = [];
  alCambiar = () => {};
  alPaso = () => {};
}

/**
 * Oculta las opciones que no coinciden con lo escrito, conservando SIEMPRE las
 * elegidas. Se manipula `hidden` en cada `<option>`, no se reconstruye la
 * lista: reconstruirla perderia la seleccion y el foco.
 */
function filtrarOpciones(select, texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  let visibles = 0;
  for (const o of select.options) {
    const coincide = !t || o.value.toLowerCase().includes(t) || o.textContent.toLowerCase().includes(t);
    // Lo elegido no se oculta nunca.
    o.hidden = !(coincide || o.selected);
    if (!o.hidden) visibles++;
  }
  select.setAttribute('data-visibles', String(visibles));
}

export function montarFiltros(filas, onCambio) {
  todas = filas;
  alCambiar = onCambio;
  const caja = $('filtros');
  caja.innerHTML = '';

  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { for: 'fTexto', texto: 'Buscar' }),
    crear('input', {
      type: 'text', id: 'fTexto', placeholder: 'frente, contrato, dirección…',
      value: filtros.texto ?? '',
      oninput: (e) => { filtros.texto = e.target.value; cambiar(null); },
    }),
  ]));
  // NO PUEDE HABER UN FILTRO INVISIBLE APLICADO: todo lo que este en `filtros`
  // tiene que verse en su control. Las fechas se rellenan mas abajo.

  for (const campo of Filtro.CAMPOS_FACETADOS) {
    const sel = crear('select', {
      multiple: 'multiple', id: 'f_' + campo, 'aria-label': ETIQUETAS[campo], 'data-campo': campo,
      onchange: (e) => {
        filtros[campo] = [...e.target.selectedOptions].map((o) => o.value);
        cambiar(campo);
      },
    });
    // BUSCADOR DENTRO DEL FILTRO.
    //
    // Con ocho contratos una lista se lee; con cuatrocientos frentes, no. El
    // buscador oculta las opciones que no coinciden, PERO NUNCA LAS ELEGIDAS:
    // si al escribir desapareciera un valor marcado, habria un filtro activo
    // sin control visible, que es el defecto que mas veces ha salido aqui.
    const buscador = crear('input', {
      type: 'search', clase: 'filtro-buscar', id: 'buscar_' + campo,
      placeholder: `Buscar en ${(ETIQUETAS[campo] ?? campo).toLowerCase()}…`,
      'aria-label': `Buscar en ${ETIQUETAS[campo] ?? campo}`,
      oninput: (e) => filtrarOpciones(sel, e.target.value),
    });
    const partes = [crear('label', { for: 'f_' + campo, id: 'et_' + campo, texto: ETIQUETAS[campo] })];
    // Solo se pone buscador donde hace falta: en una lista de tres valores
    // seria un estorbo.
    if (Filtro.opcionesDe(filas, campo).length > 8) partes.push(buscador);
    partes.push(sel);
    caja.appendChild(crear('div', { clase: 'campo', id: 'campo_' + campo }, partes));
  }

  const r = rangoTemporal(filas);
  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { texto: 'Rango de fechas' }),
    crear('div', { clase: 'dos' }, [
      crear('input', {
        type: 'date', id: 'fDesde', 'aria-label': 'Desde', value: filtros.desde ?? '',
        min: r ? soloDia(r.min) : null, max: r ? soloDia(r.max) : null,
        onchange: (e) => { filtros.desde = e.target.value || null; cambiar(null); },
      }),
      crear('input', {
        type: 'date', id: 'fHasta', 'aria-label': 'Hasta', value: filtros.hasta ?? '',
        min: r ? soloDia(r.min) : null, max: r ? soloDia(r.max) : null,
        onchange: (e) => { filtros.hasta = e.target.value || null; cambiar(null); },
      }),
    ]),
    crear('div', { clase: 'pista-campo', texto: r ? `Los datos van del ${soloDia(r.min)} al ${soloDia(r.max)}.` : 'Los datos no traen fechas válidas.' }),
  ]));

  const casillas = crear('div', { clase: 'casillas' });
  for (const [clave, titulo] of Filtro.CLAVES_RELACION) {
    const id = 'r_' + clave;
    casillas.appendChild(crear('label', { for: id }, [
      crear('input', {
        type: 'checkbox', id, value: clave, checked: filtros.relacion?.includes(clave) ? 'checked' : null,
        onchange: (e) => {
          filtros.relacion = e.target.checked
            ? [...filtros.relacion, clave]
            : filtros.relacion.filter((x) => x !== clave);
          cambiar(null);
        },
      }),
      crear('span', { texto: titulo }),
    ]));
  }
  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { texto: 'Tipo de relación' }), casillas,
  ]));

  // SEGUIMIENTO DOCUMENTAL. Filtra por ESTADO DERIVADO, no por el texto de la
  // casilla: «le falta el permiso de rotura» es una pregunta sobre el tramite,
  // y la respuesta no puede depender de como lo escribio cada quien.
  const docs = crear('div', { clase: 'casillas' });
  for (const [clave, titulo] of Filtro.CLAVES_DOCUMENTAL) {
    const id = 'd_' + clave;
    docs.appendChild(crear('label', { for: id }, [
      crear('input', {
        type: 'checkbox', id, value: clave,
        checked: filtros.documental?.includes(clave) ? 'checked' : null,
        onchange: (e) => {
          filtros.documental = e.target.checked
            ? [...(filtros.documental ?? []), clave]
            : (filtros.documental ?? []).filter((x) => x !== clave);
          cambiar(null);
        },
      }),
      crear('span', { texto: titulo }),
    ]));
  }
  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { texto: 'Seguimiento documental' }), docs,
  ]));

  caja.appendChild(crear('button', {
    clase: 'b-suave', style: 'width:100%', id: 'btnLimpiar', texto: 'Limpiar todos los filtros',
    onclick: () => limpiar(),
  }));

  refrescarListas(null);
  verificarSincronia();
}

/**
 * INVARIANTE: representación visual = estado interno.
 *
 * Después de pintar los controles se comprueba que cada filtro activo se vea de
 * verdad en su control. Si el navegador rechazó un valor —un `<input type=date>`
 * se vacía solo ante una fecha que no puede representar— el filtro se retira,
 * porque un filtro activo e invisible deja al usuario delante de una tabla en
 * cero sin nada que lo explique.
 *
 * Devuelve los filtros que hubo que retirar, para poder decirlo.
 */
export function verificarSincronia() {
  const retirados = [];
  for (const campo of ['desde', 'hasta']) {
    const valor = filtros[campo];
    if (!valor) continue;
    const control = $(campo === 'desde' ? 'fDesde' : 'fHasta');
    if (!control) continue;
    if (control.value !== valor) {
      retirados.push(`el control de fecha no pudo representar «${valor}»; ese filtro se retiró`);
      filtros[campo] = null;
      control.value = '';
    }
  }
  const t = $('fTexto');
  if (t && filtros.texto && t.value !== filtros.texto) {
    t.value = filtros.texto;                      // el texto siempre es representable
  }
  if (retirados.length) { rechazados.push(...retirados); alCambiar(); }
  return retirados;
}

function cambiar(origen) {
  refrescarListas(origen);
  alCambiar();
}

/** Repinta las listas cruzadas, respetando la que el usuario esta usando. */
export function refrescarListas(origen) {
  const ops = Filtro.opcionesFacetadas(todas, filtros, origen);
  for (const campo of Filtro.CAMPOS_FACETADOS) {
    const lista = ops[campo];
    const sel = $('f_' + campo);
    const et = $('et_' + campo);
    if (!sel) continue;
    if (et) {
      const marcados = (filtros[campo] ?? []).length;
      et.textContent = `${ETIQUETAS[campo]} · ${lista.length}` + (marcados ? ` (${marcados} elegido${marcados > 1 ? 's' : ''})` : '');
      et.classList.toggle('activo', marcados > 0);
    }
    sel.size = Math.min(7, Math.max(3, lista.length));
    if (lista.enUso) continue;                      // no repintar la lista en uso
    sel.innerHTML = '';
    for (const o of lista) {
      const op = crear('option', { value: o.valor, texto: `${o.valor} (${o.n})` });
      if (o.seleccionado) op.selected = true;
      if (o.n === 0) op.style.color = '#a35200';    // seleccionado pero ya sin coincidencias
      sel.appendChild(op);
    }
  }
}

export function limpiar() {
  filtros = Filtro.filtrosVacios();
  const t = $('fTexto'); if (t) t.value = '';
  const d = $('fDesde'), h = $('fHasta');
  if (d) d.value = ''; if (h) h.value = '';
  for (const c of $$('#filtros input[type="checkbox"]')) c.checked = false;
  refrescarListas(null);
  alCambiar();
}

/* ───────────────────────── Recorrido temporal ───────────────────────── */

let rango = null, dominio = null, tocando = false, temporizador = null, alPaso = () => {}, filasRec = [];

/**
 * VELOCIDADES. El valor es el MULTIPLICADOR, no el intervalo: el intervalo se
 * deriva dividiendo la base entre el multiplicador, que es lo unico que
 * garantiza que 4x sea el doble de rapido que 2x.
 *
 * Antes se guardaban intervalos a ojo y se les aplicaba un `Math.max(120, ...)`
 * que actuaba de suelo: 4x acababa corriendo a 120 ms frente a los 300 ms de
 * 1x, o sea 2,5x en vez de 4x. La base es 600 ms para que ni la mas rapida
 * toque suelo alguno.
 */
export const INTERVALO_BASE_MS = 600;
const VELOCIDADES = [[0.5, '0,5× (lento)'], [1, '1× (normal)'], [2, '2× (rápido)'], [4, '4× (muy rápido)']];

/** Intervalo entre pasos, en ms, para un multiplicador dado. */
export const intervaloDe = (multiplicador) => INTERVALO_BASE_MS / (multiplicador || 1);

/**
 * Recorrido temporal. Conserva todo lo del tablero historico (reproducir,
 * pausar, paso de dia/semana/mes, velocidad, volver a todo el periodo) y anade
 * la barra arrastrable, que es lo que permite ir directo a una fecha concreta.
 */
/**
 * RECORRIDO EN EL TIEMPO — la temporalidad es una funcion central, no un filtro.
 *
 * ══ QUE SE RECUPERA Y QUE SE AÑADE ════════════════════════════════════════
 *
 * Del tablero historico se conserva todo: reproducir, pausar, paso de dia,
 * semana o mes, velocidad, y volver al periodo entero. Se añade lo que faltaba:
 *
 *   · INICIO Y FIN DEL RECORRIDO, elegibles. Antes se recorria siempre todo el
 *     dominio; ahora se puede acotar a la semana que viene, a un mes, o al
 *     periodo de una obra concreta.
 *   · IR A UNA FECHA directamente, escribiendola.
 *   · AVANZAR Y RETROCEDER de uno en uno.
 *   · LA FECHA VISIBLE EN GRANDE. Era el dato mas importante de la pantalla y
 *     estaba en letra pequeña al lado de la barra.
 *
 * ══ LAS TRES PREGUNTAS TEMPORALES, QUE NO SON LA MISMA ════════════════════
 *
 *   1. PMT VIGENTES EN UNA FECHA    -> lo que hace el recorrido: `vigentesEnDia`.
 *   2. PMT PROGRAMADOS EN UN RANGO  -> lo que hace el filtro «desde/hasta»:
 *                                      cualquier PMT que toque ese intervalo.
 *   3. PMT QUE SE SOLAPAN ENTRE SI  -> lo que calcula el motor, y no es un
 *                                      filtro: es una relacion entre dos.
 *
 * Mezclarlas produce cifras que nadie puede explicar. El recorrido dice
 * siempre, en su rotulo, cual de las tres esta aplicando.
 */
export function montarRecorrido(filas, onPaso) {
  alPaso = onPaso;
  filasRec = filas;
  rango = rangoTemporal(filas);
  dominio = dominioRecorrido(filas);
  const caja = $('recorrido');
  if (!rango || !dominio) {
    caja.innerHTML = '<div style="color:var(--tenue);font-size:.86rem">Los datos cargados no tienen fechas válidas, así que no se puede recorrer el tiempo.</div>';
    return;
  }
  // Dias de CALENDARIO, no duracion redondeada: asi el ultimo dia con
  // actividad siempre se puede seleccionar.
  const dias = dominio.dias;
  recorte = { desde: 0, hasta: dias };
  const primero = soloDia(dominio.primerDia);
  const ultimo = soloDia(dominio.primerDia + dias * MS_DIA);

  caja.innerHTML = `
    <div class="recorrido-cabecera">
      <div class="fecha-grande" id="fechaViva"><small>Periodo completo</small>${esc(primero)} — ${esc(ultimo)}</div>
      <div class="crece"></div>
      <span id="vigentesAhora" class="pista-campo"></span>
    </div>

    <div class="recorrido-controles">
      <button id="btnPlay" class="b-verde b-redondo" title="Reproducir el recorrido" aria-label="Reproducir">▶</button>
      <button id="btnAtras" class="b-suave b-redondo" title="Un paso atrás" aria-label="Un paso atrás">◀</button>
      <button id="btnAdelante" class="b-suave b-redondo" title="Un paso adelante" aria-label="Un paso adelante">▶|</button>
      <label class="mini-campo" for="pasoDias">Paso
        <select id="pasoDias">
          <option value="1">Día a día</option>
          <option value="7" selected>Semana a semana</option>
          <option value="30">Mes a mes</option>
        </select>
      </label>
      <span class="sep"></span>
      <button id="btnTodoTiempo" class="b-suave b-mini">Ver todo el periodo</button>
    </div>

    <input type="range" id="barraTiempo" min="0" max="${dias}" value="0"
           aria-label="Día del recorrido" style="margin:14px 0 6px">

    <!-- LO QUE SE AJUSTA UNA VEZ NO TIENE POR QUE ESTAR SIEMPRE DELANTE.
         Arriba queda lo que se toca en cada uso: la fecha, reproducir, el paso
         y volver al periodo entero. La velocidad, el salto a una fecha y el
         tramo que se recorre se ajustan de vez en cuando, asi que viven a un
         clic. NO se han quitado: siguen enteros, con el mismo comportamiento. -->
    <details class="recorrido-ajustes" id="ajustesRecorrido">
      <summary><span id="rotuloAjustes">Ajustar el recorrido</span></summary>
      <div class="recorrido-controles" style="font-size:.84rem">
        <label class="mini-campo" for="velocidad">Velocidad
          <select id="velocidad">${VELOCIDADES.map(([v, t], i) => `<option value="${v}"${i === 1 ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        <label class="mini-campo" for="irAFecha">Ir a la fecha
          <input type="date" id="irAFecha" min="${esc(primero)}" max="${esc(ultimo)}">
        </label>
        <span class="sep"></span>
        <label class="mini-campo" for="recorridoDesde">Recorrer desde
          <input type="date" id="recorridoDesde" value="${esc(primero)}" min="${esc(primero)}" max="${esc(ultimo)}">
        </label>
        <label class="mini-campo" for="recorridoHasta">hasta
          <input type="date" id="recorridoHasta" value="${esc(ultimo)}" min="${esc(primero)}" max="${esc(ultimo)}">
        </label>
        <span id="avisoRecorte" class="pista-campo"></span>
      </div>
    </details>`;

  $('barraTiempo').oninput = (e) => aplicarPaso(+e.target.value);
  $('btnPlay').onclick = () => (tocando ? parar() : reproducir());
  $('btnAtras').onclick = () => mover(-1);
  $('btnAdelante').onclick = () => mover(1);
  $('btnTodoTiempo').onclick = () => volverATodo();
  $('velocidad').onchange = () => { if (tocando) { parar(); reproducir(); } };
  $('irAFecha').onchange = (e) => irAFecha(e.target.value);
  $('recorridoDesde').onchange = () => fijarRecorte();
  $('recorridoHasta').onchange = () => fijarRecorte();
}

/** Tramo del dominio que se recorre. Por defecto, todo. */
let recorte = { desde: 0, hasta: 0 };
const MS_DIA = 86400000;

/** Indice de dia dentro del dominio, a partir de una fecha AAAA-MM-DD. */
function diaDeTexto(texto) {
  const v = validarFechaCalendario(texto);
  if (!v.ok) return null;
  return Math.round((v.ms - dominio.primerDia) / MS_DIA);
}

/**
 * Acota el recorrido. Si el rango queda invertido o fuera del dominio NO se
 * aplica a medias: se dice y se deja como estaba. Es la misma regla que en los
 * filtros de fecha.
 */
function fijarRecorte() {
  const d = diaDeTexto($('recorridoDesde').value);
  const h = diaDeTexto($('recorridoHasta').value);
  const aviso = $('avisoRecorte');
  if (d === null || h === null) { aviso.textContent = 'Escriba dos fechas válidas.'; return; }
  if (d > h) { aviso.textContent = 'La fecha de inicio es posterior a la de fin: no se aplicó.'; return; }
  const desde = Math.max(0, Math.min(d, dominio.dias));
  const hasta = Math.max(0, Math.min(h, dominio.dias));
  recorte = { desde, hasta };
  const barra = $('barraTiempo');
  barra.min = String(desde);
  barra.max = String(hasta);
  if (+barra.value < desde) barra.value = String(desde);
  if (+barra.value > hasta) barra.value = String(hasta);
  const completo = desde === 0 && hasta === dominio.dias;
  aviso.textContent = completo
    ? 'Se recorre el periodo completo.'
    : `Se recorren ${hasta - desde + 1} día(s) de los ${dominio.dias + 1} que hay.`;
  // UN AJUSTE ACTIVO NO PUEDE QUEDAR ESCONDIDO DETRAS DE SU PLEGABLE.
  // Si se ha acotado el tramo, el rotulo lo dice aunque este cerrado: es la
  // misma regla que impide tener un filtro puesto sin verlo en su control.
  const rotulo = $('rotuloAjustes');
  if (rotulo) {
    rotulo.textContent = completo
      ? 'Ajustar el recorrido'
      : `Ajustar el recorrido · acotado a ${hasta - desde + 1} día(s)`;
    rotulo.classList.toggle('ajuste-activo', !completo);
  }
}

/** Va directamente a una fecha escrita. */
function irAFecha(texto) {
  const d = diaDeTexto(texto);
  if (d === null) return;
  const barra = $('barraTiempo');
  const v = Math.max(+barra.min, Math.min(d, +barra.max));
  barra.value = String(v);
  parar();
  aplicarPaso(v);
}

/** Un paso adelante o atrás, del tamaño elegido. */
function mover(signo) {
  parar();
  const barra = $('barraTiempo');
  const paso = +($('pasoDias')?.value ?? 7);
  const v = Math.max(+barra.min, Math.min(+barra.value + signo * paso, +barra.max));
  barra.value = String(v);
  aplicarPaso(v);
}

export function volverATodo() {
  parar();
  const b = $('barraTiempo'); if (b) b.value = b.min;
  const f = $('fechaViva');
  if (f && dominio) {
    const primero = soloDia(dominio.primerDia);
    const ultimo = soloDia(dominio.primerDia + dominio.dias * MS_DIA);
    f.innerHTML = `<small>Periodo completo</small>${esc(primero)} — ${esc(ultimo)}`;
  }
  const v = $('vigentesAhora'); if (v) v.textContent = '';
  alPaso(null);
}

function aplicarPaso(dia) {
  // Se ancla al INICIO del dia calendario: el recorrido representa dias
  // completos, no el instante que resulte de arrastrar la hora del primer dato.
  const ms = dominio.primerDia + dia * MS_DIA;
  $('fechaViva').innerHTML = `<small>PMT vigentes el día</small>${esc(soloDia(ms))}`;
  const n = vigentesEnDia(filasRec, ms).length;
  $('vigentesAhora').textContent = `${num(n)} PMT con actividad ese día completo`;
  const ir = $('irAFecha'); if (ir) ir.value = soloDia(ms);
  alPaso(ms);
}

function reproducir() {
  tocando = true;
  $('btnPlay').textContent = '⏸';
  $('btnPlay').setAttribute('aria-label', 'Pausar');
  const paso = +($('pasoDias')?.value ?? 7);
  const barra = $('barraTiempo');
  if (+barra.value >= +barra.max) barra.value = barra.min;
  aplicarPaso(+barra.value);
  temporizador = setInterval(() => {
    const v = +barra.value + paso;
    if (v > +barra.max) return parar();
    barra.value = v;
    aplicarPaso(v);
  }, intervaloDe(+($('velocidad')?.value ?? 1)));
}

export function parar() {
  tocando = false;
  clearInterval(temporizador);
  const b = $('btnPlay');
  if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Reproducir'); }
}

export const reproduciendo = () => tocando;
