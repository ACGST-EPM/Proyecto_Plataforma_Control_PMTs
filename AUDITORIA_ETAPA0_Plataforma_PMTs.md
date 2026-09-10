# ETAPA 0 — Auditoría técnica y propuesta de arquitectura
### Plataforma de Control y Articulación de PMTs · Grupo EPM · Centro de Gestión Servicios Técnicos

> **Estado:** informe para revisión y aprobación. **No se implementó nada todavía.**
> **Fecha:** 2026-09-10 · **Alcance:** repositorio `ACGST-EPM/Proyecto_Plataforma_Control_PMTs` (código fuente) y `ACGST-EPM/Control-y-Articulacion-de-PMTs-EPM` (sitio publicado, inspeccionado en solo lectura).
> **Cambios funcionales realizados:** ninguno. Ver §K.2.

---

## Resumen en una página (para leer primero)

La plataforma **funciona y ya produce valor real**: hoy tiene 460 trazados de 12 contratos y genera 84 alertas críticas y 164 de cercanía. Pero la auditoría encontró tres cosas que hay que saber antes de seguir:

1. **Hay datos personales y corporativos de EPM publicados en internet, abiertamente.** El repositorio publicado es **público** y contiene 20 correos `@epm.com.co`, con nombre, área y cargo de cada persona, además de la dirección interna del sitio de SharePoint del equipo. Esto no viene del trabajo de PMTs: viene de dos archivos `crudo_*.json` de otro tablero que está en la misma carpeta. **Es lo más urgente del informe** (Hallazgo C-1).

2. **El motor de análisis no mide lo que dice medir.** La capa se llama "CERCANÍA (120 m)" pero el umbral real es de **243 m**, y "INTERFERENCIA REAL (CRÍTICA)" no significa que dos obras se crucen: significa que están a menos de 243 m y sus **fechas** se traslapan. Lo verifiqué contra los datos publicados: de las **84 alertas críticas actuales, solo 3 corresponden a trazados que realmente se cruzan**; 16 están a más de 121 m de distancia. Además el traslape se calcula solo por día, ignorando la hora, aunque el KMZ sí trae la hora (Hallazgos C-2, C-3, A-1).

3. **QGIS se puede eliminar, y hay evidencia dura de ello.** Reprogramé el motor completo sin QGIS y sin ninguna librería geoespacial, y **reprodujo exactamente el resultado publicado: 84 interferencias y 164 cercanías**, en **47 milisegundos**. Es decir: el paso manual de QGIS + qgis2web (hoy el cuello de botella de todo el proceso) es reemplazable por código que corre dentro del navegador en menos de un décimo de segundo.

**Recomendación:** una aplicación web **modular, 100 % en el navegador**, que lea los KMZ/KML directamente que usted cargue, haga el análisis en el momento y dibuje el mapa, la tabla y el informe desde un único modelo de datos GeoJSON. Sin QGIS, sin CSV intermedio, sin GitHub, sin CDNs externos. Se entrega como una carpeta de archivos estáticos (o un único `.html` autocontenido) que puede vivir en GitHub Pages hoy y mudarse a un servidor corporativo mañana sin cambiar una línea. La migración se propone en 6 etapas, cada una funcionando por sí sola, con el motor viejo y el nuevo corriendo en paralelo hasta que den el mismo resultado.

---

## A. Estado real encontrado

### A.1 Los dos repositorios

Existen **dos repositorios distintos**, y la documentación solo describe uno:

| Repositorio | Rol real | Visibilidad | Contenido |
|---|---|---|---|
| `ACGST-EPM/Proyecto_Plataforma_Control_PMTs` | Donde trabajamos ahora. **Solo el código fuente.** | pública | 7 archivos, 271 KB |
| `ACGST-EPM/Control-y-Articulacion-de-PMTs-EPM` | **El sitio realmente publicado** (GitHub Pages) | **pública** | 74 archivos, 7,2 MB |

El repositorio de trabajo **no es autosuficiente**: le faltan `reporte_dinamico.csv`, `logo_epm.png/jpg` y el mapa `qgis2web_*`. Si alguien abre `Plataforma_PMTs.html` desde este repositorio, ve el aviso rojo de error y el mapa vacío. La verdad de lo que está en producción está en el otro repositorio.

Además existen otros repositorios del área que comparten estilo y probablemente lógica: `Supervision_Directa_PMTs` y `Control_Integral_PNAs` (no auditados; fuera del alcance que usted definió).

### A.2 Inventario real, archivo por archivo

**Repositorio de trabajo** (`Proyecto_Plataforma_Control_PMTs`):

| Archivo | Líneas | Qué hace realmente |
|---|---|---|
| `Generador_KMZ.html` | 671 | App autocontenida de captura. Base maestra de contratos + mapa Leaflet para dibujar/importar geometría + formulario validado → arma el texto de `<description>` y empaqueta un KMZ con JSZip. |
| `proceso_pmt_qgis.py` | 250 | Motor. Se pega en la Consola Python de QGIS. Lee los `.kmz` de una carpeta fija de Windows, crea 5 capas en memoria, detecta conflictos por pares y exporta `reporte_dinamico.csv` directo a la carpeta del repositorio clonado. |
| `Plataforma_PMTs.html` | 996 | Tablero. Lee el CSV, arma tabla DataTables + filtros Select2 con facetas cruzadas + recorrido temporal + informe PDF. El mapa lo muestra dentro de un `<iframe>` que apunta al export de qgis2web. |
| `contratos_db.json` | 24 | Base maestra: 3 contratos. **Desactualizada**: los datos publicados tienen 12 contratos. |
| `CLAUDE.md` | 5,1 KB | Memoria del proyecto. Correcta, pero incompleta (no menciona el segundo tablero ni el segundo repositorio). |
| `DOCUMENTACION_..._EPM.md` | 129 KB | Documento maestro. **El 85 % de su tamaño es una copia literal del código** de los otros archivos (Anexo A). |
| `README.md` | 1 línea | Dice `# Articulacion_Proyectos`. No corresponde al proyecto. |

**Repositorio publicado**, archivos adicionales que **no están documentados en ninguna parte**:

| Archivo | Tamaño | Qué es |
|---|---|---|
| `Dashboard_Seguimiento_PMTs.html` | 74 KB | **Un segundo tablero, completamente distinto.** Califica el cumplimiento de las inspecciones de PMT en campo con pesos ponderados (los mismos, según sus comentarios, de un reporte de Power BI). Usa Chart.js y PapaParse. |
| `crudo_rutinarios.json` | 987 KB | 228 registros crudos de una lista de SharePoint, extraídos por Power Automate. |
| `crudo_implementacion.json` | 4,0 MB | 580 registros crudos de otra lista de SharePoint. |
| `reporte_dinamico.csv` | 111 KB | 708 filas. La salida real del motor. |
| `qgis2web_2026_09_09-13_37_07_461995/` | 2,0 MB | El mapa exportado: 4 capas GeoJSON + Leaflet y ~20 plugins. |
| `logo_epm.png` | 55 KB | Solo existe el `.png`; el HTML pide primero `.jpg` (falla y hace *fallback*). |

**Hallazgo estructural:** el proyecto real es más grande que el documentado. Hay **dos productos** conviviendo en la misma carpeta publicada (articulación de PMTs y seguimiento de cumplimiento en campo), con dos orígenes de datos distintos y ninguna relación técnica entre ellos salvo compartir el logo y el hosting.

### A.3 Qué contienen los datos publicados hoy

Del `reporte_dinamico.csv` (708 filas):

- **460** filas `Trazado Normal`, **164** `Cercanía`, **84** `Interferencia`.
- **12 contratos** distintos, 311 nombres de frente únicos.
- Municipio: Medellín 333, Itagüí 18, Sabaneta 9, Envigado 2, **"No definido" 98**, "Varios" 248.
- Horario: **Nocturno 329 vs Diurno 131**. Esta proporción es la huella de un error de clasificación, no de la realidad operativa (ver Hallazgo A-2).
- **20 filas exactamente duplicadas** (mismo contrato, frente, fechas y dirección) → hay KMZ repetidos en la carpeta de entrada.
- 148 filas son *revigencias* legítimas del mismo frente (misma clave contrato+frente, distintas fechas). Esto significa que **el nombre del frente no identifica un registro**, y eso rompe la sincronización tabla↔mapa (Hallazgo A-4).
- Duración máxima: **614 días** para un solo PMT. Probablemente un dato mal capturado que nadie detecta porque no hay validación de rangos.

---

## B. Diagrama del flujo actual

