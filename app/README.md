# Aplicación de Control y Articulación de PMTs — Etapa 2

> **Qué cambia respecto a antes:** ya no hace falta abrir QGIS, ni ejecutar
> `proceso_pmt_qgis.py`, ni generar capas, ni pasar por qgis2web, ni producir
> `reporte_dinamico.csv`, ni publicar en GitHub Pages. Se abre el archivo,
> se arrastran los KMZ y sale el análisis.

## Cómo se usa (sin saber de programación)

1. Abra `dist/Plataforma_PMTs.html` **con doble clic**. No hay que instalar nada.
2. Arrastre sus archivos `.kmz` o `.kml`, o pulse **Elegir archivos…**. Puede
   seleccionar varios a la vez, de cualquier carpeta.
3. La aplicación lee los trazados, mide las distancias reales y compara fechas
   y horas. En los datos actuales tarda menos de medio segundo.
4. Mire el mapa, filtre, revise la pestaña **Relaciones** y, si algo no se pudo
   comprobar, la pestaña **Calidad de los datos** se lo dirá.
5. Guarde lo que necesite: Excel, GeoJSON, KML o informe para imprimir.

**Sus archivos no salen de su computador.** No hay servidor, no hay subida, no
hay llamada a ninguna API. Todo el cálculo ocurre en el navegador.

## Etapa 2.1 — qué se corrigió

La Etapa 2 se entregó demasiado pronto. La usuaria probó el producto y el **mapa
base salía en blanco**; una auditoría encontró además regresiones frente al
tablero histórico. La matriz completa está en `MATRIZ_PARIDAD_ETAPA2.md`.

**La causa del mapa en blanco, medida:** la capa de teselas llevaba
`crossOrigin: true`. Eso hace que el navegador pida la imagen en modo CORS y la
**descarte** si la respuesta no trae `Access-Control-Allow-Origin` — que es lo
que ocurre en cuanto un proxy corporativo reescribe la respuesta. Comprobado en
las 8 combinaciones de origen × `crossOrigin` × CORS del servidor: **el único
caso que falla es ese**. `crossOrigin` no aportaba nada y se retiró. También se
quitó el prefijo `{s}.`, que la propia política de OpenStreetMap desaconseja.

Además: simbología por tipo de cierre, filtros cruzados, paginación, informe
ejecutivo propio, gestión de archivos, proyectos guardables y 21 pruebas de
navegador real.

## Etapa 2.2 — qué se corrigió

Una auditoría independiente demostró ocho defectos. El más grave: **un `.pmt.json`
editado a mano imponía sus resultados**. Bastaba escribir una distancia de
98.765,4 m para que la aplicación la mostrara como cálculo del motor.

**El contrato de persistencia se rediseñó (esquema 2) con un principio:**

> Las fuentes son entrada. Los resultados son derivados.
> Un resultado no adquiere autoridad por estar escrito en un archivo.

Las relaciones **ya no se guardan**: se recalculan siempre al abrir. El archivo
guarda los trazados, la procedencia, la configuración, la versión de las reglas
del motor y una instantánea de recuentos marcada como informativa, que solo
sirve para avisar si el recálculo no coincide.

También: abrir un proyecto y añadir un KMZ ya no pierde los datos anteriores;
la vista de día muestra el día completo y no un instante; los pares no
evaluables tienen pestaña propia; `Empezar de nuevo` limpia los filtros; el
conector visual se sitúa bien en polígonos y en el antimeridiano; el informe
declara su alcance real, sitúa los contactos donde ocurren, trae mapas de
detalle y se imprime solo; y `4×` corre a 4× de verdad.

## Etapa 2.3 — cierre de integridad

Siete defectos más, reproducidos por una auditoría independiente. En vez de
parchear cada ejemplo, se corrigió la **clase** de error y se dejó escrita la
propiedad que cada uno violaba:

| Defecto | Clase de error | Invariante que ahora se prueba |
|---|---|---|
| `Polygon` de un anillo se perdía al guardar | deducir la estructura en vez de conocerla | guardar y abrir conserva la geometría |
| ms de 2030 con texto de 2026 | dos verdades para una fecha | el dato mostrado es el dato calculado |
| gestor de fuentes oculto tras abrir un proyecto | error escrito donde nadie lo ve | un error nunca queda invisible |
| último día del recorrido inalcanzable | redondear duración en vez de contar días | el último día con actividad es seleccionable |
| `aproximación(A,B) ≠ aproximación(B,A)` | contención probada en una sola dirección | A/B = B/A |
| tarjeta 0 con tabla 1 | dos sitios calculando la misma cifra | resumen = detalle |
| `2026-99-99` filtrando en la sombra | validar formato en vez de calendario | visual = estado interno |

La comprobación de simetría es una **prueba de propiedad** sobre 900 pares
generados al azar, no un puñado de casos escritos a mano.

## Arquitectura

