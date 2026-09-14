# Autorevisión adversaria de la Etapa 3

> **Qué es esto.** No es un resumen de lo hecho: es el intento deliberado de **romper lo que acabo
> de construir**, escrito antes de entregarlo. Cada entrada dice qué ataqué, qué encontré y qué hice.
> Lo que sigue abierto se queda abierto y con nombre, no se maquilla.
>
> **Por qué existe.** En las etapas anteriores, los defectos que llegaron a la usuaria no los
> encontró quien escribió el código revisándolo otra vez: los encontró alguien atacándolo. Esto es
> hacer esa segunda pasada a propósito, y dejar constancia de qué se atacó — para que la auditoría
> independiente sepa **dónde no he mirado**.

---

## 1 · Lo que ataqué, y qué salió

### 1.1 · Las compuertas: ¿vigilan de verdad, o solo dicen que sí?

Una lista de comprobación que siempre pasa no vigila nada. Así que **rompí el producto a propósito,
una infracción por compuerta**, y comprobé que cada una lo detecta:

| Compuerta | Cómo la rompí | ¿La detectó? |
|---|---|---|
| A · secretos | clave `AIza…` de 39 caracteres inyectada en el artefacto | **sí** |
| B · criticidad | `export const X = 'crítico'` en `app/nucleo/modelo.js` | **sí** |
| C · formatos | intercambiadas las columnas 1 y 2 del CSV legado | **sí** |
| D · marca | verde EPM cambiado a `#00aa00` | **sí** |
| E · modelo espacial | `modeloEspacial` por defecto puesto en `zonasDeInfluencia` | **sí** |
| F · «Pendiente» | `'pendiente'` retirado de los marcadores de ausencia | **sí** |
| G · «no sé» ≠ «no» | `NO_EVALUABLE` devolviendo `SIN_COINCIDENCIA` | **sí** |
| H · sin internet | `crossOrigin: true` añadido en código real | **sí** |
| I · datos operativos | `*.pmt.json` borrado del `.gitignore` | **sí** |
| J · procedencia | `VERSION_APP` cambiada a `'v2.4'` | **sí** |
| K · oráculo | `auditoria-codex.test.mjs` truncado a 40 líneas | **sí** |
| L · reproducible | `motor/package-lock.json` borrado | **sí** |

**12 de 12.** Después restauré todo y comprobé con `git status` que el árbol quedó exactamente como
estaba: los únicos cambios son los que quería hacer.

**Dos defectos reales que aparecieron mientras las construía:**

1. **Las compuertas B y H se disparaban con sus propios comentarios.** Este proyecto documenta
   extensamente *por qué* algo está prohibido, y el párrafo que explica «por eso ya no se activa
   `crossOrigin`» hacía saltar la compuerta que vigila que no se active. **La explicación no es la
   infracción.** Se arregló con un quitador de comentarios común a las dos.
   *Clase de error:* una comprobación que confunde hablar de algo con hacerlo. Habría dado falsos
   positivos eternos hasta que alguien desactivara la compuerta «porque siempre falla».
2. **`.gitignore` NO protegía `*.pmt.json`.** El proyecto guardado lleva los trazados reales —
   direcciones, contratistas, fechas de obra — y el repositorio es público. La regla estaba escrita
   en `CLAUDE.md` desde la Etapa 2.1 y **no estaba implementada en ninguna parte**. Un `git add -A`
   con un proyecto en la carpeta lo habría subido, y nadie se habría enterado.
   *Clase de error:* una regla que vive solo en la documentación. Ya está en `.gitignore` **y** en la
   compuerta I, que la vigila de ahora en adelante.

### 1.2 · El vocabulario operativo: ¿se puede colar criticidad por la puerta de atrás?

«Articulación requerida» nombra una consecuencia. La pregunta adversaria es si eso **es criticidad
con otro nombre**. Tres defensas, las tres comprobadas:

- Las dos lecturas son **excluyentes, no ordenadas**: un PMT es una cosa o la otra, ninguna es «más
  grave». El texto lo dice donde salen las cifras, no en una ayuda aparte.
- Una prueba recorre **todas** las etiquetas y explicaciones buscando `crític|urgent|prioridad
  alta|nivel alto|grave|severo`. Si alguien añade un matiz de gravedad, la prueba falla.
- La compuerta B vigila lo mismo en los 53 archivos de código.

