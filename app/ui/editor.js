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
import { prepararReactivacion, baseDe, agruparPorBase, historialDeBase,
  mismaGeometria } from '../nucleo/identidad-pmt.js';

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
export function abrir({ catalogo, existentes = [], pmt = null, modo = null, onGuardar, onCerrar }) {
  const reactivando = modo === 'reactivar';
  let datos, fallo = null;

  if (reactivando) {
    // REACTIVAR: la identidad se hereda entera y el trazado se reutiliza tal
    // cual. Lo único que se pide son las fechas nuevas.
    const r = prepararReactivacion(pmt, {});
    if (!r.ok) { fallo = r.motivo; datos = null; } else { datos = r.datos; }
  } else if (pmt) {
    datos = { ...pmt };
  } else {
    datos = {
      contrato: '', frente: '', municipio: '', direccion: '', tipoCierre: '',
      inicio: '', fin: '', geometria: null,
      resolucionPmt: '', permisoRotura: '', cierrePermisoRotura: '',
    };
  }

  if (fallo) {
    // Un fallo al reactivar NO abre un editor a medias: se dice y no se abre.
    // Abrirlo vacío invitaría a redibujar el trazado, que es exactamente lo que
    // esta función existe para evitar.
    const aviso = $('avisoGlobal');
    if (aviso) {
      aviso.classList.remove('oculto');
      aviso.innerHTML = `<b>No se puede reactivar este PMT:</b> ${esc(fallo)}.`;
    }
    return false;
  }

  estado = {
    catalogo, existentes, onGuardar, onCerrar,
    editando: !!pmt && !reactivando,
    reactivando,
    origen: reactivando ? pmt : null,
    // Trazado de origen, GUARDADO APARTE, para poder comprobar al guardar que
    // sigue siendo el mismo. No basta con copiarlo bien al abrir: entre abrir y
    // guardar hay una interfaz por medio.
    geometriaOriginal: reactivando ? pmt.geometria : null,
    datos,
  };
  pintar();
  mostrar('panelEditor', true);
  $('panelEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function cerrar() {
  Mapa.terminarDibujo();
  mostrar('panelEditor', false);
  const cb = estado?.onCerrar;
  estado = null;
  cb?.();
}

/**
 * Cabecera del editor cuando se está REACTIVANDO.
 *
 * Dice tres cosas, y las tres importan:
 *   · que esto NO es un PMT nuevo, sino otra vigencia del mismo;
 *   · que el trazado es el de siempre y no hay que volver a dibujarlo;
 *   · cuántas veces se ha activado ya, y cuándo.
 *
 * Sin la tercera, quien reactiva no sabe si es la segunda vez o la séptima, y
 * ese dato es justamente el que EPM quiere poder observar.
 */
function cabeceraReactivacion() {
  const o = estado.origen;
  const bases = agruparPorBase(estado.existentes ?? []);
  const base = bases.get(baseDe(o));
  const h = base ? historialDeBase(base) : null;

  return `<div class="frase" style="margin-top:0">
      <b>Nueva vigencia del mismo PMT.</b> No es un PMT nuevo: es otra activación de
      <b>${esc(o.frente ?? 'este cierre')}</b>, del contrato <b>${esc(o.contrato ?? '—')}</b>.
      <b>El trazado se reutiliza exactamente</b>, no hay que volver a dibujarlo — y por eso
      las distancias medidas seguirán siendo las mismas.
      Si lo que hace falta es <i>otro</i> cierre en el mismo sitio, cierre esto y use
      «Nuevo PMT»: serían dos PMT distintos, no uno reactivado.
    </div>
    ${h && h.veces ? `<div class="historial">
      <label>Activaciones anteriores de este PMT</label>
      ${h.activaciones.map((a) => `
        ${a.diasDesdeLaAnterior !== null && a.diasDesdeLaAnterior !== undefined
    ? `<div class="historial-hueco">↕ ${num(a.diasDesdeLaAnterior)} día(s) sin actividad</div>` : ''}
        <div class="historial-fila">
          <span class="historial-n">${esc(a.numero)}</span>
          <span>${esc(a.inicio ? a.inicio.slice(0, 10) : '—')} → ${esc(a.fin ? a.fin.slice(0, 10) : '—')}</span>
          <span>${a.dias === null ? '—' : `${num(a.dias)} día(s)`}</span>
        </div>`).join('')}
      <div class="pista-campo">Esta sería la activación <b>${num(h.veces + 1)}</b>.</div>
    </div>` : ''}`;
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

  const rea = estado.reactivando;

  $('panelEditor').querySelector('.cuerpo').innerHTML = `
    ${rea ? cabeceraReactivacion() : `<div class="frase" style="margin-top:0">
      <b>Lo que EPM gobierna no se escribe: se elige.</b> Al elegir el contrato, el
      <b>contratista</b> y el <b>proyecto</b> quedan determinados. Así «MEXICHEM», «Mexichem S.A.»
      y «MEXICHEM SAS» no pueden acabar siendo tres organizaciones distintas.
    </div>`}

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
            <button type="button" class="b-verde b-mini" id="edDibujar"${rea ? ' disabled' : ''}>✎ Dibujar en el mapa</button>
            <button type="button" class="b-suave b-mini" id="edDeshacer"${rea ? ' disabled' : ''}>Deshacer punto</button>
            <button type="button" class="b-suave b-mini" id="edBorrarGeom"${rea ? ' disabled' : ''}>Borrar</button>
          </div>
          ${rea ? `<div class="pista-campo"><b>El trazado no se puede tocar aquí.</b> Reactivar sirve
            precisamente para no volver a dibujarlo: redibujarlo cambiaría las distancias medidas sin
            que nada haya cambiado en la calle. Si el cierre es distinto, es otro PMT.</div>` : ''}
          <div id="edEstadoGeom" class="pista-campo"></div>
          <div class="ed-aviso" data-aviso="edGeometria"></div>
        </div>

        <h3 class="titulo-grupo">Seguimiento documental <small>(opcional)</small></h3>
        <div class="pista-campo" style="margin-bottom:8px">
          Si todavía no existe, <b>deje la casilla vacía</b>. No escriba «Pendiente»:
          el estado ya dirá Pendiente, y un texto de relleno no se puede distinguir
          después de un código de verdad.
        </div>
        ${DOCUMENTOS.map((doc) => {
          // ══ EL DOCUMENTO ANTERIOR SE ENSEÑA, NO SE RELLENA ═══════════════
          //
          // Al reactivar, si la activación anterior tenía este documento se
          // muestra AL LADO de la casilla, vacía. No se precarga: rellenarla
          // haría que cualquiera pulsara «guardar» y el código quedara
          // registrado para esta vigencia sin que nadie haya comprobado que
          // sigue amparándola. Esa comprobación es la pregunta P21, y no la
          // tenemos respondida.
          const previo = d.documentosPrevios?.[doc.clave] ?? null;
          const nota = previo
            ? `<div class="doc-previo"><span class="pastilla p-porconfirmar">Previo disponible</span>
                 <span class="mono">${esc(previo)}</span>
                 <small>de la activación anterior · <b>aplicabilidad a esta vigencia por confirmar</b>.
                 Si ampara también estas fechas, escríbalo aquí; si hace falta uno nuevo, déjelo vacío.</small></div>`
            : '';
          return campo('ed_' + doc.clave, doc.etiqueta,
            `<input type="text" id="ed_${esc(doc.clave)}" value="${esc(d[doc.clave] ?? '')}" placeholder="código de la resolución">${nota}`,
            doc.ayuda);
        }).join('')}
      </div>
    </div>

    <div id="edResumenValidacion" class="frase" style="margin-top:14px"></div>
    <div class="barra-acciones">
      <button class="b-verde" id="edGuardar">${rea ? 'Crear la nueva vigencia'
    : estado.editando ? 'Guardar los cambios' : 'Crear el PMT'}</button>
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

  // ══ LA IDENTIDAD NO SE EDITA AL REACTIVAR ══════════════════════════════
  //
  // Contrato y tipo de cierre son del PMT BASE, no de la activación. Cambiarlos
  // aquí convertiría la reactivación en otro PMT disfrazado de activación, y el
  // historial pasaría a mentir. Si hace falta cambiarlos, es un PMT nuevo.
  if (estado.reactivando) {
    for (const id of ['edContrato', 'edMunicipio', 'edTipo', 'edFrente', 'edDireccion']) {
      const e = $(id);
      if (e) { e.disabled = true; e.title = 'Pertenece al PMT base: no cambia entre activaciones.'; }
    }
  }

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
  const r = validarPmt(estado.datos, estado.catalogo, {
    existentes: estado.existentes,
    // El modo cambia la severidad de una cosa: un contrato fuera del catálogo
    // bloquea al CREAR (se está eligiendo) y solo avisa al reactivar o editar
    // (ya es un hecho que vino en el archivo).
    reactivando: estado.reactivando, editando: estado.editando,
  });

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
  const r = validarPmt(estado.datos, estado.catalogo, {
    existentes: estado.existentes, reactivando: estado.reactivando, editando: estado.editando,
  });
  if (!r.sePuedeGuardar) return;

  // ══ EL TRAZADO NO SE HA MOVIDO ═════════════════════════════════════════
  //
  // Se comprueba AL GUARDAR, no solo al abrir: entre abrir y guardar hay una
  // interfaz por medio, y un trazado que se desplaza solo no lo ve nadie y
  // cambia todas las distancias medidas. Si no cuadra, no se guarda.
  if (estado.reactivando && !mismaGeometria(estado.datos.geometria, estado.geometriaOriginal)) {
    $('edResumenValidacion').className = 'frase error';
    $('edResumenValidacion').innerHTML =
      '<b>El trazado ha cambiado respecto del PMT original.</b> Una reactivación tiene que ' +
      'reutilizarlo exactamente. No se ha guardado nada.';
    return;
  }
  // El catálogo manda: contratista y proyecto se ponen AL GUARDAR, no según lo
  // que hubiera en el formulario.
  const pmt = aplicarCatalogo(estado.datos, estado.catalogo);
  const cb = estado.onGuardar;
  Mapa.terminarDibujo();
  cb?.(pmt);
}
