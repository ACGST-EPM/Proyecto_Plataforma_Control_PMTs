# Informe de la Etapa 3 — Evolución integral

> **Estado: entregada para auditoría independiente. NO declarada aprobada.**
> Las cifras publicadas no han cambiado. Todo lo que exige una decisión de EPM sigue sin tomarse, y
> está enumerado al final con nombre y apellido.

---

## Índice de lo entregado

| # | Bloque | Dónde |
|---|---|---|
| 1 | Modelo espacial candidato, demostrado | `motor/src/geo/zona-influencia.js` |
| 2 | Vocabulario operativo provisional | `app/nucleo/modelo.js` |
| 3 | Seguimiento documental | `motor/src/modelo/documental.js` |
| 4 | Gobierno del dato maestro | `app/nucleo/catalogos.js` |
| 5 | Captura de PMT dentro de la plataforma | `app/ui/editor.js`, `app/nucleo/validacion-pmt.js` |
| 6 | Rediseño de la experiencia | `app/ui/barra.js`, `capas.js`, `ficha.js`, `desplegable.js` |
| 7 | Informe ejecutivo rediseñado | `app/ui/informe.js` |
| 8 | Accesibilidad medida | `app/estilos.css`, `app/test/navegador.test.mjs` |
| 9 | Escalabilidad del modelo candidato | `ESCALABILIDAD.md` §4 bis |
| 10 | Arquitectura operativa con captura | `ARQUITECTURA_OPERATIVA.md` §10 |
| 11 | Preguntas nuevas para EPM | `DESCUBRIMIENTO_EPM.md` bloque 6 |
| 12 | Compuertas de entrega A..L | `herramientas/compuertas.mjs` |
| 13 | Autorevisión adversaria | `AUTOREVISION_ETAPA3.md` |

---

## 1 · El modelo espacial: qué se demostró y qué NO se hizo

**Lo que se pidió evaluar:** cada PMT tiene una zona de influencia de señalización de 120 m; hay
coincidencia cuando dos zonas se superponen, lo que admite hasta ~240 m de separación.

**Lo primero que hicimos fue no aproximarlo.** La tentación era construir polígonos de buffer e
intersecarlos. Se demostró en su lugar una identidad exacta, en los dos sentidos:

> zona(A, rA) ∩ zona(B, rB) ≠ ∅ ⟺ dist(A, B) ≤ rA + rB

Con 120 m en los dos PMT, el modelo candidato es **exactamente** «distancia mínima ≤ 240 m». No es
una aproximación: es la misma pregunta escrita de otra forma, y se apoya en la distancia que el motor
ya calcula y que está auditada contra el oráculo de QGIS. Los polígonos que genera el módulo son
**solo para dibujar**; no deciden nada. Un buffer poligonal habría sido aproximado —un arco
discretizado se queda por dentro del círculo— e **introducido falsos negativos cerca del borde**,
que es el peor error posible aquí.

**De dónde venía el ~243 m histórico.** El motor de QGIS aplicaba un colchón a CADA geometría —es
decir, su CRITERIO ya era zona + zona, el candidato— pero lo MEDÍA en grados, no en metros. O sea:
**el criterio histórico era el candidato; lo que estaba mal era la medición.** El modelo vigente de
120 m es un criterio **distinto y más estrecho**, no una versión corregida del histórico. Esa
distinción importa, y por eso no se ha «restaurado» nada.

**Lo que NO se hizo, a propósito:**

- No se sustituyó el modelo vigente. Por defecto sigue `modeloEspacial: 'minima'` a 120 m, y la
  **compuerta E** lo vigila: si alguien lo cambia, la entrega falla.
- No se convirtió ninguna cifra nueva en baseline oficial.
- `zonasDeInfluenciaSeSuperponen` y `solapeDeZonasMetros` se calculan **en todas las relaciones,
  siempre**, con cualquier modelo activo — para poder comparar caso por caso sin recalcular nada.

**Lo que sí aporta la Etapa 3 a esa decisión:** una medida que faltaba. El modelo candidato **no es
más lento**: mismas distancias calculadas, mismo tiempo (±3 %), porque el motor mide todos los pares
igual y el umbral solo decide qué se publica. Lo que crece es la **salida**: casi el triple de
relaciones (×2,9 medido de 460 a 5.000 PMT).

**Consecuencia:** «¿120 m o 120+120?» **no es una pregunta de rendimiento**. Nadie debe elegir el
modelo estrecho por miedo a que el ancho sea caro. Hay que elegirlo por si 240 m es o no la distancia
a la que dos PMT de verdad necesitan coordinarse — y eso lo decide EPM mirando casos reales.