**Lo que no puedo evitar:** que alguien LEA «articulación requerida» como «lo urgente». Es un riesgo
de interpretación, no de implementación, y por eso la explicación va pegada a la cifra y el informe
repite que no es un nivel de criticidad. **Queda abierto y se declara.**

### 1.3 · ¿El modelo espacial candidato se ha colado en algún sitio?

- Por defecto sigue siendo `minima` a 120 m (compuerta E, más la prueba de baseline).
- `zonasDeInfluenciaSeSuperponen` se calcula **siempre** en cada relación, pero **no decide nada**:
  el motor sigue filtrando por el modelo vigente.
- El informe **nombra el candidato como candidato** y dice que está pendiente de validación humana.
  Una prueba de navegador lo exige textualmente.
- Medí el coste: el modelo ancho **no es más lento** (idénticas distancias calculadas), produce casi
  el triple de relaciones. Lo apunté en `ESCALABILIDAD.md` §4 bis **precisamente para que nadie
  elija el modelo estrecho creyendo que el ancho es caro**. No lo es; es otra cosa.

### 1.4 · Cifras que podrían no cuadrar entre sí

Ataqué el informe buscando dos sitios que calculen lo mismo:

- **Encontrado:** la tabla documental usaba `resumen.pmts - pendientes` como «registrados», con un
  `Math.max(0, …)` delante. Si los dos alcances dejaran de coincidir, ese `Math.max` **taparía la
  diferencia** en vez de enseñarla. Cambiado a `resumen.documental.total - pendientes`: ahora
  «registrados + pendientes» suma el total **por construcción**, y no hace falta tapar nada.
  *Clase de error:* un `Math.max` defensivo que convierte una incoherencia en un número plausible.
- **Comprobado y correcto:** `verInforme()` pasa `estado.visibles` como `filas` y el `resumen` sale
  de `resumenVisible()`, que usa exactamente esa misma colección. Los dos alcances no pueden
  divergir mientras eso siga así.

### 1.5 · Rendimiento de lo que añadí al camino caliente

`resumir()` ahora calcula también el recuento documental, y se llama **en cada paso del recorrido
temporal**. Medido: **1,04 ms con 460 PMT** (lo de hoy), 5,64 ms con 10.000. Con el intervalo más
rápido del recorrido (~60 ms) eso es menos del 10 % del presupuesto incluso en el caso extremo.
**No hace falta hacer nada**, y queda medido para que no haya que volver a suponerlo.

### 1.6 · La revisión de accesibilidad, atacada a sí misma

La primera versión de la prueba de contraste medía **solo lo que se ve al arrancar**. Eso dejaba
fuera el editor, el informe, los filtros y las pastillas de lectura operativa — es decir, **todo lo
que acababa de añadir**, que es justo donde estaría el color sin revisar. Ahora abre los cuatro
paneles y, además, **exige que se hayan abierto de verdad** (cuenta elementos dentro de cada uno)
antes de dar el contraste por bueno: si un panel no abre, la prueba falla en vez de aprobar en falso.

---

## 2 · Lo que encontré y arreglé, en una línea cada uno

| # | Defecto | Dónde | Clase de error |
|---|---|---|---|
| 1 | Blanco sobre el verde de marca da 4,06:1 (AA exige 4,5) | toda la interfaz | contraste no medido nunca |
| 2 | Blanco sobre el naranja de marca da 3,54:1 | botón del informe | igual |
| 3 | `--tenue` caía a 4,46:1 sobre el fondo de las tarjetas | tarjetas | contraste sobre fondo heredado |
| 4 | `.gitignore` no protegía `*.pmt.json` | repositorio público | regla que solo vivía en un documento |
| 5 | Compuertas que se disparaban con sus propios comentarios | `herramientas/compuertas.mjs` | confundir hablar con hacer |
| 6 | `Math.max(0, …)` tapando una posible incoherencia | informe documental | defensa que oculta en vez de avisar |
| 7 | `e.detalle[clave]` sobre una LISTA (siempre `undefined`) | informe documental | suponer la forma de un dato |
| 8 | Prueba de contraste ciega a los paneles cerrados | pruebas | medir solo lo cómodo |
| 9 | Prueba de vocabulario leyendo columnas por posición | pruebas | una columna nueva la habría hecho comparar cosas distintas |

Los tres primeros son **defectos que la usuaria tiene delante hoy**. El 7 habría hecho que la tabla
documental del informe saliera entera con «Pendiente», incluso para los PMT que sí tienen su código.

