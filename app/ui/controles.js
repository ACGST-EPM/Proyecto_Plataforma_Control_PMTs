/**
 * CONTROLES — filtros y recorrido temporal.
 *
 * Sustituye a Select2: listas multiples nativas con buscador propio. Menos
 * codigo, sin CDN, y accesibles con teclado sin configurar nada.
 */
import { $, esc, num, crear, soloDia } from './dom.js';
import * as Filtro from '../nucleo/filtrado.js';
import { vigentesEn, rangoTemporal } from '../nucleo/filtrado.js';

const CAMPOS = [
  ['contratista', 'Contratista'], ['contrato', 'Contrato'], ['proyecto', 'Proyecto'],
  ['municipio', 'Municipio'], ['frente', 'Frente'], ['tipoCierre', 'Tipo de cierre'],
];

let filtros = Filtro.filtrosVacios();
let alCambiar = () => {};

export const actuales = () => filtros;

/** Construye los desplegables a partir de los datos realmente cargados. */
export function montarFiltros(filas, onCambio) {
  alCambiar = onCambio;
  const caja = $('filtros');
  caja.innerHTML = '';

  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { for: 'fTexto', texto: 'Buscar' }),
    crear('input', {
      type: 'text', id: 'fTexto', placeholder: 'frente, contrato, direccion…',
      oninput: (e) => { filtros.texto = e.target.value; alCambiar(); },
    }),
  ]));

  for (const [campo, titulo] of CAMPOS) {
    const ops = Filtro.opcionesDe(filas, campo);
    const sel = crear('select', {
      multiple: 'multiple', id: 'f_' + campo, size: Math.min(6, Math.max(3, ops.length)),
      'aria-label': titulo,
      onchange: (e) => {
        filtros[campo] = [...e.target.selectedOptions].map((o) => o.value);
        alCambiar();
      },
    });
    for (const o of ops) {
      sel.appendChild(crear('option', { value: o.valor, texto: `${o.valor} (${o.n})` }));
    }
    caja.appendChild(crear('div', { clase: 'campo' }, [
      crear('label', { for: 'f_' + campo, texto: `${titulo} · ${ops.length}` }), sel,
    ]));
  }

  const r = rangoTemporal(filas);
  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { texto: 'Rango de fechas' }),
    crear('div', { clase: 'dos' }, [
      crear('input', {
        type: 'date', id: 'fDesde', 'aria-label': 'Desde', value: r ? soloDia(r.min) : null,
        onchange: (e) => { filtros.desde = e.target.value || null; alCambiar(); },
      }),
      crear('input', {
        type: 'date', id: 'fHasta', 'aria-label': 'Hasta', value: r ? soloDia(r.max) : null,
        onchange: (e) => { filtros.hasta = e.target.value || null; alCambiar(); },
      }),
    ]),
  ]));
  // Los campos se rellenan con el rango completo solo como pista visual:
  // el filtro arranca vacio para no esconder nada sin que nadie lo pida.
  filtros.desde = null; filtros.hasta = null;

  const casillas = crear('div', { clase: 'casillas' });
  for (const [clave, titulo] of Filtro.CLAVES_RELACION) {
    const id = 'r_' + clave;
    casillas.appendChild(crear('label', { for: id }, [
      crear('input', {
        type: 'checkbox', id, value: clave,
        onchange: (e) => {
          filtros.relacion = e.target.checked
            ? [...filtros.relacion, clave]
            : filtros.relacion.filter((x) => x !== clave);
          alCambiar();
        },
      }),
      crear('span', { texto: titulo }),
    ]));
  }
  caja.appendChild(crear('div', { clase: 'campo' }, [
    crear('label', { texto: 'Tipo de relacion' }), casillas,
  ]));

  caja.appendChild(crear('button', {
    clase: 'b-suave', style: 'width:100%', texto: 'Limpiar todos los filtros',
    onclick: () => limpiar(),
  }));
}

export function limpiar() {
  filtros = Filtro.filtrosVacios();
  const t = $('fTexto'); if (t) t.value = '';
  for (const [campo] of CAMPOS) {
    const s = $('f_' + campo); if (s) [...s.options].forEach((o) => { o.selected = false; });
  }
  const d = $('fDesde'), h = $('fHasta');
  if (d) d.value = ''; if (h) h.value = '';
  document.querySelectorAll('#filtros input[type="checkbox"]').forEach((c) => { c.checked = false; });
  alCambiar();
}

/* ───────────────────────── Recorrido temporal ───────────────────────── */

let rango = null, tocando = false, temporizador = null, alPaso = () => {};

/**
 * Recorrido temporal: reproduce el avance de las obras en el tiempo. Es la
 * capacidad del tablero historico («Iniciar Recorrido») que mas se usa, y se
 * conserva mejorada: barra arrastrable, no solo un boton de reproducir.
 */
export function montarRecorrido(filas, onPaso) {
  alPaso = onPaso;
  rango = rangoTemporal(filas);
  const caja = $('recorrido');
  if (!rango) {
    caja.innerHTML = '<div style="color:#6b7075;font-size:.86rem">Los datos cargados no tienen fechas validas, asi que no se puede recorrer el tiempo.</div>';
    return;
  }
  const dias = Math.max(1, Math.round((rango.max - rango.min) / 86400000));
  caja.innerHTML = `
    <button id="btnPlay" class="b-verde">▶ Reproducir</button>
    <input type="range" id="barraTiempo" min="0" max="${dias}" value="0" aria-label="Dia del recorrido">
    <span class="fecha-viva" id="fechaViva">${esc(soloDia(rango.min))}</span>
    <label style="font-size:.82rem;display:flex;align-items:center;gap:5px">
      Paso
      <select id="pasoDias" style="width:auto">
        <option value="1">1 dia</option><option value="7" selected>1 semana</option><option value="30">1 mes</option>
      </select>
    </label>
    <button id="btnTodoTiempo" class="b-suave b-mini">Ver todo el periodo</button>
    <span id="vigentesAhora" style="font-size:.84rem;color:#6b7075"></span>`;

  $('barraTiempo').oninput = (e) => aplicarPaso(+e.target.value, filas);
  $('btnPlay').onclick = () => (tocando ? parar() : reproducir(filas));
  $('btnTodoTiempo').onclick = () => { parar(); alPaso(null); $('fechaViva').textContent = 'Todo'; $('vigentesAhora').textContent = ''; };
}

function aplicarPaso(dia, filas) {
  const ms = rango.min + dia * 86400000;
  $('fechaViva').textContent = soloDia(ms);
  const v = vigentesEn(filas, ms);
  $('vigentesAhora').textContent = `${num(v.length)} PMT vigentes ese dia`;
  alPaso(ms);
}

function reproducir(filas) {
  tocando = true;
  $('btnPlay').textContent = '⏸ Pausar';
  const paso = +($('pasoDias')?.value ?? 7);
  const barra = $('barraTiempo');
  temporizador = setInterval(() => {
    const v = +barra.value + paso;
    if (v > +barra.max) return parar();
    barra.value = v;
    aplicarPaso(v, filas);
  }, 420);
}

export function parar() {
  tocando = false;
  clearInterval(temporizador);
  const b = $('btnPlay'); if (b) b.textContent = '▶ Reproducir';
}
