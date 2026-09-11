# Motor geoespacial y temporal de PMTs — Etapa 1

> Corre **en paralelo** al motor de QGIS. No lo sustituye, no lo modifica y no toca el tablero actual.
> `proceso_pmt_qgis.py` permanece congelado como referencia.

## Para qué sirve

Calcula, para cada pareja de frentes de **contratos distintos**, los hechos que hacen falta para
decidir si hay conflicto — **sin decidirlo por nadie**:

| Hecho | Qué responde |
|---|---|
| `distanciaMetros` | distancia mínima real entre las geometrías, en metros |
| `intersecanFisicamente` | si los trazados se tocan de verdad (distancia 0, con tolerancia de 1 µm por redondeo) |
| `dentroDelUmbral` | si esa distancia cae dentro del umbral configurado |
| `vigenciaA` / `vigenciaB` | inicio y fin completos de cada vigencia, con hora |
| `hayTraslapeTemporal` | si coinciden en el tiempo, con fecha **y** hora |
| `traslapeInicio` / `traslapeFin` / `traslapeDias` / `traslapeHoras` | cuándo y cuánto coinciden |
| `vigenciasContiguas` | si una termina justo cuando la otra empieza |
| `minimoExigidoMinutos` | la coincidencia mínima que se exigió para este cálculo |
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
npm test                                      # 146 pruebas automáticas
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
    cotejo.js        compara los dos caminos de reproducción, alerta por alerta
test/            146 pruebas + 1 que requiere los datos reales
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

**Tolerancia numérica: 1 micrómetro.** Las comprobaciones de contacto usaban antes igualdad exacta
con cero, lo que es frágil: dos segmentos que se cruzan de verdad pueden dar un producto cruzado de
`1e-13` en vez de `0`, y el motor respondía «no se tocan». El valor de 1 µm sale de una medida, no
de una intuición: las coordenadas geocéntricas rondan los 6,4 millones de metros y la doble
precisión arrastra ~1,4 nm por componente; el residuo observado en un caso real —el punto medio del
borde de un polígono, que geométricamente está *sobre* el borde— es de **1,65e-8 m**. Un micrómetro
deja 60 veces de margen sobre ese residuo y sigue sin tener ningún sentido físico (un pelo humano
mide 70 µm).

> Esta tolerancia es de **aritmética**, no operacional. El umbral de cercanía de 120 m dice «estos
> trazados están lo bastante cerca como para que importe»; el micrómetro dice «estos dos números son
> el mismo número». Hay 8 órdenes de magnitud entre uno y otro, así que ninguna decisión de negocio
> puede depender de él. Una prueba comprueba que a **un milímetro** el motor sigue diciendo que no
> se tocan.

El predicado de orientación se normaliza además dividiendo por la longitud del segmento: el
resultado es una **distancia perpendicular en metros**, no un área en metros cuadrados, de modo que
la tolerancia significa lo mismo en un segmento de 2 m que en uno de 2 km.

**Característica documentada, que la tolerancia NO arregla porque no es redondeo:** un tramo entre
dos puntos de la misma latitud es una recta en el plano, mientras que el paralelo es una curva. La
separación crece con el cuadrado de la distancia: 0,03 mm en 111 m, 2,6 mm en 1,1 km y 26 cm en
11 km. Los **meridianos, en cambio, sí proyectan rectos**. Es geometría de la Tierra, no aritmética,
y tiene pruebas propias que lo dejan por escrito con los números medidos.

### 2. Cómo se compara el tiempo

- Se usa **fecha y hora**. Las marcas se leen descomponiendo los campos, no con `new Date(texto)`,
  para que el resultado no dependa de la zona horaria del equipo.

- **La regla del traslape, escrita una sola vez:**

  > Hay traslape cuando la coincidencia dura **más de cero** y **al menos** los N minutos exigidos.
  > Es decir: `duración > 0` **y** `duración >= N`.

  Con el valor aprobado por defecto **N = 0** se reduce a «cualquier coincidencia real cuenta».
  Con N = 120, dos vigencias que coincidan **exactamente** 120 minutos **sí** traslapan, porque se
  exige *al menos*, no *más de*. Esta frase es literalmente la misma en el código
  (`intervalo.js`), en las pruebas (`tiempo.test.mjs`) y en el texto que lee el usuario en el
  verificador. Cuando no se llega al mínimo, el motivo dice cuánto falta:
  «coinciden 120 min, menos de los 180 exigidos».

