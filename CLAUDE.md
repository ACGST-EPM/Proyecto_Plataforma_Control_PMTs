# CLAUDE.md — Plataforma de Control y Articulación de PMTs (Grupo EPM)

> Este archivo es la memoria del proyecto: Claude Code lo lee al inicio de cada sesión.
> El contexto completo (decisiones, límites, historial) está en `DOCUMENTACION_Plataforma_PMTs_EPM.md`. **Léelo antes de cambios grandes.**

## Idioma y comunicación
- Responde SIEMPRE en **español**.
- La usuaria (Leydi Marín, Centro de Gestión Servicios Técnicos de EPM) **no es programadora**: explica cada cambio en lenguaje sencillo, sin jerga innecesaria, y di qué archivo tocaste y por qué.
- Cuando entregues archivos, déjalos listos para copiar/pegar y súbelos por GitHub Desktop (ella no usa terminal).

## Objetivo de la herramienta
Automatizar el control de los Planes de Manejo de Tránsito (PMTs): capturar datos de trazados de forma estandarizada, detectar interferencias y cercanías espacio-temporales entre contratos, y visualizarlas en un dashboard web con mapa, filtros e informe PDF.

## Componentes y archivos (nombres definitivos)
- `Generador_KMZ.html` — captura estandarizada + genera KMZ (Leaflet + JSZip). Autocontenido.
- `proceso_pmt_qgis.py` — motor de análisis; se pega en la Consola de Python de QGIS. Genera capas + `reporte_dinamico.csv`.
- `dist/Plataforma_PMTs.html` — **LA APLICACIÓN (Etapa 2).** Un solo archivo, doble clic, sin internet.
  Lee KMZ/KML directamente. Fuente en `app/` (ver `app/README.md`); se regenera con `npm run construir:app`.
- `Plataforma_PMTs.html` — tablero ANTERIOR (Bootstrap + DataTables + Select2, lee `reporte_dinamico.csv`,
  mapa qgis2web en iframe, API de GitHub). **Sustituido.** Se conserva durante la transición; no lo modifiques.
- `contratos_db.json` — base maestra de contratos (contrato → contratista, proyecto, municipios[]).
- `DOCUMENTACION_Plataforma_PMTs_EPM.md` — documento maestro con todo el detalle.
- `AUDITORIA_ETAPA0_Plataforma_PMTs.md` — auditoría técnica del estado real (Etapa 0, aprobada).
- `INFORME_ETAPA1.md` — resultados de la Etapa 1.
- `motor/` — **motor geoespacial y temporal nuevo, en paralelo** (Etapa 1). No sustituye a nada
  todavía. Ver `motor/README.md` para las decisiones técnicas; `motor/dist/verificador.html` se abre
  con doble clic y compara el motor de QGIS con el nuevo, caso por caso.
- `app/fuentes/` — **gestión de fuentes, versiones y actualización incremental** (Etapa 3).
  Lógica pura, sin DOM y **sin saber de dónde vienen los datos**: huellas de contenido, inventario,
  detector de cambios, bitácora y el contrato del proveedor (`listar()` / `leer()`).
- `dist/Vista_previa_Datos.html` — **maqueta** de cómo se vería la plataforma cuando los KMZ lleguen
  solos. Usa la tubería real con un origen **simulado**; no hay nada corporativo conectado.
  Se regenera con `npm run construir:prototipo`. **Archivo aparte a propósito**: no puede
  confundirse con la aplicación.

### Documentos de referencia (leer antes de decidir algo grande)
- `BASELINE.md` — qué versión produjo qué, con qué reglas, y cómo reproducirlo desde un clon limpio.
- `ARQUITECTURA_OPERATIVA.md` — proceso AS-IS y TO-BE, modelo de fuentes, estrategia incremental,
  persistencia y flujo de automatización. Todo marcado CONFIRMADO / HIPÓTESIS / VALIDAR EPM.
- `INVESTIGACION_MICROSOFT_EPM.md` — qué es posible con SharePoint, Graph, Power Automate, SPFx,
  Teams y Azure, con documentación oficial; cuatro arquitecturas comparadas y una recomendación.
- `DESCUBRIMIENTO_EPM.md` — las 17 preguntas exactas para TI, cada una con qué decisión desbloquea.
- `ESCALABILIDAD.md` — medida real de 460 a 10.000 PMT y a partir de cuándo hay que actuar.
- `SEGURIDAD_MODELO_AMENAZAS.md` — qué se protege, de quién, qué está cerrado y qué no.

