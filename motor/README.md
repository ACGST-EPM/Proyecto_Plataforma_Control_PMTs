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
| `traslapeEvaluable` | si las fechas permiten siquiera decidirlo. Cuando es `false`, `hayTraslapeTemporal` **no** significa «no coinciden», significa «no se sabe», y así se presenta |
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
    cajas.js         prefiltro por cajas envolventes: cota inferior, antimeridiano
    geodesica.js     Vincenty inverso — solo referencia para las pruebas
    segmentos.js     operaciones planas: distancias, cortes, punto en anillo
    geometria.js     distancia e intersección entre geometrías GeoJSON completas
                     (plano por par de partes + dominio declarado de 50 km)
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
test/            184 pruebas + 1 que requiere los datos reales
                 (auditoria-codex.test.mjs: una prueba adversaria por hallazgo de la ronda 1.2)
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
  rotación se hace en el espacio cartesiano. Lo que está acotado no es *dónde* puede estar el par,
  sino *cuánto puede abarcar*: ver el dominio declarado más abajo.
- No necesita husos, ni tablas, ni datum nacional.
- Sin dependencias: ~30 líneas, lo que permite entregar el producto como un archivo portable.

**El plano se construye para cada PAR DE PARTES, no para la geometría entera.** Una geometría puede
tener varias partes (un `MultiPoint`, un `MultiLineString`, una `GeometryCollection`). Si el origen
del plano se calculara con todas ellas a la vez, una parte lejana desplazaría el origen y movería la
medida de las partes cercanas, que es lo que se quiere medir. Medido: un vértice añadido a 221 km
desplazaba una distancia de 120,010 m a 119,992 m —18,26 mm— y podía cruzar el umbral de 120 m en el
sentido equivocado. Con el origen por par de partes, la medida del par cercano sale **idéntica bit a
bit** con y sin el vértice lejano, y hay una prueba que exige esa igualdad exacta.

**Volver del plano al terreno (Etapa 2.4).** El plano también se sabe deshacer: `desproyectar()`
toma `[este, norte]` en metros y devuelve `[lon, lat]`, imponiendo que el punto esté sobre el
elipsoide (itera sobre la altura; converge en dos o tres pasos, con un error de ida y vuelta del
orden del nanómetro). **No interviene en ninguna medida**: existe solo para situar dibujos.

Hace falta porque, para el motor, un tramo entre dos vértices es la RECTA DEL PLANO que los une, y
esa no es la misma línea que la recta en grados. Interpolar en grados sobre el tramo original —que
es lo que se hacía— coloca el punto en otro sitio: en un tramo de 66 km a lo largo de un paralelo,
9,4 m. Ese fue el defecto que dejaba el conector del mapa con los dos extremos en la misma
coordenada mientras el motor declaraba 9,387513 m. Ahora `puntosMasCercanos()` comprueba la
separación **geodésica de los puntos que va a dibujar** contra la distancia canónica; si no cuadra,
la recupera deshaciendo la proyección, y si aun así no cuadra devuelve `ubicado: false` y no dibuja.

**Dominio declarado: `RADIO_DOMINIO_METROS = 50 000`.** Un plano tangente deja de ser fiable cuando
el par abarca demasiado. Si el par de partes ocupa un radio mayor de 50 km, el motor **no lo mide**:
devuelve `metros: null`, `dominioValido: false` y un error que dice cuántos kilómetros abarcaba y
cuál es el límite. Nunca devuelve un número inventado ni «se tocan». El caso extremo que lo motivó:
dos geometrías **antípodas** daban antes 0 m y contacto físico, porque el antípoda, proyectado en un
plano tangente compartido, cae justo sobre el origen. Sobre 120 m, 50 km de dominio dejan un error de
proyección de 3,7 mm, y el motor solo mide de verdad por debajo del umbral.

> Portabilidad, dicha sin exagerar: el motor mide **en cualquier punto del planeta**, incluidos polos
> y antimeridiano, siempre que **cada par comparado quepa en 50 km**. Fuera de eso lo dice; no lo
> aproxima. Para los PMT de EPM, donde el umbral de trabajo es de 120 m, esa condición se cumple
> siempre.

Error medido frente a la geodésica exacta (prueba `geo-distancia.test.mjs`):

