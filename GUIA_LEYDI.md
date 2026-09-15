# La plataforma, explicada sin tecnicismos

> **Para Leydi Marín** · Centro de Gestión Servicios Técnicos · Grupo EPM
>
> Este documento no tiene jerga. Explica qué hace hoy la herramienta, cómo se usa, qué significa cada
> palabra que verá en pantalla, y cómo probarla desde el computador de EPM.

---

## 1 · Qué es ahora la plataforma

Es **un solo archivo** que se abre con doble clic. No necesita internet, ni instalar nada, ni QGIS, ni
que nadie le dé permisos.

Hace tres cosas:

1. **Lee** los PMT que le entregan (archivos KMZ o KML, tal cual llegan).
2. **Compara** todos contra todos: a qué distancia están y si coinciden en el tiempo.
3. **Le enseña** dónde hay que coordinar entre contratos, en un mapa, con filtros e informe.

El archivo se llama **`dist/Plataforma_PMTs.html`**. Es el único que hay que abrir.

---

## 2 · Cómo se alimenta

Tres caminos, y los tres conviven:

| Camino | Cómo |
|---|---|
| Los KMZ de siempre | «Elegir archivos» y los selecciona. Puede añadir más después, sin empezar de cero. |
| Un proyecto guardado | Abre un `.pmt.json` que usted guardó antes. Vuelve todo como estaba. |
| **Nuevo: crearlos usted misma** | Botón «＋ Nuevo PMT»: elige el contrato, dibuja en el mapa, pone fechas. |

**Importante:** el archivo `.pmt.json` que usted guarda **lleva datos de obra dentro** (direcciones,
contratistas, fechas). Guárdelo en su computador, **no lo suba al repositorio**.

---

## 3 · La idea nueva más importante: PMT base y activaciones

Esta es la novedad que más cambia el día a día.

### El problema que resuelve

Usted cierra una calle en marzo. En julio hay que **volver a cerrar exactamente la misma calle,
igual**. Hasta ahora había que dibujar el trazado otra vez. Eso trae dos problemas:

- el dibujo nuevo **nunca sale idéntico**, así que las distancias medidas cambian aunque en la calle
  no haya cambiado nada;
- la herramienta veía **dos PMT distintos** donde usted ve **uno que se repitió**, y entonces no se
  podía responder «¿cuántas veces hemos cerrado aquí?».

### Cómo funciona ahora

Separamos dos cosas que antes estaban juntas:

**EL PMT BASE** — *qué se cierra y dónde.*
El trazado, el contrato, el frente, el tipo de cierre, el municipio. **Esto no cambia.**

**LA ACTIVACIÓN** — *cuándo se ejecuta esa vez.*
Las fechas, los documentos de esa vez, el motivo. **Esto es lo que cambia en cada repetición.**

### Cómo se usa

1. Seleccione el PMT que quiere volver a usar (en el mapa o en la tabla).
2. Pulse **«↻ Nueva vigencia»**.
3. La plataforma le muestra las veces anteriores, le dice cuál sería esta, y **conserva el trazado**.
4. Usted **solo pone las fechas nuevas**.
5. Guardar.

**El trazado no se puede tocar en esa pantalla, y es a propósito.** Si lo que hace falta es *otro*
cierre en el mismo sitio, use «＋ Nuevo PMT»: serían dos PMT distintos, no uno repetido.

### Qué gana con esto

Al abrir la ficha de un PMT que se ha repetido, verá algo así:

```
Activaciones de este PMT   3
 1   2024-03-01 → 2024-03-20      20 día(s)
     ↕ 426 día(s) sin actividad
 2   2025-05-01 → 2025-05-31      31 día(s)
     ↕ 277 día(s) sin actividad
 3   2026-03-04 → 2026-03-20      17 día(s)  (la que está viendo)

En total, 68 día(s) de cierre en 2024, 2025, 2026.
```

Sin tener que buscar tres cosas que parecían distintas.

