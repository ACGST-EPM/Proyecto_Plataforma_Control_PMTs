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
  vendor/leaflet/   Leaflet 1.9.4 (BSD-2-Clause), incluido en el repositorio
  test/             37 pruebas de la lógica pura
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
npm run preparar        # instala las dependencias de desarrollo del motor
npm test                # 218 pruebas del motor + 37 de la aplicación
npm run construir:app   # genera dist/Plataforma_PMTs.html
```

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