---

## 3 · Lo que NO he atacado (para que la auditoría independiente empiece por aquí)

Decir dónde no he mirado vale más que repetir dónde sí.

> **Nota:** los tres primeros huecos que había dejado apuntados aquí **ya los ataqué** antes de
> entregar; están resueltos y documentados en la §5. Lo que queda debajo es lo que sigue sin mirar.

1. **La cartografía contra un servidor de teselas real.** Desde este contenedor no hay salida a
   internet: el desfase cartográfico se verificó **numéricamente** (0 grados de pérdida de precisión
   entre el KMZ y Leaflet) y con una herramienta dentro de la aplicación, no mirando un mapa de
   verdad. **Sigue sin observación directa.**
2. **Accesibilidad más allá del contraste, el foco y el ancho.** No he probado un lector de
   pantalla real, ni el zoom del navegador al 200 %, ni la navegación completa por teclado del mapa.
3. **La clave del generador que aparece en el historial público de Git.** Sigue ahí, **a
   propósito**: limpiar historia no se hace sin autorización expresa. Es un riesgo **separado** de
   esta etapa y sigue abierto.

---

## 4 · Lo que sigue necesitando una decisión que no es mía

Ninguna de estas se ha dado por aprobada, y ninguna está aplicada:

- Sustituir «distancia ≤ 120 m» por «zonas de 120 + 120 m» (hasta 240 m).
- Cualquier criterio de criticidad.
- Un proveedor cartográfico para producción (licencia y permiso de TI).
- Almacenamiento corporativo, autenticación corporativa y permisos del contratista.
- Política de persistencia local.
- La arquitectura Microsoft definitiva.
- Reglas jurídicas sobre plazos o secuencia de los documentos del PMT.
- Disponibilidad y licenciamiento de cualquier servicio de EPM.

---

## 5 · Los tres huecos que sí ataqué antes de entregar

No basta con apuntar dónde no he mirado si mirar era barato. Estos tres lo eran, así que los cerré.

### 5.1 · El editor contra datos hostiles

Siete pruebas nuevas con lo que escribiría alguien con prisa o un catálogo mal mantenido:
coordenadas fuera del planeta (`-181`, latitud `91`, `NaN`, coordenadas como texto), una «línea» de
un solo punto, un contrato con la lista de municipios vacía, un catálogo corrupto de cinco formas
distintas, y un contrato que no existe en el catálogo.

**Resultado: las siete pasaron a la primera.** La validación ya era robusta; lo que faltaba era la
prueba que lo demuestra. Dos comportamientos que merecía la pena fijar por escrito:

- un **catálogo incompleto no puede impedir capturar**: que a un contrato le falten los municipios es
  un defecto del dato maestro, y castigar por él a quien captura empuja a escribir cualquier cosa;
- un catálogo corrupto **se rechaza entero y con motivo**, nunca a medias: medio catálogo cargado es
  peor que ninguno, porque parece que funciona.

### 5.2 · El PMT creado, de ida y vuelta

Para poder probar esto tuve que **sacar la construcción de la fila fuera del DOM**: vivía dentro de
`incorporarPmt()` en `app.js` y por eso solo se podía comprobar abriendo un navegador. Ahora es
`filaDePmtCreado()` en `app/nucleo/validacion-pmt.js`, lógica pura.

*Clase de error que esto cierra:* **lógica que solo se puede probar tarde**. Justo lo que hace esa
función —normalizar la vigencia, derivar el estado documental, decidir si el PMT es analizable— es lo
que tiene que sobrevivir a guardar el proyecto y volver a abrirlo la semana siguiente.

Comprobado: un PMT capturado con «Pendiente» en el permiso de rotura se guarda, se vuelve a abrir, y
vuelve **idéntico** en los once campos que importan y en su geometría; el estado documental se
**vuelve a derivar** y da lo mismo (`1/3`), porque es derivado y no guardado. Los identificadores de
dos capturas distintas no colisionan, llevan prefijo propio (`pmt_local_`) y, al **editar**, se
respeta el que ya tenía. Una vigencia ilegible deja el PMT como no analizable **pero conserva el
extremo que sí se pudo leer**, que es el invariante de «un fallo parcial no destruye lo válido».

### 5.3 · El vocabulario operativo con el modelo candidato activo