---

## 2 · Hechos y consecuencia: un vocabulario que no es criticidad

«Se tocan» y «A la vez» son **hechos medidos**. Quien coordina no pregunta eso: pregunta «¿tengo que
sentar a estos dos contratistas en la misma mesa?». Esa deducción se hacía cruzando dos columnas
mentalmente. Ahora se hace **una vez, en un sitio**, y se dice de dónde sale:

- **ARTICULACIÓN REQUERIDA** — comparten espacio **y** coinciden en el tiempo.
- **COINCIDENCIA ESPACIAL** — comparten espacio, en momentos distintos.
- **SIN COINCIDENCIA** — se midió y no comparten espacio.
- **NO SE PUDO ANALIZAR** — y esto **jamás** se convierte en ninguna de las anteriores.

**Por qué no se llama «crítico».** «Crítico» afirma una prioridad, y una prioridad implica un
criterio aprobado —quién cede, en cuánto tiempo, con qué consecuencia— que EPM no ha definido. Las
dos lecturas son **excluyentes, no ordenadas**. Tres defensas activas: las etiquetas y explicaciones
pasan por una prueba que busca vocabulario de gravedad; la compuerta B vigila los 53 archivos de
código; y la explicación va **pegada a la cifra**, no en una ayuda aparte —una etiqueta que hay que
ir a buscar se interpreta a ojo, y ahí es donde nace «entonces esto es lo crítico».

**La lectura no sustituye a los hechos.** En la tabla de relaciones se ven las tres columnas a la vez
—lectura, espacio, tiempo— y una prueba de navegador comprueba **fila a fila** que la lectura cuadra
con los dos hechos de los que se deriva.

---

## 3 · Seguimiento documental: «Pendiente» no es un código

Se añadieron Resolución PMT, Permiso de rotura y Cierre del permiso de rotura, **al final** del campo
Descripción y como opcionales: un KMZ antiguo se sigue leyendo exactamente igual.

**La regla que atraviesa todo esto:** si el documento no existe todavía, el dato queda **vacío** y el
estado PENDIENTE se **deriva**. Escribir «Pendiente», «N/A», «por definir» o «—» en la casilla se
descarta —**con aviso**, nunca en silencio— porque un texto de relleno guardado como código no se
puede distinguir después de un código de verdad.

Hay resumen `n/3`, pestaña propia, filtros por documento, y el buscador general encuentra un PMT por
su código de resolución. La compuerta F lo vigila.

---

## 4 · Gobierno del dato maestro: que nadie escriba lo que EPM gobierna

El problema, medido sobre los datos reales: el contratista escribe su propio nombre en cada archivo.
«MEXICHEM», «Mexichem», «MEXICHEM S.A.» y «MEXICHEM SAS» son cuatro entidades distintas para
cualquier programa. Filtrar por contratista deja fuera tres cuartas partes de sus PMT **sin avisar de
nada**, porque no hay nada que avisar: los cuatro textos son válidos.

**La respuesta no es limpiar después. Es que nadie los escriba.** Al elegir el contrato se **derivan**
contratista y proyecto, y los municipios quedan limitados a los declarados para ese contrato. El
catálogo **manda al guardar**, no al escribir: aunque alguien toque el formulario, se guarda lo del
catálogo.

Eso elimina **la clase entera de error**, no un caso concreto.

**Lo que NO se hizo:** ninguna autenticación falsa en el frontend. No hay usuarios, ni roles, ni
contraseñas de administrador. La plataforma no puede autenticar a nadie y no finge que puede.

---

## 5 · Crear y editar un PMT dentro de la plataforma

No se «mejoró el generador»: se integró la captura. Se elige el contrato, se dibuja el trazado **en
el mismo mapa** donde luego se ve el análisis, y al guardar **se recalcula todo** — el PMT nuevo no
se añade «a un lado».

**Validación en tres niveles que no se mezclan:**

- **ERROR** impide guardar: sin contrato, sin vigencia legible o sin trazado, el PMT no significa nada.
- **ADVERTENCIA** deja guardar y pide revisión: algo es raro pero quien captura sabe cosas que la
  herramienta no.
- **INFORMACIÓN** solo orienta.

Confundirlos tiene un coste concreto: si todo es error, la gente busca la manera de saltárselo
—escribiendo cualquier cosa en la casilla— y acabamos con datos **peores** que sin validar.

