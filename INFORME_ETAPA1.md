# ETAPA 1 — Motor geoespacial y temporal en paralelo, con verificador

> **Estado:** terminada y detenida para auditoría independiente. **No se avanza a la Etapa 2.**
> **Fecha:** 11 de septiembre de 2026
> **Alcance:** se construyó un motor nuevo que corre **en paralelo**. No se tocó ni un archivo del sistema actual.

---

## Resumen

El motor nuevo existe, está probado y se puede comprobar sin conocimientos técnicos abriendo un archivo.

Tres resultados que conviene conocer antes de entrar en el detalle:

1. **La réplica del motor de QGIS reproduce el resultado publicado línea por línea: 708 de 708 filas idénticas.**
   Eso da una base de comparación fiable: cuando el motor nuevo difiere, sabemos que la diferencia es del
   motor nuevo y no del arnés de pruebas.

2. **Configurado como el motor viejo, el motor nuevo da exactamente lo mismo que el motor viejo: 248 alertas,
   84 con coincidencia temporal.** No hay ninguna discrepancia de medición entre uno y otro. Todo lo que
   cambia, cambia porque decidimos cambiarlo, no por un error de cálculo.

3. **Con los parámetros aprobados (120 m reales, fecha + hora), quedan 174 relaciones en lugar de 248.**
   Desaparecen 74 y no aparece ninguna nueva. De las 68 que sí coinciden en el tiempo, **solo 3 corresponden
   a trazados que se tocan de verdad**.

Se encontró además **un caso de dato que ninguno de los dos sistemas veía**: un trazado con fecha de fin
`2026-02-29`, un día que no existe. El motor de QGIS lo ignoraba en silencio; el nuevo lo señala.

---

## 1. Arquitectura implementada

```
                 ARCHIVOS .kmz / .kml  (los suelta la usuaria; nunca salen de su equipo)
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
  ┌───────────────────────────┐          ┌──────────────────────────────┐
  │  io/                      │          │  legado/replica.js           │
  │  zip.js   abre el KMZ     │          │  Reproduce el motor de QGIS   │
  │  xml.js   lee el XML      │          │  CON SUS DEFECTOS, para poder │
  │  kml.js   KML → GeoJSON   │          │  comparar sobre cualquier KMZ │
  │  descripcion.js  el " | " │          │  (proceso_pmt_qgis.py sigue   │
  └────────────┬──────────────┘          │   congelado e intacto)        │
               ▼                         └──────────────────────────────┘
  ┌───────────────────────────┐
  │  modelo/                  │   Un REGISTRO = un frente + una vigencia + una geometría
  │  registro.js  normaliza   │   con identificador estable y lista de avisos de calidad
  │  identidad.js  el id      │
  └────────────┬──────────────┘
               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  nucleo/relaciones.js   ← EL NÚCLEO. Puro, sin DOM, sin archivos │
  │                                                                  │
  │   geo/plano-local.js   lon/lat → metros, en cualquier parte      │
  │   geo/geometria.js     distancia e intersección, GeoJSON entero  │
  │   tiempo/intervalo.js  traslape con fecha y hora                 │
  │                                                                  │
  │   Devuelve HECHOS. No clasifica. No decide qué es crítico.       │
  └────────────┬─────────────────────────────────┬──────────────────┘
               ▼                                 ▼
   ┌────────────────────────┐      ┌──────────────────────────────────┐
   │ nucleo/provisional.js  │      │  verificador.html                │
   │ Etiquetas PROVISIONALES│      │  Un archivo de doble clic.       │
   │ fuera del cálculo      │      │  Compara los dos motores y deja  │
   └────────────────────────┘      │  cambiar los parámetros en vivo. │
                                   └──────────────────────────────────┘
```

La separación que pidió el encargo se cumple en el código, no solo en la intención: en
`src/nucleo/relaciones.js` no aparece ninguna palabra como «crítico», «alerta» o «interferencia».
Hay una prueba automática que lo comprueba: ninguna relación devuelta puede traer campos
`categoria`, `nivel` ni `criticidad`.

---

## 2. Archivos creados y modificados

**Creados** — 33 archivos, 4.722 líneas, todos dentro de `motor/`:

