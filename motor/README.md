# Motor geoespacial y temporal de PMTs — Etapa 1

> Corre **en paralelo** al motor de QGIS. No lo sustituye, no lo modifica y no toca el tablero actual.
> `proceso_pmt_qgis.py` permanece congelado como referencia.

## Para qué sirve

Calcula, para cada pareja de frentes de **contratos distintos**, los hechos que hacen falta para
decidir si hay conflicto — **sin decidirlo por nadie**:

| Hecho | Qué responde |
|---|---|
| `distanciaMetros` | distancia mínima real entre las geometrías, en metros |
| `intersecanFisicamente` | si los trazados se tocan de verdad (distancia exactamente 0) |
| `dentroDelUmbral` | si esa distancia cae dentro del umbral configurado |
| `vigenciaA` / `vigenciaB` | inicio y fin completos de cada vigencia, con hora |
| `hayTraslapeTemporal` | si coinciden en el tiempo, con fecha **y** hora |
| `traslapeInicio` / `traslapeFin` / `traslapeDias` / `traslapeHoras` | cuándo y cuánto coinciden |
| `vigenciasContiguas` | si una termina justo cuando la otra empieza |
| `contratoA` / `contratoB`, `idA` / `idB` | a quién pertenece cada lado |
| `geometriaA` / `geometriaB` | las geometrías implicadas |
| `avisos` | problemas de calidad heredados de cualquiera de los dos registros |

**No hay ninguna regla de criticidad dentro del cálculo.** Las combinaciones posibles se pueden
etiquetar con `src/nucleo/provisional.js`, pero todas sus etiquetas llevan el prefijo `PROVISIONAL:`
y viven fuera del motor, porque esa decisión es operacional y aún no está tomada.

## Cómo se usa

### La forma sencilla: el verificador

Abra **`dist/verificador.html`** con doble clic. No necesita internet, ni servidor, ni instalar nada.
Arrastre los KMZ, pulse *Calcular y comparar* y verá los dos motores lado a lado.

### Desde la línea de comandos

```bash
npm install                                   # solo para desarrollo y pruebas
npm test                                      # 109 pruebas automáticas
npm run inventario -- /ruta/a/01_KMZ_Entrada  # qué hay dentro de los KMZ
npm run comparar   -- /ruta/a/01_KMZ_Entrada  [reporte_dinamico.csv]
npm run construir                             # regenera dist/verificador.html
```

Para ejecutar además la prueba contra los datos reales:

```bash
PMT_KMZ_DIR=/ruta/a/01_KMZ_Entrada \
PMT_CSV_LEGADO=/ruta/a/reporte_dinamico.csv \
npm test
```

### Desde código

```js
import { analizar } from './src/nucleo/index.js';

const resultado = await analizar(
  [{ nombre: 'CW123.kmz', datos: bytesDelArchivo }],
  { umbralMetros: 120, granularidadTemporal: 'instante', toleranciaMinutos: 0 }
);
// resultado.registros, resultado.relaciones, resultado.calidad, resultado.archivos
```

## Estructura

```
src/
  geo/
    elipsoide.js     WGS84: constantes y radios de curvatura
    plano-local.js   proyección métrica local (la decisión clave; ver abajo)
    geodesica.js     Vincenty inverso — solo referencia para las pruebas
    segmentos.js     operaciones planas: distancias, cortes, punto en anillo
    geometria.js     distancia e intersección entre geometrías GeoJSON completas
  tiempo/
    instante.js      lectura de marcas de tiempo, 24:00:00, calendario real
    intervalo.js     vigencias y traslape
  modelo/
    identidad.js     identificador estable de registro
    registro.js      normalización de un trazado + avisos de calidad
  io/
    xml.js           lector XML propio, idéntico en Node y navegador
    kml.js           KML → geometrías GeoJSON + metadatos
    zip.js           KMZ sin dependencias, con DecompressionStream
    descripcion.js   el formato " | " del proyecto (invariante intacto)
  nucleo/
    config.js        parámetros; ninguno enterrado en el código
    relaciones.js    el cálculo de hechos por pares
    provisional.js   etiquetas PROVISIONALES, desacopladas del cálculo
    index.js         API pública
  legado/
    replica.js       réplica fiel del motor QGIS, defectos incluidos
test/            109 pruebas + 1 que requiere los datos reales
herramientas/    inventario, comparador, empaquetador del verificador
fixtures/        casos límite sintéticos (ningún dato real de EPM)
verificador/     fuente del verificador
dist/            verificador.html autocontenido, de doble clic
```

