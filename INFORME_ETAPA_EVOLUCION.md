# Informe de la etapa integral de evolución

> **Qué es esto.** El informe de cierre de la etapa de evolución conjunta —producto, experiencia de
> uso, cartografía, modelo operativo, seguimiento documental, análisis espacio-temporal,
> trazabilidad y preparación corporativa—. No es un diario de programación: es qué se encontró, qué
> se decidió, qué se midió y qué queda abierto.
>
> **Estado: ENTREGADA, NO APROBADA.** Igual que la Etapa 3: se detiene aquí a propósito, para que
> alguien distinto lo mire antes de darlo por bueno.

---

## 1 · Diagnóstico de UX encontrado

El punto de partida no fue una opinión: **la propia responsable funcional del proyecto encontraba
algunas pantallas difíciles de interpretar.** Cuando quien mejor conoce el dominio no puede leer la
herramienta, el problema no es de capacitación.

Lo que encontré al conducir la aplicación con los datos reales:

| # | Problema observado | Por qué duele |
|---|---|---|
| 1 | **Once bloques apilados antes del mapa**: banda, selector, aviso, frase, alcance, ocho tarjetas, glosario, título, tarjetas de archivos y siguiente paso | nadie llega al mapa después de leer once párrafos: se salta los once |
| 2 | **Ocho cifras que solo se leían.** Ver «27 articulación requerida» y filtrar por ello eran cinco pasos distintos | la cifra señalaba algo y no dejaba ir ahí |
| 3 | **La cifra y el filtro se calculaban por caminos distintos** | podían discrepar sin que nada lo delatara |
| 4 | **El mapa enseñaba todo a la vez**: todos los trazados, todas las zonas, todos los conectores de medición | la pareja que se acababa de pulsar no se distinguía del resto |
| 5 | **El cierre parcial se dibujaba discontinuo** | sugería «tramo incompleto», que es otra cosa |
| 6 | **La ficha de una relación empezaba por lo técnico** y enterraba la consecuencia | había que reconstruir mentalmente qué hacer |
| 7 | **Texto explicativo permanente** repitiendo lo que las cabeceras ya decían | el ruido tapa la señal, y se deja de leer todo |
| 8 | **Acciones que perdían el contexto geográfico**: crear una vigencia alejaba el mapa a todo el territorio | había que volver a buscar la obra |
| 9 | **HTML literal a la vista** en una tarjeta: `ACTIVACIONES DE ESTE PMT <SPAN CLASS="PASTILLA P-CERCA">2</SPAN>` | un defecto que destruye la confianza en todo lo demás |
| 10 | **El recorrido en el tiempo, en su propio panel bajo el mapa**, con once controles siempre visibles | le quitaba altura al mapa siendo su mando |

---

## 2 · Arquitectura de experiencia propuesta

Un solo principio, y todo lo demás sale de él:

> **La plataforma no debe mostrar todo lo que sabe. Debe mostrar, en cada contexto, lo necesario
> para decidir.**

Con un límite que no se negocia: **reducir ruido no es quitar capacidades ni rigor.** Todo lo que
sale de la vista principal sigue existiendo, a un clic, con el mismo comportamiento.

Cuatro reglas operativas:

1. **Una cifra que importa es un botón.** Si una cifra señala algo, pulsarla tiene que llevar ahí.
2. **El mapa es el centro y va limpio.** La complejidad aparece cuando se pide, sobre lo elegido.
3. **Primero la consecuencia, después los hechos.** Veredicto → quiénes → dónde → cuándo → por qué
   → qué hacer → detalle técnico bajo demanda.
4. **Nada activo puede quedar invisible.** Si se pliega algo y hay un ajuste puesto, el rótulo lo
   dice aunque esté cerrado.

---

## 3 · Cambios implementados