- **Contiguas** significa exactamente que una vigencia termina en el mismo instante en que empieza
  la otra (`duración == 0`). No depende del mínimo exigido.

- **Validación estricta de la hora.** La **única** normalización admitida es
  `24:00:00 → 00:00:00 del día siguiente`, porque es notación legítima de «fin del día» y aparece
  en los datos. Todo lo demás fuera de rango (`25:00`, `24:30`, minutos o segundos por encima de 59)
  es **dato inválido** y se rechaza con un diagnóstico que dice qué pasa. Antes se «arreglaba»
  sumando días o recortando a 59, lo que convertía un error de captura en un instante distinto sin
  que nadie se enterara: el trazado entraba al análisis con una vigencia que nunca existió.

- Las fechas que no existen en el calendario (por ejemplo `2026-02-29`) se rechazan **con nombre y
  apellido** en los avisos. El motor legado las ignoraba en silencio.

- `granularidadTemporal: 'dia'` reproduce el criterio legado (descarta la hora) y existe solo para
  poder comparar ambos criterios sin tocar el cálculo.

### 3. Portabilidad real: el antimeridiano

No basta con que el cálculo final sepa tratar el meridiano ±180: el **prefiltro por cajas
envolventes** tiene que saberlo también, porque si descarta el par, el cálculo no llega a
ejecutarse nunca. Eso es justo lo que pasaba: dos trazados a 110 m uno de otro con longitudes
179,9995 y −179,9995 daban, con una resta normal, una separación de 359,999 grados —casi una vuelta
entera al planeta— y el prefiltro los tiraba.

La separación en longitud se mide ahora **sobre el círculo**: se prueba el segundo intervalo
desplazado una vuelta a cada lado y se toma la menor de las tres separaciones. La latitud no
necesita ese tratamiento. Hay pruebas de extremo a extremo —entrando por KMZ y saliendo por
`analizar()`— para puntos, para líneas, cerca de los polos, en el meridiano cero, y un control
negativo que exige que dos trazados a 220 km **no** se relacionen.

### 4. Registros sin contrato

Un trazado al que le falta el contrato **se conserva**: aparece en `registros`, conserva su
geometría, se puede dibujar en el mapa y lleva su aviso de calidad. Pero **no participa en ninguna
relación**, porque una interferencia se define entre contratos distintos y aquí no se sabe a cuál
pertenece. Antes se colaba: al no tener contrato, la comprobación de «mismo contrato» se saltaba y
dos trazados huérfanos se comparaban como si fueran de contratos diferentes. Los pares descartados
por este motivo se cuentan aparte, en `estadisticas.paresSinContrato`.

### 5. Identificador de registro

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

### 6. Modelo de geometría

El modelo interno es GeoJSON completo: `Point`, `MultiPoint`, `LineString`, `MultiLineString`,
`Polygon` (con huecos), `MultiPolygon` y `GeometryCollection`. Del lado del KML se leen además
`LinearRing` y `MultiGeometry`, que el lector legado perdía.

**Nada se descarta en silencio.** Un tipo no reconocido produce un error con su nombre; un
`MultiGeometry` con tipos mezclados se convierte en `GeometryCollection` y lo avisa.

Los datos reales de hoy solo traen `Point` (33) y `LineString` (427), así que el soporte de los
demás tipos se prueba con fixtures sintéticos.

### 7. Cómo se comprueba que la réplica del legado es fiel

El verificador no declara fidelidad porque los totales cuadren. Dos resultados pueden sumar lo
mismo sin tener nada que ver: 84 interferencias aquí y 84 allí podrían ser 84 parejas distintas.

`legado/cotejo.js` compara la **identidad de cada alerta**, una a una: mismo par de contratos,
mismos frentes, misma categoría del legado y, en las interferencias, mismo periodo de traslape.
Solo se declara fidelidad si no falta ni sobra ni una sola alerta y además coincide el número de
trazados leídos. Si algo no cuadra, el verificador dice **exactamente qué comprobó y qué falla**,
y muestra ejemplos de las alertas descuadradas, en lugar de afirmar una equivalencia no demostrada.

Sobre los 8 KMZ reales el cotejo da **248 alertas coincidentes una a una, 0 faltantes y 0
sobrantes**. Las pruebas de `cotejo.test.mjs` se dedican sobre todo a comprobar que el control
**sabe decir que no**: se le dan totales que cuadran con parejas distintas, categorías cambiadas,
periodos desplazados y alertas de más y de menos, y tiene que detectarlo en todos los casos.

### 8. Dependencias

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
