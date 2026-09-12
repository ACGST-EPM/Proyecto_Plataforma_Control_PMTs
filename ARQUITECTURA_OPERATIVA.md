# Arquitectura operativa de los PMTs — de «buscar ocho archivos» a una plataforma

> **Qué es este documento.** El diseño del proceso completo, no solo de la aplicación:
> cómo nace un PMT, cómo llega, dónde vive, qué pasa cuando cambia, y qué parte de eso
> puede dejar de hacerse a mano.
>
> **Cómo leerlo.** Cada afirmación va marcada. No hay una sola suposición disfrazada de hecho:
>
> | Marca | Significa |
> |---|---|
> | **CONFIRMADO** | está demostrado en este repositorio o en el documento maestro |
> | **HIPÓTESIS** | es lo razonable, pero nadie lo ha comprobado |
> | **VALIDAR EPM** | depende de una respuesta de TI o de operación que todavía no tenemos |

---

## 1 · El proceso de hoy (AS-IS)

```
   Contratista dibuja la geometría en Google Earth
                     │  KMZ con geometría, sin datos normalizados
                     ▼
   Generador_KMZ.html  (se abre en el navegador)
     · base maestra contratos_db.json        · menús cerrados, sin texto libre
     · normaliza fechas y tipo de cierre     · exporta el KMZ estandarizado
                     │
                     ▼
   Una carpeta del equipo de Leydi:  C:\...\PLATAFORMA_PMTs\01_KMZ_Entrada
                     │
                     ▼
   dist/Plataforma_PMTs.html  (doble clic)
     · se seleccionan los KMZ a mano         · analiza, filtra, mapa, informe
     · se guarda un .pmt.json si se quiere
```

| # | Hecho | Marca |
|---|---|---|
| 1 | La geometría la dibuja el contratista en Google Earth | **CONFIRMADO** (documento maestro, §2) |
| 2 | El generador normaliza y produce el KMZ estandarizado | **CONFIRMADO** (el código está en el repositorio) |
| 3 | Los KMZ se llaman `CONTRATO_PROYECTO.kmz` | **CONFIRMADO** por observación: los 8 archivos reales lo cumplen |
| 4 | Los KMZ viven en una carpeta del equipo de una sola persona | **CONFIRMADO** (documento maestro, §6: «entorno de un equipo») |
| 5 | Un contrato = un proyecto | **CONFIRMADO** como supuesto del generador (§7), y **VALIDAR EPM** como regla de negocio |
| 6 | **Cómo llegan los KMZ del contratista a esa carpeta** | **VALIDAR EPM** — ¿correo? ¿Teams? ¿una carpeta compartida? El repositorio no lo dice, y suponerlo sería inventarlo |
| 7 | Quién puede publicar una versión nueva de un PMT | **VALIDAR EPM** |
| 8 | Qué se hace hoy con la versión anterior de un KMZ corregido | **VALIDAR EPM** |

### Qué duele hoy, en concreto

| Dolor | Consecuencia medible |
|---|---|
| Hay que buscar y seleccionar los 8 KMZ cada vez | ~2 minutos por análisis, y crece con cada contrato nuevo |
| No hay forma de saber cuál es la última versión de un archivo | se puede analizar con datos viejos **sin enterarse** |
| Todo el proceso vive en un equipo | si ese equipo no está, no hay análisis |
| Se reprocesa todo aunque solo cambie un archivo | con 460 PMT son ~300 ms y no importa; con 5.000 son 21 s (ver `ESCALABILIDAD.md`) |
| No queda registro de por qué las cifras cambiaron | «ayer eran 174 y hoy 176» no tiene respuesta |

---

## 2 · El proceso al que hay que llegar (TO-BE)

```
  creación / recepción → almacenamiento → validación → actualización
        → análisis → consulta → informe → notificación → histórico
```