| Carpeta | Archivos | Líneas | Contenido |
|---|---|---|---|
| `motor/src/` | 18 | 2.213 | el motor: geometría, tiempo, modelo, lectura, núcleo y réplica del legado |
| `motor/test/` | 8 | 1.278 | 110 pruebas automáticas |
| `motor/herramientas/` | 5 | 597 | inventario, comparador, diagnóstico temporal, empaquetador |
| `motor/fixtures/` | 1 | 126 | casos límite sintéticos |
| `motor/verificador/` | 1 | 508 | fuente del verificador |
| `motor/dist/verificador.html` | 1 | — | 113 KB, autocontenido, de doble clic |
| `motor/README.md` | 1 | — | decisiones técnicas razonadas |
| `INFORME_ETAPA1.md` | 1 | — | este documento |

**Modificados:** solo `.gitignore`, para impedir que los KMZ operativos, el CSV y los `crudo_*.json`
entren por accidente al repositorio público.

**No tocados, como se pidió:** `proceso_pmt_qgis.py`, `Plataforma_PMTs.html`, `Generador_KMZ.html`,
`contratos_db.json`, el repositorio publicado y el `Dashboard_Seguimiento_PMTs.html`.

---

## 3. Dependencias

**En el producto: ninguna.** El verificador no carga nada de internet y funciona sin conexión.

| Pieza | Cómo se resolvió | Por qué |
|---|---|---|
| Descomprimir el KMZ | `DecompressionStream('deflate-raw')` de la propia plataforma web | Evita JSZip (~95 KB) y mantiene la opción de entregar un archivo único. Disponible en Chrome 103+, Firefox 113+, Safari 16.4+ y Node 18+. |
| Leer el XML | Analizador propio de ~180 líneas | `DOMParser` solo existe en el navegador. Con un único lector, las pruebas demuestran el comportamiento real del producto. |
| Empaquetar el verificador | Script propio de ~90 líneas | Convierte los módulos en URLs de tipo blob; el navegador ejecuta módulos ES reales, así que no hay riesgo de que dos funciones con el mismo nombre se pisen. Sin empaquetador externo. |
| Ejecutar las pruebas | `node:test`, incluido en Node | Sin dependencias. |

**Solo para desarrollo:** `@turf/turf` 7.4.0, licencia **MIT**, mantenimiento activo (última
publicación hace aproximadamente un mes). Se usa **exclusivamente en las pruebas**, como referencia
geométrica independiente. No entra en el producto ni en el verificador.

---

## 4 y 5. Pruebas ejecutadas y resultado exacto

```
$ npm test
# tests 110   # pass 110   # fail 0   # skipped 0   # duration_ms 483
```

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `geo-distancia.test.mjs` | 8 | metros, validación cruzada contra Vincenty y Turf, antimeridiano, nueve latitudes, cota de error |
| `geo-tipos.test.mjs` | 18 | punto↔punto, punto↔línea, línea↔línea, polígonos con hueco, Multi*, GeometryCollection, tipos desconocidos, geometría ausente |
| `umbral.test.mjs` | 7 | exactamente 120 m, justo por debajo y por encima, umbral configurable, configuración inválida |
| `tiempo.test.mjs` | 20 | intervalos iguales, parciales, contenidos, extremos que se tocan, mismo día sin traslape, `24:00:00`, fechas inexistentes, tolerancia, independencia de la zona horaria |
| `identidad.test.mjs` | 13 | revigencias, homónimos, geometrías distintas, estabilidad frente a la configuración, duplicados, nombres que son prefijo de otro |
| `io.test.mjs` | 22 | XML, coordenadas, descripción en HTML, MultiGeometry, carpetas, CDATA, KMZ comprimido, archivos rotos, entradas absurdas |
| `nucleo.test.mjs` | 12 | regla de contratos, independencia de los hechos, contrato de datos, ausencia de clasificación, reproducibilidad |
| `replica-legado.test.mjs` | 10 | cada defecto del legado replicado por separado + reproducción exacta del CSV publicado |

**Validación contra referencias independientes** (requisito 13): la distancia no se comprueba solo
contra sí misma. Se compara con **Vincenty inverso**, implementado aparte con otro algoritmo
(coincidencia por debajo de 1 mm), con **Turf.js** (dentro del 0,6 % que separa su modelo esférico
del elipsoidal) y con **valores geodésicos publicados**: el caso Flinders Peak → Buninyong
(54.972,271 m) y los grados de latitud y longitud en el ecuador según WGS84.

**Prueba en navegador real:** el verificador empaquetado se abrió con Chromium desde `file://`, se
le cargaron los 8 KMZ reales, se pulsó calcular, se recorrieron los filtros y se recalculó con otros
parámetros. **Cero errores de JavaScript.** Un fallo visual detectado en esa prueba (el aviso de
fidelidad se duplicaba al recalcular) quedó corregido y verificado.

