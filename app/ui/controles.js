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
import { $, esc, num, crear, soloDia } from './dom.js';
import * as Filtro from '../nucleo/filtrado.js';
import { vigentesEn, rangoTemporal } from '../nucleo/filtrado.js';

const ETIQUETAS = {
  contratista: 'Contratista', contrato: 'Contrato', proyecto: 'Proyecto',
  municipio: 'Municipio', frente: 'Frente', tipoCierre: 'Tipo de cierre',
};

let filtros = Filtro.filtrosVacios();
let todas = [];
let alCambiar = () => {};

export const actuales = () => filtros;
export function fijarFiltros(f) { filtros = { ...Filtro.filtrosVacios(), ...(f ?? {}) }; }

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
        type: 'date', id: 'fDesde', 'aria-label': 'Desde', min: r ? soloDia(r.min) : null, max: r ? soloDia(r.max) : null,
        onchange: (e) => { filtros.desde = e.target.value || null; cambiar(null); },
      }),
      crear('input', {
        type: 'date', id: 'fHasta', 'aria-label': 'Hasta', min: r ? soloDia(r.min) : null, max: r ? soloDia(r.max) : null,
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
  document.querySelectorAll('#filtros input[type="checkbox"]').forEach((c) => { c.checked = false; });
  refrescarListas(null);
  alCambiar();
}

/* ───────────────────────── Recorrido temporal ───────────────────────── */

let rango = null, tocando = false, temporizador = null, alPaso = () => {}, filasRec = [];

const VELOCIDADES = [['2400', '0,5× (lento)'], ['1200', '1× (normal)'], ['600', '2× (rápido)'], ['250', '4× (muy rápido)']];

/**
 * Recorrido temporal. Conserva todo lo del tablero historico (reproducir,
 * pausar, paso de dia/semana/mes, velocidad, volver a todo el periodo) y anade
 * la barra arrastrable, que es lo que permite ir directo a una fecha concreta.
 */
export function montarRecorrido(filas, onPaso) {
  alPaso = onPaso;
  filasRec = filas;
  rango = rangoTemporal(filas);
  const caja = $('recorrido');
  if (!rango) {
    caja.innerHTML = '<div style="color:var(--tenue);font-size:.86rem">Los datos cargados no tienen fechas válidas, así que no se puede recorrer el tiempo.</div>';
    return;
  }
  const dias = Math.max(1, Math.round((rango.max - rango.min) / 86400000));
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
  const ms = rango.min + dia * 86400000;
  $('fechaViva').textContent = soloDia(ms);
  $('vigentesAhora').textContent = `${num(vigentesEn(filasRec, ms).length)} PMT vigentes ese día`;
  alPaso(ms);
}

function reproducir() {
  tocando = true;
  $('btnPlay').textContent = '⏸ Pausar';
  const paso = +($('pasoDias')?.value ?? 7);
  const ritmo = +($('velocidad')?.value ?? 1200);
  const barra = $('barraTiempo');
  if (+barra.value >= +barra.max) barra.value = 0;
  aplicarPaso(+barra.value);
  temporizador = setInterval(() => {
    const v = +barra.value + paso;
    if (v > +barra.max) return parar();
    barra.value = v;
    aplicarPaso(v);
  }, Math.max(120, ritmo / 4));
}

export function parar() {
  tocando = false;
  clearInterval(temporizador);
  const b = $('btnPlay'); if (b) b.textContent = '▶ Reproducir';
}

export const reproduciendo = () => tocando;