| Etapa | Qué debería pasar | Quién decide | Marca |
|---|---|---|---|
| **Creación** | el contratista captura con el generador, con menús cerrados | operación | **CONFIRMADO** que ya funciona así |
| **Recepción** | el KMZ acaba en **un sitio conocido y único**, no en un correo | TI + operación | **VALIDAR EPM** |
| **Almacenamiento** | ese sitio guarda **versiones**: corregir no borra lo anterior | TI | **VALIDAR EPM** |
| **Validación** | al llegar se comprueba que se puede leer y que trae los campos; si no, **se rechaza y se dice por qué** | ya implementado | **CONFIRMADO** |
| **Actualización** | se detecta qué cambió y **solo eso** se vuelve a procesar | ya implementado | **CONFIRMADO** (`app/fuentes/`) |
| **Análisis** | el motor recalcula las relaciones afectadas | **CONFIRMADO** (recalcula todo; ver §5) |
| **Consulta** | mapa, filtros, tablas; alcance siempre declarado | **CONFIRMADO** |
| **Informe** | PDF con procedencia; caduca si el estado cambia | **CONFIRMADO** |
| **Notificación** | avisar de hechos neutros (ver §7) | operación | **VALIDAR EPM** |
| **Histórico** | poder responder «qué había el 3 de marzo» | operación + TI | **VALIDAR EPM** |

---

## 3 · Arquitectura lógica: dónde está la frontera

La decisión de fondo: **ni la interfaz ni el motor pueden saber de dónde vienen los datos.**

```
   ┌──────────────────────────────────────────────────────────────┐
   │  INTERFAZ            mapa · filtros · tablas · informe        │
   ├──────────────────────────────────────────────────────────────┤
   │  MOTOR               distancias · traslapes · relaciones      │
   │                      (no sabe qué es un archivo)              │
   ├──────────────────────────────────────────────────────────────┤
   │  GESTIÓN DE FUENTES  inventario · versiones · incremental     │
   │                      bitácora · plan de actualización         │
   ├───────────────── F R O N T E R A ────────────────────────────┤
   │  PROVEEDOR           listar() · leer()                        │
   │    · local (hoy)                                              │
   │    · simulado (pruebas y maqueta)                             │
   │    · corporativo (el día que TI diga cuál)  ← NO EXISTE       │
   └──────────────────────────────────────────────────────────────┘
```

**Estado: implementado y probado** (`app/fuentes/`, 25 pruebas). El contrato es deliberadamente
pequeño — `listar()` y `leer()` — porque cuanto más grande es una frontera, menos frontera es.

Las otras tres interfaces que el mandato pedía se resolvieron así, y conviene explicar por qué no
todas son un módulo:

| Interfaz pedida | Cómo está resuelta | Por qué |
|---|---|---|
| `SourceProvider` | `app/fuentes/proveedores.js` | es la frontera real: aquí cambia todo según el origen |
| `ProjectRepository` | **no se ha creado** | hoy guardar es descargar un archivo y abrir es elegirlo. Una interfaz con una sola implementación trivial es ceremonia, no arquitectura. Se creará cuando exista un segundo sitio donde guardar |
| `AuditRepository` | `app/fuentes/auditoria.js`, en memoria y serializable | ya tiene dos destinos posibles (memoria y archivo) y la forma de la anotación es lo que hay que fijar ahora |
| `NotificationProvider` | **no se ha creado** | no hay ningún hecho que notificar mientras no exista la decisión de operación de §7. Crear la interfaz antes sería adivinar su forma |

> Regla que se ha seguido: **una abstracción sin al menos dos usos reales es deuda, no diseño.**

---

## 4 · Modelo de fuentes y versiones

Tres preguntas que **no** son la misma, y confundirlas produce errores concretos:

| Pregunta | La responde | Si se confunde con otra… |
|---|---|---|
| **¿Son los mismos bytes?** (deduplicación técnica) | huella del contenido | copiar un archivo a otra carpeta duplicaría 60 trazados |
| **¿Es el mismo archivo, más nuevo?** (versionado) | identidad de la fuente = proveedor + ruta | corregir una fecha parecería que desaparecen todos sus PMT y aparecen otros |
| **¿Es el mismo PMT?** (identidad de negocio) | identificador estable del trazado | el mismo PMT se contaría dos veces en dos versiones |

