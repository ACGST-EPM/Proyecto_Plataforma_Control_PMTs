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
    desde: fecha(f.desde), hasta: fecha(f.hasta),
    texto: typeof f.texto === 'string' ? f.texto : '',
  };
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
    caja.appendChild(crear('div', { clase: 'campo', id: 'campo_' + campo }, [
      crear('label', { for: 'f_' + campo, id: 'et_' + campo, texto: ETIQUETAS[campo] }), sel,
    ]));
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
  caja.innerHTML = `
    <button id="btnPlay" class="b-verde" aria-label="Reproducir el recorrido">▶ Reproducir</button>
    <input type="range" id="barraTiempo" min="0" max="${dias}" value="0" aria-label="Día del recorrido">
    <span class="fecha-viva" id="fechaViva">Todo</span>
    <label class="mini-campo">Paso
      <select id="pasoDias"><option value="1">1 día</option><option value="7" selected>1 semana</option><option value="30">1 mes</option></select>
    </label>
    <label class="mini-campo">Velocidad
      <select id="velocidad">${VELOCIDADES.map(([v, t], i) => `<option value="${v}"${i === 1 ? ' selected' : ''}>${t}</option>`).join('')}</select>
    </label>
    <button id="btnTodoTiempo" class="b-suave b-mini">Ver todo el periodo</button>
    <span id="vigentesAhora" class="pista-campo"></span>`;

  $('barraTiempo').oninput = (e) => aplicarPaso(+e.target.value);
  $('btnPlay').onclick = () => (tocando ? parar() : reproducir());
  $('btnTodoTiempo').onclick = () => volverATodo();
  $('velocidad').onchange = () => { if (tocando) { parar(); reproducir(); } };
}

export function volverATodo() {
  parar();
  const b = $('barraTiempo'); if (b) b.value = 0;
  const f = $('fechaViva'); if (f) f.textContent = 'Todo';
  const v = $('vigentesAhora'); if (v) v.textContent = '';
  alPaso(null);
}

function aplicarPaso(dia) {
  // Se ancla al INICIO del dia calendario: el recorrido representa dias
  // completos, no el instante que resulte de arrastrar la hora del primer dato.
  const ms = dominio.primerDia + dia * 86400000;
  $('fechaViva').textContent = soloDia(ms);
  const n = vigentesEnDia(filasRec, ms).length;
  $('vigentesAhora').textContent = `${num(n)} PMT con actividad ese día completo`;
  alPaso(ms);
}

function reproducir() {
  tocando = true;
  $('btnPlay').textContent = '⏸ Pausar';
  const paso = +($('pasoDias')?.value ?? 7);
  const barra = $('barraTiempo');
  if (+barra.value >= +barra.max) barra.value = 0;
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
  const b = $('btnPlay'); if (b) b.textContent = '▶ Reproducir';
}

export const reproduciendo = () => tocando;