**Pantalla principal.** Los once bloques pasan a una *tira de situación*: contexto en una línea,
**tres cifras que son el filtro** (`app/ui/bandeja.js`), y todo lo demás en «Ver el detalle del
análisis». Una cifra en cero no se esconde —«0 requieren articulación» es una respuesta útil—: se
atenúa y no acepta pulsación.

**Mapa.** Limpio por defecto: sin zonas de influencia ni conectores de medición. Al elegir una
relación **aísla los dos PMT**, dibuja sus dos zonas, representa la superposición con un **disco
inscrito demostrable** (disco en el punto medio del acercamiento con radio `solape/2`, contenido en
la intersección de las dos zonas) y encuadra a los dos. Opción de atenuar el fondo cartográfico.

**Simbología.** El cierre parcial pasa a **línea continua** con núcleo claro. La forma distingue,
no solo el color.

**Ficha de relación.** Reordenada por la pregunta que se viene a responder. El detalle técnico
—distancia exacta, contacto, zonas, vigencias, criterio espacial— queda en un desplegable.

**Ficha de PMT.** Enseña solo los documentos que existen; los que faltan se agrupan en un
desplegable en vez de tres «Pendiente» permanentes.

**Recorrido temporal.** Va **pegado al mapa**, separado por una línea y no por una caja. Arriba lo
de cada uso; velocidad, ir-a-fecha y tramo en «Ajustar el recorrido». Si el tramo queda acotado, el
rótulo lo dice con el plegable cerrado.

**Tablas.** La de relaciones gana el selector de columnas que ya tenía la de PMT. Las tres columnas
de lectura + espacio + tiempo son **fijas y ni se ofrecen**.

**Filtros documentales.** Las dos caras de cada documento: pendiente y registrado. Un documento
«heredado por confirmar» **no** cuenta como registrado.

**Gestión de fuentes.** `app/fuentes/` entra en la aplicación: una sola regla decide si un archivo
es nuevo, es otra versión o es una copia. Huella SHA-256 con respaldo declarado. **Historial** de
cambios con la hora de cada hecho.

**Herramientas.** `npm run comparador` (comparación espacial reproducible) y `npm run demo` (KMZ de
demostración con datos inventados, no versionado).

---

## 4 · Antes / después conceptual

| | Antes | Después |
|---|---|---|
| **Al abrir** | once bloques, ocho cifras, el mapa abajo | contexto en una línea, tres cifras accionables, el mapa arriba |
| **«Quiero ver lo que hay que coordinar»** | leer la cifra, bajar a filtros, desplegar, buscar el filtro, marcarlo, volver a subir | pulsar la cifra |
| **Al elegir una relación** | el mapa seguía igual de lleno; la ficha empezaba por metros | solo los dos, con sus zonas y su superposición; la ficha empieza por el veredicto y acaba en qué hacer |
| **Cierre parcial** | línea discontinua («¿tramo incompleto?») | línea continua con núcleo claro |
| **Crear una vigencia** | el mapa se alejaba a todo el territorio | el encuadre se conserva |
| **Añadir un archivo repetido** | una copia sumaba sus PMT otra vez | no se incorpora, y se dice por qué |
| **«¿Qué pasó con las fuentes?»** | un aviso que se iba con la siguiente acción | historial con la hora de cada hecho |

---

## 5 · Archivos creados y modificados

**Creados (5)**

| Archivo | Qué es |
|---|---|
| `app/ui/bandeja.js` | las tres cifras que son el filtro |
| `app/fuentes/index.js` | punto de entrada único de la gestión de fuentes |
| `herramientas/comparador-espacial.mjs` | comparador 120 m vs zonas, reproducible |
| `herramientas/generar-demo.mjs` | KMZ de demostración con datos inventados |
| `MODELO_INFORMACION_Y_PUBLICACION.md` | modelo futuro (§15) y publicación en cuatro ejes (§17) |

**Modificados (15)**