```
 ┌─ PROCESO A: ARTICULACIÓN DE PMTs (el documentado) ───────────────────────────┐
 │                                                                              │
 │  Contratista dibuja en Google Earth                                          │
 │            │ KMZ/KML con geometría                                           │
 │            ▼                                                                 │
 │  ╔═══════════════════════════╗   contratos_db.json (fetch, mismo directorio) │
 │  ║  Generador_KMZ.html       ║◄──── localStorage 'pmt_db' (cache por PC)     │
 │  ║  navegador · Leaflet+JSZip║                                               │
 │  ╚═══════════════════════════╝                                               │
 │            │ descarga KMZ estandarizado (nombre = contrato_proyecto.kmz)     │
 │            ▼                                                                 │
 │  ✋ MANUAL: copiar a  C:\Users\lmarinza\PLATAFORMA_PMTs\01_KMZ_Entrada        │
 │            │                                                                 │
 │            ▼                                                                 │
 │  ╔═══════════════════════════╗                                               │
 │  ║  proceso_pmt_qgis.py      ║  ✋ MANUAL: pegar y ejecutar en la Consola     │
 │  ║  QGIS Desktop (PyQGIS)    ║     Python de QGIS                            │
 │  ╚═══════════════════════════╝                                               │
 │       │                    │                                                 │
 │       │ escribe             │ 5 capas en memoria de QGIS                     │
 │       ▼ directo             ▼                                                │
 │  reporte_dinamico.csv   ✋ MANUAL: exportar con qgis2web                      │
 │  (11 columnas)              │  → carpeta qgis2web_AAAA_MM_DD-HH_MM_SS/       │
 │       │                     │     (4 GeoJSON + Leaflet + ~20 plugins)        │
 │       │                     ▼                                                │
 │       │              ✋ MANUAL: copiar la carpeta al repositorio              │
 │       │                     │                                                │
 │       └──────┬──────────────┘                                                │
 │              ▼                                                               │
 │  ✋ MANUAL: GitHub Desktop → Commit → Push                                    │
 │              │                                                               │
 │              ▼                                                               │
 │  ╔═══════════════════════════════════════════════════════════╗               │
 │  ║  GitHub Pages (público)                                   ║               │
 │  ║  Plataforma_PMTs.html                                     ║               │
 │  ║    ├── fetch reporte_dinamico.csv ──► tabla + filtros     ║               │
 │  ║    ├── <iframe> ──► descubre el mapa así:                 ║               │
 │  ║    │      1º ¿existe index.html?                          ║               │
 │  ║    │      2º ¡PREGUNTA A api.github.com! ◄── acoplamiento  ║               │
 │  ║    │      3º ¿existe mapa_qgis.html?                      ║               │
 │  ║    └── syncMap(): entra al iframe y oculta capas por      ║               │
 │  ║        coincidencia de TEXTO del nombre del frente        ║               │
 │  ╚═══════════════════════════════════════════════════════════╝               │
 └──────────────────────────────────────────────────────────────────────────────┘

 ┌─ PROCESO B: SEGUIMIENTO EN CAMPO (no documentado, mismo hosting) ────────────┐
 │  Formulario/Lista SharePoint (epmco.sharepoint.com/teams/PlanSeguimientoPMTObra)│
 │            │ Power Automate ("Obtener elementos")                            │
 │            ▼                                                                 │
 │  crudo_rutinarios.json (228) + crudo_implementacion.json (580)  ⚠ PÚBLICOS   │
 │            │                                                                 │
 │            ▼  Dashboard_Seguimiento_PMTs.html (Chart.js + PapaParse)         │
 └──────────────────────────────────────────────────────────────────────────────┘
```

**Cuenta de pasos manuales del proceso A, de punta a punta: 6.** Cada uno puede olvidarse o hacerse a medias, y ninguno deja rastro de cuándo se hizo.

---

## C. Hallazgos y problemas, por criticidad

### 🔴 CRÍTICO

#### C-1 · Datos personales y corporativos de EPM expuestos en internet
**Dónde:** repositorio publicado (público), archivos `crudo_rutinarios.json` y `crudo_implementacion.json`.
**Qué contiene, verificado:**
- **20 correos corporativos `@epm.com.co`** completos.
- Por cada persona: `DisplayName`, `Email`, `Department`, `JobTitle`. Se exponen 3 áreas de EPM y 3 cargos.
- **818 URLs internas** del tenant, incluyendo la ruta exacta del sitio de equipo: `https://epmco.sharepoint.com/teams/PlanSeguimientoPMTObra/...`
- El esquema interno completo de dos listas de SharePoint (51 y 77 campos con sus nombres internos).
- Claims de identidad de Entra ID en formato `i:0#.f|membership|<correo>`.

**Por qué es crítico:** es información personal de empleados identificables tratada sin base legal visible (Ley 1581 de 2012, habeas data), y es reconocimiento gratuito de la infraestructura interna de EPM (nombre del tenant, sitio de equipo, estructura de listas, correos válidos para *phishing* dirigido). Un repositorio público de GitHub es indexable y clonable; **borrar el archivo no borra el historial de Git**.

**Acción inmediata sugerida (requiere su decisión):** cambiar los dos repositorios a privados o despublicar Pages **hoy**, sacar esos dos JSON, y coordinar con TI/Seguridad la limpieza del historial (`git filter-repo` o recrear el repositorio). Detalle en §I-1.

#### C-2 · El umbral espacial es el doble de lo que dice ser
**Dónde:** `proceso_pmt_qgis.py:158` y `:172`.
```python
lista_frentes.append({'geom': f.geometry().buffer(0.0011, 5), ...})   # a CADA frente
...
if f1['geom'].intersects(f2['geom']):                                 # se comparan los buffers
```
Se le aplica un colchón de 0.0011° a **cada** geometría y luego se pregunta si **los dos colchones** se tocan. Dos colchones se tocan cuando las geometrías originales están a **≤ 2 × 0,0011°**.

Cálculo a la latitud de Medellín (6,26°): 1° de latitud = 110.587 m → 0,0011° = **121,6 m**, pero el umbral efectivo es **243,3 m**. La capa se llama `🔵 CERCANÍA (120m)`.

**Verificado contra los datos publicados:** de las **248 alertas actuales, 74 (30 %) están en la banda 121–243 m**, es decir, fuera del radio que la herramienta declara. De las 84 alertas **críticas**, 16 están a más de 121 m.

*(Nota: la anisotropía grados↔metros, que sí sería un problema serio en latitudes altas, aquí es despreciable: a 6,26° un grado de longitud mide 110.660 m contra 110.587 m de latitud, 0,07 % de diferencia. El problema real es el factor 2, no la proyección.)*

#### C-3 · "INTERFERENCIA REAL" no significa que las obras se crucen
**Dónde:** `proceso_pmt_qgis.py:172-197`.
La única diferencia entre `CERCANÍA ESPACIAL` e `INTERFERENCIA REAL (CRÍTICA)` es **si las fechas se traslapan**. Espacialmente ambas usan exactamente la misma prueba (los buffers se tocan). No existe en ningún punto del código una comprobación de que las geometrías se intersequen de verdad.

**Verificado sobre las 84 críticas publicadas:**

| Distancia real entre los dos frentes | Alertas críticas |
|---|---|
| 0 m (se cruzan físicamente) | **3** |
| ≤ 25 m | 26 |
| 26–120 m | 39 |
| **121–243 m** | **16** |

Solo **3 de 84** (3,6 %) son interferencias físicas. El resto son proximidades de distinto grado, todas etiquetadas igual, todas en naranja, todas en el informe PDF como "ALERTA DE GESTIÓN". El efecto práctico es **fatiga de alarma**: si todo es crítico, nada lo es. Y al revés: un cruce real de dos obras cuyas fechas no coinciden queda archivado como simple "cercanía".

#### C-4 · El producto publicado depende de la API de GitHub para funcionar
**Dónde:** `Plataforma_PMTs.html:527-551`.
Si no encuentra un `index.html` al lado, el tablero **llama a `https://api.github.com/repos/{owner}/{repo}/contents/`** para descubrir cuál es la carpeta `qgis2web_*` más reciente. Deduce `owner` y `repo` del hostname `*.github.io`.

En el repositorio publicado **no hay `index.html` en la raíz**, así que **esta es la ruta que se ejecuta siempre**. Consecuencias:
- Fuera de `github.io` el mapa **no carga nunca** (la función retorna `null` de entrada). Esto bloquea por completo cualquier publicación corporativa.
- La API sin autenticar permite **60 peticiones por hora y por dirección IP** ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). Todos los usuarios de EPM salen por la misma IP corporativa: basta con que ~60 personas abran el tablero en una hora para que a partir de ahí **el mapa deje de cargar sin ningún mensaje de error**.
- El orden de carpetas se decide comparando **textos** de nombres con fecha. Funciona hoy por casualidad del formato; un cambio de formato de qgis2web y carga el mapa equivocado.