**Un aviso honesto:** la plataforma **no juzga** que reactivar mucho sea malo. Puede ser una obra
compleja bien planeada o puede ser un imprevisto, y con estos datos no se puede distinguir. Se
guarda el hecho; interpretarlo es decisión de EPM.

---

## 4 · Operativo e histórico: la otra idea nueva

### El problema

Con dos o tres años de PMT cargados, la pantalla se llena de obras que **terminaron hace meses**.
Ninguna se puede coordinar ya. Son ruido encima de las pocas que sí piden atención.

Pero borrarlas sería peor: el histórico es **evidencia**, y hace falta para responder «¿quién estaba
interviniendo en este punto en marzo de 2025?».

### La solución: usted elige qué está mirando

Arriba de las cifras hay tres botones:

| Botón | Qué le enseña |
|---|---|
| **Operativo** | Lo que todavía se puede atender: lo vigente y lo programado. **Es lo normal.** |
| **Histórico** | Un año concreto. Aparece un selector de año con los años que hay en sus datos. |
| **Todo** | Absolutamente todo, sin recortes. |

Y encima, **siempre**, una banda que dice con palabras dónde está:

```
📍 Operativo · al 2026-09-14        460 PMT cargados: 12 vigente(s) · 3 programado(s) · 445 histórico(s)
```

o, si consulta el pasado:

```
🕘 Consulta histórica · Año 2025     460 PMT cargados: 12 vigente(s) · 3 programado(s) · 445 histórico(s)
```

**Fíjese en que siempre le dice cuántos hay de cada clase**, incluidos los que no está viendo. Ese
número es el que evita la duda de «¿y los otros?».

### Tres palabras que verá en la tabla

- **Vigente** — está en obra ahora mismo (respecto de la fecha que esté mirando).
- **Programado** — todavía no empieza.
- **Histórico** — ya terminó.

---

## 5 · El recorrido en el tiempo, y por qué es coherente con lo anterior

Si usted mueve la barra de tiempo —o escribe una fecha en «Ir a»— al **10 de marzo de 2025**, la
plataforma le enseña **lo que pasaba ese día**: los PMT que estaban abiertos, y las coincidencias que
había entre ellos.

Una obra que hoy es «histórica» **vuelve a ser relevante** si usted está mirando deliberadamente su
fecha. Ocultar históricos **nunca** significa borrarlos.

Todo esto sale de un solo concepto: la **fecha de referencia**, que es la fecha desde la que se mira.
Es hoy en la vista operativa, la fecha del recorrido si está recorriendo, y el año elegido si está
consultando el histórico. Todas las cifras de la pantalla usan esa misma fecha, siempre.

---

## 6 · Coincidencias y articulaciones

Cuando dos PMT **de contratos distintos** están cerca, la plataforma lo dice de dos maneras:

**COINCIDENCIA ESPACIAL** — comparten sitio, pero en **momentos distintos**.
No hace falta coordinar fechas.

**ARTICULACIÓN REQUERIDA** — comparten sitio **y además a la vez**.
Aquí sí hay que sentar a los dos contratistas.

Debajo siguen estando los hechos que las sustentan: los metros exactos, si se tocan, y los días que
coinciden.

**Dos cosas importantes:**

1. **No son niveles de gravedad.** Una no es «más crítica» que la otra: son situaciones distintas. La
   plataforma sigue sin decir qué es crítico, porque ese criterio todavía no existe en EPM.
2. **Una articulación cuyo periodo ya pasó deja de pedir coordinación.** Si dos obras coincidieron en
   febrero y marzo, y hoy es junio, ya no hay nada que acordar sobre aquello. Sigue apareciendo como
   coincidencia espacial —comparten sitio, y eso no ha caducado— y el hecho de que coincidieron
   **está intacto** y vuelve entero si usted mira febrero.

---

## 7 · Los tres documentos

Cada PMT lleva seguimiento de **Resolución PMT**, **Permiso de rotura** y **Cierre del permiso de
rotura**. Verá un «2/3», podrá filtrar por lo que falta, y el buscador encuentra un PMT por el número
de su resolución.