`app/app.js` · `app/index.html` · `app/estilos.css` · `app/ui/ficha.js` · `app/ui/mapa.js` ·
`app/ui/tablas.js` · `app/ui/controles.js` · `app/ui/barra.js` · `app/nucleo/filtrado.js` ·
`app/nucleo/modelo.js` · `app/test/navegador.test.mjs` · `dist/Plataforma_PMTs.html` (regenerado) ·
`package.json` · `.gitignore` · `CLAUDE.md`

Total: **2.141 líneas añadidas, 258 retiradas**, en 20 archivos.

---

## 6 · Decisiones tomadas, y por qué

| Decisión | Por qué |
|---|---|
| **La cifra ES el filtro** | dos caminos para la misma pregunta pueden discrepar; uno solo no |
| **Tres cifras y no ocho** | son las tres preguntas que se hace quien abre esto por la mañana; las otras cinco siguen en el detalle |
| **Cierre parcial continuo** | lo confirmó la responsable funcional: la discontinua sugería «tramo incompleto» |
| **Aislar al elegir una relación** | enseñar todo a la vez es indistinguible de no enseñar nada |
| **Disco inscrito para la superposición** | dibujar la intersección real de dos círculos es una lente que no se puede pintar con una primitiva; el disco inscrito **está demostrablemente dentro** y no afirma de más |
| **Las tres columnas de relación, fijas** | la lectura operativa no puede quedarse sola afirmando. Un selector de columnas no deshace una garantía del producto |
| **Una copia byte a byte no se incorpora** | contaba los mismos PMT dos veces. Contradecía un invariante ya aprobado |
| **La línea de alcance, fuera del plegable** | con un filtro puesto, esconder el «está viendo 2 de 4» y su botón de salida es esconder el estado justo cuando hace falta |
| **El recorrido pegado al mapa** | es su mando: causa y efecto tienen que verse a la vez |
| **Actor `equipo-local` en el historial** | sin identidad corporativa, inventar un autor sería peor que no tenerlo |

---

## 7 · Decisiones que deliberadamente NO tomé

1. **NO sustituí la regla espacial de 120 m.** El modelo candidato está construido, medido y
   disponible; sigue **sin aplicarse**. Es una decisión de negocio (§8).
2. **NO resolví P21** (si una resolución anterior ampara una vigencia nueva). Sigue el modelo
   neutral: ni se copia ni se borra, se conserva como `HEREDADO_POR_CONFIRMAR`.
3. **NO introduje criticidad.** Ni «crítico», ni «alto», ni un orden por gravedad. Hay una
   compuerta que lo vigila.
4. **NO toqué la historia de Git** ni borré `01_KMZ_Entrada.zip`. Exige autorización expresa, y
   además no bastaría.
5. **NO afirmé que ningún servicio corporativo esté habilitado.** Ni Esri con licencia EPM, ni
   Power Platform, ni SharePoint, ni Entra.
6. **NO cambié el formato de la descripción del KMZ ni las columnas del CSV legado.**
7. **NO optimicé el cálculo incremental de relaciones.** Con 460 PMT cuesta unas décimas: sería
   añadir una fuente de errores para ahorrar lo que nadie nota.

---

## 8 · Comparador espacial: 120 m vs zonas de influencia

Reproducible con `npm run comparador <carpeta-o-zip>`. Sobre los **8 KMZ reales (460 PMT)**:

| Modelo | Regla | Relaciones |
|---|---|---|
| **Vigente** | distancia mínima ≤ 120 m | **174** |
| **Candidato** | zonas de 120 + 120 m que se superponen = distancia ≤ 240 m | **247** |
| Referencia QGIS | distancia ≤ 243,2 m (colchón en grados) | **248** |

- Comunes: **174** · Solo en el vigente: **0** · Añade el candidato: **73**, de ellas **16 con
  coincidencia temporal**.
- Bandas de distancia de las añadidas: 120–150 m: **20** · 150–180: **17** · 180–210: **24** ·
  210–240: **12**.
