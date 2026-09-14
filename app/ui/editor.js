/**
 * CREAR Y EDITAR UN PMT DENTRO DE LA PLATAFORMA.
 *
 * ══ POR QUE AQUI Y NO EN EL GENERADOR APARTE ══════════════════════════════
 *
 * El generador separado tenía sentido cuando la plataforma solo sabía leer. Hoy
 * mantener los dos cuesta:
 *
 *   · el formato de la descripción vive en dos sitios y puede separarse;
 *   · el catálogo de contratos vive en el generador y la plataforma no lo ve,
 *     así que no puede validar contra él;
 *   · el mapa, Leaflet y la lista de tipos de cierre están duplicados;
 *   · y quien captura tiene que cambiar de herramienta para ver el efecto de
 *     lo que acaba de capturar.
 *
 * Esto es el PROTOTIPO de la integración: captura con datos maestros, dibujo en
 * el mismo mapa y validación en vivo. El generador NO se retira: sigue siendo
 * lo que hoy usan los contratistas, y retirarlo antes de que EPM decida cómo
 * llegan los KMZ sería dejar un hueco.
 *
 * ══ LO QUE ESTO NO ES ═════════════════════════════════════════════════════
 *
 * No es control de acceso. Que el formulario no deje escribir un contratista no
 * impide que alguien edite el KMZ a mano. Es gobierno del DATO.
 */
import { $, esc, num, crear, mostrar } from './dom.js';
import { NIVEL, validarPmt, aplicarCatalogo } from '../nucleo/validacion-pmt.js';
import { derivarDeContrato, opcionesDeCatalogo } from '../nucleo/catalogos.js';
import { DOCUMENTOS } from '../../motor/src/modelo/documental.js';
import * as Mapa from './mapa.js';

let estado = null;

const CLASE_NIVEL = {
  [NIVEL.ERROR]: 'p-fallo',
  [NIVEL.ADVERTENCIA]: 'p-parcial',
  [NIVEL.INFORMACION]: 'p-gris',
};
const ETIQUETA_NIVEL = {
  [NIVEL.ERROR]: 'Falta',
  [NIVEL.ADVERTENCIA]: 'Revisar',
  [NIVEL.INFORMACION]: 'Nota',
};

/**
 * Abre el editor.
 * @param {object} cfg {catalogo, existentes, pmt, onGuardar, onCerrar}
 */
