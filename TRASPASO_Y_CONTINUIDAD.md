# Traspaso y continuidad del desarrollo

> **Para qué sirve este archivo.** Es el único documento que hay que leer para retomar este
> proyecto, en la herramienta que sea. Contiene qué se construyó, en qué punto quedó, qué falta, qué
> puede salir mal y cómo seguir. Está escrito para que lo lea una persona **y** para que lo lea la
> IA que vaya a continuar el trabajo.
>
> **Fecha de corte:** 16 de septiembre de 2026 · **Último commit del origen:** `b10082c`

## Por qué existe este documento

El desarrollo se hizo en Claude Code sobre el repositorio corporativo
`ACGST-EPM/Proyecto_Plataforma_Control_PMTs`. Ese repositorio dejó de estar disponible para el
trabajo diario por una restricción corporativa sobre el uso de GitHub.

Hubo un intento de trasladarlo a Copilot · Cowork sobre una carpeta de OneDrive corporativo. **Ese
traslado se abortó.**

**Destino definitivo:** repositorio personal `LJMARINZA/Proyecto_Plataforma_Control_PMTs`, clonado
en el PC personal en `C:\Users\Leidy Marin Zapata\DESARROLLOS_EPM\Proyecto_Plataforma_Control_PMTs`.

## Lo que este cambio arregla, y no es menor

El repositorio anterior es **PÚBLICO** y su historia contiene `01_KMZ_Entrada.zip` con datos de obra
reales (commit `4de5969`). Ese ha sido el **riesgo abierto número 1** desde la Etapa 3, y no se
podía cerrar: borrar la historia exige autorización expresa y, además, **no bastaría** — lo que
estuvo público hay que darlo por copiado.

**Un repositorio nuevo empieza sin historia.** Es la única forma limpia de dejar atrás ese problema.
Por eso el paquete de arranque que acompaña a este documento **no incluye ese archivo**, y por eso
el repositorio nuevo **debe ser privado**.

Lo que NO cambia: el riesgo histórico del repositorio antiguo sigue existiendo mientras ese
repositorio siga público. Lo que se consigue es **no arrastrarlo**.

---

# PARTE 1 · QUÉ ES ESTO

## 1.1 · El problema que resuelve

EPM ejecuta obras a través de varios contratos a la vez. Cada obra que cierra o interviene una vía
necesita un **Plan de Manejo de Tránsito (PMT)**. Cuando dos contratos distintos intervienen el
mismo sector en fechas que se solapan, hay que **coordinarlos**: señalización, desvíos, programación.

Antes eso se detectaba a mano, con QGIS y un proceso en Python, y el resultado era un CSV y un mapa
estático. La plataforma lo automatiza: lee los KMZ de los contratistas, mide distancias reales entre
trazados, cruza las vigencias y presenta en un mapa qué hay que coordinar, con quién y cuándo.

## 1.2 · Qué es técnicamente

**Un solo archivo HTML que se abre con doble clic y funciona sin internet.**

Eso no es una casualidad ni una limitación: es la decisión de arquitectura que sostiene todo el
proyecto. El PC corporativo no permite instalar nada ni conectarse a servicios externos, así que el
producto tenía que caber en un archivo que se pueda copiar a una carpeta y abrir.

Consecuencias que **no se pueden romper**:

- No hay servidor, no hay base de datos, no hay servicio en la nube.
- No hay dependencias en tiempo de ejecución. Leaflet (el mapa) va **incrustado**, no desde internet.
- Si no hay red, el mapa de fondo no carga pero **la plataforma sigue funcionando**: los trazados,
  las distancias y las relaciones no dependen de él.

## 1.3 · Las tres piezas

| Pieza | Qué hace | Dónde vive |
|---|---|---|
| **La aplicación** | lo que usa Leydi: carga KMZ, analiza, mapa, tablas, informe | `dist/Plataforma_PMTs.html` (generado) desde `app/` |
| **El motor** | mide distancias geodésicas y cruza vigencias | `motor/src/` |
| **Las herramientas** | construyen la aplicación, ejecutan las compuertas, comparan modelos | `herramientas/` |

---

# PARTE 2 · ESTADO ACTUAL

## 2.1 · Etapas

| Etapa | Estado |
|---|---|
| **Etapa 0** — auditoría del sistema anterior | cerrada y aprobada |
| **Etapa 1** — motor geoespacial nuevo | cerrada y auditada por un tercero |
| **Etapa 2** — la aplicación de un solo archivo | **CERRADA y congelada** en `BASELINE.md` |
| **Etapa 3** — plataforma operativa (crear PMT, reactivar, histórico) | **ENTREGADA, no aprobada** |
| **Etapa de evolución** — producto, experiencia de uso, cartografía, fuentes | **ENTREGADA, no aprobada** |

«Entregada, no aprobada» significa: funciona, está probada, está documentada, y **está parada a
propósito** esperando que alguien distinto la revise. No es un estado de error.

## 2.2 · Verificación en el momento del corte

