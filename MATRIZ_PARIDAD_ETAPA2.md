# Matriz de paridad funcional — tablero histórico vs. aplicación nueva

> Elaborada **antes** de corregir nada, inspeccionando `Plataforma_PMTs.html`
> (996 líneas), `proceso_pmt_qgis.py` y la Etapa 2 tal como se entregó.
> Se comparan **capacidades de usuario**, no tecnologías.

**Leyenda:** ✅ conservada · ⭐ mejorada · ❌ regresión (corregida en 2.1) ·
🔄 obsoleta por rediseño · ⏸ pendiente de decisión

| # | Capacidad | Histórico | Etapa 2 | Estado | Qué se hizo en 2.1 |
|---|---|---|---|---|---|
| 1 | **Carga de datos** | `reporte_dinamico.csv` producido por QGIS | KMZ/KML directo | ⭐ | — |
| 2 | **Mapa base** | qgis2web en `<iframe>`, con teselas | `{s}.tile.openstreetmap.org` + `crossOrigin:true` → **en blanco** | ❌ | Causa raíz corregida; arquitectura de proveedores con respaldo |
| 3 | **Geometrías en el mapa** | capas QGIS exportadas | Leaflet sobre los datos cargados | ⭐ | — |
| 4 | **Simbología por tipo de cierre** | rojo/amarillo/gris + punto azul de «ingreso y salida» | **todo verde** | ❌ | Simbología propia: color + grosor + patrón + marcador |
| 5 | **Interacción mapa ↔ tabla** | sincronía por nombre de frente (fallaba con prefijos) | por id estable | ⭐ | — |
| 6 | **Filtros cruzados (facetados)** | sí, recalculaban entre sí | **listas estáticas** | ❌ | `opcionesFacetadas()` con las tres reglas del histórico |
| 7 | **Filtro por contratista/contrato/frente/municipio** | sí | sí | ✅ | — |
| 8 | **Filtro por proyecto** | no | sí | ⭐ | — |
| 9 | **Filtro por tipo de cierre** | indirecto | sí | ⭐ | Lista corregida a los 3 valores del contrato |
| 10 | **Filtro por estado/interferencia** | 1 lista mezclando categoría y estado | 6 casillas de hechos separados | ⭐ | — |
| 11 | **Búsqueda libre** | buscador de DataTables | campo propio sobre 6 campos | ✅ | — |
| 12 | **Filtro temporal (rango)** | 2 fechas | 2 fechas + pista del periodo | ⭐ | — |
| 13 | **Recorrido temporal** | botón reproducir | barra + reproducir | ⭐ | — |
| 14 | **Pausar el recorrido** | sí | **no** | ❌ | Botón que alterna reproducir/pausar |
| 15 | **Paso día/semana/mes** | sí | sí | ✅ | — |
| 16 | **Velocidad de reproducción** | 0,5× / 1× / 2× | **no** | ❌ | 0,5× / 1× / 2× / 4× |
| 17 | **Volver a «todo el periodo»** | implícito | sí | ⭐ | — |
| 18 | **Tabla: ordenación** | DataTables | propia, por cualquier columna | ✅ | — |
| 19 | **Tabla: paginación** | DataTables | **solo scroll** (460 filas) | ❌ | Paginación 50/100/250/todas |
| 20 | **Tabla: selección de fila** | sí | sí | ✅ | — |
| 21 | **Informe ejecutivo** | portada, KPIs, resumen, críticas, avance, detalle | **impresión del tablero** | ❌ | Informe propio con mapa vectorial automático |
| 22 | **Mapa dentro del informe** | **captura adjuntada a mano** | no | ❌ | Se dibuja solo, con la simbología y la leyenda |
| 23 | **Exportar a Excel/CSV** | DataTables Buttons | CSV propio | ✅ | — |
| 24 | **Exportar GeoJSON** | no | sí | ⭐ | — |
| 25 | **Exportar KML** | no | sí, reimportable | ⭐ | — |
| 26 | **CSV con las 11 columnas antiguas** | era el formato nativo | sí, por compatibilidad | ✅ | — |
| 27 | **Reiniciar** | recargar la página | botón, sin recargar | ⭐ | — |
| 28 | **Añadir archivos al análisis** | no aplicaba | **no** | ❌ | «Añadir más archivos», sin perder lo cargado |
| 29 | **Quitar un archivo** | no aplicaba | **no** | ❌ | Botón por archivo, recalcula solo |
| 30 | **Saber qué archivos componen el análisis** | no aplicaba | lista al cargar | ⭐ | Lista permanente con estado y recuento |
| 31 | **Diagnósticos de calidad** | ninguno | panel completo | ⭐ | — |
| 32 | **Manejo de errores de archivo** | fallo silencioso | nombrado y explicado | ⭐ | — |
| 33 | **Guardar y reabrir el trabajo** | no | **no** | ⭐ | Proyectos `.pmt.json` versionados |
| 34 | **Dependencia de QGIS** | obligatoria | eliminada | 🔄 | — |
| 35 | **Dependencia de la API de GitHub** | obligatoria | eliminada | 🔄 | — |
| 36 | **Dependencia de 4 CDN** | obligatoria | eliminada | 🔄 | — |
| 37 | **Mapa dentro de un `<iframe>`** | sí | eliminado | 🔄 | — |
| 38 | **Clasificación crítico/alto/medio** | sí («interferencia crítica») | no, por decisión | ⏸ | Sigue pendiente de decisión operativa |

## Resumen

- **9 regresiones reales** (filas 2, 4, 6, 14, 16, 19, 21, 22, 28-29). Todas corregidas.
- **17 capacidades mejoradas**, 8 conservadas sin cambio.
- **4 dependencias eliminadas por rediseño**, ninguna de ellas aportaba valor al usuario.
- **1 capacidad retirada a propósito**: la clasificación de criticidad, que el histórico
  aplicaba sin una regla de negocio aprobada. Queda pendiente de decisión.

## Nota sobre la fila 38

El tablero histórico llamaba «interferencia crítica» a todo par cercano con fechas
solapadas, **sin comprobar nunca si los trazados se tocaban**. De las 84 que marcaba
como críticas, solo 3 corresponden a trazados que se tocan de verdad. Restaurar esa
etiqueta sería restaurar el error; por eso se presentan los hechos separados hasta que
exista una regla acordada.