Dos PMT de contratos distintos a **~180 m**: fuera de los 120 m del modelo vigente, dentro de los
240 m del candidato. Comprobado que el modelo vigente **no ve relación**, el candidato **sí**, y que
sobre esa relación la lectura operativa se deriva correctamente (`Articulación requerida`) y el
resumen cuenta exactamente lo mismo que la lectura fila a fila.

Es decir: el vocabulario **no depende del modelo espacial**, se apoya en el criterio vigente sea cual
sea. Eso era una suposición y ahora es una prueba.


---

# Complemento: reactivaciones, histórico y semántica temporal

> Segunda ronda de ataque, sobre lo añadido en el cierre operativo de la Etapa 3.

## 6 · Lo que ataqué en esta ronda

### 6.1 · Las tres compuertas nuevas, rotas a propósito

| Compuerta | Cómo la rompí | ¿La detectó? |
|---|---|---|
| M · reactivar reutiliza el trazado | `prepararReactivacion` compartiendo el objeto en vez de clonarlo | **sí** |
| N · un solo reloj | `export const ESTA_VENCIDO = (x) => x.finMs < Date.now()` en `ui/capas.js` | **sí** |
| O · el histórico no se borra | el alcance «Todo» recortando históricos | **sí** |

**Un defecto de la propia compuerta N, encontrado y corregido:** su primera versión marcaba
`ahora = Date.now()` como **valor por defecto de un parámetro**, que es exactamente el patrón
correcto —quien llama puede inyectar la fecha, así que la función se puede probar y no impone su
reloj—. También marcaba el banco de pruebas del prototipo, que genera contenido falso con la hora y
no clasifica nada. Una compuerta que castiga el patrón bueno se acaba desactivando «porque siempre
falla». Ahora persigue lo que de verdad duele: un `Date.now()` incrustado en medio de una
comparación, donde nadie puede sustituirlo.

## 7 · Defectos encontrados mientras construía esto

| # | Defecto | Clase de error |
|---|---|---|
| 10 | **Ciclo de importaciones** `filtrado → temporalidad → filtrado`. El empaquetador de un solo archivo no lo resuelve: revienta la construcción. | dependencia circular entre un módulo y su ladrillo |
| 11 | `arguments.callee` para remontar el selector de periodo. **No existe en un módulo ES**: habría lanzado en cuanto alguien cambiara de alcance. | copiar un patrón de otro lenguaje/época |
| 12 | Un `return` para no reconectar campos al reactivar dejaba **sin conectar los botones Guardar y Cancelar**: el editor se abría muerto. | salida temprana en una función que hace dos cosas |
| 13 | La columna de situación **se vaciaba sola al pulsar una fila**: dos de los tres repintados de la tabla usaban `estado.visibles` sin la situación derivada. | el mismo dato calculado en un camino y no en los otros |
| 14 | El historial en la ficha usaba `relVisibles`, así que **con la vista operativa puesta decía «1 activación»**: las anteriores son históricas por definición y no estaban en lo visible. | confundir «lo que se ve» con «lo que hay» |
| 15 | **Las exportaciones no usaban `nombreConProcedencia`.** La función existía y estaba probada, pero los botones ponían solo la fecha: un CSV sin versión no permite responder «¿qué versión produjo esto?». | una función correcta que nadie llama |
| 16 | **`fijarFiltros()` descartaba `alcance` y `anio` en silencio.** Reconstruye los filtros desde cero, así que todo lo que no se nombre se pierde. El usuario pulsaba «Histórico» y la pantalla seguía en operativo, sin error y sin explicación. | una función que reconstruye y una lista que no se actualizó con ella |
| 17 | **Los radios del selector medían 0×0.** Un elemento sin superficie no recibe clics: ni el ratón ni una herramienta de pruebas pueden pulsarlo. Se descubrió porque la suite de navegador se quedaba 30 s por intento. | ocultar algo sacándolo de la capa de interacción en vez de recortarlo |
| 18 | **Reactivar quedaba BLOQUEADO** si el contrato del PMT no estaba en el catálogo. Medido: con el catálogo real (3 contratos) y los KMZ reales, **ningún PMT sería reactivable**. | aplicar la regla de «crear» a una operación que no crea |
| 19 | **Los fixtures de prueba tenían fechas escritas a mano.** Al pasar esa fecha, todos se volvieron históricos y la vista operativa —la de por defecto— dejó de enseñarlos: media suite empezó a fallar sin que nada se hubiera roto. | una prueba cuyo significado cambia con el calendario |
| 20 | **La vista operativa podía dejar la pantalla vacía sin explicar nada.** Es lo que le habría pasado a la usuaria al abrir la herramienta con los PMT del año pasado: se lee como «no cargó mis archivos», no como «no hay nada que coordinar». | un estado vacío legítimo indistinguible de un fallo |