---

## 6. Resultados sobre los KMZ reales

**Inventario de `01_KMZ_Entrada`** (`npm run inventario`):

| | |
|---|---|
| Archivos | 8 KMZ, todos legibles sin errores |
| Trazados | 460 · 1.340 vértices |
| Contratos | **8** (el informe de la Etapa 0 decía 12; ese número estaba mal contado, ver §11) |
| Geometrías | LineString 427 · Point 33 · ningún MultiGeometry, polígono ni tipo múltiple |
| Tipos de cierre | parcial 236 · total 189 · ingreso y salida 35 |
| Descripciones en HTML o CDATA | ninguna |
| Frentes distintos | 312, de los cuales 93 tienen más de una vigencia (148 registros son revigencia) |
| Nombres donde uno es prefijo de otro | 26 pares |
| Vigencias | mínima 6,5 días · mediana 91,4 · máxima 614,4 · seis de más de un año |
| Hora capturada | 460 la traen, pero **213 tienen 00:00 → 00:00**, es decir, la hora nunca se registró |
| Fin exactamente a las 00:00 | 214 de 460 |

**Rendimiento:** lectura de los 8 KMZ y análisis completo en **87 ms** dentro del navegador
(160 ms la primera vez, con el arranque). En línea de comandos, 0,061 s de punta a punta.

---

## 7. Comparación cuantitativa legado vs nuevo

Se ejecutaron cuatro perfiles sobre **los mismos archivos**, para que cada diferencia tenga una
sola causa atribuible.

| Perfil | Distancia | Tiempo | Alertas | Con coincidencia temporal |
|---|---|---|---|---|
| **1. Réplica del motor QGIS** | colchón doble en grados | solo fecha | **248** | **84** |
| **2. Motor nuevo, medida real, 243,2 m** | 243,2 m reales | solo fecha | **248** | **84** |
| **3. Motor nuevo, 120 m** | 120 m reales | solo fecha | **174** | **68** |
| **4. Motor nuevo, configuración aprobada** | 120 m reales | fecha + hora | **174** | **68** |

**Control de fidelidad de la réplica**, contra el `reporte_dinamico.csv` realmente publicado:

```
Filas del CSV publicado ....... 708
Filas idénticas ............... 708
Solo en la réplica ............   0
Solo en el CSV publicado ......   0
Veredicto ..................... REPRODUCCIÓN EXACTA
```

---

## 8. Explicación de cada categoría de diferencia

**a) Medir bien la distancia: cero diferencias.**
Cambiar el cálculo en grados del colchón de QGIS por una medida métrica real **no mueve ni un caso**
(248 → 248, 84 → 84). Es un resultado importante y conviene no adornarlo: a la latitud del Valle de
Aburrá la distorsión entre grados y metros es del 0,07 %, demasiado pequeña para cambiar ninguna
clasificación. **La medida métrica no se justifica por precisión local, sino por portabilidad**: sin
ella el motor quedaría atado a esta región, que es justo lo que el encargo pedía evitar.

**b) Corregir el umbral de 243 m a 120 m: −74 alertas, −16 con coincidencia temporal.**
Es la diferencia grande, y es enteramente atribuible al defecto identificado en la Etapa 0: QGIS
aplicaba el colchón a las dos geometrías antes de cruzarlas, así que su umbral efectivo era el doble
del que anunciaba su propia capa. Las 74 alertas que desaparecen estaban **todas** entre 121 y 243 m
de distancia real.

**c) Usar fecha y hora en vez de solo fecha: cero diferencias en estos datos.**
Este resultado sorprende y lo verifiqué a fondo antes de darlo por bueno. **La opción sí se aplica**:
las 460 vigencias cambian de forma al activarla. Lo que ocurre es que **ningún par está cerca de la
frontera**: el traslape más corto de todo el conjunto dura **11 días**, y no hay ni uno solo de uno a
siete días. Un traslape solo puede cambiar de estado si dependía del primer o del último día.

Conclusión honesta: **el mecanismo funciona, pero hoy no cambia nada.** Su valor es preventivo, para
los casos que la operación sí tiene —obra diurna frente a obra nocturna el mismo día— y que estos
ocho KMZ no contienen. Hay pruebas sintéticas que lo demuestran caso por caso.

Con un matiz que sí importa: **214 de 460 trazados terminan exactamente a las 00:00**. Con criterio
estricto eso excluye el último día completo de la vigencia. Hoy da igual porque los traslapes son
largos, pero en cuanto haya vigencias cortas empezará a notarse. Por eso el parámetro
*«la fecha de fin cubre todo ese día»* está expuesto en el verificador y es una decisión pendiente
(§11, decisión 2).