Repo publicado: `ACGST-EPM/Control-y-Articulacion-de-PMTs-EPM` (GitHub Pages).
Carpeta local: `C:\Users\lmarinza\PLATAFORMA_PMTs` (subcarpetas: `01_KMZ_Entrada`, `02_Proyecto_QGIS`, `Control-y-Articulacion-de-PMTs-EPM`).

## Estado (Etapa 2 CERRADA y congelada en `BASELINE.md`; Etapa 3 en curso)

### Invariantes de aplicación — no los rompa
- **Representación visual = estado interno.** Ningún filtro puede estar activo sin verse en su
  control. `Controles.verificarSincronia()` lo comprueba tras pintar y retira lo que el control no
  pueda representar.
- **El dato mostrado es el dato con el que se calcula.** El texto `AAAA-MM-DD HH:MM:SS` es CANÓNICO;
  los milisegundos son DERIVADOS y **no se persisten**. Si un archivo trae unos que contradicen al
  texto, la vigencia se descarta: no se elige en silencio (`app/nucleo/tiempo.js`).
- **Guardar y abrir no cambia la semántica.** Hay pruebas de ida y vuelta por tipo de geometría.
- **Resumen = detalle.** Tablero, informe y exportaciones usan `resumir(analisis, filas, relaciones,
  noEvaluables)` con el MISMO alcance. No recalcule una cifra por su cuenta en el informe.
- **A/B = B/A.** `puntosMasCercanos` delega la distancia en `medir()` y prueba la contención en las
  dos direcciones. Si no puede situar el punto con fiabilidad, devuelve `ubicado:false` y **no
  dibuja** en vez de inventar una ubicación.
- **El último día con actividad siempre es seleccionable** (`dominioRecorrido`, en días calendario,
  nunca redondeando duraciones).
- **Un error nunca queda invisible**: todos van a `#avisoGlobal`, que vive fuera del panel de carga.
- **Un dato derivado nunca sustituye al motor.**
- **Un fallo parcial no destruye lo válido que lo acompaña.** Cada extremo de una
  vigencia tiene su propio estado (`inicioValido` / `finValido`). Si solo se lee uno, se
  conserva ese; `valida` sigue significando UNA cosa: «se puede comparar en el tiempo», y
  para eso hacen falta los dos. Estados: `completa`, `incompleta`, `ilegible`,
  `incoherente`, `invertida`, `ausente` (`app/nucleo/tiempo.js`).
- **Ninguna cifra viaja sin su alcance.** `resumir()` devuelve siempre `pmts`
  (lo visible), `pmtsCargados` (el total) y `filtrado`. Las tarjetas del tablero enseñan
  el ALCANCE VISIBLE y se repintan con cada filtro; el total va a su lado, etiquetado.
  «Calidad de los datos» y el cotejo con la instantánea usan el TOTAL, y se dice.
- **Un resultado ya pintado no sobrevive al estado que lo produjo.** El informe lleva un
  SELLO del estado (fuentes, filtros, día, recuentos). Si cambia, queda marcado como
  caducado, se atenúa y **no se deja imprimir** hasta regenerarlo (política B: invalidación
  explícita; se descartó regenerar solo porque el recorrido dispara un cambio cada pocas
  décimas de segundo y porque un informe que se rehace sin avisar es indistinguible de uno
  que no ha cambiado).
- **`ubicado: true` significa que el dibujo es fiable.** Se comprueba la separación
  GEODÉSICA de los dos puntos que se van a dibujar contra la distancia canónica, no un
  número intermedio. Si no cuadra, se intenta deshaciendo la proyección
  (`plano.desproyectar`); si sigue sin cuadrar, `ubicado:false`, se conserva la distancia
  y **no se dibuja nada**.
- **Ningún contador sin evidencia.** `duplicadosExactos` se cuenta sobre los TRAZADOS
  (`x.duplicadoExacto`), no sobre el análisis de archivos, así que vale igual venga de un
  KMZ o de un proyecto. Al abrir un proyecto la marca solo se acepta si el identificador
  la respalda (sufijo `~N`): un archivo editado no puede inflar el recuento.

### Etapa 3 (en curso) — plataforma operativa
- **Una abstracción sin al menos dos usos reales es deuda, no diseño.** Por eso hay
  `SourceProvider` (local + simulado) y bitácora, pero NO `ProjectRepository` ni
  `NotificationProvider`: tendrían una sola implementación trivial o ninguna regla que aplicar.