**No se inventó ninguna restricción jurídica.** No sabemos cuánto puede durar un PMT, ni si una obra
puede empezar en domingo, ni qué forma tiene un código de resolución. Una vigencia de más de un año
es INFORMACIÓN, no error.

**KMZ y KML se siguen leyendo igual.** El editor es una entrada más.

---

## 6 · La experiencia: el mapa manda, y cada cifra dice de dónde sale

Barra de trabajo compacta con lo que se usa siempre (buscar, periodo, municipio, contrato) y el resto
detrás de «Más filtros». Panel de capas con su cifra al lado. Filtros con buscador dentro, donde **lo
elegido nunca desaparece** al buscar otra cosa. Control de contexto: ver solo lo filtrado, o todo
atenuado. Ficha de PMT reorganizada por bloques. Tabla con pocas columnas de entrada y las demás
disponibles.

**Simbología que no depende del color:** cada tipo de cierre tiene grosor, trazo y forma propios,
además de color, y halo blanco por debajo. Las pastillas de lectura operativa se distinguen por
**borde grueso**, no solo por tono: en blanco y negro, o con daltonismo, siguen leyéndose.

**Navegación temporal:** fechas de inicio y fin del recorrido, paso, velocidad, reproducir/pausar,
adelante/atrás, ir a una fecha concreta, y la **fecha viva en grande**, diciendo siempre de qué está
hablando («Periodo completo» o «PMT vigentes el día …»).

No se copió ningún producto existente. La disposición sale de las tareas reales, y hay una prueba de
navegador por tarea.

---

## 7 · El informe: primero la consecuencia

El informe abre con **articulación requerida** y **coincidencia espacial**, explica ahí mismo qué
significan, y pone los hechos medidos debajo, más pequeños: se leen para **sustentar** la decisión,
no para tomarla. Declara el criterio espacial vigente **con las palabras del propio motor** (si algún
día cambia el modelo, el informe lo dice solo), nombra el candidato **como candidato y pendiente de
validación humana**, y trae la sección de seguimiento documental.

Sigue sin clasificar criticidad, y lo dice. El sello de caducidad de la Etapa 2.4 sigue intacto: un
informe que ya no corresponde al estado actual **no se deja imprimir**.

---

## 8 · Accesibilidad: dos defectos que la usuaria tiene delante hoy

Medido en el navegador, no mirado en la hoja de estilos:

| Qué | Medido | Mínimo AA |
|---|---|---|
| Blanco sobre el verde de marca `#009300` | **4,06:1** | 4,5:1 |
| Blanco sobre el naranja de marca `#d56b00` | **3,54:1** | 4,5:1 |
| Gris de apoyo sobre el fondo de las tarjetas | **4,46:1** | 4,5:1 |

Eso es la barra de cabecera, todos los botones verdes, las pastillas de recuento y el botón del
informe: **casi todo lo que se lee**.