**Muy importante:** si un documento todavía no existe, **deje la casilla vacía**. No escriba
«Pendiente». La plataforma ya dirá Pendiente sola. Si usted escribe esa palabra, después no hay forma
de distinguir un trámite que falta de un texto de relleno.

### Cuando un PMT se vuelve a usar en otras fechas

**Cada vigencia lleva sus propios documentos.** Usted lo confirmó así: cada PMT y cada reactivación
tienen su resolución independiente, y lo mismo el permiso de rotura. Así que al crear una vigencia
nueva las tres casillas salen **vacías** y el PMT aparece en **0/3**: hay que tramitar los de esa vez.

Lo que sí verá, en letra pequeña debajo de «Pendiente», es **el número que tuvo la vez anterior**
—«la anterior tuvo RES-1001-2026»—. No es un error ni significa que ya esté resuelto: está ahí
solo para que pueda buscar el expediente anterior si lo necesita. No cuenta como registrado y no
rebaja el «0/3».

---

## 8 · El informe

Botón «Ver informe ejecutivo». Se imprime o se guarda como PDF desde el navegador.

**El informe dice siempre desde cuándo habla, en el título:**

- *«Informe operativo de PMTs — al 2026-09-14»*
- *«Consulta histórica de PMTs — Año 2025»*

Un informe histórico habla **en pasado** y lo advierte arriba: describe lo que ocurrió, no lo que hay
que coordinar ahora. Eso evita que alguien convoque una reunión por una obra que terminó.

---

## 9 · Cómo probarla desde el computador de EPM

1. Abra GitHub Desktop y **traiga los últimos cambios** de la rama principal
   (`Proyecto_Plataforma_Control_PMTs`).
2. En la carpeta del proyecto, entre en **`dist`**.
3. **Doble clic en `Plataforma_PMTs.html`**.
4. Pulse «Elegir archivos» y seleccione sus KMZ de `01_KMZ_Entrada`.

Eso es todo. No hace falta internet: si el mapa de fondo sale gris porque la red de EPM lo bloquea,
**sus trazados se siguen dibujando y todas las cifras son correctas** — el fondo es solo decoración.

### Qué probar, en orden

1. Que carga sus 8 KMZ y las cifras cuadran con lo que usted espera.
2. Que la banda de arriba dice «Operativo» y cuántos históricos hay.
3. Cambiar a «Histórico» y elegir un año: ver que salen los PMT de ese año.
4. Seleccionar un PMT y pulsar «↻ Nueva vigencia»: comprobar que **no le pide redibujar**.
5. Generar el informe en los dos modos y ver que los títulos son distintos.
6. Exportar a Excel y ver que el nombre del archivo dice si es operativo o histórico.

---

## 10 · Lo que todavía NO hace, y por qué

| Lo que falta | Por qué |
|---|---|
| Traer los KMZ sola, sin que usted los busque | Falta saber dónde vivirán (pregunta a TI) |
| Que entren solo correos `@epm.com.co` | Hace falta infraestructura de EPM |
| Decir qué es «crítico» | Ese criterio no existe todavía; hay que definirlo |
| Usar la distancia de 240 m | Está listo y demostrado, pero **no activado**: es decisión de EPM |
| Un mapa de fondo garantizado | Hace falta licencia **y** permiso de TI |
| Compartir el trabajo entre varias personas | Hoy cada quien guarda su proyecto en su equipo |

---

## 11 · Una cosa que conviene que sepa

En el repositorio hay un archivo llamado **`01_KMZ_Entrada.zip`** que se subió para la auditoría. El
repositorio **es público**, así que ese archivo y los datos de obra que lleva dentro **son visibles
para cualquiera en internet**.

No lo he borrado, por dos razones: borrarlo del historial de Git requiere su autorización expresa, y
además **no bastaría** — quedaría en el historial igualmente.

Si eso le preocupa, las opciones reales son: hacer el repositorio **privado** (lo más simple y
efectivo), o pedir ayuda para limpiar el historial. **Dígamelo y lo preparamos**; no he tocado nada.