### 🟠 ALTO

#### A-1 · El traslape temporal ignora la hora, aunque el dato existe
`extraer_fecha_y_hora()` separa fecha y hora, pero solo la **fecha** llega a `QDate` y al cálculo de traslape (`proceso_pmt_qgis.py:136-137, 183`). La hora se usa únicamente para etiquetar "Diurno/Nocturno". Resultado: un PMT de 06:00–12:00 y otro de 18:00–23:00 **el mismo día** se reportan como interferencia crítica, cuando no coinciden ni un minuto. Es exactamente el caso que la herramienta debería resolver bien.

#### A-2 · La clasificación Diurno/Nocturno está mal
`determinar_horario()` (`:47-55`) marca "Nocturno" si **cualquiera** de las dos horas cae en rango nocturno. Casos reales verificados:

| Inicio | Fin | Resultado del código | Debería ser |
|---|---|---|---|
| 07:00 | 17:00 | Diurno ✓ | Diurno |
| **06:00** | **18:00** | **Nocturno ✗** | Diurno (jornada típica) |
| 08:00 | 22:00 | Nocturno ✗ | Mixto / extendido |
| 00:00 | 23:59 | Nocturno ✗ | 24 horas |
| (sin hora) | 10:00 | Nocturno ✗ | Sin dato |

Esto explica el 72 % de "Nocturno" en los datos publicados (329 de 460). El campo **no es confiable** para decisiones ni para el informe ejecutivo.

#### A-3 · Las filas de "Cercanía" desaparecen al filtrar por fecha
El motor escribe `"N/A"` en `FECHA_INICIO` y `FECHA_FIN` de las 164 filas de cercanía (`:212`). El tablero descarta toda fila sin fechas válidas cuando hay filtro de fechas activo o el recorrido temporal está corriendo (`Plataforma_PMTs.html:596-602`). **Verificado: las 164 filas de cercanía tienen `N/A`.** Es decir: en cuanto la usuaria pone un rango de fechas —lo más natural del mundo— **el 23 % de las alertas se evapora sin aviso**.

#### A-4 · La sincronización tabla↔mapa empareja por subcadena de texto
`syncMap()` (`Plataforma_PMTs.html:426-429`) decide si una geometría se ve así:
```js
frentesActivos.some(f => f.includes(nombreMapa) || nombreMapa.includes(f))
```
**Verificado en los datos reales: hay 26 pares de nombres donde uno es prefijo del otro** (`CLPA ET2 4 1` es prefijo de `CLPA ET2 4 10`, `…11`, `…12`, `…13`). Filtrar por un frente enciende en el mapa hasta cuatro frentes que no se pidieron. Y como 148 filas son revigencias del mismo nombre, el nombre **no puede** ser la llave: falta un identificador único de registro.

#### A-5 · Inyección de HTML desde el CSV hacia el tablero
`Plataforma_PMTs.html:613-616` y el generador de PDF construyen filas con `innerHTML` concatenando los valores del CSV **sin escapar**. El campo `DIRECCION` es texto libre que viene del KMZ del contratista. Un `<img src=x onerror=...>` en una dirección se ejecutaría en el navegador de quien abra el tablero. Hoy no hay ningún caso en los datos (verificado: 0 celdas con `<`, `>` o `&`), pero la puerta está abierta y la entrada la controla un tercero.

#### A-6 · Las geometrías de tipo punto se pierden silenciosamente de la capa maestra
La capa maestra se declara `LineString` (`:64`) y luego se le agregan **todas** las geometrías, puntos incluidos (`:142`). El proveedor de memoria de QGIS rechaza lo que no coincide y `addFeature` falla **sin lanzar error**.
**Verificado:** la capa maestra publicada tiene 427 features (189 TOTAL + 236 PARCIAL + 2 "INGRESO Y SALIDA") frente a 460 filas normales en el CSV. Los **33 faltantes son exactamente los puntos**. Hoy no se nota porque existe la capa aparte `📍 INGRESO Y SALIDA`, que los rescata. Pero si mañana llega un punto con otro tipo de cierre, **desaparece del mapa y nadie se entera**.

#### A-7 · El motor no reporta ningún error
Ni un `try/except` en las 250 líneas. Un KMZ corrupto, con un KML que no se puede abrir o con `description` vacía produce silencio: `QgsVectorLayer` inválido → `getFeatures()` no devuelve nada → ese contrato simplemente **no aparece** en el análisis. No hay conteo de archivos leídos, ni de features procesadas, ni lista de rechazos. Solo imprime `✅ Análisis completado`.

#### A-8 · El mapa usa teselas de Google por una ruta no oficial
`qgis2web_.../index.html:150`: `https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}`. Es un endpoint interno de Google Maps, no la API con licencia. Usarlo contraviene los Términos de Servicio de Google Maps y no es defendible en un despliegue corporativo de EPM. Sustituto directo y sin costo: OpenStreetMap (el generador ya lo usa) o el mapa base del IGAC.

#### A-9 · Cero pruebas, cero validación automática, cero CI
No hay `tests/`, ni `.github/workflows/`, ni linter, ni `.gitignore`, ni `LICENSE`. La única verificación es que la usuaria mire el resultado. Cualquier cambio al motor o al tablero es una apuesta.

#### A-10 · El repositorio de trabajo no puede ejecutarse
Faltan `reporte_dinamico.csv`, `logo_epm.*` y el mapa. Nadie (ni usted, ni yo, ni un futuro colega) puede abrir el tablero desde este repositorio y ver algo. Reproducir el estado de producción exige acceder al otro repositorio, y eso no está escrito en ningún lado.

### 🟡 MEDIO