| Suite | Resultado |
|---|---|
| Pruebas del motor (Node) | **259 · 258 pasan · 0 fallan** *(1 salta: requiere un artefacto opcional)* |
| Pruebas de la aplicación (Node) | **258 · 258 pasan · 0 fallan** |
| Pruebas de navegador real (Playwright) | **85 · 85 pasan · 0 fallan** |
| Compuertas de entrega A..R | **18 de 18** |

## 2.3 · Rendimiento medido

Navegador real, con los 8 KMZ reales (460 PMT):

| Acción | Tiempo |
|---|---|
| Abrir la aplicación | 190 ms |
| Cargar 8 KMZ y analizar | 1.058 ms |
| Aplicar un filtro | 93 ms |
| Elegir una relación y aislarla en el mapa | 68 ms |
| Generar el informe | 101 ms |
| Errores de JavaScript | ninguno |

---

# PARTE 3 · FUNCIONALIDADES CONSTRUIDAS

## 3.1 · Análisis

- Lee **KMZ y KML** directamente, sin QGIS ni Python.
- Mide la **distancia real** (geodésica) entre trazados, en cualquier punto del planeta siempre que
  cada par comparado quepa en 50 km. Fuera de ahí devuelve «no evaluable» y lo dice.
- Cruza **vigencias con fecha y hora**, tolerancia 0 minutos.
- Umbral vigente: **120 m**. Hay un modelo candidato (zonas de influencia de 120 m que se
  superponen = 240 m) calculado y disponible, **pero no aplicado**.
- **Nunca clasifica criticidad.** Presenta hechos separados: distancia, contacto físico,
  coincidencia temporal. No hay «crítico / alto / medio» y hay una compuerta que lo vigila.

## 3.2 · Lectura operativa

Dos etiquetas **excluyentes**, que no son un orden de gravedad:

- **ARTICULACIÓN REQUERIDA** — comparten espacio **y** coinciden en el tiempo.
- **COINCIDENCIA ESPACIAL** — comparten espacio, en momentos distintos.

Y un tercer valor que no es ninguno de los dos: **NO SE PUDO COMPROBAR**. Esa distinción atraviesa
todo el producto: «no se encontró relación» y «no se pudo analizar» nunca se presentan igual.

Para que una coincidencia sea **atendible hoy** hacen falta **las dos partes vivas**. Con un
contrato cuya obra terminó no hay nada que acordar, aunque el otro siga vigente. Medido sobre los 8
KMZ reales: la regla anterior presentaba 95 relaciones como accionables; la correcta presenta **27**.

## 3.3 · Interfaz

- **Tres cifras arriba que SON el filtro.** Pulsar «requieren articulación» deja en el mapa y en la
  tabla exactamente esas.
- **Mapa limpio por defecto.** Al elegir una relación **aísla los dos PMT**, dibuja sus zonas de
  influencia y la superposición, y encuadra a los dos.
- **Simbología por forma, no solo por color.** El cierre parcial es **línea continua** con núcleo
  claro (confirmado por Leydi; la discontinua sugería «tramo incompleto»).
- **Recorrido en el tiempo** pegado al mapa: mueve el día y el mapa responde.
- **Tablas con columnas configurables.** En relaciones, las columnas «Lectura», «En el espacio» y
  «En el tiempo» son **fijas**: la lectura no puede quedarse sola afirmando.
- **Filtros cruzados** que no se autolimitan.
- **Informe ejecutivo** imprimible a PDF, con sello del estado: si cambia lo que se está viendo, el
  informe queda marcado como caducado y no se deja imprimir hasta regenerarlo.

## 3.4 · Captura y edición dentro de la plataforma

- Crear un PMT sin salir de la aplicación, dibujando en el mapa.
- **El contrato deriva** contratista y proyecto y limita los municipios. Eso elimina la clase entera
  de error «la misma organización escrita de cuatro maneras».
- Tres niveles de validación: **ERROR** impide guardar · **ADVERTENCIA** deja guardar y pide
  revisión · **INFORMACIÓN** solo orienta.
- **Reactivar** un PMT: reutiliza el trazado **exactamente** (se clona y se comprueba la igualdad) y
  solo pide fechas nuevas.

## 3.5 · Seguimiento documental

Tres documentos por PMT: **Resolución PMT**, **Permiso de rotura**, **Cierre del permiso de rotura**.

- «Pendiente» **nunca es un código**. El dato queda vacío y el estado se deriva.
- Se filtra por las **dos caras**: lo que falta y lo que ya está registrado.
- Se busca un PMT por cualquiera de sus tres códigos.
- **Cada activación lleva los suyos** (regla dada por Leydi el 15/09/2026). Una vigencia nueva nace
  en `0/3`; el número de la anterior se conserva como historia, se muestra en letra menuda y **no
  cuenta como registrado**.

## 3.6 · Gestión de fuentes

- Tres preguntas que **no se mezclan**: ¿mismos bytes? · ¿mismo archivo más nuevo? · ¿mismo PMT?
- **Mover ≠ copiar ≠ alta.** Una copia byte a byte **no se incorpora**: contaría los mismos PMT dos
  veces. No se descarta en silencio: se dice y queda en la bitácora.