El 15 es especialmente instructivo: **la compuerta J pasaba** porque probaba la función, no su uso.
Una prueba que verifica una capacidad no verifica que el producto la ejerza.

## 8 · Decisiones que tomé y por qué (revisables)

1. **La fila sigue siendo la unidad, no un árbol.** Anidar activaciones dentro de un objeto PMT
   obligaría a desanidarlas en cada análisis, filtro, tabla y exportación, y a mantener dos formas
   sincronizadas. La unidad de análisis del motor es el par (geometría, vigencia): dos activaciones
   son dos hechos espacio-temporales distintos y tienen que poder compararse por separado.
2. **Coincidencia y articulación tienen alcances distintos.** Para la coincidencia basta con que UNO
   siga operativo (es lo que pidió la operación, y es útil: que donde hoy trabaja alguien hubo otra
   intervención es contexto). Para la articulación exijo que **el traslape siga vivo**, porque solo
   se puede coordinar un solape que no ha terminado. Una articulación caducada **se degrada a
   coincidencia espacial**, no desaparece: los dos siguen compartiendo sitio.
3. **Los documentos no se heredan al reactivar.** Una resolución ampara unas fechas concretas.
   Copiar el número haría pasar por tramitado algo que no lo está. **DECISIÓN PENDIENTE**: si EPM
   confirma que alguno ampara varias activaciones, se cambia.
4. **Un selector, no pestañas por año.** Se leen bien tres años y mal diez, y la pestaña del año en
   curso —la que se usa casi siempre— acabaría compitiendo con nueve que nadie abre.

## 8 bis · Ataques directos a los módulos nuevos

Ataqué `identidad-pmt.js` y `temporalidad.js` con entradas que nadie escribe a mano pero que un
archivo editado, una combinación de fuentes o un error de programación sí pueden producir. **Dos
defectos reales:**

| # | Defecto | Por qué importaba |
|---|---|---|
| 21 | `prepararReactivacion` **lanzaba** con una geometría circular en vez de devolver `{ok:false}` | Una función que promete un objeto de fallo y en su lugar revienta convierte un caso previsto en un error inesperado a mitad de la interfaz |
| 22 | `referencia({ms: NaN})` producía una referencia **con NaN dentro** | Con NaN, `fin < NaN` y `inicio > NaN` son los dos `false`, así que **absolutamente todo pasaría por VIGENTE**. Sin ningún error: la pantalla mentiría entera, en silencio. Ahora se cae a hoy y **lo declara** en `degradada` |

Lo que aguantó bien: vigencias invertidas, rangos de 200 años, activaciones sin fechas (dan `null`,
no `NaN`), `traslapeFin` ilegible (nunca oculta), conjuntos vacíos y filas sin `idBase`.

**Rendimiento con 5.000 activaciones**, que es lo que se repinta en cada cambio de filtro:
`inventarioDeAnios` 6 ms · `agruparPorBase` 13 ms · `revisarCoherenciaDeBases` 6 ms. Hay prueba que
vigila que no se derrumbe.

## 9 · Dónde NO he mirado en esta ronda

1. ~~Volumen real de histórico.~~ **MEDIDO** (ver §8 bis): 25 ms en total con 5.000 activaciones, y
   con prueba que lo vigila. Lo que sigue sin medir es el **repintado del DOM** con esos volúmenes,
   que es otra cosa.
2. **Reactivar un PMT venido de un proyecto que a su vez venía de otro proyecto.** La cadena de dos
   saltos no está probada.
3. ~~Dos fuentes con la misma `idBase` y geometrías distintas.~~ **CERRADO antes de entregar.**
   `revisarCoherenciaDeBases()` lo detecta y lo dice, tanto para trazados distintos como para
   contratos distintos. **Avisa, no corrige**: no sabemos cuál de las dos versiones es la buena, y
   elegir una por nuestra cuenta sería inventar. Cuatro pruebas.
4. **La búsqueda espacial histórica** («qué había en este punto») se puede hacer hoy filtrando por
   año y municipio, pero **no hay consulta por proximidad a un punto**. La arquitectura no lo impide;
   simplemente no está.