- **M-1 · 85 % del documento maestro es código copiado.** El Anexo A de `DOCUMENTACION_...md` contiene los tres archivos completos, y hoy son **byte a byte idénticos** a los reales (lo verifiqué con `diff`). Eso es suerte, no proceso: al primer cambio, el documento miente. Debe apuntar al código, no copiarlo.
- **M-2 · `contratos_db.json` del repositorio está desactualizado** (3 contratos vs 12 en producción) y además cada navegador cachea su propia copia en `localStorage`, con prioridad sobre el archivo. Dos personas pueden ver bases distintas.
- **M-3 · `html2pdf` se carga dos veces** (`Plataforma_PMTs.html:13` y `:334`): ~300 KB descargados de más en cada visita.
- **M-4 · Versiones inconsistentes y viejas.** JSZip 3.1.3 en el tablero contra 3.10.1 en el generador. Select2 fijado en `4.1.0-rc.0` (una *release candidate* de 2020) cuando ya existe la 4.1.0 estable, publicada el 2026-05-27.
- **M-5 · 5 CDNs externos distintos** (`cdn.jsdelivr.net`, `cdn.datatables.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `code.jquery.com`) sin `integrity` ni versiones fijadas en algunos casos. Si la red de EPM bloquea uno, la página se rompe a medias y sin mensaje. Y sin CDNs no hay uso sin internet.
- **M-6 · La duración se calcula distinto según la fila.** Trazado normal: `daysTo` (un PMT de un día = **0 días**). Interferencia: `daysTo + 1` (= 1 día). Verificado: 165 filas con duración 0. El PDF luego hace `parseInt(row[10]) || 1`, tapando el síntoma.
- **M-7 · El parser de CSV del tablero es artesanal.** No des-escapa comillas dobles internas (`""` → `"`) y parte por `\n`, así que un salto de línea dentro de un campo entrecomillado rompe la tabla. Hoy funciona (verifiqué las 708 filas contra un parser estándar: coinciden), pero es frágil y sobra: PapaParse ya está en el otro tablero del mismo repositorio.
- **M-8 · Importación de KML incompleta.** `getByLocal(pm,'LineString')[0]` toma **solo la primera** geometría: un `MultiGeometry` o `MultiLineString` de Google Earth pierde el resto sin avisar. Los polígonos se descartan con un `return` mudo, y el mensaje final dice "N importados" sin decir cuántos se ignoraron.
- **M-9 · Sin control de duplicados.** El motor procesa todos los `.kmz` de la carpeta; si un KMZ está dos veces con distinto nombre, todo se cuenta dos veces. Verificado: **20 filas exactamente duplicadas** en producción.
- **M-10 · Análisis O(n²) sin índice espacial.** Hoy son 104.196 pares, irrelevante. A 3.000 frentes serían 4,5 millones con buffers reales de QGIS: minutos.
- **M-11 · `str(f.attribute('Name')) or "Sin Nombre"` es código muerto** (`:127`): `str(None)` devuelve `'None'`, que es *truthy*, así que el respaldo nunca se usa y un frente sin nombre entra al reporte como el texto `None`.
- **M-12 · El nombre del KMZ exportado sale del primer trazado** (`Generador_KMZ.html:568-570`). Si el archivo mezcla contratos, el nombre miente sobre su contenido.
- **M-13 · Filas de interferencia con `MUNICIPIO = "Varios"`** (248 filas) quedan fuera del filtro de municipio, que es justo el filtro que un coordinador de zona usaría primero.
- **M-14 · 98 filas con `MUNICIPIO = "No definido"`** (21 % de los trazados). El campo es opcional en el generador y no se deduce de la geometría, existiendo los límites municipales.

### 🟢 BAJO

- **B-1 · `README.md` dice `# Articulacion_Proyectos`.** No corresponde al proyecto.
- **B-2 · La "clave de administrador" no protege nada** y su valor por defecto (`EPM-PMT-2026`) está escrito en el documento maestro. Verifiqué que el hash SHA-256 del código corresponde a esa clave. La documentación ya es honesta al respecto ("es control de proceso, no seguridad real"), y así debe quedar.
- **B-3 · `crypto.subtle` no existe en contexto no seguro**: abriendo el generador con doble clic (`file://`) la base maestra no se puede desbloquear. Ya está manejado con un `alert`.
- **B-4 · `logo_epm.jpg` no existe**: cada carga hace una petición fallida antes del *fallback* a `.png`.
- **B-5 · Sin `.gitignore`, `LICENSE`, ni convención de commits.** El historial completo son dos commits: "Initial commit" e "Inicio proyecto".
- **B-6 · Las propiedades temporales de QGIS no se exportan.** El motor las configura con esmero (`:215-229`), pero qgis2web no genera control de tiempo: **en el mapa publicado no existe la línea de tiempo**. Ese código solo sirve dentro de QGIS de escritorio.

---

## D. Capacidades que NO debemos perder

Lista de contrato para la migración. Cada punto debe tener una prueba que lo verifique antes de dar por cerrada la etapa correspondiente.

**Captura (Generador)**
1. Base maestra contrato → contratista, proyecto, municipios[], con importar/exportar JSON.
2. Autocompletado: al elegir contrato se llenan contratista y proyecto; el municipio se elige de la lista de ese contrato.
3. Importar geometría desde KMZ/KML de Google Earth **y** dibujar línea o punto sobre el mapa.
4. Relectura de la descripción de un KMZ ya estandarizado para precargar el formulario.
5. Lista cerrada `tipo_cierre`: `total`, `parcial`, `ingreso y salida`.
6. Normalización de fechas, incluido `24:00:00` → `00:00:00` del día siguiente.
7. Protección del separador `|` en textos libres.
8. **Duplicar para nueva vigencia** (clona todo, solo cambian fechas). Es una función muy usada: 148 de 460 registros.
9. Validación previa a exportar, con lista explícita de qué falta en cada trazado.
10. Sugerencia de nombre consecutivo del frente.

**Análisis (Motor)**
11. Detección de conflictos entre frentes de **contratos distintos** (nunca dentro del mismo contrato).
12. Distinción entre conflicto con coincidencia temporal y sin ella.
13. Geometría del área de conflicto, para dibujarla en el mapa.
14. Periodo de coincidencia (inicio y fin del traslape) y su duración en días.
15. Trazados `ingreso y salida` representados como punto (centroide si vienen como línea).
16. Duración de cada trazado.
17. Clasificación de horario (**a corregir**, no a conservar tal cual).

**Visualización (Tablero)**
18. Tabla con las 11 columnas actuales y paginación.
19. Filtros multiselección con **facetas cruzadas jerárquicas**: cada lista se acota por las otras pero nunca por sí misma. Es la pieza más elaborada del tablero y la más fácil de estropear.
20. Filtro por rango de fechas **con regla de cruce de periodo** (una fila pasa si estuvo activa en algún momento de la ventana).
21. Recorrido temporal animado, con paso (día/semana/mes), velocidad y pausa.
22. Mapa con simbología: total rojo, parcial amarillo, ingreso y salida punto azul, cercanía azul, interferencia naranja.
23. Sincronización mapa↔filtros (**a corregir el mecanismo**, a conservar el comportamiento).
24. Exportación a Excel/CSV de lo filtrado.
25. **Informe PDF ejecutivo**: KPIs, resumen, tarjetas de interferencias críticas con agrupación configurable, barras de avance con semáforo de días hábiles, tabla de detalle, imagen del mapa adjuntable, recorte del periodo a la ventana del filtro con nota de vigencia real.
26. Semáforo por días hábiles L-V (>20 verde, 15-20 amarillo, <15 rojo).
27. Marca EPM: verde `#009300`, lima `#b7c200`, naranja `#d56b00`.
28. Enlace directo del tablero al generador.

**Operación**
29. Que una persona no técnica pueda usarlo entero sin terminal y sin instalar nada.
30. Que se pueda publicar copiando archivos.

---

## E. Arquitectura objetivo recomendada

### E.1 La idea en una frase

Una sola aplicación web modular donde usted **arrastra los KMZ y ve el resultado**, con **GeoJSON como único modelo de datos** en memoria, el motor de análisis escrito en JavaScript y ejecutándose en el navegador, y el mapa como una capa más de la misma página (no un `iframe` ajeno).

### E.2 Por qué es viable: la prueba está hecha

Reimplementé el motor completo en 60 líneas, **sin QGIS y sin ninguna librería geoespacial**, y lo corrí contra las geometrías reales publicadas:

```
frentes = 457 · vértices = 1.321 · pares evaluados = 104.196 · distancias calculadas = 294
carga + parseo GeoJSON : 0,005 s
análisis completo      : 0,042 s
RESULTADO: 84 interferencias, 164 cercanías  ←  IDÉNTICO a lo publicado por QGIS
```

Reproducción exacta, en **47 milisegundos**. El filtro por caja envolvente reduce 104.196 pares a 294 cálculos reales. **No hacen falta *web workers* ni índices espaciales a esta escala**, y aún con 10× los datos seguiría siendo instantáneo. Esto convierte "quitar QGIS" de una apuesta a una certeza medida.

### E.3 Diagrama de la arquitectura propuesta

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  UNA SOLA APLICACIÓN WEB — todo ocurre en el navegador                       ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ CAPA 1 · ENTRADA (io/)                                                 │  ║
║  │  • Arrastrar/soltar N archivos .kmz/.kml  ó  carpeta completa          │  ║
║  │  • kmz.js    descomprime el ZIP (fflate)                               │  ║
║  │  • kml.js    KML → GeoJSON (@tmcw/togeojson): Placemark, MultiGeometry,│  ║
║  │              Folder anidado, Point, LineString, Polygon, CDATA         │  ║
║  │  • parse-descripcion.js  lee el formato ` | ` (invariante intacto)     │  ║
║  │  • validate.js  informe por archivo: leídos / OK / con avisos / falla  │  ║
║  └───────────────────────────────┬────────────────────────────────────────┘  ║
║                                  ▼                                           ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ CAPA 2 · MODELO ÚNICO (model/)   ← el corazón del rediseño             │  ║
║  │  FeatureCollection GeoJSON en memoria. Cada Feature:                   │  ║
║  │   { id: <hash estable>,            ← resuelve A-4 (nombres repetidos)  │  ║
║  │     geometry: {...},                                                   │  ║
║  │     properties: { frente, contrato, contratista, proyecto, municipio,  │  ║
║  │                   direccion, tipo_cierre,                              │  ║
║  │                   inicio: <ISO con HORA>, fin: <ISO con HORA>,         │  ║
║  │                   origen_archivo, avisos: [...] } }                    │  ║
║  │  Un solo modelo alimenta mapa, tabla, filtros, PDF y exportaciones.    │  ║
║  └───────────────────────────────┬────────────────────────────────────────┘  ║
║                                  ▼                                           ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ CAPA 3 · MOTOR (engine/)  — puro, sin DOM, 100 % testeable             │  ║
║  │  proyeccion.js  lon/lat → metros locales (equirectangular calibrada    │  ║
║  │                 al centro de los datos; error < 0,1 % en Valle Aburrá) │  ║
║  │  distancia.js   distancia MÍNIMA real segmento-segmento en metros      │  ║
║  │  temporal.js    traslape con FECHA + HORA; jornadas diarias            │  ║
║  │  clasificar.js  3 niveles en vez de 2:                                 │  ║
║  │      ⛔ SOLAPAMIENTO FÍSICO   dist ≤ tolerancia  Y  traslape temporal  │  ║
║  │      🟠 PROXIMIDAD CRÍTICA    dist ≤ umbral(120) Y  traslape temporal  │  ║
║  │      🔵 CERCANÍA INFORMATIVA  dist ≤ umbral(120) SIN traslape          │  ║
║  │      → cada alerta lleva su distancia en metros y sus días de traslape │  ║
║  │  Umbral configurable desde la interfaz. Salida: GeoJSON de alertas.    │  ║
║  └───────────────────────────────┬────────────────────────────────────────┘  ║
║                                  ▼                                           ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ CAPA 4 · INTERFAZ (ui/)  — todos leen del MISMO modelo, sin iframe     │  ║
║  │  mapa.js   Leaflet en la propia página → filtros y mapa siempre        │  ║
║  │            sincronizados por ID, no por texto                          │  ║
║  │  tabla.js · filtros.js (facetas cruzadas, se conserva la lógica)       │  ║
║  │  linea-tiempo.js  (ahora sí mueve el mapa, no solo la tabla)           │  ║
║  │  informe.js  PDF ejecutivo · exportar.js  Excel/CSV/GeoJSON/KMZ        │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ CAPA 5 · PERSISTENCIA (opcional, decisión suya)                        │  ║
║  │  a) Nada: cada sesión se cargan los KMZ. Cero infraestructura.         │  ║
║  │  b) "Guardar proyecto": un archivo .pmt.json con todo el estado, que   │  ║
║  │     se guarda donde usted quiera y se vuelve a cargar. RECOMENDADO.    │  ║
║  │  c) IndexedDB: recordar la última sesión en ese PC.                    │  ║
║  │  d) Backend/SharePoint: solo si aparece la necesidad multiusuario.     │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
        │                                    │
        │ salidas que el usuario descarga    │ el generador de KMZ se integra
        ▼                                    ▼ como una pestaña más de la app
  PDF · Excel · GeoJSON · KMZ           (mismo modelo, mismos contratos)

  QGIS pasa a ser OPCIONAL: se puede seguir abriendo el GeoJSON exportado
  para análisis avanzado, pero deja de ser un paso obligatorio del proceso.