- **Tres preguntas distintas, que no se mezclan**: ¿mismos bytes? (huella) · ¿mismo archivo, más
  nuevo? (proveedor + ruta) · ¿mismo PMT? (identificador estable). Confundirlas hace que renombrar
  parezca un alta y una baja, o que una copia duplique 60 trazados.
- **Mover ≠ copiar ≠ alta.** Si el contenido ya se conocía y su ruta anterior **ya no está**, se
  movió; si **sigue ahí**, es una copia y no se procesa.
- **El reloj del origen no decide.** `modificadoDeclarado` es informativo; decide la huella.
- **Una fuente que no se pudo leer NO se da por vigente con su versión anterior.**
- **La bitácora no inventa quién hizo qué.** Sin identidad, el actor es `equipo-local`.
- **No se afirma nada antes de saberlo**: al revisar, todavía no se ha leído ningún archivo, así que
  no se puede decir qué PMT cambian.
- Toda cifra que sale del producto lleva **procedencia**: app, motor, reglas, fecha y parámetros.
  En el CSV va en el nombre del archivo; el **CSV legado no se toca** (11 columnas, invariante).
- **Un error nunca queda invisible, tampoco los no previstos**: `error` y `unhandledrejection` van a
  `#avisoGlobal`.
- Pruebas: **231 motor + 164 app + 45 de navegador real**.

### Otras reglas de la 2.4
- `motor/src/geo/plano-local.js` añade `desproyectar()` (inverso del plano ENU, iterando
  sobre la altura elipsoidal). **No interviene en ninguna medida**: solo sitúa dibujos.
  Interpolar en grados sobre el tramo original NO da la misma línea que la recta del plano
  que el motor mide: en 66 km sobre un paralelo se separan 9,4 m.
- La prueba «el desvío crece con el tramo» fue **sustituida**: ese crecimiento era el
  defecto. Ahora se exige que esté ACOTADO a cualquier largo, más una prueba de propiedad
  sobre geometrías generadas (semilla fija) del invariante de ubicación.
- Pruebas: **231 motor + 121 app + 43 de navegador real**.

### Otras reglas de la 2.3
- `app/nucleo/geojson.js` valida con una **regla explícita por tipo**. No vuelva a deducir la
  estructura por la profundidad de los arrays: eso rechazaba `Polygon`, `MultiLineString` y
  `MultiPolygon` de un solo elemento.
- El **gestor de fuentes** (`#panelFuentes`) queda visible siempre que haya análisis.
- Las fechas de filtro se validan contra el calendario real, no con una expresión regular.
- Pruebas: 229 motor + 102 app + **37 de navegador real**.

### Estado anterior (Etapa 2.2)
- **Un `.pmt.json` NUNCA dicta resultados.** Guarda trazados (entrada), procedencia, configuración y
  una instantánea de recuentos marcada como informativa. Las relaciones **se recalculan siempre** al
  abrir. `leerProyecto()` valida esquema (rechaza 0, −1 y futuros), IDs duplicados, geometrías,
  coordenadas fuera del planeta y configuración. La `huella` detecta corrupción accidental; **no es
  autenticación** y no se presenta como tal.
- **Semántica temporal de la interfaz: un día es el DÍA CALENDARIO COMPLETO** (`vigentesEnDia`). El
  motor sigue calculando traslape con fecha y hora exactas: eso no se toca. No mezcle «instante» y
  «día» bajo la misma etiqueta.
- **Fuentes**: abrir un proyecto lo incorpora como UNA FUENTE MÁS. Añadir suma, quitar resta,
  «Empezar de nuevo» vacía. Identidad por nombre + huella de contenido.
- **`Empezar de nuevo` llama a `Controles.reiniciarEstado()`**: sin eso quedaba un filtro aplicado e
  invisible. Nunca puede haber un filtro activo sin su control visible.
- **Pares no evaluables**: tienen pestaña propia, contador propio y salen en el informe. Jamás se
  presentan como «lejos» ni como «sin relación».
- **Velocidades del recorrido**: el `<select>` guarda el MULTIPLICADOR y el intervalo se deriva
  (`intervaloDe`). No vuelva a poner un suelo con `Math.max`: rompía la proporción.
- `VERSION_REGLAS` en `motor/src/nucleo/config.js` identifica las reglas canónicas. **Súbala solo si
  cambia algo que mueva cifras.**