- Parejas de contratos que ganan relaciones: CW323402↔CW352217 **32** · CW323402↔CW353556 **22** ·
  CW352217↔CW374202 **17** · CW328120↔CW374202 **2**.

**El hallazgo de fondo:** el modelo vigente deja fuera **74 relaciones que el sistema QGIS anterior
sí veía**. No es que el candidato invente relaciones: es que el vigente perdió las que había.

**Y sin embargo no se declara ganador.** El coste del candidato no lo paga la máquina —se calculan
exactamente las mismas distancias, medido: 507 ms vs 430 ms— lo paga **quien tiene que leer 73
relaciones más y convocar a la gente**. Esa es una decisión de negocio.

*(Nota técnica: que zonas de radio 120+120 equivalga exactamente a distancia ≤ 240 m no es una
aproximación; está demostrado en `motor/src/geo/zona-influencia.js`.)*

---

## 9 · Diagnóstico del posible desfase cartográfico

Se investigaron las cinco causas posibles, en orden:

| Eje | Qué se comprobó | Resultado |
|---|---|---|
| **A · Coordenadas del KMZ** | 1.340 vértices de los 8 archivos reales | 11–16 decimales, **0 fuera del planeta**, resolución submilimétrica. **Descartado** |
| **B · Datum / proyección** | qué declaran los KML | no declaran datum; **por definición de la OGC un KML es WGS84**, así que no ocurre ninguna transformación. **Descartado** |
| **C · Leaflet / Web Mercator** | ida y vuelta de la proyección | error de **4,94 × 10⁻¹⁰ m**. **Descartado** |
| **D · Simplificación o redondeo** | todo el camino del dato en nuestro código | no hay simplificación, ni *snapping*, ni redondeo. Solo un `toFixed(1)` **para mostrar**. **Descartado** |
| **E · Cartografía del proveedor** | — | **NO SE PUDO COMPROBAR AQUÍ**: este entorno no tiene salida a los servidores de teselas (OSM y Esri devuelven error de conexión, comprobado de nuevo al cerrar la etapa) |

**Conclusión honesta:** los cuatro ejes que dependen de nosotros están limpios. Queda **una
hipótesis sin comprobar**, y solo se puede comprobar desde el PC de EPM: que el KMZ se dibujara
sobre la imagen de **otro proveedor**, de modo que el desfase aparente sea la diferencia entre dos
cartografías, no un error de la plataforma.

**No se alteró ninguna geometría para hacerla coincidir visualmente**, ni se hizo *snapping* ni
desplazamiento silencioso. Si el desfase viene de la cartografía de fondo, mover los datos sería
falsificarlos.

La aplicación incluye «Comprobar cartografía» para contrastar un trazado desde el propio PC.

---

## 10 · Pruebas ejecutadas y resultados exactos

| Suite | Resultado |
|---|---|
| Motor (Node) | **259 pruebas · 258 pasan · 0 fallan** *(1 salta: requiere un artefacto opcional)* |
| Aplicación (Node) | **258 pruebas · 258 pasan · 0 fallan** |
| Navegador real (Playwright, `file://` y HTTP) | **85 pruebas · 85 pasan · 0 fallan** |
| Compuertas de entrega (A..R) | **18 de 18** |

**Pruebas nuevas de esta etapa (7):**

1. Las columnas de relaciones se eligen, **las tres fijas no se pueden quitar**, y las celdas
   cuadran con las cabeceras.
2. Las dos caras de cada documento filtran y no se confunden.
3. Se llega a un PMT por **cualquiera de sus tres códigos**.
4. **Escapado**: un KMZ con marcado y comillas en sus textos. Nada se ejecuta, el texto se ve tal
   como lo escribieron, y **ninguna parte de la pantalla tiene marcado a la vista**.