```

### E.4 Qué corre dónde

| Parte | Dónde corre | Necesita |
|---|---|---|
| Leer KMZ/KML, análisis espacio-temporal, mapa, tabla, filtros, PDF, exportaciones | **100 % navegador** | Nada. Ni servidor, ni internet si se empaquetan las librerías. |
| Base de contratos compartida | Archivo `contratos_db.json` junto a la app **o** carga manual | Almacenamiento externo solo si se quiere edición concurrente. |
| Guardar/recuperar el proyecto entre sesiones | Archivo `.pmt.json` que usted guarda | Nada. Una biblioteca de SharePoint/OneDrive sirve como "carpeta compartida" sin ninguna integración técnica. |
| Autenticación real (solo `@epm.com.co`) | **Fuera del navegador, obligatoriamente** | Un servicio de identidad + un servidor que sirva los archivos. Ver §I-2. |
| Ingesta automática de KMZ desde correo o SharePoint | **Backend / Power Automate** | Solo si se decide automatizar la recepción. No es necesario para el objetivo. |

### E.5 Dependencias nuevas propuestas

Solo tres librerías nuevas, y ninguna imprescindible salvo la primera.

| Librería | Versión | Licencia | Para qué | ¿Por qué no hacerlo a mano? | Navegador / corporativo |
|---|---|---|---|---|---|
| **@tmcw/togeojson** | 7.1.2 | BSD-2-Clause | KML → GeoJSON | El KML real trae `MultiGeometry`, carpetas anidadas, `ExtendedData`, CDATA, namespaces y estilos. El parser artesanal actual ya pierde datos (M-8). Esta librería es el estándar de facto (la usa Mapbox/Placemark) y está escrita justo para eso. | Sí, es ESM puro sin dependencias. Se empaqueta local, sin CDN. |
| **fflate** | 0.8.x | MIT | Descomprimir el KMZ (ZIP) | Escribir un descompresor DEFLATE es absurdo. Alternativa: seguir con **JSZip** (MIT), que ya está en el proyecto y funciona. fflate es ~8× más pequeño y rápido, pero **JSZip es la opción de menor riesgo** si se prefiere no cambiar. | Ambas funcionan en navegador. Sugiero **mantener JSZip** en la etapa 1 y evaluar fflate después. |
| **@turf/turf** (módulos sueltos) | 7.4.0 | MIT | Buffers e intersecciones **para dibujar** el polígono del área de conflicto | El cálculo de distancia lo hago yo (60 líneas, exacto, ya probado). Turf hace falta solo para generar la geometría del área de alerta que se pinta en el mapa; hacer un buffer poligonal robusto a mano sí es reinventar la rueda. Importar solo `@turf/buffer` e `@turf/intersect`, no el paquete completo. | Sí. Muy usado y mantenido (última publicación hace ~1 mes). |

**Se conservan** (ya presentes y sin motivo para cambiarlas): Leaflet 1.9.4 (BSD-2), Bootstrap 5.3 (MIT), html2pdf.js (MIT). **A actualizar**: Select2 a 4.1.0 estable, JSZip a 3.10.1 en ambos archivos.

**Deliberadamente NO propongo**: React/Vue (añaden un build complejo sin resolver ningún problema real aquí), MapLibre GL (más potente que Leaflet, pero cambiar de motor de mapas no aporta a los objetivos y sí riesgo), proj4js (la proyección local resuelve el caso con 15 líneas verificables), DuckDB-WASM o similares (sobredimensionado para 500 registros), ni un backend en esta etapa.

**Decisión de empaquetado.** Los módulos ES no se pueden abrir con doble clic desde `file://` (el navegador los bloquea). Propongo generar **dos salidas** desde el mismo código: (a) la carpeta modular, para mantenimiento y para servir desde cualquier servidor; y (b) **un único `.html` autocontenido** con todo adentro, que sí funciona con doble clic, sin internet y sin instalar nada. Yo ejecuto el empaquetado aquí y le entrego el archivo listo: usted no necesita instalar herramientas.

---

## F. Qué conservar, transformar o eliminar

| Componente actual | Decisión | Razón |
|---|---|---|
| Formato de `<description>` con ` \| ` | ✅ **Conservar tal cual** | Es el contrato entre el generador y el motor, y ya hay KMZ en circulación con ese formato. Cambiarlo no aporta nada y rompe el histórico. Se le añade, opcionalmente y sin quitar nada, un bloque `ExtendedData` con los mismos datos en formato máquina. |
| Lista cerrada `tipo_cierre` | ✅ Conservar | Invariante de negocio. |
| `contratos_db.json` (esquema) | ✅ Conservar el esquema, actualizar el contenido | Los 12 contratos reales deben estar en el repositorio, no solo en el `localStorage` de un PC. |
| Marca EPM y sistema visual | ✅ Conservar | Reconocible y correcto. |
| Facetas cruzadas jerárquicas de los filtros | ✅ Conservar la lógica, migrar a módulo | Es lo mejor construido del tablero. Se extrae tal cual a `ui/filtros.js` y se le escriben pruebas. |
| Informe PDF ejecutivo | ✅ Conservar, alimentar del nuevo modelo | Funciona y es el entregable que ve la dirección. |
| Semáforo de días hábiles | ✅ Conservar, hacer configurables los umbrales | 20/15 días están fijos en el código. |
| `Generador_KMZ.html` | 🔄 **Transformar** en un módulo de la app | Su lógica es buena. Deja de ser un archivo aparte y pasa a ser la pestaña "Capturar", compartiendo modelo y base de contratos con el resto. Se mantiene además una salida independiente para el contratista externo. |
| Motor `proceso_pmt_qgis.py` | 🔄 **Transformar** en `engine/` JavaScript | Ya está demostrado que se puede (§E.2). El `.py` **se conserva congelado** durante toda la migración como oráculo de comparación (§H). |
| Tablero `Plataforma_PMTs.html` | 🔄 **Transformar**: partir en módulos | 996 líneas de HTML+CSS+JS mezclados. Se separa; se conserva el comportamiento. |
| Mapa por `<iframe>` + qgis2web | ❌ **Eliminar** | Origen de C-4 (API de GitHub), A-4 (sincronía por texto), A-8 (teselas de Google), B-6 (línea de tiempo que no existe) y 2 MB de plugins de los que se usan tres. El mapa pasa a ser Leaflet en la propia página. |
| `reporte_dinamico.csv` como interfaz entre piezas | ❌ **Eliminar como interfaz** | Es la causa de A-3 (fechas `N/A`), A-5 (inyección), M-6 (duraciones) y M-7 (parser). Se conserva como **formato de exportación** para quien lo pida. |
| Detección de mapa vía `api.github.com` | ❌ **Eliminar** | Bloquea toda publicación fuera de GitHub. |
| Ruta `BASE = r"C:\Users\lmarinza\..."` | ❌ **Eliminar** | La entrada pasa a ser "los archivos que usted arrastre". |
| Clave SHA-256 en el cliente | ❌ **Eliminar** como si fuera seguridad; ⚠️ conservar como aviso de proceso | No protege nada y da falsa sensación de control. La seguridad real es §I-2. |
| Anexo A del documento maestro | ❌ **Eliminar** | Duplicado exacto del código (M-1). El documento debe enlazar, no copiar. |
| `crudo_*.json` en repositorio público | ❌ **Eliminar y limpiar historial** | Hallazgo C-1. |
| `Dashboard_Seguimiento_PMTs.html` | ⏸️ **Fuera de alcance, pero decidir** | Es un producto distinto que comparte hosting. O se integra conscientemente, o se separa a su propio repositorio. Hoy solo genera confusión y riesgo compartido. |