**La marca no cambia.** `#009300` y `#d56b00` se siguen usando en bordes, iconos, rellenos y
gráficos, donde el mínimo es 3:1 y lo cumplen de sobra. Se añadieron `--verde-texto` (#007000) y
`--naranja-texto` (#a35200) **solo** para el fondo que lleva letras blancas encima.

Cuatro pruebas de navegador lo vigilan: contraste sobre el **fondo real** (subiendo por los ancestros
hasta el primero opaco) con el informe, el editor y los filtros **abiertos** —y exigiendo antes que
se hayan abierto de verdad—; recorrido de teclado con foco visible y nombre accesible en cada
control; pantalla de 420 px sin desbordamiento, **nombrando al culpable** si lo hay; y un nombre de
frente de 110 caracteres que no rompe nada.

---

## 9 · Las compuertas de entrega

`npm run compuertas` ejecuta doce comprobaciones sobre el **producto**, no sobre el código. Cada una
se rompió a propósito una vez para comprobar que detecta su infracción: **12 de 12**. El detalle está
en `AUTOREVISION_ETAPA3.md` §1.1.

---

## 10 · Defectos encontrados y cerrados en esta etapa

| # | Defecto | Clase de error |
|---|---|---|
| 1 | Blanco sobre el verde de marca: 4,06:1 | contraste nunca medido |
| 2 | Blanco sobre el naranja de marca: 3,54:1 | ídem |
| 3 | `--tenue` a 4,46:1 sobre las tarjetas | contraste sobre fondo heredado |
| 4 | `.gitignore` no protegía `*.pmt.json` | regla que solo vivía en un documento |
| 5 | Compuertas que se disparaban con sus propios comentarios | confundir hablar con hacer |
| 6 | `Math.max(0,…)` tapando una posible incoherencia de alcances | defensa que oculta en vez de avisar |
| 7 | `e.detalle[clave]` sobre una lista: siempre `undefined` | suponer la forma de un dato |
| 8 | Prueba de contraste ciega a los paneles cerrados | medir solo lo cómodo |
| 9 | Prueba leyendo columnas por posición | una columna nueva la habría hecho comparar cosas distintas |

Los tres primeros son visibles hoy. El 7 habría hecho que la tabla documental del informe saliera
entera con «Pendiente», incluso para los PMT que sí tienen su código.

---

## 11 · Pruebas

```
Motor ......................  259
Aplicación (lógica pura) ...  200
Navegador real .............   66
Compuertas de entrega ......   12
```

---

## 12 · Lo que NO se hizo, y por qué

- **No se sustituyó el modelo espacial.** Exige validación humana sobre casos reales.
- **No se movieron geometrías** para «corregir» el desfase cartográfico, ni se usó *snap to road*.
  La cadena se verificó numéricamente: **0 grados de pérdida de precisión** desde el texto del KMZ
  hasta Leaflet. Ninguna transformación nuestra puede introducir metros de error.
- **No se inventó ninguna restricción jurídica.**
- **No se introdujo criticidad.**
- **No se incrustó ningún secreto, clave, token ni contraseña**, ni se implementó pseudoautenticación.
- **No se reescribió historia de Git ni se destruyó evidencia.** La clave del generador que aparece
  en el historial público sigue ahí, **a propósito**, como riesgo **separado** y abierto.
- **No se afirmó que ningún servicio de Microsoft o de EPM esté habilitado.** Todo lo corporativo
  sigue marcado como HIPÓTESIS o VALIDAR EPM.
- **No se tocó el CSV legado** (11 columnas, compuerta C).

---

## 13 · Decisiones que NO puede tomar la herramienta

Ninguna está aplicada y ninguna se da por aprobada:

1. Sustituir «distancia ≤ 120 m» por «zonas de 120 + 120 m» (hasta 240 m).
2. Cualquier criterio de criticidad.
3. Proveedor cartográfico para producción (licencia **y** permiso de TI de EPM).
4. Almacenamiento corporativo.
5. Autenticación corporativa.
6. Permisos del contratista.
7. Política de persistencia local.
8. Arquitectura Microsoft definitiva.
9. Reglas jurídicas sobre plazos o secuencia de los documentos del PMT.
10. Disponibilidad y licenciamiento de cualquier servicio de EPM.

Las tres primeras preguntas nuevas para EPM (P18, P19, P20) están en `DESCUBRIMIENTO_EPM.md`.

---

## 14 · Dónde NO he mirado

Está en `AUTOREVISION_ETAPA3.md` §3, y es el punto de partida recomendado para la auditoría
independiente:

1. La cartografía contra un servidor de teselas **real** (sin salida a internet desde el entorno de
   desarrollo, la verificación fue numérica y con una herramienta dentro de la aplicación).
2. Accesibilidad más allá del contraste, el foco y el ancho: lector de pantalla, zoom al 200 %,
   teclado en el mapa.
3. La clave del generador en el historial público de Git.

---

# RESUMEN PARA LEYDI — LENGUAJE NO TÉCNICO

**Qué he hecho en esta etapa, sin tecnicismos.**

**1. Ahora la plataforma le dice qué hacer, no solo qué pasa.** Antes le mostraba «estos dos se tocan»
y «estos dos coinciden en el tiempo», y usted tenía que cruzar las dos cosas mentalmente para saber a
quién convocar. Ahora eso sale ya hecho, arriba del todo: **«articulación requerida»** significa que
dos contratos están en el mismo sitio **a la vez** y hay que coordinar; **«coincidencia espacial»**
significa que comparten sitio pero en momentos distintos. Debajo siguen estando los metros y los días,
para que pueda comprobar de dónde sale cada cosa.

**Ojo con una cosa:** eso **no** quiere decir que una sea «más grave» que la otra. Son dos
situaciones distintas, no un ranking. La plataforma sigue sin decir qué es crítico, porque esa regla
todavía no existe en EPM.

**2. Ya puede crear un PMT sin salir de la plataforma.** Elige el contrato de una lista, dibuja el
trazado en el mismo mapa, pone las fechas y listo. Los KMZ que le manden siguen funcionando
exactamente igual: esto es una forma más de entrar, no un reemplazo.

**3. Nadie vuelve a escribir el nombre del contratista.** Antes cada quien lo escribía a mano, y por
eso «MEXICHEM», «Mexichem» y «MEXICHEM S.A.» eran tres empresas distintas para la herramienta —
filtrar por una dejaba fuera las otras dos **sin avisar**. Ahora usted elige el contrato y la
plataforma pone sola el contratista, el proyecto y los municipios posibles. Ese problema ya no puede
volver a ocurrir.

**4. Seguimiento de los tres documentos.** Resolución PMT, permiso de rotura y cierre del permiso.
Verá un «2/3» que le dice cuántos tiene cada PMT, puede filtrar por lo que falta, y el buscador
encuentra un PMT por el número de su resolución.
**Importante:** si un documento todavía no existe, **deje la casilla vacía**. No escriba «Pendiente».
La plataforma ya dirá Pendiente sola, y así se puede distinguir lo que falta de verdad de un texto de
relleno.

**5. Arreglé dos cosas que usted tiene delante hoy y no se veían.** Las letras blancas sobre el verde
y el naranja de EPM **no tenían contraste suficiente** — se leen mal en una pantalla con brillo, en un
proyector o si alguien tiene la vista cansada. Cambié **solo el fondo** de los botones y la barra a un
verde y un naranja un poco más oscuros. **Los colores de la marca EPM no han cambiado**: se siguen
usando igual en los bordes, los iconos y los gráficos.

**6. Sobre la distancia de 120 metros: no he cambiado nada, a propósito.** Investigué la propuesta de
que cada PMT tenga una zona de influencia de 120 m alrededor (lo que haría que dos PMT «coincidan»
hasta a 240 m de distancia) y **demostré matemáticamente** que se puede calcular exacto. También
descubrí que el sistema viejo de QGIS **ya usaba ese criterio** — lo que tenía mal era la medición, no
la idea.

Pero **no lo he activado**. Ese cambio afecta a qué cuenta como interferencia, y eso lo decide EPM,
no la herramienta. Lo que sí le puedo decir para ayudar a decidir: **no es más lento**, y produce casi
**el triple de coincidencias**. Es decir, la pregunta no es «¿aguanta el computador?» — aguanta. La
pregunta es «¿de verdad hay que coordinar dos obras que están a 200 metros?», y esa la responde usted
con su equipo, mirando casos reales en el mapa.

**7. Puse doce «candados» automáticos.** Son doce comprobaciones que se ejecutan solas y que impiden
entregar la herramienta si alguien, sin querer, rompe algo importante: que no se filtre ninguna clave,
que no aparezca la palabra «crítico», que el CSV de siempre no cambie de columnas, que los colores de
EPM sigan siendo los de EPM, que «Pendiente» nunca se guarde como si fuera un código, que la
aplicación siga funcionando sin internet, y que ningún archivo con datos de obra se suba al
repositorio público. **Rompí cada cosa a propósito una vez** para comprobar que el candado salta de
verdad. Los doce saltaron.

**8. Encontré un descuido serio y lo cerré.** Los archivos de proyecto que usted guarda (`.pmt.json`)
llevan dentro los trazados reales: direcciones, contratistas, fechas de obra. La regla de «esto no se
sube al repositorio» estaba **escrita** desde hace meses pero **no estaba puesta en práctica en
ninguna parte**. Si alguna vez hubiera subido todo de golpe con GitHub Desktop, se habría publicado
sin que nadie se enterara. Ya está bloqueado, y uno de los doce candados lo vigila.

**9. Lo que sigue pendiente de EPM.** Nada de esto lo puedo decidir yo, y ninguna está activada:
si se cambia a la zona de 120 m; qué se considera crítico; qué mapa de fondo se puede usar de verdad
(hace falta licencia **y** permiso de TI); dónde se guardan los archivos; cómo entra la gente; y qué
plazos legales tienen los documentos del PMT. Le dejé preparadas **tres preguntas nuevas** para TI y
para el área de contratación, en `DESCUBRIMIENTO_EPM.md`.

**10. Esta etapa NO está aprobada.** La dejo entregada y **parada a propósito**, para que la revise
alguien independiente antes de darla por buena. Incluso le dejé escrito, en `AUTOREVISION_ETAPA3.md`,
**dónde no he mirado** — porque eso es más útil para quien audite que repetir dónde sí.