**d) Separar proximidad de contacto físico: lo que nadie estaba midiendo.**
Con la configuración aprobada hay **6 relaciones con contacto físico real** (distancia exactamente 0),
de las cuales **3 coinciden además en el tiempo**. El motor de QGIS llamaba «INTERFERENCIA REAL
(CRÍTICA)» a las 84 que estaban cerca con fechas traslapadas, sin comprobar el contacto ni una vez.

Reparto completo de las 174 relaciones, por las dos preguntas independientes:

| | Coinciden en el tiempo | No coinciden |
|---|---|---|
| **Se tocan (0 m)** | **3** | 3 |
| **Están cerca (≤ 120 m)** | 65 | 103 |

Estas cuatro casillas **no tienen todavía nombre oficial**. Están disponibles en el código como
etiquetas `PROVISIONAL:` y en el verificador como filtros, precisamente para poder mirarlas antes de
decidir.

---

## 9. Errores y anomalías encontrados en los KMZ

Los ocho archivos se leyeron **sin un solo fallo**. Las anomalías están en el contenido:

| Anomalía | Casos | Qué hace el motor nuevo | Qué hacía QGIS |
|---|---|---|---|
| **Fecha que no existe** (`2026-02-29`, en `CW353556 · HUE-RC-12`) | 1 | Lo señala por su nombre y deja el trazado fuera del análisis temporal, pero **sí lo mide espacialmente** | La ignoraba en silencio; el trazado no podía ser interferencia nunca |
| **Trazados idénticos repetidos** dentro del mismo KMZ (`MALP_RC_4_1`, `_2`, `_3` en `CW366713`) | 3 | Los conserva con sufijo `~2` y avisa | Los contaba dos veces sin decir nada |
| **Sin municipio** | 98 (21 %) | Avisa; el campo es opcional | Escribía «No definido» |
| **Campo obligatorio ausente** | 66 avisos | Los nombra uno a uno | Rellenaba «No definido» |
| **Hora nunca capturada** (00:00 → 00:00) | 213 (46 %) | Lo deja registrado | No lo distinguía de una hora real |
| **Vigencias de más de un año** | 6, la mayor de 614 días | Se procesan; quedan visibles en el inventario | Igual, sin visibilidad |

Sobre los duplicados hay que corregir algo que dije en la Etapa 0: el informe atribuía las 20 filas
duplicadas del CSV a **archivos KMZ repetidos en la carpeta**. Con los archivos delante, eso es
falso: **no hay ningún KMZ repetido**. Hay 3 placemarks idénticos dentro de un mismo archivo, y las
demás filas «duplicadas» del CSV son trazados distintos que el CSV no puede distinguir porque no
lleva identificador ni geometría. Es otra consecuencia del mismo problema de identidad.

---

## 10. Limitaciones que permanecen

1. **Sin polígonos reales que probar.** El motor los soporta y hay pruebas sintéticas, pero ningún
   KMZ real los usa todavía. El soporte está sin contrastar contra datos de campo.
2. **El identificador cambia si se edita el trazado.** Es correcto conceptualmente —un trazado
   editado es otro registro— pero para tener identidad estable a través de ediciones haría falta que
   el generador escribiera un `pmt:id` propio dentro del KMZ. El lector ya lo respeta si aparece.
3. **`intersecanFisicamente` es una condición estricta de distancia cero.** Dos trazados dibujados
   por contratistas distintos que «se encuentran en la misma esquina» rara vez estarán a 0,000 m
   exactos. Los cruces reales sí se detectan con fiabilidad, porque el corte de segmentos es una
   prueba topológica, no una medida. Si hiciera falta una tolerancia de contacto (por ejemplo, 2 m),
   es una decisión operativa, no técnica.
4. **La comparación por pares es O(n²) con prefiltro por caja.** Con 460 trazados basta y sobra
   (294 distancias calculadas de 104.196 pares posibles). Con varios miles convendría un índice
   espacial. No hace falta todavía.
5. **El efecto de la hora no se puede validar con datos reales**, porque no hay ni un caso frontera
   en estos ocho archivos. Solo está probado con fixtures sintéticos.
6. **No hay nada del tablero.** Mapa, filtros, línea de tiempo y PDF siguen intactos en el sistema
   viejo, como pedía el encargo.