---

## G. Plan de migración por etapas

Principio rector: **nada de reescritura de golpe**. En cada etapa el sistema queda funcionando y usted puede parar ahí sin haber perdido nada. Las etapas 1 y 2 son las que resuelven el riesgo; el resto es mejora ordenada.

> **Etapa 0.5 — Contención (horas, antes que nada)**
> Sacar los `crudo_*.json`, decidir visibilidad de los repositorios, coordinar limpieza del historial con TI. No toca código funcional. **Requiere su decisión, no la mía.** (§I-1)

> **Etapa 1 — El motor en el navegador, en paralelo y sin tocar nada**
> Se crea `engine/` en JavaScript con proyección métrica, distancia real, traslape con hora y clasificación en 3 niveles. Se añade una página `verificador.html` que carga los mismos KMZ y **muestra lado a lado** lo que dice QGIS y lo que dice el motor nuevo, con la diferencia explicada caso por caso.
> *Nada de lo actual se modifica.* Al terminar, usted decide si el motor nuevo es confiable, con evidencia en la mano.
> **Entregable:** motor + verificador + informe de diferencias.

> **Etapa 2 — Carga de KMZ desde la interfaz**
> Arrastrar y soltar uno o varios KMZ/KML → lectura → validación con informe por archivo → modelo GeoJSON → motor → resultados en pantalla.
> **En este punto QGIS deja de ser necesario.** De 6 pasos manuales se pasa a 1.
> **Entregable:** app funcional que sustituye al motor; el tablero viejo sigue existiendo hasta la etapa 4.

> **Etapa 3 — Mapa propio, sin `iframe` ni GitHub**
> Leaflet dentro de la página, dibujando del mismo modelo. Se elimina la llamada a `api.github.com` y las teselas de Google. Sincronización por ID.
> **Entregable:** mapa integrado; el producto ya es publicable fuera de GitHub.

> **Etapa 4 — Tablero, filtros, línea de tiempo e informe sobre el nuevo modelo**
> Se migran facetas cruzadas, filtros de fecha, recorrido temporal, exportaciones y PDF. Se verifica la lista de §D punto por punto.
> **Entregable:** un solo producto integrado. Aquí se jubila `Plataforma_PMTs.html`.

> **Etapa 5 — Captura integrada y calidad de datos**
> El generador pasa a ser una pestaña. Se corrigen horario (A-2), duración (M-6), duplicados (M-9), municipio automático por geometría (M-14) y validación de rangos.
> **Entregable:** ciclo completo capturar → analizar → publicar en una sola herramienta.

> **Etapa 6 — Empaquetado y preparación corporativa**
> Librerías locales (sin CDN), archivo único autocontenido, rutas relativas, sin llamadas externas obligatorias, documentación de despliegue. Aquí se conversa con TI con un producto real en la mano.
> **Entregable:** carpeta portable + `.html` único.

**Puertas de calidad entre etapas:** no se pasa de una etapa a la siguiente sin que (1) las pruebas de la etapa pasen, (2) la lista de §D siga completa, y (3) usted lo haya visto funcionando.

---

## H. Estrategia de pruebas

### H.1 El oráculo: comparar el motor nuevo contra QGIS

Esta es la pieza clave y **ya está validada**. En esta auditoría reproduje el motor de QGIS con código independiente y obtuve **exactamente** su salida publicada (84 y 164). Eso demuestra que la comparación automática es posible y fiable.

El arnés de comparación funciona así:

```
      Los MISMOS KMZ de 01_KMZ_Entrada
                │
       ┌────────┴────────┐
       ▼                 ▼
  QGIS (congelado)   Motor nuevo (JS)
       │                 │
  CSV + GeoJSON      GeoJSON de alertas
       │                 │
       └────────┬────────┘
                ▼
        comparador.js
     empareja por (contrato_A, frente_A, vigencia_A,
                   contrato_B, frente_B, vigencia_B)
                ▼
   ┌────────────────────────────────────────────┐
   │ IGUALES     → verde, sin acción            │
   │ SOLO QGIS   → ¿el nuevo dejó de ver algo?  │
   │ SOLO NUEVO  → ¿el viejo se lo perdía?      │
   │ DISTINTA    → con la distancia real en m y │
   │ CLASE         las horas, para decidir cuál │
   │               tiene razón                  │
   └────────────────────────────────────────────┘
```

**Lo importante:** las diferencias **no** son fallos del motor nuevo. Son, en su mayoría, correcciones esperadas. Ya sé cuáles serán y cuántas:

| Diferencia esperada | Cantidad prevista | Causa |
|---|---|---|
| Alertas que desaparecen por estar a >120 m reales | **74 de 248** | Corrección de C-2 (umbral 243 → 120 m real) |
| Críticas que bajan a "proximidad" por no cruzarse | **81 de 84** | Corrección de C-3 (solo 3 son solapamiento físico) |
| Alertas que desaparecen por no coincidir en hora | por determinar | Corrección de A-1 |

Cada una debe revisarse **con usted** antes de aceptarla: son cambios en el criterio de alerta, y ese criterio es una decisión operativa, no técnica.

### H.2 Los cuatro niveles de prueba

1. **Unitarias del motor** (automáticas, sin navegador): proyección contra distancias conocidas de Medellín; distancia segmento-segmento contra casos calculados a mano (paralelas, cruce, punto-línea, extremos); traslape temporal con los 13 casos frontera (mismo día distinta hora, extremos tocándose, fechas invertidas, fechas ausentes, `24:00:00`); clasificación de horario con la tabla de A-2.
2. **De lectura de archivos** (con KMZ de laboratorio que hay que construir): KMZ normal · KML suelto · `MultiGeometry` · carpetas anidadas · descripción en CDATA HTML de Google Earth · descripción vacía · sin `<name>` · coordenadas con altitud · coordenadas separadas por saltos de línea · ZIP con varios `.kml` · archivo corrupto · KMZ con 500 placemarks. **Ninguno debe romper la aplicación**; todos deben producir un aviso legible.
3. **De regresión funcional**: la lista de 30 capacidades de §D convertida en lista de verificación ejecutable, revisada al cierre de cada etapa.
4. **Con datos reales**: los KMZ de producción (necesito que me los facilite, §K.4) contra la salida publicada actual.

### H.3 Lo que hace falta y no tengo

Para montar el arnés necesito la carpeta `01_KMZ_Entrada`. Sin ella puedo comparar contra el GeoJSON publicado (que ya usé y funciona), pero no puedo probar la **lectura** de los KMZ reales, que es justo la parte nueva.

---

## I. Riesgos y decisiones que requieren su participación

### I-1 · URGENTE — Exposición de datos personales (Hallazgo C-1)
**No puedo decidir esto por usted y no debo tocarlo sin su instrucción.**
Los repositorios son **públicos** y contienen correos, nombres, áreas, cargos y rutas internas de SharePoint de 20 personas de EPM.
Opciones, en orden de rapidez:
1. **Ahora mismo:** GitHub → Settings → Pages → *Unpublish site* en el repositorio publicado. Deja la URL en 404 sin desconfigurar nada. Los archivos siguen accesibles en el repositorio.
2. **Hoy:** cambiar ambos repositorios a **privados**. Ojo: eso apaga GitHub Pages en cuentas sin plan de pago; hay que asumir que la plataforma queda fuera de línea hasta resolver el hosting.
3. **Esta semana, con TI:** borrar los `crudo_*.json`, **reescribir el historial de Git** (borrarlos del último commit no los borra del pasado) y reportar el incidente por el canal que corresponda en EPM.

**Mi recomendación:** hacer (1) hoy mismo, hablar con TI/Seguridad esta semana, y no reanudar la publicación hasta que el historial esté limpio. **Necesito su visto bueno antes de tocar cualquier cosa en el repositorio publicado.**

### I-2 · Autenticación real: qué es posible y qué no
Separado como usted pidió. **Nada de lo siguiente está confirmado como habilitado para este uso en EPM**, salvo lo marcado.