| Distancia | Error |
|---|---|
| 111 m | 0,000004 mm |
| 1,1 km | 0,0013 mm |
| 11 km | 1,4 mm |
| 33 km | 37 mm |
| 111 km | 1,4 m *(fuera del dominio de 50 km: se mide aquí solo para caracterizar el error; en el motor este par se rechaza)* |

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

  La validación es de **texto completo**, no de prefijo: `123:00`, `12:3`, `99:99` o `1a:00` ya no
  caen en el camino de «sin hora» convirtiéndose en `00:00:00` sin decir nada, y `24:00:001` ya no
  se confunde con `24:00:00` por compartir el principio. Cada uno devuelve `ms: null`,
  `estadoHora: 'invalida'` y un aviso que dice qué está mal.

- **Las zonas horarias se rechazan diciendo que son zonas horarias.** El formato del proyecto
  expresa hora local de obra y no admite sufijo. Antes, un `Z`, un `UTC` o un `-05:00` al final se
  ignoraban en silencio y la marca entraba como hora local; ahora la vigencia se invalida con un
  mensaje que nombra el sufijo encontrado.

- **`24:00:00` no se extiende dos veces.** Ese texto significa «el final del día declarado». El
  criterio legado de *fin inclusivo* lleva un fin escrito a las `00:00` hasta el último instante de
  su día; aplicárselo también a un `24:00:00` regalaba un día entero: `2026-03-01 24:00:00`
  terminaba en `2026-03-02 23:59:59`. El motor recuerda de dónde viene cada hora
  (`origenHora: 'medianoche24'`) y no la vuelve a extender. En granularidad de día, además, ese
  registro pertenece al **día que declara** (el 1), no al día al que apunta el instante (el 2).

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

**El prefiltro tampoco puede exagerar cerca de los polos.** Convertir grados de longitud a metros
exige multiplicar por el coseno de la latitud, que tiende a cero en el polo. Ese coseno estaba
recortado a un mínimo de 0,01, lo que hacía que el prefiltro **sobreestimara** la separación: a
89,999° de latitud, dos puntos realmente separados 1,95 m se estimaban a ~1,1 km y el par se
descartaba antes de medirlo. La regla es que la estimación tiene que ser una **cota inferior** —nunca
puede superar la distancia real—, porque solo así se garantiza que el prefiltro no tira ningún par
que el cálculo preciso habría aceptado. Todo el prefiltro vive ahora en `geo/cajas.js`
(`separacionLongitud`, `cotaInferiorMetros`, `unir`, `radioAproximadoMetros`), con una prueba que
compara cota contra distancia real y otra de extremo a extremo con el par polar.

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
- **Conserva los duplicados exactos** añadiendo el sufijo `~2`, en vez de perderlos. El sufijo se
  busca hasta encontrar uno **realmente libre**, y además **no puede quitarle el identificador a
  otro registro**: con la entrada `x`, `x`, `x~2` el segundo no se queda con `x~2` —ese pertenece al
  tercero, que lo trae escrito de origen— sino con `x~3`. Antes salían dos registros llamados `x~2`,
  y el tercero recibía un aviso que lo acusaba de traer un identificador repetido cuando el choque lo
  había provocado el propio motor.
- **Distingue dos problemas distintos**: `duplicadosExactos` cuenta registros con el mismo contenido
  (el caso real: tres placemarks idénticos en un KMZ) y `idsRepetidos` cuenta archivos que reutilizan
  un `pmt:id` para registros diferentes. El primero es una copia; el segundo es un archivo mal
  hecho. Se informan por separado.
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

**Coordenadas: se leen enteras o no se leen.** El lector usaba `parseFloat`, que acepta basura
pegada al número: `0.002oops` se leía como `0,002` y el trazado seguía adelante con una geometría
falsa, sin que nadie lo supiera. Ahora se convierte solo si **todo** el texto es un número, y
también se rechazan las coordenadas fuera del rango terrestre. Si un vértice no se puede leer, se
excluye **la geometría completa** —no los vértices buenos por su cuenta, que producirían un trazado
que nadie dibujó— y el registro se conserva con su diagnóstico para poder corregirlo en origen.