```
  FUENTE  (proveedor + ruta)        ← identidad estable; no cambia con el contenido
    └── VERSIÓN (huella del contenido)
          └── REGISTROS DERIVADOS (identificadores de PMT)   ← se recalculan, nunca mandan
```

Estados que se distinguen, cada uno con su prueba: `nueva`, `modificada`, `sin_cambio`,
`eliminada`, `movida`, `duplicada`, `indeterminada`.

Tres decisiones que merecen defenderse:

- **Mover no es dar de baja y de alta.** Se comprueba primero la ruta y después el contenido. Si el
  contenido ya se conocía en una ruta que **ya no existe**, se movió.
- **Copiar no es mover.** Si la ruta de antes **sigue ahí**, es una copia: el original no se ha ido.
  *Lo encontró la maqueta, no una prueba escrita a mano.*
- **El reloj del origen no decide.** `modificadoDeclarado` se guarda como informativo. Quien decide
  si algo cambió es la huella, que es lo único comprobable.

---

## 5 · Estrategia incremental

**Lo que ya está hecho y probado:** no se vuelve a *leer* lo que no cambió. Con ocho archivos y uno
corregido, se relee uno: **88 % evitado**. Sincronizar dos veces sin cambios no lee nada y no
produce ningún cambio — hay una prueba de propiedad que lo exige.

**Lo que NO está hecho, y por qué:** las **relaciones** se siguen recalculando enteras. Un PMT nuevo
puede relacionarse con cualquier otro, así que «recalcular solo lo afectado» exige saber qué pares
puede tocar, y eso necesita un índice espacial que hoy no existe (ver `ESCALABILIDAD.md`). Con 460
PMT recalcular todo cuesta ~300 ms: **optimizarlo ahora sería añadir una fuente de errores para
ahorrar tres décimas de segundo.**

Cuando haga falta, el orden es: primero un prefiltro espacial correcto, después relaciones
incrementales. Nunca al revés.

---

## 6 · Persistencia local (Fase H)

| Papel | Hoy | ¿Cambiar? |
|---|---|---|
| Intercambio y respaldo portable | `.pmt.json` | **No.** Es un archivo que se envía, se guarda en una carpeta y se abre en otro equipo. Ningún almacén de navegador hace eso |
| Recuperar la última sesión | no existe | **Sí, vale la pena** |
| Historial local, proyectos recientes | no existe | **Sí, pero después** |

**Recomendación: IndexedDB, con tres condiciones innegociables.**

1. **Nunca en silencio.** Guardar exige una acción visible («Recordar esta sesión en este equipo»).
   Que una herramienta deje datos operativos de EPM en un equipo sin decirlo es un problema de
   gobierno, no una comodidad.
2. **Se puede borrar, y se ve cómo.** Un botón «Olvidar lo guardado en este equipo» y cuánto ocupa.
3. **Se explica qué queda.** Los KMZ llevan direcciones, fechas de obra y nombres de contratista.

Por qué IndexedDB y no `localStorage`: `localStorage` tiene ~5 MB y guarda texto; los KMZ de origen
no caben. IndexedDB guarda binario y tiene cuota de decenas o cientos de MB.

**No se implementa en esta entrega.** Sin la decisión de gobierno de datos (§D4 de `BASELINE.md`),
construirlo sería adelantarse a una respuesta que puede ser «no». La arquitectura ya está lista: es
un proveedor más y un repositorio más.

---

## 7 · El flujo de automatización objetivo (Fase L)

```
  llega un KMZ  →  se detecta  →  se valida  →  se identifica la versión
        →  se incorporan los cambios  →  se recalcula  →  se actualiza el estado
        →  se anota en la bitácora  →  se notifica, si procede
```