- Pruebas: 229 motor + 75 app + **31 de navegador real**.

### Estado anterior (Etapa 2.1)
- **El mapa base NUNCA lleva `crossOrigin`.** Fue la causa del mapa en blanco: obliga a CORS y el
  navegador descarta teselas válidas si un proxy corporativo quita la cabecera. Demostrado en las 8
  combinaciones posibles. Tampoco se usa el prefijo `{s}.` (la política de OSM lo desaconseja).
- El mapa base es **intercambiable** (`app/nucleo/mapas-base.js`), con respaldo automático y un hueco
  para un servidor de EPM configurable desde la interfaz. No hay evidencia de que exista tal servidor.
- **Filtros cruzados**: cada lista se recalcula con los demás filtros pero NO se autolimita, lo
  seleccionado nunca desaparece y la lista en uso no se repinta. Si toca `opcionesFacetadas()`,
  conserve las tres reglas.
- `motor/src/geo/acercamiento.js` calcula los puntos reales de aproximación, **solo para dibujar**.
  Una prueba exige que su distancia coincida con `medir()`: no la relaje.
- Pruebas: 229 motor + 49 app + **21 de navegador real** (`npm run test:navegador`). La Etapa 2 no
  tenía pruebas de navegador y por eso se entregaron defectos que solo se ven al abrir la aplicación.
- Proyectos `.pmt.json` con esquema versionado. **Llevan datos operativos: no subirlos al repositorio.**

### Estado anterior (Etapa 2)
- **La operación normal YA NO requiere** QGIS, Python/PyQGIS, qgis2web, `reporte_dinamico.csv`,
  API de GitHub ni GitHub Pages. `proceso_pmt_qgis.py` queda como **oráculo de regresión**: el motor
  reproduce su salida 708/708 y esa comprobación debe seguir pasando.
- Punto de entrada único: `npm run preparar` · `npm test` (218 motor + 37 app) · `npm run construir`.
  **`motor/package-lock.json` SÍ se versiona**: sin él `npm ci` falla y se pierden 3 pruebas.
- La aplicación **no clasifica criticidad**. Presenta hechos separados (distancia, contacto físico,
  coincidencia temporal). No introduzcas «crítico/alto/medio» sin decisión operativa explícita.
- Regla que atraviesa el producto: **«no se encontró relación» y «no se pudo analizar» nunca se
  presentan igual**. Contador, color, filtro y pastilla propios para cada uno.
- `app/nucleo/` es lógica pura sin DOM (se prueba en Node); `app/ui/` toca el DOM (se prueba en
  navegador). No mezcles las dos cosas.
- Leaflet 1.9.4 (BSD-2-Clause) está **vendorizado** en `app/vendor/`. No lo sustituyas por una CDN:
  la aplicación debe funcionar sin internet.

### Estado anterior (Etapa 1, cerrada y auditada)
- El motor nuevo (`motor/`) corre **en paralelo**: no sustituye al tablero, no retira QGIS ni
  qgis2web, no toca el generador. `proceso_pmt_qgis.py` queda **congelado** como referencia; no se
  corrige para hacerlo coincidir con el nuevo.
- `motor/src/legado/replica.js` reproduce el motor de QGIS **con sus defectos a propósito**. No
  arregles nada ahí: su valor es poder demostrar qué hacía el sistema anterior.
- El núcleo separa HECHOS (distancia, contacto, traslape) de su CLASIFICACIÓN. No metas reglas de
  criticidad dentro del cálculo: van en `provisional.js` y siguen sin aprobarse.
- Parámetros aprobados: umbral **120 m reales** (configurable), traslape con **fecha y hora**,
  tolerancia **0 minutos**. El ~243 m del legado es solo línea base de comparación.
- Rondas **1.1** (endurecimiento) y **1.2** (13 hallazgos de la auditoría independiente de Codex) ya
  aplicadas. Detalle en la sección 13 de `INFORME_ETAPA1.md`. Ninguna cifra publicada cambió.
  `motor/test/auditoria-codex.test.mjs` lleva una prueba adversaria por hallazgo: **no la borres ni
  la relajes**, es la prueba de que cada defecto está cerrado.
- El motor mide en cualquier punto del planeta **siempre que cada par comparado quepa en 50 km**
  (`RADIO_DOMINIO_METROS`). Fuera de ahí devuelve `null` y lo dice. No prometas más que eso.