5. Idéntico / corregido / copia se distinguen, con sus recuentos comprobados, y queda constancia.
6. «Empezar de nuevo» tampoco deja rastro que confunda al siguiente análisis.
7. Crear una vigencia nueva **no aleja el mapa ni pierde el sitio** (compara zoom y centro).
8. Elegir una relación deja en el mapa **solo los dos**, con sus zonas.

**Pruebas actualizadas (4), todas por decisión funcional intencional y ninguna para hacer
desaparecer una regresión:** la ficha de relación se reordenó (2), el glosario pasó a tooltip más
detalle (1), y las que manejan velocidad / ir-a-fecha / tramo abren el plegable como haría una
persona (1). En los cuatro casos se conservó lo que la prueba garantizaba.

---

## 11 · Regresiones encontradas y corregidas

**Dos, y las dos se encontraron probando, no leyendo:**

1. **La línea de alcance y «Quitar los filtros» quedaron dentro del plegable.** Al plegar el
   detalle me llevé dentro la línea que dice «está viendo 2 de 4» y el botón para salir del filtro.
   Con un filtro puesto quedaban **invisibles justo cuando más falta hacen**. Lo delató una prueba
   que no podía pulsar el botón. Corregido: la línea vive fuera y aparece en cuanto hay algo que
   decir. La prueba ahora exige que **se vean**, no solo que existan.

2. **Una copia byte a byte inflaba los recuentos.** La tubería decía «es una copia, no información
   nueva» y la aplicación la incorporaba igual. Medido: **7 PMT donde hay 5**. Contradecía un
   invariante ya aprobado. Corregido, y la copia se anuncia en lugar de descartarse en silencio.

---

## 12 · Rendimiento medido

Navegador real, los **8 KMZ reales (460 PMT)**, sin red:

| Acción | Tiempo |
|---|---|
| Abrir la aplicación | **190 ms** |
| Cargar 8 KMZ y analizar (460 PMT, 174 visibles, 27 relaciones accionables) | **1.058 ms** |
| Aplicar un filtro de texto | **93 ms** |
| Pulsar una cifra de la bandeja | **799 ms** |
| Elegir una relación y aislarla en el mapa | **68 ms** |
| Generar el informe ejecutivo | **101 ms** |
| **Errores de JavaScript** | **ninguno** |

Comparador espacial (Node, los dos modelos completos): vigente **507 ms**, candidato **430 ms**.
Se calculan las mismas distancias: **el modelo candidato no es más lento.**

---

## 13 · Riesgos abiertos

| # | Riesgo | Estado |
|---|---|---|
| 1 | **El repositorio es PÚBLICO y contiene datos de obra reales** (`01_KMZ_Entrada.zip`, commit `4de5969`) | **abierto.** Contención propuesta por separado; exige decisión de EPM. Borrar historia no bastaría: lo que estuvo público hay que darlo por copiado |
| 2 | **No hay autenticación, y un sitio estático no puede darla** | **abierto.** Hoy la contención real es que el archivo vive en el equipo de quien lo usa |
| 3 | **El desfase cartográfico (eje E) no se pudo comprobar aquí** | **abierto.** Solo se puede comprobar desde el PC de EPM |
| 4 | **La lectura operativa sigue siendo provisional** | **abierto a propósito.** No es criticidad y no ordena por urgencia |
| 5 | **El modelo espacial vigente deja fuera 74 relaciones que el sistema anterior veía** | **abierto.** Es el punto 1 de la sección 14 |
| 6 | **El catálogo de contratos viaja embebido** | **abierto.** Actualizarlo exige reconstruir el archivo |

---

## 14 · Asuntos que requieren decisión de Leydi

1. **¿Se sustituye la regla de 120 m por el modelo de zonas (240 m)?** Los datos están en la
   sección 8. Pasar de 174 a 247 relaciones significa **73 conversaciones más**, 16 de ellas con
   coincidencia temporal. La pregunta no es cuál es más correcto: es **cuántas se pueden atender**.
   *No la he decidido y no la voy a decidir.*