| Paso | Estado | Qué falta |
|---|---|---|
| se detecta | **implementado** con `listar()` | quién es el origen — **VALIDAR EPM** |
| se valida | **implementado**: se rechaza y se dice por qué | — |
| se identifica la versión | **implementado**: huella + ruta | — |
| se incorporan los cambios | **implementado**: solo lo que cambió | — |
| se recalcula | **implementado** (entero, no incremental) | ver §5 |
| se actualiza el estado | **implementado** | — |
| se anota | **implementado**; el actor es `equipo-local` | identidad — **VALIDAR EPM** |
| se notifica | **no implementado** | a quién y por qué medio — **VALIDAR EPM** |

### Eventos técnicos vs. reglas operativas — la distinción importa

Un **evento técnico** es un hecho: pasó o no pasó, y la herramienta lo sabe sola. Una **regla
operativa** dice qué hacer con ese hecho: a quién avisar, con qué urgencia. **La herramienta puede
producir los eventos hoy; las reglas no le corresponden.**

Hechos que ya se pueden emitir, todos neutros:

| Hecho | Por qué es neutro |
|---|---|
| llegó un PMT nuevo | describe algo que pasó |
| un archivo fue rechazado | tampoco valora nada |
| apareció una relación que antes no estaba | «apareció», no «es grave» |
| cambió la distancia de una relación | el número, sin interpretarlo |
| cambió la vigencia de un PMT | ídem |
| un par no se pudo evaluar | el hecho de no poder, que no es lo mismo que «no hay problema» |

**Ninguno dice «crítico».** La plataforma no clasifica criticidad, y añadirla aquí por la puerta de
atrás sería exactamente lo que se lleva cuatro etapas evitando. Cuando operación defina esa regla
(§D1 de `BASELINE.md`), se aplica **encima** de estos hechos, sin tocarlos.

---

## 8 · La experiencia objetivo (Fase O)

**Ya está prototipada y funciona**: `dist/Vista_previa_Datos.html` (`npm run construir:prototipo`).

Lo que la usuaria dejaría de hacer: buscar los 8 KMZ, descargarlos, seleccionarlos uno a uno,
preguntarse cuál es la última versión, y guardar el estado a mano cada vez.

Lo que vería en su lugar:

```
  DATOS      última sincronización · fuentes activas · nuevos · modificados
             · problemas · [Sincronizar]
  ANÁLISIS   estado actualizado · relaciones nuevas o cambiadas · mapa · filtros
```

La maqueta usa la **tubería real**; lo único simulado es de dónde salen los archivos, que es
justamente lo que falta decidir. Trae un banco de pruebas para reproducir lo que pasa en una carpeta
compartida: llega un archivo, alguien lo corrige, lo mueve, deja una copia, lo retira, o deja de
poder leerse. **Encontró dos defectos reales del modelo** que ninguna prueba escrita a mano había
visto.

---

## 9 · Qué se ha construido ya, y qué depende de una respuesta

| Pieza | Estado |
|---|---|
| Huellas de contenido | **hecho** · `app/fuentes/huella.js` |
| Modelo fuente → versión → registros | **hecho** · `app/fuentes/inventario.js` |
| Detector incremental | **hecho**, 7 estados distinguidos |
| Plan de actualización | **hecho** |
| Contrato del proveedor | **hecho** · `app/fuentes/proveedores.js` |
| Proveedor local | **hecho** |
| Proveedor simulado | **hecho** (pruebas y maqueta) |
| Tubería de sincronización | **hecho** · `app/fuentes/sincronizacion.js` |
| Bitácora | **hecho** · `app/fuentes/auditoria.js` |
| Maqueta de la vista de Datos | **hecho** · `dist/Vista_previa_Datos.html` |
| Versionado y procedencia | **hecho** · `app/nucleo/version.js`, `BASELINE.md` |
| **Adaptador corporativo** | **bloqueado**: no se sabe contra qué |
| **Identidad en la bitácora** | **bloqueado**: no hay identidad |
| **Notificaciones** | **bloqueado**: falta la regla operativa |
| **Persistencia local rica** | **en espera**: falta la decisión de gobierno de datos |

**Nada de lo construido habla con ningún servicio corporativo, tiene credenciales, ni supone qué
tiene EPM.** El día que TI responda, lo único nuevo es un archivo que cumpla `listar()` y `leer()`.