## Decisiones técnicas

### 1. Cómo se mide la distancia

**Adoptado: plano tangente local ENU, construido por rotación de coordenadas geocéntricas (ECEF),
con el origen calculado para cada par de geometrías a partir de los propios datos.**

Alternativas evaluadas:

| Opción | Por qué no |
|---|---|
| Equirectangular calibrada a Medellín | Funciona con los datos de hoy, pero ata el motor a una región. Descartada por eso. |
| UTM con huso automático | Estándar, pero introduce factor de escala (hasta ~1 ‰) y se rompe cuando los datos cruzan un huso. |
| proj4js con EPSG:9377 (MAGNA-SIRGAS) | Correcta para Colombia, pero añade dependencia y vuelve a atar el motor a un país. Sigue disponible si algún día hay que exportar a un CRS oficial. |
| Geodésica exacta segmento a segmento | No tiene forma cerrada; exigiría optimización numérica por par. Sobreingeniería para una tolerancia de metros. |
| Turf.js en tiempo de ejecución | No hay distancia línea-a-línea; habría que componerla y densificar. Se usa como **referencia de prueba**, no como motor. |

Por qué el plano ENU:

- Es el método estándar de trabajo local en navegación, no una aproximación casera.
- Funciona en **cualquier latitud y longitud**, incluidos los polos y el antimeridiano, porque la
  rotación se hace en el espacio cartesiano.
- No necesita husos, ni tablas, ni datum nacional.
- Sin dependencias: ~30 líneas, lo que permite entregar el producto como un archivo portable.

Error medido frente a la geodésica exacta (prueba `geo-distancia.test.mjs`):

| Distancia | Error |
|---|---|
| 111 m | 0,000004 mm |
| 1,1 km | 0,0013 mm |
| 11 km | 1,4 mm |
| 33 km | 37 mm |
| 111 km | 1,4 m |

El motor solo mide por debajo del umbral (120 m por defecto), donde el error es de micras.
Se valida contra **dos referencias independientes**: Vincenty inverso implementado aparte
(coincidencia por debajo de 1 mm) y Turf.js 7.4.0 (dentro del 0,6 % que separa el modelo esférico
de Turf del elipsoidal).

**Característica documentada, no defecto:** un tramo entre dos puntos de la misma latitud es una
recta en el plano, mientras que el paralelo es una curva. A 2,2 km de vano la separación es de
1 cm. Irrelevante frente a 120 m, pero explica que `intersecanFisicamente` sea una condición
estricta de distancia cero. Hay una prueba dedicada a dejarlo por escrito.

### 2. Cómo se compara el tiempo

- Se usa **fecha y hora**. Las marcas se leen descomponiendo los campos, no con `new Date(texto)`,
  para que el resultado no dependa de la zona horaria del equipo.
- Hay traslape si `max(inicios) < min(fines) − tolerancia`: se exige **duración positiva**. Dos
  vigencias que solo se tocan en un instante no traslapan, pero se marcan como `contiguas`.
- **Tolerancia por defecto: 0 minutos.** No se introduce el margen de 2 horas que sugería la
  auditoría, porque no existe todavía una regla operativa que lo respalde. El parámetro está listo.
- `24:00:00` es el final del día y equivale a las `00:00:00` del siguiente.
- Las fechas que no existen en el calendario (por ejemplo `2026-02-29`) se rechazan **con nombre y
  apellido** en los avisos. El motor legado las ignoraba en silencio.
- `granularidadTemporal: 'dia'` reproduce el criterio legado (descarta la hora) y existe solo para
  poder comparar ambos criterios sin tocar el cálculo.