2. **¿Se acepta que el repositorio siga siendo público, o se hace privado?**
3. **¿Las tres cifras de la bandeja son las tres correctas?** Se eligieron por lo que parece la
   rutina de la mañana; es una hipótesis que solo el uso confirma.
4. **¿Las columnas por defecto de las tablas son las que se usan?**

---

## 15 · Asuntos que requieren validación de EPM / TI

1. **P21** — ¿una resolución de PMT ampara unas fechas concretas, o el cierre mientras esté
   vigente? Mientras no se responda, `HEREDADO_POR_CONFIRMAR` sigue siendo provisional.
2. **¿Existe un consecutivo corporativo de PMT?** Desbloquea la identidad estable del PMT base.
3. **¿Qué mapa base puede usar EPM, y con qué licencia?** No se afirma que el uso corporativo de
   Esri esté autorizado: no hay ningún documento que lo diga.
4. **¿Hay un servidor de cartografía de EPM?** Hay un hueco preparado; no hay evidencia de que
   exista.
5. **¿Hay Microsoft 365 con Power Platform habilitado para este equipo?** No hay evidencia de
   ninguno de esos servicios.
6. **Autenticación**: Cloudflare Access con PIN de un solo uso, o Entra ID. Las dos exigen dominio
   propio y decisión de TI; la restricción por dominio en Azure exige plan de pago.

Las preguntas completas, con qué desbloquea cada una, están en `DESCUBRIMIENTO_EPM.md` y
`MODELO_INFORMACION_Y_PUBLICACION.md` §9.

---

## 16 · Commits de la etapa

Todos en la rama principal `Proyecto_Plataforma_Control_PMTs`, **con push normal**. No se reescribió
historia, no se usó `--force`, no se borró ningún commit.

| Commit | Qué entra |
|---|---|
| `0d63762` | la pantalla dice lo necesario, y el mapa explica la relación |
| `9d114ee` | el recorrido es el mando del mapa, y las relaciones eligen columnas |
| `e52bfd9` | una sola regla decide qué es un archivo nuevo, y queda constancia |
| `2cf38bb` | pruebas de lo que se cambió, y el comparador espacial reproducible |
| `c4b6cad` | modelo de información futuro y publicación corporativa |

---

## 17 · Estado local y remoto

Local y remoto **coinciden** en la rama principal `Proyecto_Plataforma_Control_PMTs`. No hay
trabajo sin subir ni ramas secundarias pendientes. `dist/Plataforma_PMTs.html` está **regenerado y
versionado** con todos los cambios.

---

## 18 · Qué archivo hay que abrir para probar

```
Control-y-Articulacion-de-PMTs-EPM\dist\Plataforma_PMTs.html
```

**Doble clic. No hace falta internet, ni instalar nada.** Si el mapa de fondo no carga por la red
corporativa, **la plataforma sigue funcionando**: los trazados, las distancias y las relaciones no
dependen del mapa base.

Antes de abrirlo, en GitHub Desktop: **Fetch origin** y luego **Pull origin**, sobre la rama
`Proyecto_Plataforma_Control_PMTs`.

---

## 19 · Recorrido manual recomendado (8 pruebas, por valor)