7. **El hallazgo C-1 sigue abierto.** Esta etapa no lo tocó, por instrucción expresa.

---

## 11. Decisiones que necesitan tu participación

> **Corrección de la Etapa 0, antes de nada:** el informe anterior decía «12 contratos». Contando los
> KMZ reales son **8**. El error vino de contar los valores distintos de la columna CONTRATO del CSV,
> que incluye textos como «CW323402 vs CW352217». Ningún otro número del informe depende de ese dato.

**Decisión 1 · ¿Qué merece llamarse crítico?**
Los hechos ya están medidos y separados. Las cuatro casillas de §8 esperan nombre:

| Combinación | Casos hoy | Propuesta a discutir |
|---|---|---|
| Se tocan **y** coinciden en el tiempo | **3** | lo más grave: dos obras en el mismo punto a la vez |
| Están cerca **y** coinciden en el tiempo | 65 | requiere coordinación, pero no es lo mismo |
| Se tocan, en momentos distintos | 3 | informativo: mismo punto, sin simultaneidad |
| Están cerca, en momentos distintos | 103 | informativo |

**Decisión 2 · ¿La fecha de fin cubre todo ese día?**
Afecta a 214 de 460 trazados. «Fin 2026-10-01» ¿significa *hasta el comienzo del 1 de octubre* o
*hasta el final del 1 de octubre*? QGIS asumía lo segundo. El motor nuevo, por defecto, asume lo
primero, que es lo que dice literalmente el dato. Hoy no cambia ningún resultado; en cuanto haya
vigencias cortas, sí.

**Decisión 3 · ¿Se mantiene el umbral en 120 m?**
Aprobado provisionalmente. Con los números ya en la mano: 120 m deja 174 relaciones; 243 m deja 248.
El verificador permite probar cualquier valor antes de fijarlo.

**Decisión 4 · ¿Hace falta una tolerancia de contacto?**
Hoy «se tocan» significa 0,000 m exactos. Si dos trazados a 1 m deben considerarse en contacto, hay
que decirlo y es un parámetro más.

**Decisión 5 · ¿Qué se hace con el trazado de fecha imposible?**
`CW353556 · HUE-RC-12` tiene fecha de fin `2026-02-29`. Hay que corregirlo en origen con el
contratista; mientras tanto queda fuera del análisis temporal.

**Decisión 6 · ¿Se corrigen los 3 trazados duplicados** dentro de `CW366713_DESCARGAS_NORTE.kmz`?

**Decisión 7 · ¿Hay que soportar polígonos de verdad?**
El modelo ya los admite, pero nadie los está usando. Si van a usarse, conviene probarlos con datos
reales antes de la Etapa 3.

---

## 12. Cómo comprobarlo sin saber de programación

1. Abra la carpeta `motor/dist` del repositorio.
2. Haga **doble clic** en `verificador.html`. Se abre en su navegador. No necesita internet.
3. **Arrastre** dentro del recuadro los archivos de `01_KMZ_Entrada`. Puede soltar los ocho a la vez.
4. Pulse **«Calcular y comparar»**.

Verá dos bloques de cifras: arriba lo que produce el motor de QGIS que usa hoy; abajo, el motor nuevo.
Entre ambos aparece un aviso verde de **control de fidelidad**: confirma que los dos caminos de
reproducción del motor viejo coinciden y que, por tanto, la comparación es fiable.

Más abajo, la tabla **caso por caso** tiene botones para filtrar:

- **«Se tocan físicamente»** — los trazados que de verdad se cruzan.
- **«Que el motor de QGIS marcaba y el nuevo no»** — las 74 alertas que desaparecen, con su distancia
  real a la vista, para juzgar si se estaban perdiendo o sobrando.
- **«Que el nuevo ve y QGIS no»** — hoy, ninguna.

Puede cambiar los parámetros arriba y volver a pulsar «Calcular y comparar» cuantas veces quiera.
**Prueba recomendada:** ponga la distancia en `243` y el tiempo en «Solo la fecha». Debe salir
exactamente lo mismo que el motor de QGIS. Eso demuestra, sin fiarse de nadie, que el motor nuevo no
mide distinto: solo aplica criterios distintos cuando se lo pedimos.

Los botones del final descargan la tabla en Excel/CSV y los trazados en GeoJSON.

**Nada de esto modifica el sistema actual.** El tablero, QGIS y el generador siguen exactamente igual.
Los archivos que arrastra no salen de su computador.

---

*Etapa 1 terminada. Detenida para auditoría independiente. No se avanza a la Etapa 2.*