### 3. Identificador de registro

```
id = "pmt_" + FNV1a64( contrato, frente, tipo_cierre, dirección,
                       fecha_inicio CRUDA, fecha_fin CRUDA, geometría canónica )
```

- **Determinista**: el mismo KMZ da el mismo id en cualquier equipo y ejecución. No depende del
  orden de lectura, del nombre del archivo ni del reloj.
- **Distingue revigencias**: el mismo frente con otras fechas es otro registro, que es lo correcto.
  En los datos reales hay 148 registros que son revigencia de otro.
- **Distingue homónimos**: mismo nombre en distinto contrato, o con distinta geometría, son ids
  distintos. En los datos reales hay 26 pares de nombres donde uno es prefijo del otro; ese es
  exactamente el fallo que hacía que el tablero encendiera frentes que nadie pidió.
- **No cambia al cambiar la configuración del motor**: se usan los textos de fecha tal como vienen
  en el KMZ, no la vigencia ya normalizada. Sin esto no se podrían comparar dos ejecuciones
  registro a registro. Hay una prueba que lo garantiza.
- **Conserva los duplicados exactos** añadiendo el sufijo `~2`, en vez de perderlos.
- La geometría se redondea a 7 decimales (~1 cm) para que el ruido de coma flotante de un
  re-exportado no genere un id distinto.

**Límite conocido:** si se corrige la dirección o se mueve un vértice, el id cambia, porque para el
motor eso es otro registro. Para tener identidad estable a través de ediciones haría falta que el
generador escribiera un identificador propio dentro del KMZ. El lector **ya respeta** un `pmt:id`
que venga en `<ExtendedData>`, así que la mejora es compatible hacia atrás.

### 4. Modelo de geometría

El modelo interno es GeoJSON completo: `Point`, `MultiPoint`, `LineString`, `MultiLineString`,
`Polygon` (con huecos), `MultiPolygon` y `GeometryCollection`. Del lado del KML se leen además
`LinearRing` y `MultiGeometry`, que el lector legado perdía.

**Nada se descarta en silencio.** Un tipo no reconocido produce un error con su nombre; un
`MultiGeometry` con tipos mezclados se convierte en `GeometryCollection` y lo avisa.

Los datos reales de hoy solo traen `Point` (33) y `LineString` (427), así que el soporte de los
demás tipos se prueba con fixtures sintéticos.

### 5. Dependencias

**En tiempo de ejecución: ninguna.** El verificador empaquetado no carga nada de internet.

- El ZIP del KMZ se abre con `DecompressionStream('deflate-raw')`, que forma parte de la
  plataforma web (Chrome 103+, Firefox 113+, Safari 16.4+, Node 18+). Evita arrastrar JSZip.
- El XML se lee con un analizador propio de ~180 líneas, común a Node y al navegador. Se eligió
  frente a `DOMParser` porque `DOMParser` no existe en Node, y tener dos lectores distintos haría
  que las pruebas no demostraran el comportamiento real.

**Solo para desarrollo:** `@turf/turf` 7.4.0 (MIT), usada exclusivamente en las pruebas como
referencia independiente de los cálculos geométricos. No entra en el producto.

El ejecutor de pruebas es `node:test`, que viene con Node. No hay empaquetador: el verificador se
arma con un script propio de ~90 líneas que convierte los módulos en URLs de tipo blob, de modo que
el navegador ejecuta módulos ES reales con su aislamiento de nombres intacto.

## Qué NO hace esta etapa

No sustituye `Plataforma_PMTs.html`, no retira QGIS ni qgis2web, no migra los filtros ni el PDF,
no integra el generador, no decide hosting y no implementa autenticación. Todo eso es de etapas
posteriores.

## Aviso sobre los datos

Los KMZ reales de `01_KMZ_Entrada` **no están en el repositorio** y no deben añadirse: contienen
información operativa de EPM y el repositorio es público. El verificador los lee desde el disco de
quien lo abre, sin enviarlos a ninguna parte.