export function abrir({ catalogo, existentes = [], pmt = null, onGuardar, onCerrar }) {
  estado = {
    catalogo, existentes, onGuardar, onCerrar,
    editando: !!pmt,
    datos: pmt ? { ...pmt } : {
      contrato: '', frente: '', municipio: '', direccion: '', tipoCierre: '',
      inicio: '', fin: '', geometria: null,
      resolucionPmt: '', permisoRotura: '', cierrePermisoRotura: '',
    },
  };
  pintar();
  mostrar('panelEditor', true);
  $('panelEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function cerrar() {
  Mapa.terminarDibujo();
  mostrar('panelEditor', false);
  const cb = estado?.onCerrar;
  estado = null;
  cb?.();
}

function campo(id, etiqueta, control, ayuda = '') {
  return `<div class="campo">
    <label for="${esc(id)}">${esc(etiqueta)}</label>
    ${control}
    ${ayuda ? `<div class="pista-campo">${ayuda}</div>` : ''}
    <div class="ed-aviso" data-aviso="${esc(id)}"></div>
  </div>`;
}

function pintar() {
  const d = estado.datos;
  const ops = opcionesDeCatalogo(estado.catalogo);
  const derivado = derivarDeContrato(estado.catalogo, d.contrato);
  const municipios = derivado?.municipios ?? [];

  $('panelEditor').querySelector('.cuerpo').innerHTML = `
    <div class="frase" style="margin-top:0">
      <b>Lo que EPM gobierna no se escribe: se elige.</b> Al elegir el contrato, el
      <b>contratista</b> y el <b>proyecto</b> quedan determinados. Así «MEXICHEM», «Mexichem S.A.»
      y «MEXICHEM SAS» no pueden acabar siendo tres organizaciones distintas.
    </div>

    <div class="ed-rejilla">
      <div>
        ${campo('edContrato', 'Contrato', `<select id="edContrato">
            <option value="">— elija el contrato —</option>
            ${ops.contratos.map((c) => `<option value="${esc(c)}"${c === d.contrato ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          </select>`, 'Lo mantiene EPM en el catálogo maestro.')}

        <div class="campo">
          <label>Se derivan del contrato</label>
          <div class="ed-derivado">
            <div><span class="k">Contratista</span><b>${esc(derivado?.contratista || '—')}</b></div>
            <div><span class="k">Proyecto</span><b>${esc(derivado?.proyecto || '—')}</b></div>
          </div>
          <div class="pista-campo">No se escriben. Si el catálogo cambia, cambian aquí.</div>
        </div>

        ${campo('edMunicipio', 'Municipio', `<select id="edMunicipio"${municipios.length ? '' : ' disabled'}>
            <option value="">${municipios.length ? '— elija —' : 'elija antes el contrato'}</option>
            ${municipios.map((m) => `<option value="${esc(m)}"${m === d.municipio ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>`, 'Solo los municipios declarados para ese contrato.')}

        ${campo('edFrente', 'Nombre del frente',
          `<input type="text" id="edFrente" value="${esc(d.frente)}" placeholder="p. ej. PMT_03_02">`)}

        ${campo('edDireccion', 'Dirección',
          `<input type="text" id="edDireccion" value="${esc(d.direccion)}" placeholder="Carrera 65 con Calle 30">`)}

        ${campo('edTipo', 'Tipo de cierre', `<select id="edTipo">
            <option value="">— elija —</option>
            ${ops.tiposCierre.map((t) => `<option value="${esc(t)}"${t === d.tipoCierre ? ' selected' : ''}>${esc(t)}</option>`).join('')}
          </select>`, 'Lista cerrada: son exactamente tres.')}

        <div class="dos">
          ${campo('edInicio', 'Desde', `<input type="datetime-local" id="edInicio" value="${esc(aLocal(d.inicio))}">`)}
          ${campo('edFin', 'Hasta', `<input type="datetime-local" id="edFin" value="${esc(aLocal(d.fin))}">`)}
        </div>
      </div>

      <div>
        <div class="campo">
          <label>Trazado en el mapa</label>
          <div class="barra-acciones">
            <button type="button" class="b-verde b-mini" id="edDibujar">✎ Dibujar en el mapa</button>
            <button type="button" class="b-suave b-mini" id="edDeshacer">Deshacer punto</button>
            <button type="button" class="b-suave b-mini" id="edBorrarGeom">Borrar</button>
          </div>
          <div id="edEstadoGeom" class="pista-campo"></div>
          <div class="ed-aviso" data-aviso="edGeometria"></div>
        </div>

        <h3 class="titulo-grupo">Seguimiento documental <small>(opcional)</small></h3>
        <div class="pista-campo" style="margin-bottom:8px">
          Si todavía no existe, <b>deje la casilla vacía</b>. No escriba «Pendiente»:
          el estado ya dirá Pendiente, y un texto de relleno no se puede distinguir
          después de un código de verdad.
        </div>
        ${DOCUMENTOS.map((doc) => campo('ed_' + doc.clave, doc.etiqueta,
          `<input type="text" id="ed_${esc(doc.clave)}" value="${esc(d[doc.clave] ?? '')}" placeholder="código de la resolución">`,
          doc.ayuda)).join('')}
      </div>
    </div>

    <div id="edResumenValidacion" class="frase" style="margin-top:14px"></div>
    <div class="barra-acciones">
      <button class="b-verde" id="edGuardar">${estado.editando ? 'Guardar los cambios' : 'Crear el PMT'}</button>
      <button class="b-suave" id="edCancelar">Cancelar</button>
    </div>`;

  conectar();
  revalidar();
}

/** `AAAA-MM-DD HH:MM:SS` ⇄ el valor que pide `datetime-local`. */
const aLocal = (s) => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');
const deLocal = (s) => (s ? `${String(s).replace('T', ' ')}:00`.slice(0, 19) : '');

function conectar() {
  const d = estado.datos;
  const liga = (id, campo, transformar = (v) => v) => {
    const e = $(id);
    if (!e) return;
    e.oninput = e.onchange = () => { d[campo] = transformar(e.value); revalidar(); };
  };
  liga('edFrente', 'frente');
  liga('edDireccion', 'direccion');
  liga('edMunicipio', 'municipio');
  liga('edInicio', 'inicio', deLocal);
  liga('edFin', 'fin', deLocal);
  for (const doc of DOCUMENTOS) liga('ed_' + doc.clave, doc.clave);

  // Cambiar el contrato REPINTA: los municipios disponibles dependen de él.
  $('edContrato').onchange = (e) => {
    d.contrato = e.target.value;
    const der = derivarDeContrato(estado.catalogo, d.contrato);
    if (der && !der.municipios.includes(d.municipio)) d.municipio = '';
    pintar();
  };
  // Cambiar el tipo cambia lo que se dibuja: un punto o una línea.
  $('edTipo').onchange = (e) => {
    d.tipoCierre = e.target.value;
    if (Mapa.dibujando()) empezarDibujo();
    revalidar();
  };

  $('edDibujar').onclick = () => empezarDibujo();
  $('edDeshacer').onclick = () => { Mapa.deshacerVertice(); d.geometria = Mapa.geometriaDelDibujo(); revalidar(); };
  $('edBorrarGeom').onclick = () => { Mapa.terminarDibujo(); d.geometria = null; revalidar(); };
  $('edCancelar').onclick = () => cerrar();
  $('edGuardar').onclick = () => guardar();
}

function empezarDibujo() {
  const tipo = estado.datos.tipoCierre === 'ingreso y salida' ? 'punto' : 'linea';
  Mapa.empezarDibujo(tipo, (g) => { estado.datos.geometria = g; revalidar(); });
  revalidar();
}

function revalidar() {
  const r = validarPmt(estado.datos, estado.catalogo, { existentes: estado.existentes });

  for (const e of $('panelEditor').querySelectorAll('[data-aviso]')) e.innerHTML = '';
  const mapaCampos = {
    contrato: 'edContrato', frente: 'edFrente', municipio: 'edMunicipio',
    direccion: 'edDireccion', tipoCierre: 'edTipo', inicio: 'edInicio', fin: 'edFin',
    geometria: 'edGeometria', contratista: 'edContrato', proyecto: 'edContrato',
    resolucionPmt: 'ed_resolucionPmt', permisoRotura: 'ed_permisoRotura',
    cierrePermisoRotura: 'ed_cierrePermisoRotura',
  };
  for (const a of r.avisos) {
    const destino = $('panelEditor').querySelector(`[data-aviso="${mapaCampos[a.campo] ?? a.campo}"]`);
    if (!destino) continue;
    destino.innerHTML += `<div class="ed-linea ${esc(a.nivel)}">
      <span class="pastilla ${CLASE_NIVEL[a.nivel]}">${esc(ETIQUETA_NIVEL[a.nivel])}</span>
      <span>${esc(a.texto)}${a.ayuda ? ` <small>${esc(a.ayuda)}</small>` : ''}</span></div>`;
  }

  const g = estado.datos.geometria;
  $('edEstadoGeom').innerHTML = Mapa.dibujando()
    ? `Pulse en el mapa para añadir puntos. Llevan <b>${num(Mapa.verticesDibujados())}</b>.`
    : g ? `Trazado: <b>${esc(g.type)}</b> con ${num(g.type === 'Point' ? 1 : g.coordinates.length)} punto(s).`
      : 'Todavía no hay trazado.';

  const caja = $('edResumenValidacion');
  caja.className = 'frase ' + (r.errores ? 'error' : r.advertencias ? 'atencion' : '');
  caja.innerHTML = r.errores
    ? `<b>Faltan ${num(r.errores)} dato(s) para poder guardar.</b> Están marcados arriba.`
    : r.advertencias
      ? `Se puede guardar. Hay <b>${num(r.advertencias)} cosa(s) que conviene revisar</b>, marcadas arriba.`
      : '<b>Todo correcto.</b> Se puede guardar.';
  $('edGuardar').disabled = !r.sePuedeGuardar;
}

function guardar() {
  const r = validarPmt(estado.datos, estado.catalogo, { existentes: estado.existentes });
  if (!r.sePuedeGuardar) return;
  // El catálogo manda: contratista y proyecto se ponen AL GUARDAR, no según lo
  // que hubiera en el formulario.
  const pmt = aplicarCatalogo(estado.datos, estado.catalogo);
  const cb = estado.onGuardar;
  Mapa.terminarDibujo();
  cb?.(pmt);
}