- **Historial** de qué entró, qué se reemplazó y qué se quitó, con la hora.
- Huella **SHA-256** con respaldo declarado cuando el navegador no da criptografía.

## 3.7 · Proyectos guardados

`.pmt.json` con esquema versionado. Guarda **entradas**, nunca resultados: las relaciones **se
recalculan siempre** al abrir. **Llevan datos operativos reales — no se suben a ningún sitio público.**

---

# PARTE 4 · LO QUE NO SE PUEDE ROMPER

> Esta sección es la más importante del documento. Son decisiones tomadas con motivo, muchas de
> ellas después de haber cometido el error contrario. **Antes de cambiar algo aquí, pregunta.**

## 4.1 · Invariantes de honestidad

1. **NO EVALUABLE ≠ VERDADERO ≠ FALSO.** En el espacio, en el tiempo y en los documentos. Esconder
   lo desconocido afirma que no importa; contarlo como bueno afirma que lo es.
2. **«No se encontró relación» y «no se pudo analizar» nunca se presentan igual.** Contador, color,
   filtro y pastilla propios para cada uno.
3. **Ninguna cifra viaja sin su alcance.** Siempre se dice cuántos hay en total y cuántos se están
   viendo.
4. **Un error nunca queda invisible.** Todos van a `#avisoGlobal`, incluidos los no previstos.
5. **Un dato derivado nunca sustituye al motor.** Las relaciones se recalculan siempre.
6. **La plataforma no clasifica criticidad.** Hay una compuerta que busca vocabulario de gravedad.
7. **No se inventan restricciones jurídicas.** Cuando EPM aporta una regla, entra **citada**.

## 4.2 · Invariantes de interfaz

8. **Representación visual = estado interno.** Ningún filtro puede estar activo sin verse en su
   control. Lo mismo para cualquier ajuste dentro de un plegable.
9. **El dato mostrado es el dato con el que se calcula.**
10. **Guardar y abrir no cambia la semántica.**
11. **Resumen = detalle.** El informe no recalcula ninguna cifra por su cuenta.
12. **Un resultado ya pintado no sobrevive al estado que lo produjo.**

## 4.3 · Invariantes de geometría

13. **Reactivar reutiliza el trazado EXACTAMENTE.** Se clona y se comprueba la igualdad.
14. **Nunca se altera una geometría para que coincida visualmente.** Ni *snapping*, ni
    desplazamiento silencioso, ni simplificación.
15. **Si no se puede situar un punto con fiabilidad, no se dibuja.** Se conserva la distancia y se
    devuelve `ubicado:false` en vez de inventar una ubicación.
16. **A/B = B/A.** La distancia se mide en un solo sitio y se prueba en las dos direcciones.

## 4.4 · Invariantes de formato (si cambias una punta, actualiza la otra)

17. **Formato del campo Descripción del KMZ**, separador ` | `:
    `fecha_inicio: AAAA-MM-DD HH:MM:SS | fecha_fin: ... | tipo_cierre: <total|parcial|ingreso y
    salida> | direccion: ... | municipio: ... | contrato: ... | contratista: ... | proyecto: ...`
18. **`tipo_cierre` tiene EXACTAMENTE tres valores**: `total`, `parcial`, `ingreso y salida`. En la
    Etapa 2 se separaron sin decisión aprobada y en la 2.1 hubo que retirarlo.