**1) Técnicamente posible** (independiente de EPM):
- Servir la aplicación desde cualquier servidor web y ponerle un control de acceso delante. La app no cambia.
- Cloudflare Access con *One-time PIN*: envía un código de un solo uso al correo y solo deja pasar dominios aprobados. Es lo más parecido a lo que usted pidió.
- Azure Static Web Apps con inicio de sesión de Entra ID (cuenta corporativa, con MFA).
- SharePoint/Teams como contenedor de archivos con permisos del propio tenant.

**2) Requiere licencia o plan de pago:**
- Restringir Azure Static Web Apps **al tenant de EPM** exige el plan **Standard** (de pago). El gratuito no permite restringir por tenant.
- Power BI Pro / Premium si se quisiera llevar los tableros allí.
- Conectores premium de Power Automate/Power Apps, si se automatizara la ingesta.

**3) Requiere habilitación o permiso de TI de EPM:**
- Un **dominio propio** para poner el sitio detrás de Cloudflare o de un servicio corporativo.
- **Registro de aplicación en Entra ID** y consentimiento de administrador.
- Una **suscripción de Azure** con centro de costos asignado.
- Autorización de gobierno de datos para alojar información de PMT fuera de la infraestructura de EPM.
- Permiso para hospedar contenido HTML propio en SharePoint (varias configuraciones de SharePoint Online **no renderizan** archivos `.html` subidos a bibliotecas; los descargan). **Esto hay que verificarlo con una prueba real antes de comprometerse con esa ruta.**

**4) Confirmado para EPM, con evidencia encontrada en este mismo repositorio:**
- **Microsoft 365 / SharePoint Online activo**: tenant `epmco.sharepoint.com`, con el sitio de equipo `/teams/PlanSeguimientoPMTObra`. Evidencia: 818 URLs internas en los `crudo_*.json`.
- **Listas de SharePoint en uso productivo**: dos listas con 51 y 77 campos, con datos reales de 2026.
- **Identidades Entra ID**: claims `i:0#.f|membership|<correo>@epm.com.co`. Entra ID existe y autentica a estas personas.
- **Power Automate en uso**: los archivos tienen la forma exacta de la salida de la acción "Obtener elementos" de SharePoint (`@odata.etag`, `ItemInternalId`), y el código de `Dashboard_Seguimiento_PMTs.html` lo dice explícitamente. *Evidencia fuerte de que alguien del área ya ejecuta flujos; no es confirmación de licencias premium ni de permiso para un flujo nuevo.*
- **Power BI mencionado**: los comentarios del código dicen que los pesos vienen "del reporte Power BI". *Es una mención, no una confirmación de licenciamiento para este uso.*

**Lo que esto cambia:** ya sabemos que la ruta Microsoft **no parte de cero** en esta área. Eso hace mucho más plausible la opción B (Entra ID) de lo que suponía la documentación. Pero sigue sin cerrarse la decisión, como usted pidió: hace falta hablar con TI.

**Requisitos técnicos que la app debe cumplir desde ya** para no cerrarse ninguna puerta (esto sí lo puedo garantizar por diseño):
- Cero llamadas obligatorias a servicios externos (fuera la API de GitHub, fuera los CDNs, fuera las teselas de Google).
- Solo rutas relativas: que funcione igual en `/`, en `/sitio/subcarpeta/` o en `file://`.
- Sin cookies ni almacenamiento imprescindible; que un cierre de sesión no pierda nada crítico.
- Todo el contenido servible como archivos estáticos, sin proceso de servidor.
- Sin secretos en el código del cliente. Nunca.

### I-3 · Decisiones operativas que solo usted puede tomar

| # | Decisión | Por qué importa | Mi recomendación |
|---|---|---|---|
| 1 | **¿Cuál es el umbral de cercanía correcto?** ¿120 m como dice el nombre, 243 m como funciona hoy, u otro? | Cambia cuántas alertas ve. Al pasar a 120 m reales desaparecen 74 de las 248 actuales. | 120 m, y que sea **configurable en pantalla** para poder subirlo puntualmente. |
| 2 | **¿Qué merece ser "crítico"?** ¿Solo el cruce físico, o también la proximidad con fechas traslapadas? | Hoy 84 alertas críticas; con el criterio estricto serían 3. | Tres niveles (§E.3): crítico el cruce físico, alto la proximidad con traslape, informativa la cercanía. Ningún dato se pierde, se ordena. |
| 3 | **¿La hora cuenta para el traslape?** | Dos obras el mismo día en jornadas distintas: ¿es conflicto o no? | Sí debe contar, pero con un margen (p. ej. 2 h) por desplazamientos y montaje. |
| 4 | **¿Se conservan los nombres actuales de las categorías** (`INTERFERENCIA REAL (CRÍTICA)`, `CERCANÍA ESPACIAL`)? | Si hay informes o comunicaciones con esos términos, cambiarlos confunde. | Conservar los nombres si ya circulan, y añadir el nivel nuevo. Usted sabe si ya circulan. |
| 5 | **¿Dónde vivirá el producto final?** GitHub Pages provisional, carpeta compartida, SharePoint, servidor de EPM. | Determina la etapa 6 y la conversación con TI. | Diseñar para que dé igual, y decidir al final con TI. |
| 6 | **¿Qué hacemos con `Dashboard_Seguimiento_PMTs.html`?** | Comparte hosting y riesgo, no está documentado y no es parte de este proyecto. | Separarlo a su propio repositorio, privado. |
| 7 | **¿Un contrato puede tener varios proyectos?** | El generador asume uno solo; es una limitación conocida. | Levantar la restricción en la etapa 5 si es real en su operación. |
| 8 | **¿Hay que soportar polígonos?** (hoy solo punto y línea) | Cambia el modelo de datos y el motor. | Decidirlo antes de la etapa 1: añadirlo después cuesta más. |

### I-4 · Riesgos del proyecto y cómo los mitigo

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El motor nuevo da resultados distintos y se pierde confianza | Alto | El verificador de la etapa 1 muestra cada diferencia explicada **antes** de cambiar nada. QGIS queda congelado como respaldo hasta la etapa 4. |
| Se pierde una función en la migración | Alto | Lista de 30 capacidades (§D) verificada en cada etapa. |
| Un KMZ raro rompe la aplicación en plena reunión | Medio | Batería de KMZ de laboratorio (§H.2). Regla de diseño: **un archivo malo nunca tumba la app**, produce un aviso. |
| El proyecto queda a medias y usted se queda sin herramienta | Alto | Cada etapa deja el sistema funcionando. Se puede parar en cualquiera. |
| Mantenimiento futuro por otra persona | Medio | Módulos pequeños, pruebas automáticas, documentación que enlaza en vez de copiar. |
| Rendimiento al crecer | Bajo | Medido: 47 ms con los datos reales. Margen de sobra. |

---

## J. Primera etapa que propongo tras esta auditoría

**Etapa 1: motor de análisis en JavaScript, en paralelo, con verificador comparativo.**

No toca ni un archivo de los que hoy funcionan.

**Qué construiría:**

1. `src/engine/proyeccion.js` — conversión lon/lat a metros locales calibrada al centro de los datos, con sus pruebas contra distancias conocidas.
2. `src/engine/distancia.js` — distancia mínima real entre geometrías (segmento-segmento), en metros.
3. `src/engine/temporal.js` — traslape con fecha **y hora**, con margen configurable.
4. `src/engine/clasificar.js` — los tres niveles, con umbral configurable, devolviendo distancia en metros y días de traslape en cada alerta.
5. `src/engine/index.js` — orquestador: entra un `FeatureCollection`, sale un `FeatureCollection` de alertas.
6. `tests/` — pruebas unitarias de los cuatro módulos, ejecutables con un comando.
7. `verificador.html` — página que carga el GeoJSON publicado (o los KMZ que usted me dé), corre el motor nuevo, lo compara con la salida de QGIS y muestra una tabla de diferencias con la explicación de cada una.
8. `INFORME_ETAPA1.md` — qué cambió, por qué, y las decisiones de §I-3 que quedan pendientes con los números concretos en la mano.

**Lo que usted vería al final:** una página donde comprueba, alerta por alerta, en qué coinciden el motor viejo y el nuevo y en qué no, con la distancia real en metros de cada caso. Con eso decide si seguimos.

**Lo que necesito de usted para empezar:**
- Su respuesta a §I-1 (el tema de los datos expuestos), que va primero que todo lo demás.
- Idealmente, la carpeta `01_KMZ_Entrada` comprimida (§K.4). Sin ella igual puedo trabajar con el GeoJSON publicado, pero con menos cobertura.
- Sus respuestas a las decisiones 1, 2, 3 y 8 de §I-3. Las demás pueden esperar.