**Lo que se acepta y lo que no, dicho claro:**

| Entrada | Qué hace el motor |
|---|---|
| KML en UTF-8, UTF-16LE o UTF-16BE (con marca de orden) | Se lee. Si no era UTF-8, lo avisa. Antes un KMZ en UTF-16 devolvía **0 registros sin un solo error**, y parecía un archivo vacío. |
| `<NetworkLink>` a otros documentos | **No se sigue.** Si el documento no tiene Placemarks propios es un **error**; si los tiene, es un aviso. Nunca se presenta como una lectura correcta de 0 frentes. |
| Varios `.kml` dentro del KMZ | Se procesa `doc.kml` (o el primero) y se **nombran los que no se procesaron**. |
| Coordenada ilegible o fuera del planeta | Se excluye la geometría; el registro se conserva con el diagnóstico. |
| Par que abarca más de 50 km | Se comparan segmentos locales; si no basta para decidir, queda como `no_evaluable` con identidad, motivo y contador. |
| Zona horaria en la fecha | Vigencia inválida, con el sufijo nombrado. |

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

**Coincidir no es lo mismo que haber demostrado fidelidad.** El cotejo publica ahora cuatro
condiciones por separado, y solo las cuatro juntas dan por superado el control:

| Condición | Qué significa |
|---|---|
| `coinciden` | Los dos caminos dan la misma alerta, una a una. |
| `hayEntrada` | Se leyó al menos un trazado. **Cero contra cero no demuestra equivalencia**: un `<kml>` truncado daba antes 0 alertas a cada lado, los totales cuadraban y el control salía «superado» sobre una entrada que nadie había leído. |
| `lecturaLimpia` | Ningún archivo falló al leerse. Si uno de ocho es ilegible, lo comparado no es la entrada. |
| `alcanceContrastado` | Todas las geometrías son de un tipo cuya equivalencia con QGIS está realmente contrastada: **`Point` y `LineString`, y solo esos**. |

Ese último punto importa: la réplica del legado ignoraba los polígonos **en silencio**, igual que
QGIS, y el cotejo seguía diciendo «superado» sobre una entrada que no había comparado entera. Ahora
`replica.js` devuelve `noContrastables` con el frente y el tipo de cada geometría que quedó fuera, y
el control lo refleja. El verificador muestra cada condición con su ✔ o su ✖, de modo que nadie
tenga que deducir por qué el control pasó o falló.

**Lo que el verificador nunca presenta como «no coinciden» es «no lo sabemos».** Una relación cuyas
fechas no permiten decidir el traslape tiene su propia tarjeta (gris), su propio filtro y una
pastilla que dice «No se puede saber» en la tabla; en el CSV sale como `no evaluable`. Sumarla a
«sin coincidencia en el tiempo» habría convertido un dato que falta en una respuesta tranquilizadora.

### 8. Dependencias

**En tiempo de ejecución: ninguna.** El verificador empaquetado no carga nada de internet.

- El ZIP del KMZ se abre con `DecompressionStream('deflate-raw')`, que forma parte de la
  plataforma web (Chrome 103+, Firefox 113+, Safari 16.4+, Node 18+). Evita arrastrar JSZip.

**El lector de ZIP está endurecido.** No se abre un archivo de procedencia desconocida sin
comprobarlo ni acotarlo:

- **Se verifica el CRC-32** de cada entrada contra el que declara el propio ZIP. Antes no se
  comprobaba nunca, así que un archivo manipulado o corrompido en tránsito entraba al análisis como
  si nada.
- **Límites explícitos** en `LIMITES_POR_DEFECTO` (congelado, no se puede subir sobre la marcha):
  64 MB de archivo, 64 MB por entrada descomprimida, 128 MB descomprimidos en total, factor de
  expansión 400 y 10 000 entradas. Sin ellos, 60 MB comprimidos a 59,7 KB —un factor de 1029:1—
  entraban sin resistencia. Los valores son holgados frente a los KMZ reales, que pesan decenas
  de kilobytes.
- **Se descomprime solo lo que hace falta.** `leerDirectorio` lee el índice sin descomprimir nada,
  `listarZip` enseña el contenido igual de barato, y `extraerKml` descomprime **únicamente** la
  entrada elegida.
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