19. **El CSV legado no se toca**: 11 columnas, en ese orden.
20. **Marca EPM**: verde `#009300`, lima `#b7c200`, naranja `#d56b00`. Para fondos con texto blanco
    se usan `--verde-texto` (#007000) y `--naranja-texto` (#a35200), porque el verde de marca da
    4,06:1 y la norma AA exige 4,5:1.

## 4.5 · Invariantes de cartografía

21. **El mapa base NUNCA lleva `crossOrigin`.** Fue la causa del mapa en blanco: obliga a CORS y el
    navegador descarta teselas válidas si un proxy corporativo quita la cabecera. Demostrado en las
    8 combinaciones posibles.
22. **Leaflet va incrustado**, nunca desde una CDN.

## 4.6 · Las 18 compuertas

`npm run compuertas` ejecuta 18 comprobaciones (A..R) **sobre el producto**, no sobre el código.
Cada una se rompió a propósito una vez para comprobar que detecta su infracción.

| | Qué vigila |
|---|---|
| **A** | el artefacto no contradice los formatos invariantes |
| **B** | no aparece vocabulario de criticidad |
| **C** | el CSV legado conserva sus 11 columnas |
| **D** | la marca EPM se respeta |
| **E** | el modelo espacial por defecto sigue siendo 120 m |
| **F** | «Pendiente» es un estado derivado, nunca un código |
| **G** | «no se pudo comprobar» nunca se convierte en un hecho |
| **H** | la aplicación funciona sin internet |
| **I** | ningún dato operativo o personal está versionado |
| **J** | toda cifra que sale lleva su procedencia |
| **K** | el oráculo del motor de QGIS no se ha borrado |
| **L** | la baseline se puede reproducir |
| **M** | reactivar reutiliza el trazado exactamente |
| **N** | la clasificación temporal usa UNA sola fecha de referencia |
| **O** | ocultar históricos nunca borra un hecho |
| **P** | una coincidencia operativa exige DOS partes coordinables |
| **Q** | lo que no se puede situar no se cuenta como atendible |
| **R** | cada activación lleva sus propios documentos |

---

# PARTE 5 · QUÉ FALTA

## 5.1 · Decisiones que dependen de Leydi

| # | Decisión | Datos para decidir |
|---|---|---|
| **1** | **¿Se sustituye la regla de 120 m por el modelo de zonas (240 m)?** | Vigente **174** relaciones · candidato **247** · QGIS histórico **248**. El candidato añade **73** (16 con coincidencia temporal) y no cuesta más tiempo de máquina. **El hallazgo de fondo: el modelo vigente dejó fuera 74 relaciones que el sistema anterior SÍ veía.** Pero 73 relaciones más son 73 conversaciones más |
| **2** | ¿El repositorio sigue público o se hace privado? | contiene datos de obra reales |
| **3** | ¿Las tres cifras de la bandeja son las correctas? | se eligieron por hipótesis de la rutina diaria |
| **4** | ¿Las columnas por defecto de las tablas son las que se usan? | — |

## 5.2 · Preguntas para EPM / TI

| # | Pregunta | Qué desbloquea |
|---|---|---|
| **1** | ¿El **cierre del permiso de rotura** sigue la misma regla que la resolución y el permiso? | confirmar una **asunción ya implementada** |
| **2** | ¿Existe un consecutivo corporativo de PMT? | identidad estable del PMT base |
| **3** | ¿Qué mapa base puede usar EPM, y con qué licencia? | cartografía |
| **4** | ¿Hay Microsoft 365 con Power Platform habilitado para este equipo? | automatización |
| **5** | Autenticación: ¿Cloudflare Access o Entra ID? | seguridad |

Las 22 preguntas completas están en `DESCUBRIMIENTO_EPM.md`.

## 5.3 · Trabajo técnico pendiente

1. **Auditoría independiente** de la Etapa 3 y de la etapa de evolución. Es el siguiente paso
   natural. `AUTOREVISION_ETAPA3.md` dice **dónde no he mirado**: es el punto de partida.
2. **Eje E del desfase cartográfico**: no se pudo comprobar porque el entorno de desarrollo no tiene
   salida a los servidores de teselas. **Solo se puede comprobar desde el PC de EPM.**
3. **Modelo de información futuro**: documentos como objetos con fecha y autor, geometría versionada,
   catálogo de contratos como fuente. Está diseñado en `MODELO_INFORMACION_Y_PUBLICACION.md`; los dos
   primeros pasos no dependen de ninguna respuesta de EPM.
4. **Cálculo incremental de relaciones**: deliberadamente **no** hecho. Con 460 PMT cuesta décimas de
   segundo; optimizarlo ahora sería añadir una fuente de errores para ahorrar lo que nadie nota.

---

# PARTE 6 · RIESGOS ABIERTOS

| # | Riesgo | Estado |
|---|---|---|
| **1** | **El repositorio ANTERIOR es PÚBLICO y su historia contiene datos de obra reales** (`01_KMZ_Entrada.zip`, commit `4de5969`) | **abierto, y no se cierra mudándose.** Lo que estuvo público hay que darlo por copiado. Lo que sí se consigue: **el repositorio nuevo no lo arrastra**, porque empieza sin historia. Decisión pendiente de EPM: ¿se hace privado el antiguo, o se acepta por escrito? |
| **2** | **No hay autenticación, y un sitio estático no puede darla** | **abierto.** Una clave escrita en HTML o JavaScript no es una protección débil: **no es una protección** |
| **3** | **El desfase cartográfico (eje E) no se pudo comprobar** | **abierto.** Requiere el PC de EPM |
| **4** | La lectura operativa sigue siendo provisional | abierto a propósito |
| **5** | El modelo vigente deja fuera 74 relaciones que el anterior veía | abierto — decisión 1 de §5.1 |
| **6** | El catálogo de contratos viaja embebido | abierto |
| **7** | **El repositorio nuevo es personal, no corporativo** | **a validar con EPM.** Trabajar el desarrollo en una cuenta personal resuelve la restricción de herramienta, pero no es lo mismo que tener el visto bueno para que el código de un proceso de EPM viva ahí. Conviene decirlo y que quede dicho, no descubrirlo después |
| **8** | **Los KMZ reales quedan fuera del repositorio** | **es lo correcto**, pero significa que hay que guardarlos aparte y no perderlos. Carpeta propia, fuera del clon |

---

# PARTE 7 · QUÉ ARCHIVOS HACEN FALTA

> Respuesta corta: **todo el proyecto sin `node_modules` ni `.git` ocupa 3,8 MB.** No hay problema
> de espacio. Si la carpeta pesa mucho más, es porque se copió `motor/node_modules` (41 MB) o
> `.git` (12 MB), y ninguna de las dos hace falta.

## 7.1 · Núcleo de trabajo — **2,7 MB, imprescindible**

```
app/                          ← el código fuente de la aplicación
  app.js                        orquestador (81 KB)
  index.html                    estructura
  estilos.css                   sistema de diseño
  README.md                     cómo está organizado
  nucleo/                       lógica pura, sin pantalla (se prueba en Node)
  ui/                           todo lo que toca la pantalla
  fuentes/                      gestión de fuentes, versiones, bitácora
  vendor/                       Leaflet incrustado — SIN ESTO NO HAY MAPA
  test/                         343 pruebas (258 en Node + 85 de navegador) · LA RED DE SEGURIDAD
motor/
  src/                          motor geoespacial y temporal
  fixtures/                     datos de prueba sintéticos
  test/                         pruebas del motor
  package.json                  declara las dependencias
  package-lock.json             fija las versiones exactas
herramientas/                 ← construir, compuertas, comparador, demo
  construir-app.mjs             convierte app/ en el archivo único
  compuertas.mjs                las 18 comprobaciones
  comparador-espacial.mjs       120 m vs 240 m
  construir-catalogo.mjs        embebe contratos_db.json
  generar-demo.mjs              KMZ de demostración
package.json                  ← los comandos
contratos_db.json             ← base maestra de contratos
dist/Plataforma_PMTs.html     ← LA APLICACIÓN (896 KB, generado)
proceso_pmt_qgis.py           ← oráculo de regresión · LA COMPUERTA K LO EXIGE
Generador_KMZ.html            ← captura estandarizada, autocontenido
```

## 7.2 · Documentos vivos — **256 KB, muy recomendable**

| Archivo | Por qué |
|---|---|
| `CLAUDE.md` | **el más importante.** Memoria del proyecto: todas las decisiones y sus motivos |
| `TRASPASO_Y_CONTINUIDAD.md` | este archivo |
| `GUIA_LEYDI.md` | la guía sin tecnicismos |
| `BASELINE.md` | qué versión produjo qué · **la compuerta L lo exige** |
| `INFORME_ETAPA_EVOLUCION.md` | el cierre de la última etapa, con el recorrido de 8 pruebas |
| `MODELO_INFORMACION_Y_PUBLICACION.md` | a dónde va el modelo de datos y los cuatro ejes de publicación |
| `DESCUBRIMIENTO_EPM.md` | las 22 preguntas para TI |
| `ARQUITECTURA_OPERATIVA.md` | proceso AS-IS y TO-BE |
| `AUTOREVISION_ETAPA3.md` | **dónde NO he mirado** — punto de partida de la auditoría |
| `SEGURIDAD_MODELO_AMENAZAS.md` | qué está cerrado y qué no |
| `ESCALABILIDAD.md` | de 460 a 10.000 PMT |
| `INFORME_ETAPA3.md` · `INFORME_ETAPA3_COMPLEMENTO.md` · `CORRECCION_SEMANTICA.md` | historia de las decisiones |
| `AGENTS.md` | instrucciones para agentes de IA |

## 7.3 · Archivo histórico — **748 KB, se puede mover a una subcarpeta `_archivo/`**

`DOCUMENTACION_Plataforma_PMTs_EPM.md` (127 KB) · `AUDITORIA_ETAPA0_Plataforma_PMTs.md` (70 KB) ·
`INFORME_ETAPA1.md` · `INVESTIGACION_MICROSOFT_EPM.md` · `MATRIZ_PARIDAD_ETAPA2.md` ·
`PROPUESTA_AUTOMATIZACION.md` · `README.md` · `Plataforma_PMTs.html` *(tablero ANTERIOR, sustituido)*
· `motor/dist/` · `motor/verificador/` · `motor/herramientas/` · `dist/Vista_previa_Datos.html` ·
`app/prototipo/`

**No los borres**, pero tampoco hace falta tenerlos delante. Muévelos a `_archivo/` y la carpeta de
trabajo queda limpia.

## 7.4 · NO copiar

| Qué | Por qué |
|---|---|
| **`motor/node_modules/`** — 41 MB | se reinstala con `npm ci`. **Solo hacen falta para 3 pruebas del motor y las de navegador** |
| **`.git/`** — 12 MB | solo si quieres conservar la historia. Ver §8.4 |
| **`01_KMZ_Entrada.zip`** | **datos de obra reales.** Guárdalo **fuera** de la carpeta de trabajo, en la carpeta de datos corporativa |
| Cualquier `*.pmt.json`, `*.kmz`, `reporte_dinamico.csv`, `crudo_*.json` | datos operativos reales |

> ⚠️ **Aviso importante sobre los datos.** En OneDrive corporativo los datos reales están **mejor
> protegidos** que en el repositorio público de GitHub. Pero el archivo `.gitignore` que los
> protegía **ya no aplica** en una carpeta normal. Si algún día vuelves a subir esta carpeta a
> algún sitio, revisa primero que no lleve KMZ reales ni proyectos guardados.

## 7.5 · Qué se pierde sin `node_modules`

| Capacidad | ¿Funciona sin dependencias? |
|---|---|
| Ejecutar las **258 pruebas de la aplicación** | **SÍ** — comprobado |
| Ejecutar **13 de los 16 archivos de prueba del motor** | **SÍ** — comprobado |
| Ejecutar las 3 pruebas que usan Turf | no (hace falta `@turf/turf`) |
| **Construir la aplicación** (`npm run construir:app`) | **SÍ** — comprobado |
| **Ejecutar las compuertas** | **SÍ**, 15 de 18 sin `.git`; 18 de 18 con el repositorio |
| **Comparador espacial** y **generador de demo** | **SÍ** |
| Pruebas de **navegador real** | no (hace falta Playwright + Chromium) |

Con `npm ci` dentro de `motor/` se recupera todo, incluida la comprobación de navegador — que es la
que atrapa los defectos que solo se ven al abrir la aplicación. En un PC personal con Node
instalado no hay obstáculo para hacerlo, así que **conviene hacerlo**.

---

# PARTE 8 · CÓMO PONER TODO EN EL PC Y SEGUIR

## 8.1 · Los cuatro pasos de la mudanza

| # | Paso | Detalle |
|---|---|---|
| **1** | **Poner el repositorio nuevo en privado** | En GitHub: *Settings* → abajo del todo, *Change repository visibility* → **Private**. Hazlo **antes** de subir nada |
| **2** | **Descomprimir el paquete de arranque** dentro de la carpeta del clon | `C:\Users\Leidy Marin Zapata\DESARROLLOS_EPM\Proyecto_Plataforma_Control_PMTs` |
| **3** | **Publicar con GitHub Desktop** | Aparecerán ~144 archivos como cambios. Mensaje: `Punto de partida: continuidad del desarrollo desde el repositorio anterior` → *Commit* → *Push origin* |
| **4** | **Comprobar que quedó bien** | Ver §8.3 |

> **La rama.** El repositorio anterior usaba una rama llamada `Proyecto_Plataforma_Control_PMTs`, no
> `main`, porque el PC corporativo no manejaba bien ramas secundarias. **Esa razón ya no aplica.**
> En el repositorio personal, usa la rama que GitHub Desktop te haya dado por defecto —
> normalmente `main`— y no crees una rama con el nombre del proyecto. Una sola rama, la principal.
> Si en algún documento ves referencias a la rama antigua, es historia, no una instrucción.

## 8.2 · Si el paquete de arranque no te llegara

El repositorio anterior es **público**, así que se puede descargar desde cualquier PC, sin
credenciales corporativas:

```
https://github.com/ACGST-EPM/Proyecto_Plataforma_Control_PMTs/archive/refs/heads/Proyecto_Plataforma_Control_PMTs.zip
```

**Si usas esta vía, borra `01_KMZ_Entrada.zip` antes de publicar.** Es el archivo con datos de obra
reales, y el objetivo de empezar de cero es precisamente no volver a meterlo en un repositorio.

## 8.3 · Comprobación después de mudarte

Abre **`dist\Plataforma_PMTs.html`** con doble clic. Debería:

- abrir sin errores;
- dejarte cargar un KMZ y ver los trazados en el mapa;
- enseñar las tres cifras arriba, y que al pulsarlas filtren.

Si además puedes ejecutar comandos, la comprobación completa es:

| Comando | Qué debe decir |
|---|---|
| `node --version` | v18 o superior |
| `npm run test:app` | **258 · 258 pasan · 0 fallan** |
| `node herramientas/compuertas.mjs` | **18 de 18** |

**La compuerta I debería pasar ahora**, y por un motivo que importa: comprueba que no haya datos
operativos versionados, y en el repositorio nuevo ya no los hay.

## 8.4 · Cómo trabajo yo a partir de ahora

Hay dos formas, y **la primera es claramente mejor**.

### A · Claude Code en tu PC personal — recomendada

Instalas Claude Code en tu PC y abres la carpeta del proyecto. A partir de ahí trabajo
**directamente sobre tus archivos locales**: leo, edito, ejecuto las pruebas, reconstruyo la
aplicación y te digo qué salió. Exactamente como hasta ahora, pero sin que nada tenga que pasar por
GitHub.

Ventajas frente a lo que teníamos:

- **Todo queda en tu PC**, que es lo que pediste.
- **GitHub deja de ser necesario para trabajar.** Pasa a ser solo tu copia de seguridad: subes
  cuando quieras, con GitHub Desktop.
- **Más rápido**: no hay un contenedor remoto de por medio.
- Sin restricciones corporativas: es tu equipo y tu cuenta.

Claude Code existe como **aplicación de escritorio para Windows**, además de como herramienta de
terminal. Con la aplicación de escritorio **no necesitas usar la terminal**.

### B · Claude Code en la web, apuntando a tu repositorio personal

Conectas tu cuenta **personal** de GitHub en claude.ai (Ajustes → Conectores) y abres una sesión
nueva contra `LJMARINZA/Proyecto_Plataforma_Control_PMTs`. Funciona, pero:

- sigue dependiendo de GitHub para todo;
- el trabajo vive en un contenedor remoto, no en tu PC;
- cada sesión empieza sin memoria: hay que darle este documento.

### Lo que NO se puede hacer

**La sesión donde se hizo todo este desarrollo no se puede reapuntar** a otro repositorio. Está
atada al repositorio corporativo desde que se creó. Cualquier continuación es una **sesión nueva**,
y por eso existe este documento: para que una sesión nueva no empiece a ciegas.

## 8.5 · El ciclo de trabajo, y por qué este orden

```
1. PEDIR el cambio, describiendo el PROBLEMA, no la solución
2. Se implementa en app/ o motor/
3. npm run test:app        ← ¿rompí algo?
4. npm run construir:app   ← llevar el cambio a la aplicación
5. node herramientas/compuertas.mjs   ← ¿rompí una garantía del producto?
6. Abrir dist/Plataforma_PMTs.html y MIRARLO
7. Solo entonces, dar por bueno
8. GitHub Desktop: Commit + Push
```

**El paso 4 es el que más se olvida y el que más problemas causa.** `dist/Plataforma_PMTs.html` es
un archivo **generado**: cambiar `app/app.js` no cambia la aplicación hasta que se reconstruye.

**El paso 6 tampoco se puede saltar.** Varios defectos de este proyecto —el mapa en blanco, el HTML
literal en una tarjeta, el botón de quitar filtros escondido— **solo se ven abriendo la aplicación**.

**El paso 8 es tu red.** Con GitHub Desktop, cada `Commit` es un punto al que puedes volver. Haz uno
cada vez que algo funcione, no solo al final del día.

## 8.6 · Cómo pedir las cosas

Lo que mejor ha funcionado en todo este proyecto:

**Describe el problema, no la solución.**
- ✅ «Cuando filtro por contrato no veo cuántos PMT quedaron fuera, y me confunde.»
- ❌ «Añade un contador a la derecha del filtro.»

La primera deja encontrar la causa; la segunda ya decidió el remedio, y a veces el equivocado.

**Di qué te pasó, no qué crees que falla.**
- ✅ «Creé una vigencia nueva y el mapa se fue a ver todo Medellín; tuve que buscar la obra otra vez.»

**Cuando confirmes una regla del negocio, dilo con esas palabras.** Tu frase *«cada PMT y sus
reactivaciones tienen una resolución independiente»* se implementó y quedó **citada literalmente**
en el código. Así, dentro de seis meses, se sabe de dónde salió la regla.

**Exige que te digan qué NO se hizo.** Una entrega que solo cuenta lo que funcionó es una entrega a
medias.

---

# PARTE 9 · PROBLEMAS PROBABLES

| Síntoma | Causa casi segura | Solución |
|---|---|---|
| «Cambié algo y la aplicación sigue igual» | falta `npm run construir:app` | reconstruir |
| **El mapa sale en blanco** | alguien puso `crossOrigin` en las teselas | quitarlo. Está documentado, con las 8 combinaciones probadas |
| «Las pruebas no arrancan» | falta `app/test/` o `package.json` | completar la copia |
| «3 pruebas del motor fallan» | falta `@turf/turf` | `cd motor && npm ci`, o ignorarlas |
| «Las pruebas de navegador no corren» | falta Playwright + Chromium | es esperable fuera del entorno original |
| **La compuerta I falla** | no hay repositorio `git` | `git init` (§8.4), o aceptarlo y comprobar a mano |
| Las compuertas K y L fallan | falta `proceso_pmt_qgis.py` o `BASELINE.md` | copiarlos |
| «Aparece HTML crudo en pantalla» | se metió marcado en un texto que se escapa | hay prueba que lo detecta; ejecutarla |
| «Los recuentos no cuadran» | se recalculó una cifra por fuera de `resumir()` | todo sale del mismo sitio |
| **Una copia de un KMZ duplica los PMT** | no puede pasar: hay regla y prueba | si pasa, es una regresión grave |
| «El informe no se deja imprimir» | **es correcto**: cambió el estado que lo produjo | regenerarlo |

---

# PARTE 10 · LOS PRIMEROS CINCO PASOS

| # | Paso | Por qué primero |
|---|---|---|
| **1** | **Poner el repositorio nuevo en PRIVADO** | antes de subir nada. Es la única de las cinco que es irreversible si se hace mal |
| **2** | **Descomprimir el paquete y publicar** con GitHub Desktop (§8.1) | tener el punto de partida guardado |
| **3** | **Abrir `dist\Plataforma_PMTs.html` y comprobar que funciona** (§8.3) | confirmar que la mudanza no rompió nada |
| **4** | Hacer el **recorrido de 8 pruebas** de `INFORME_ETAPA_EVOLUCION.md` §19 | comprobar lo entregado con los ojos, no solo con las pruebas |
| **5** | Decidir el punto 1 de §5.1 (**la regla de 120 m**) | es la única decisión pendiente que cambia cifras |

**No empieces por añadir funcionalidad.** Lo entregado está probado pero **no aprobado**, y hay una
auditoría independiente pendiente. Construir encima de algo sin revisar multiplica el trabajo si
aparece un defecto de fondo.

---

# PARTE 11 · PROMPT DE ARRANQUE

Copia esto tal cual en el primer mensaje de cualquier sesión nueva:

```
Vas a continuar el desarrollo de la Plataforma de Control y Articulación de PMTs
del Grupo EPM. Todo el contexto está en esta carpeta.

ANTES DE HACER O PROPONER NADA:
1. Lee TRASPASO_Y_CONTINUIDAD.md completo. Es el documento de traspaso.
2. Lee CLAUDE.md. Es la memoria del proyecto: cada decisión y su motivo.
3. Confírmame que leíste los dos y dime en tus palabras:
   - qué hace la plataforma
   - en qué estado está
   - cuáles son los tres invariantes que te parecen más fáciles de romper sin darse cuenta

DESPUÉS, ejecuta la comprobación de la sección 8.3 y dime el resultado sin
adornarlo: si algo no funciona, quiero saberlo.

CÓMO TRABAJAMOS:
- Respóndeme siempre en español. No soy programadora: explícame cada cambio en
  lenguaje sencillo y dime qué archivo tocaste y por qué.
- Antes de cambiar algo listado en la PARTE 4 del traspaso, pregúntame.
- Después de cada cambio: pruebas, reconstruir, compuertas, y abrir la aplicación
  para mirarla. En ese orden.
- Dime siempre qué NO hiciste y por qué.
- No decidas por mí una regla de negocio. Si hace falta una, pídemela.
- Si algo no se puede comprobar, dilo. No lo des por bueno.
```

---

# PARTE 12 · CÓMO SEGUIMOS TRABAJANDO JUNTAS

Mi papel cambia: dejo de ser quien escribe el código en línea y paso a ser **el cerebro de diseño y
el auditor** de lo que se construya allí.

### Lo que hago mejor ahora

| Rol | Qué significa | Cómo pedírmelo |
|---|---|---|
| **Diseñador** | convertir un problema en un plan que respete los invariantes | «Necesito que la plataforma haga X. ¿Cómo lo plantearías sin romper nada?» |
| **Auditor** | revisar lo que se produzca buscando el defecto, no la confirmación | pégame el código o el resumen: «¿esto rompe algo?» |
| **Redactor de instrucciones** | escribirte la petición exacta para la sesión que ejecute | «Prepárame la instrucción para pedir esto» |
| **Memoria** | por qué se tomó cada decisión | «¿por qué la línea del cierre parcial es continua?» |
| **Traductor** | explicarte qué significa lo que te respondieron | pégame la respuesta |

### El ciclo que propongo

```
1. Me cuentas el problema
2. Te devuelvo un PLAN y la INSTRUCCIÓN exacta para la sesión que ejecute
3. La ejecutas allí
4. Me traes el resultado: qué cambió, qué dijeron las pruebas, qué viste en pantalla
5. Lo AUDITO y te digo si está bien, si falta algo o si rompió una garantía
6. Si hay que corregir, te preparo la instrucción de corrección
```

**Tráeme siempre las tres cosas del paso 4.** «Ya quedó» no me deja auditar nada; el número de
pruebas que pasaron, sí.

### Mi compromiso

- **No doy por bueno lo que no puedo comprobar.** Si no veo el código o el resultado, te lo digo.
- **Busco el defecto, no la confirmación.** En este proyecto encontré defectos reales —el botón
  escondido, la copia que inflaba los recuentos, el HTML literal— **probando**, no leyendo.
- **No decido por ti una regla de negocio.** La regla de 120 m sigue sin decidirse por eso.
- **Te digo siempre qué no se hizo.**

---

# PARTE 13 · RESUMEN EN UNA PÁGINA

**Qué tienes.** Una plataforma que lee los KMZ de los contratistas, detecta qué obras van a
estorbarse entre sí en el espacio y en el tiempo, y lo presenta en un mapa donde se puede pulsar una
coincidencia y entender en diez segundos qué dos contratos son, dónde, cuándo y qué hay que hacer.
Funciona con doble clic, sin internet y sin instalar nada. **602 pruebas automáticas y 18
comprobaciones de producto** la respaldan, todas en verde.

**Qué falta.** Que alguien distinto la audite. Que tú decidas si se amplía la regla de distancia de
120 a 240 metros —sabiendo que el sistema viejo de QGIS ya veía esas 74 coincidencias que hoy no se
muestran—. Y que EPM responda cinco preguntas que no son técnicas.

**Qué cuidar al mudarte.** Tres cosas: que la carpeta lleve `app/`, `motor/` y `herramientas/`
completos; que **después de cada cambio se reconstruya** `dist/Plataforma_PMTs.html`, porque si no
el cambio no llega a la aplicación; y que tengas **alguna forma de volver atrás** antes de tocar
nada.

**Qué no cargar.** `node_modules` (41 MB) y `.git` (12 MB) no hacen falta. Todo lo demás son 3,8 MB.

**Qué no romper.** La PARTE 4. Son decisiones tomadas con motivo, varias de ellas después de haber
cometido el error contrario. Ante la duda, pregunta antes de cambiar.