```
app/
  index.html        estructura de la página
  estilos.css       sistema visual EPM, sin framework
  app.js            orquestador: qué se muestra y cuándo
  nucleo/           lógica pura, sin DOM → se prueba en Node
    modelo.js       modelo interno único y estados sin ambigüedad
    ingesta.js      archivos → análisis, y traducción de diagnósticos
    filtrado.js     filtros y recorrido temporal
    exportar.js     CSV, GeoJSON, KML y CSV compatible con el formato antiguo
    resumen.js      cifras y frase honesta de cabecera
  ui/               lo que toca el DOM → se prueba en navegador
    dom.js  mapa.js  tablas.js  controles.js
    mapas-base.js   catálogo de proveedores de mapa base, con respaldo
    proyecto.js     formato `.pmt.json` versionado: guardar y reabrir
  ui/
    informe.js      informe ejecutivo con mapa vectorial propio
  vendor/leaflet/   Leaflet 1.9.4 (BSD-2-Clause), incluido en el repositorio
  test/
    app.test.mjs        49 pruebas de la lógica pura
    navegador.test.mjs  21 pruebas de la aplicación empaquetada, en Chromium real
```

El motor geoespacial y temporal **no se tocó**: vive en `motor/`, con sus 218
pruebas, y esta aplicación lo importa. Aquí no hay ni un cálculo de distancias
ni de traslapes.

## Por qué estas decisiones

**Sin backend.** Todo el procesamiento cabe en el navegador: 460 PMT y 86.000
parejas se resuelven en ~400 ms. Un servidor añadiría hosting, autenticación,
mantenimiento y un lugar donde guardar datos operativos, sin resolver nada que
hoy no esté resuelto. Cuando haga falta compartir resultados entre personas,
esa será la conversación —y entonces habrá un motivo concreto.

**Sin framework y sin CDN.** El tablero anterior cargaba jQuery, Bootstrap,
DataTables, Buttons, Select2, JSZip y html2pdf desde cuatro CDN distintas. En un
equipo corporativo sin salida a internet, o con esos dominios bloqueados, la
página se queda muerta sin decir por qué. Todo lo necesario va dentro del
archivo: ~390 KB, cero peticiones de red para funcionar.

**Un solo archivo.** `dist/Plataforma_PMTs.html` se abre con doble clic, se
copia a una carpeta compartida, se adjunta en un correo o se sirve desde
cualquier sitio. No depende de GitHub Pages ni de ninguna estructura de
carpetas, lo que deja abierta cualquier opción de publicación corporativa.

**Mapa base desacoplado del proveedor.** El mapa base es una capa
intercambiable, no algo escrito a pelo en el código. Hay varios proveedores,
una cadena de respaldo automática y un hueco reservado para un servidor de
teselas de EPM que se configura desde la propia interfaz, sin tocar código
(`PENDIENTE DE VALIDACIÓN CORPORATIVA`: no consta que exista uno). Si ninguno
responde, se dice con todas las letras que **lo que falta es el fondo, no los
datos**.

**Leaflet en vez del mapa de qgis2web.** El mapa de qgis2web es *estático*: para
actualizarlo hay que volver a abrir QGIS y regenerarlo, que es justo el paso que
esta etapa elimina. Además el tablero lo incrustaba en un `<iframe>` y tenía que
preguntar a la API de GitHub en qué carpeta estaba. Con Leaflet el mapa se
dibuja desde los datos recién cargados, y **funciona sin internet**: si las
teselas de fondo no cargan, los trazados se dibujan igual sobre fondo liso y se
avisa. Leaflet va incluido en el repositorio; no se descarga de ninguna CDN.

**Impresión del navegador en vez de html2pdf.** Una dependencia menos, respeta
los saltos de página y desde el diálogo de impresión se guarda como PDF igual.

## Construir

```bash
npm run preparar          # instala dependencias de desarrollo (npm ci)
npm test                  # 229 pruebas del motor + 49 de la aplicación
npm run test:navegador    # 21 pruebas en Chromium real sobre dist/
npm run test:todo         # todo lo anterior
npm run construir:app     # genera dist/Plataforma_PMTs.html
```

Las pruebas de navegador conducen el archivo de `dist/` desde `file://`, igual
que la usuaria: cargan archivos, cruzan filtros, mueven el recorrido temporal,
descargan las exportaciones, generan el informe y **simulan una oficina sin
salida a internet**. La Etapa 2 no las tenía, y por eso se entregaron defectos
que solo se ven al abrir la aplicación.

Durante el desarrollo se trabaja sobre `app/` en módulos separados. El archivo
de `dist/` se genera con el empaquetador propio de `herramientas/construir-app.mjs`,
que convierte los módulos en URLs de tipo blob para que funcionen desde `file://`.

## Lo que esta etapa NO decide

**No se clasifica ninguna relación como «crítica», «alta» o «media».** La
aplicación presenta los hechos separados —a qué distancia están, si llegan a
tocarse, si coinciden en el tiempo— porque esa clasificación es una decisión
operativa que se tomará cuando se puedan ver los casos reales. Tampoco se
resuelve la publicación corporativa ni la autenticación.

## Regla que atraviesa todo el producto

> **«No se encontró relación» y «no se pudo analizar» son cosas distintas y
> nunca se presentan igual.**

Tienen contador propio, color propio, filtro propio y pastilla propia. Un
archivo que falla se nombra y se explica; nunca se convierte en un cero
tranquilizador.