**Me detengo aquí, como pidió.** No empiezo la etapa 1 hasta que revise y apruebe este informe.

---

## K. Anexos de trazabilidad

### K.1 Archivos inspeccionados

**`ACGST-EPM/Proyecto_Plataforma_Control_PMTs` (rama `claude/compassionate-pascal-l0n57t`, commit `06837cb`) — 7/7 archivos, íntegros:**
`CLAUDE.md` · `DOCUMENTACION_Plataforma_PMTs_EPM.md` (2.253 líneas) · `Generador_KMZ.html` (671) · `Plataforma_PMTs.html` (996) · `proceso_pmt_qgis.py` (250) · `contratos_db.json` · `README.md`

**`ACGST-EPM/Control-y-Articulacion-de-PMTs-EPM` (commit `34a5811`, clon superficial de solo lectura) — 74 archivos:**
`reporte_dinamico.csv` (708 filas, analizado completo) · `Dashboard_Seguimiento_PMTs.html` (revisado: dependencias y canal de datos) · `crudo_rutinarios.json` (228 registros) · `crudo_implementacion.json` (580) · `qgis2web_2026_09_09-13_37_07_461995/index.html` y sus 4 capas GeoJSON (`GESTINPMTMAESTRA_1`, `INGRESOYSALIDA_2`, `CERCANA120m_3`, `INTERFERENCIAREAL_4`, analizadas completas) · `logo_epm.png` · el resto de plugins y recursos, inventariados sin leer línea a línea.

### K.2 Cambios realizados en el repositorio

**Ninguno funcional.** Ni una línea de código, configuración o dato del proyecto fue modificada.

Se añaden dos archivos, ambos sin efecto sobre el funcionamiento:
- **`AUDITORIA_ETAPA0_Plataforma_PMTs.md`** — este informe. Es documentación.
- **`.gitignore`** — al verificar la sintaxis de `proceso_pmt_qgis.py`, Python dejó una carpeta temporal `__pycache__/`. La borré y añadí este archivo para que esos temporales no vuelvan a colarse al repositorio. Resuelve además parte del hallazgo B-5.

**Cambios incidentales fuera del proyecto**, todos en carpetas temporales de esta sesión y sin efecto sobre el repositorio:
- Clon de solo lectura de `Control-y-Articulacion-de-PMTs-EPM` en `/home/user/acgst-epm/` (no se puede escribir en él desde esta sesión).
- Scripts de verificación y un KMZ de prueba en la carpeta temporal.

### K.3 Comandos y pruebas ejecutados

| # | Qué verifiqué | Cómo | Resultado |
|---|---|---|---|
| 1 | Sintaxis Python del motor | `python3 -m py_compile` | Válida |
| 2 | Sintaxis JavaScript de ambos HTML | Extracción de `<script>` + `node --check` | Válida en los dos |
| 3 | JSON de contratos | `json.load` | Válido, 3 contratos |
| 4 | ¿El Anexo A coincide con el código real? | `diff` de los 3 bloques | Idénticos byte a byte (M-1) |
| 5 | Metros por grado a 6,26° y umbral efectivo | Fórmulas geodésicas | 121,6 m por buffer → **243,3 m efectivos** (C-2) |
| 6 | Clave de administrador | SHA-256 de candidatas | `EPM-PMT-2026` confirmada (B-2) |
| 7 | Clasificación de horario | Reimplementación + 7 casos | 5 de 7 mal clasificados (A-2) |
| 8 | Ida y vuelta del formato KMZ | Generé un KMZ con la lógica del generador y lo leí con la del motor | Correcto; los datos sobreviven |
| 9 | Caso de 176,9 m con fechas traslapadas | KMZ sintético | Marcado "INTERFERENCIA REAL (CRÍTICA)" pese a estar a 177 m y en jornadas distintas |
| 10 | Calidad del CSV publicado | Análisis de las 708 filas | 20 duplicados, 164 cercanías sin fecha, 98 sin municipio, 165 con duración 0 |
| 11 | Parser CSV del tablero vs estándar | Reimplementación + comparación fila a fila | Coinciden hoy; frágil por diseño (M-7) |
| 12 | Sincronía CSV ↔ mapa | Cruce de claves | Consistentes en esta instantánea; **no hay nada que lo garantice** |
| 13 | Pérdida de geometrías tipo punto | Conteo por tipo de cierre | 427 en la capa maestra vs 460 en el CSV; faltan exactamente los 33 puntos (A-6) |
| 14 | Nombres de frente ambiguos | Búsqueda de prefijos entre 311 nombres | **26 pares** rompen `syncMap` (A-4) |
| 15 | **Reproducción completa del motor sin QGIS** | Reimplementación independiente contra las geometrías publicadas | **84 interferencias y 164 cercanías: idéntico** |
| 16 | Distancia real de cada alerta | Distancia mínima segmento-segmento | Solo **3 de 84** críticas son cruces físicos; 74 de 248 alertas están a >120 m (C-3) |
| 17 | Rendimiento del motor nuevo | Cronometrado sobre 457 frentes | **47 ms** en total (§E.2) |
| 18 | Datos personales publicados | Extracción de patrones sobre los `crudo_*.json` | 20 correos, 818 URLs internas, 3 áreas, 3 cargos (C-1) |
| 19 | Dependencias externas | Inventario de hosts en los 3 HTML | 5 CDNs + `api.github.com` (C-4, M-5) |
| 20 | Estado actual de las librerías | Consulta web | Turf 7.4.0 (MIT), togeojson 7.1.2 (BSD-2), Select2 4.1.0 estable desde 2026-05-27 |
| 21 | Límite de la API de GitHub | Documentación oficial | 60 peticiones/hora **por IP** sin autenticar (C-4) |

### K.4 Lo que NO pude verificar

1. **Los KMZ reales de entrada.** No tengo `01_KMZ_Entrada`. Todo lo relativo a la **lectura** de KMZ está inferido del código y de un KMZ que fabriqué yo. Es la pieza que más necesito para la etapa 1.
2. **La ejecución real en QGIS.** No hay QGIS en este entorno. La lógica del motor la verifiqué **por reproducción**, y esa reproducción coincide exactamente con la salida publicada, lo cual es una validación fuerte pero indirecta.
3. **Comportamiento real en el navegador.** No abrí las páginas en un navegador. La sintaxis está verificada y la lógica leída; el comportamiento visual e interactivo, no.
4. **El sitio publicado en vivo.** No accedí a la URL de GitHub Pages, solo a los archivos del repositorio.
5. **Qué tiene EPM licenciado y habilitado.** Solo puedo afirmar lo de §I-2 punto 4, que es lo que aparece en los datos. Todo lo demás requiere a TI.
6. **Si SharePoint Online de EPM renderiza HTML propio.** Depende de la configuración del tenant. Hay que probarlo.
7. **`Dashboard_Seguimiento_PMTs.html` a fondo.** Lo revisé lo justo para entender su canal de datos y detectar C-1. No es parte de este alcance.
8. **Si los 20 duplicados y el PMT de 614 días son errores de dato o realidad operativa.** Solo usted lo sabe.

### K.5 Hipótesis que aún necesitan evidencia

| # | Hipótesis | En qué me baso | Cómo confirmarla |
|---|---|---|---|
| H1 | Los 33 puntos se pierden de la capa maestra por incompatibilidad de tipo de geometría | 189+236+2 = 427 features, y 460−427 = 33, exactamente el número de puntos | Ejecutar el motor en QGIS y mirar el valor de retorno de `addFeature` |
| H2 | El 72 % de "Nocturno" se explica por el error de `determinar_horario` y no por la operación real | La función marca Nocturno en 5 de 7 casos habituales | Contrastar con las horas reales de los KMZ |
| H3 | Los 20 duplicados vienen de KMZ repetidos en la carpeta de entrada | Filas idénticas en todos sus campos | Listar la carpeta `01_KMZ_Entrada` |
| H4 | El PMT de 614 días es un error de captura | Fuera de todo rango razonable para un PMT | Revisarlo con el contratista |
| H5 | Las descripciones de Google Earth pueden venir como HTML en CDATA y romper la lectura | Comportamiento estándar de Google Earth Pro | Revisar los KMZ reales |
| H6 | El área ya ejecuta flujos de Power Automate sobre SharePoint | Forma OData de los datos + comentarios del código | Preguntar en el área quién administra ese flujo |
| H7 | La app empaquetada en un `.html` único funcionaría desde una biblioteca de SharePoint | Es como funcionan los archivos estáticos en general | Subir un HTML de prueba y abrirlo |

---

*Informe de auditoría · Etapa 0 · Plataforma de Control y Articulación de PMTs · Grupo EPM.*
*Sin cambios funcionales. Pendiente de revisión y aprobación antes de iniciar la Etapa 1.*