- **Nunca subas al repositorio** los KMZ de `01_KMZ_Entrada`, `reporte_dinamico.csv` ni los
  `crudo_*.json`: el repositorio es público y esos archivos llevan datos operativos y personales.

## Invariantes que NO debes romper (si cambias una punta, actualiza la otra)
- **Formato del campo Descripción del KMZ** (lo produce el generador y lo lee el motor):
  `fecha_inicio: AAAA-MM-DD HH:MM:SS | fecha_fin: ... | tipo_cierre: <total|parcial|ingreso y salida> | direccion: ... | municipio: ... | contrato: ... | contratista: ... | proyecto: ...`
  Separador ` | `. Los textos libres eliminan cualquier `|` interno.
- **Lista cerrada `tipo_cierre`**: `total`, `parcial`, `ingreso y salida`. Son EXACTAMENTE tres.
  En la Etapa 2 se añadieron `ingreso` y `salida` por separado sin decisión aprobada; en la 2.1 se
  retiraron. Si algún día se separan, hay que actualizar generador Y motor a la vez y migrar los KMZ
  existentes. En los 8 KMZ reales hay 35 trazados con `ingreso y salida` como valor único.
- **Columnas del CSV** (`reporte_dinamico.csv`): `CATEGORIA, CONTRATO, CONTRATISTA, MUNICIPIO, FRENTE, DIRECCION, ESTADO_CIERRE, HORARIO, FECHA_INICIO, FECHA_FIN, DURACION_DIAS`. El dashboard depende de estos índices (0..10).
- **Capas QGIS** (nombres exactos): `🚀 GESTIÓN PMT MAESTRA`, `📍 INGRESO Y SALIDA` (punto azul), `🔵 CERCANÍA (120m)`, `🟠 INTERFERENCIA REAL`, `📋 REPORTE DINÁMICO`.
- **Marca EPM**: verde `#009300`, lima `#b7c200`, naranja `#d56b00`.

## Cómo debes trabajar (usa todo tu potencial)
- Sé proactivo y ambicioso: **investiga en la web** el estado actual de librerías/servicios antes de recomendar (no confíes solo en memoria), **audita** el código en busca de errores o riesgos, y **propón e implementa mejoras** alineadas al objetivo.
- Usa los **skills** que apliquen (p. ej. diseño frontend para la UI, documentos para informes, hojas de cálculo/PDF si se requieren) sin que haya que pedírtelo.
- **Verifica siempre** lo que produces: revisa sintaxis, simula la lógica con casos de prueba y confirma que no rompiste nada existente antes de decir "listo".
- Mantén el sistema de diseño y la marca EPM; conserva la coherencia entre generador, motor y dashboard.
- Planifica primero en pasos claros cuando el cambio sea grande, y explícalos.

## No hagas (don'ts)
- No incrustes llaves/secretos (API keys, contraseñas) en código de cliente (HTML/JS): el sitio es público.
- No prometas seguridad que un sitio estático no puede dar (ver SEGURIDAD abajo); sé honesto sobre los límites.
- No cambies el formato de Descripción ni las columnas del CSV sin actualizar a la vez el productor y el consumidor.
- No hagas cambios destructivos o irreversibles sin explicarlos y pedir confirmación.
- No inventes datos: si algo depende de información que no tienes, pídela o búscala.

## SEGURIDAD (workstream pendiente prioritario)
Objetivo: que solo entren correos `@epm.com.co` con un código de un solo uso que cambia en cada acceso (OTP). Un sitio estático de GitHub Pages **no** puede autenticar ni proteger los datos por sí solo. Dos rutas evaluadas: (A) **Cloudflare Access con One-time PIN** sobre Cloudflare Pages (lo más cercano al requisito, bajo código); (B) **Azure Static Web Apps con Microsoft Entra ID** (SSO corporativo; la restricción por tenant requiere plan Standard de pago). En ambos casos hay que involucrar a **TI/Seguridad de EPM** (dominio propio, gobierno de datos). Detalle completo en la sección SEGURIDAD del documento maestro.

## Verificación antes de entregar
1. ¿Sintaxis válida? (revisa/valida el JS/Python).
2. ¿La lógica hace lo esperado en casos límite? (simula).
3. ¿Se conservan las funcionalidades existentes? (sin regresiones).
4. ¿Explicaste el cambio en lenguaje sencillo y dejaste los archivos listos para subir?