| # | Qué hacer | Qué debería pasar | Por qué importa |
|---|---|---|---|
| **1** | Cargar los 8 KMZ y **sin tocar nada**, mirar las tres cifras de arriba | se entiende qué hay que coordinar hoy sin leer nada más | es la prueba del principio de toda la etapa |
| **2** | **Pulsar** «requieren articulación» | el mapa y la tabla se quedan solo con esas; volver a pulsar lo deshace | la cifra y el filtro son la misma cosa |
| **3** | Ir a «Relaciones» y **pulsar una fila** | quedan solo esos dos PMT, con sus zonas y su superposición; la ficha responde en pocos segundos **qué dos, qué contratos, dónde, cuándo, por qué y qué hacer** | es el criterio de éxito de la etapa |
| **4** | Mirar un **cierre parcial** en el mapa | línea **continua** con núcleo claro, no discontinua | fue una corrección pedida explícitamente |
| **5** | Seleccionar un PMT, **acercar el mapa**, pulsar «↻ Nueva vigencia», poner fechas y guardar | el mapa **se queda donde estaba** | era el defecto más molesto de la etapa anterior |
| **6** | Añadir **dos veces el mismo KMZ**, y después una copia con otro nombre | los recuentos **no cambian**, y el historial de fuentes dice por qué | evita cifras infladas sin que nadie lo note |
| **7** | En «Más filtros», marcar **«Resolución PMT registrada»** y luego «pendiente» | las dos caras funcionan y sus cifras suman el total | es la mitad que faltaba del seguimiento documental |
| **8** | Buscar un **código de resolución** en la caja de búsqueda | lleva al PMT | es como llega una consulta real |

Si algo no se comporta así, **es un defecto**: anótelo con lo que hizo justo antes.

---

## 20 · Hallazgos adicionales materiales

1. **El modelo vigente perdió relaciones respecto al sistema que sustituyó.** No es una mejora que
   el candidato «añada» 73: es que el vigente **dejó de ver** 74 que QGIS sí veía. Cambia la
   pregunta: no es «¿ampliamos?», es «¿por qué se redujo, y estuvo bien?».
2. **Había dos implementaciones de la misma regla** de identidad de archivos, y la que usaba la
   aplicación era la más pobre. No fallaba por casualidad: la de la copia sí fallaba.
3. **Una prueba que verifica una capacidad no verifica que el producto la ejerza.** Ya había pasado
   en la etapa anterior con la procedencia en las exportaciones; volvió a pasar aquí con el botón
   de quitar filtros, que existía y no se podía pulsar.
4. **El entorno donde se desarrolla no tiene salida a los servidores de teselas.** Es una limitación
   real del diagnóstico cartográfico, y por eso el eje E queda declarado como no comprobado en vez
   de darlo por descartado.
5. **La accesibilidad no se rompió** con el rediseño: los colores de marca se conservan y los
   fondos con texto blanco siguen usando las variantes medidas (`--verde-texto`, `--naranja-texto`).

---

## Resumen en lenguaje no técnico

**Qué pasaba.** La plataforma sabía muchas cosas y las enseñaba todas a la vez. Había que leer once
bloques antes de llegar al mapa, ocho cifras que no se podían pulsar, y un mapa con tantas líneas
encima que la pareja de obras que uno acababa de señalar no se distinguía del resto.

**Qué se hizo.** Ahora arriba hay **tres cifras, y son botones**: pulsar «requieren articulación»
deja en pantalla exactamente esas. El mapa va limpio, y cuando se elige una relación **se queda con
esos dos** y enseña dónde se pisan. La ficha empieza por lo que hay que hacer y deja los metros y
las fechas exactas para quien los quiera. El cierre parcial se dibuja con línea continua, como se
pidió. Y crear una vigencia nueva ya no aleja el mapa: uno se queda donde estaba.

**Qué se arregló por el camino.** Dos cosas que solo se ven usando la herramienta: el botón para
quitar los filtros se había quedado escondido, y un archivo repetido con otro nombre sumaba sus
obras dos veces (decía 7 donde hay 5).

**Qué NO se decidió.** La regla de distancia sigue igual. Se midió que ampliarla haría aparecer
**73 coincidencias más**, 16 de ellas al mismo tiempo — y que el sistema antiguo de QGIS ya las
veía. Pero ampliarla significa **73 conversaciones más**, y cuántas se pueden atender no lo decide
un programa.

**Qué falta.** Que alguien de EPM responda cinco preguntas que no son técnicas —entre ellas si una
resolución anterior sigue valiendo cuando una obra se reactiva— y que se decida si el repositorio
sigue siendo público, porque contiene datos de obra reales.
