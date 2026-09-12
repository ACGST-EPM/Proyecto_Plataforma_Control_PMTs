# BASELINE — Plataforma de Control y Articulación de PMTs

> **Para qué sirve este archivo.** Para responder, dentro de seis meses y sin buscar en
> ninguna conversación: *«¿qué versión produjo este resultado, con qué reglas, y cómo
> vuelvo a obtenerlo exactamente?»*.
>
> Se actualiza **solo** cuando se cierra una etapa o cuando cambia una cifra publicada.

---

## 1 · Identidad de esta baseline

| Qué | Valor |
|---|---|
| Etapa | **2.4 + gate de cierre** |
| Estado | `BASELINE FUNCIONAL CANDIDATA A CIERRE` (pendiente de auditoría externa) |
| Rama de desarrollo | `claude/compassionate-pascal-l0n57t` |
| Versión de la aplicación | **2.4.0** (`app/nucleo/version.js`) |
| Versión del motor | **1.2.0** (`app/nucleo/version.js`) |
| Versión de las **reglas** | **1.2.0** (`motor/src/nucleo/config.js`) |
| Esquema de `.pmt.json` | **2** (lee desde el 1) |
| Node probado | v22.22.2 · npm 10.9.7 (requisito declarado: Node ≥ 18) |

### Las tres versiones, y por qué son tres

Cambian por motivos distintos y a ritmos distintos. Confundirlas es lo que hace imposible
reproducir un resultado meses después.

- **Versión de la aplicación** — lo que ve y hace la persona: pantallas, filtros, informe,
  exportaciones. *Puede subir sin que se mueva ni una cifra.*
- **Versión del motor** — cómo se calcula. *Puede subir por una corrección interna que no
  mueve ninguna cifra* (por ejemplo, el inverso del plano de la Etapa 2.4).
- **Versión de las reglas** — **qué se considera una interferencia**. Umbral, criterio
  temporal, exclusiones. **Solo sube si cambian las cifras publicadas**, y cuando sube hay
  que actualizar en el mismo commit la sección 4 de este archivo, con su explicación.

### Cómo se numeran

| Sube | Cuándo |
|---|---|
| MAYOR | cambia qué se considera interferencia, o un archivo guardado deja de poder abrirse |
| MENOR | capacidad nueva que no mueve ninguna cifra ya publicada |
| PARCHE | corrección que no mueve ninguna cifra ya publicada |

---

## 2 · Parámetros funcionales aprobados

Están en `motor/src/nucleo/config.js` y **hay una prueba que falla si alguno cambia**
(`app/test/baseline.test.mjs`). No están enterrados en el código: todos son configurables.

| Parámetro | Valor | Origen de la decisión |
|---|---|---|
| Umbral de cercanía | **120 m reales** | aprobado en la Etapa 0/1. El ~243 m del motor de QGIS era un defecto de implementación y solo se usa para comparar |
| Criterio temporal | **fecha y hora reales** | aprobado en la Etapa 1 |
| Tolerancia de traslape | **0 minutos** | no se inventa margen operativo sin una regla que lo respalde |
| Fin inclusivo de día completo | **desactivado** | criterio estricto: se usa lo que dice literalmente el dato |
| Mismo contrato | **nunca es interferencia entre contratos** | invariante del proyecto |
| Modo de distancia | **real** | mínima entre las geometrías originales |
| Dominio espacial | **50 km por par comparado** | fuera de ahí el motor dice «no se puede medir», nunca inventa un número |
| `tipo_cierre` | **exactamente tres**: `total`, `parcial`, `ingreso y salida` | lista cerrada; separar `ingreso` y `salida` exigiría migrar los KMZ existentes |

---

## 3 · Reglas invariantes del producto

Están escritas en `CLAUDE.md` (sección «Invariantes de aplicación») y, lo que importa,
**probadas** en `app/test/propiedades.test.mjs` sobre conjuntos generados:

| # | Propiedad | Dónde se prueba |
|---|---|---|
| P1 | `guardar → abrir` conserva la semántica y es **idempotente** | `propiedades.test.mjs` |
| P2 | el dato mostrado es el dato con el que se calcula | `propiedades.test.mjs` |
| P3 | lo exportado es lo visible, sin referencias colgando | `propiedades.test.mjs` |
| P4 | resumen = detalle, para el mismo alcance | `propiedades.test.mjs` |
| P5 | «hubo un error» ≠ «no hay resultado» | `propiedades.test.mjs` |
| P6 | «no se pudo evaluar» ≠ «fuera del umbral» | `propiedades.test.mjs` |
| P7 | misma entrada + mismas reglas → mismo resultado | `propiedades.test.mjs` |
| P8 | mismo contrato → nunca relación entre contratos | `propiedades.test.mjs` |
| P9 | A/B = B/A | `propiedades.test.mjs` |
| P10 | `ubicado:true` ⇒ separación geodésica ≈ distancia canónica | `motor/test/acercamiento.test.mjs` |
| P11 | ningún filtro activo sin su control visible | `app/test/navegador.test.mjs` |
| P12 | cambio de estado ⇒ informe actualizado o explícitamente caducado | `app/test/navegador.test.mjs` |

---

## 4 · Cifras de regresión — NO NEGOCIABLES

Se obtienen sobre los **8 KMZ reales** de `01_KMZ_Entrada` (que **nunca** se suben al
repositorio: llevan datos operativos y el repositorio es público).

```
Registros totales ......................................  460
Fidelidad con el motor de QGIS .........................  708/708 filas, uno a uno
Relaciones del perfil legado (umbral ~243 m, solo fecha)  248  = 84 con traslape + 164 sin
Relaciones de la configuración aprobada ................  174
  · con traslape temporal ..............................   68
  · con contacto físico (0 m) ..........................    6
Relaciones históricas retiradas, explicadas ............  74/74  (todas por distancia > 120 m)
Pares espacialmente no evaluables ......................    0
Duplicados exactos desambiguados .......................    3
```

Se mantienen **también** después de guardar el proyecto y volver a abrirlo.

**Si una de estas cifras cambia**, no es un detalle: o hay un defecto, o cambió una regla.
En el segundo caso hay que subir `VERSION_REGLAS` y actualizar esta tabla en el mismo
commit, explicando qué regla cambió y por qué.

Cómo reproducirlas:

```bash
npm run preparar
cd motor && node herramientas/comparar.mjs <carpeta-con-los-8-KMZ>
```

---

## 5 · Pruebas

```
Motor ......................  231   (1 omitida: depende de una referencia externa opcional)
Aplicación (lógica pura) ...  139
Navegador real .............   44   (file:// y HTTP)
```

```bash
npm run preparar        # npm ci del motor. NECESARIO: sin el lockfile se pierden pruebas
npm test                # motor + aplicación
npm run test:navegador  # construye dist/ y lo conduce con un Chromium real
npm run test:todo       # las tres cosas
```

| Archivo | Qué garantiza |
|---|---|
| `motor/test/auditoria-codex.test.mjs` | una prueba adversaria por hallazgo de la auditoría independiente. **No se borra ni se relaja.** |
| `motor/test/acercamiento.test.mjs` | la ubicación dibujada corresponde a la distancia medida |
| `app/test/propiedades.test.mjs` | los invariantes del producto, sobre conjuntos generados |
| `app/test/baseline.test.mjs` | los parámetros aprobados y la trazabilidad de versiones |
| `app/test/navegador.test.mjs` | lo que solo se ve al abrir la aplicación de verdad |

---

## 6 · Dependencias

**En producción: ninguna.** `dist/Plataforma_PMTs.html` es un archivo que se abre con doble
clic y funciona sin internet. Leaflet 1.9.4 (BSD-2-Clause) va **vendorizado** en
`app/vendor/`, no desde una CDN.

De desarrollo, solo en `motor/package.json`:

| Paquete | Versión | Para qué | Licencia |
|---|---|---|---|
| `@turf/turf` | 7.4.0 | segunda referencia independiente para validar las distancias | MIT |
| `playwright` | 1.56.1 | conducir un Chromium real en las pruebas de navegador | Apache-2.0 |

`motor/package-lock.json` **sí se versiona**: sin él `npm ci` falla y se pierden pruebas.

---

## 7 · Reproducir desde un clon limpio

```bash
git clone <repo> && cd Proyecto_Plataforma_Control_PMTs
git checkout claude/compassionate-pascal-l0n57t

npm run preparar          # instala las dependencias de desarrollo del motor
npm test                  # 231 motor + 139 app
npm run construir         # genera dist/Plataforma_PMTs.html y motor/dist/verificador.html
npm run test:navegador    # 43 pruebas conduciendo la aplicación construida

# Regresión con datos reales (los KMZ no están en el repositorio):
cd motor && node herramientas/comparar.mjs /ruta/a/01_KMZ_Entrada
```

Para usarla: abrir `dist/Plataforma_PMTs.html` con doble clic. No hace falta servidor,
ni internet, ni instalar nada.

---

## 8 · Trazabilidad de cada resultado

Cada cosa que sale de la plataforma se puede identificar sin preguntarle a nadie:

| Sale como | Dónde va la procedencia |
|---|---|
| **Informe** (PDF) | filas «Versiones» y «Generado» en la tabla *Qué se analizó*, con las tres versiones, el alcance y los parámetros |
| **Proyecto** `.pmt.json` | bloque `motor`: `versionApp`, `versionMotor`, `versionReglas`, más `config` y `esquema` |
| **GeoJSON** | miembro `procedencia` de nivel superior (el estándar lo permite) |
| **KML** | `<description>` del `<Document>`; Google Earth la muestra |
| **CSV nuestros** | en el **nombre del archivo**: `PMT_2026-09-12_app-2.4.0_reglas-1.2.0.csv` |
| **CSV legado** | **nada**, a propósito: sus 11 columnas son un invariante y una línea de cabecera extra rompería a quien las lea |

---

## 9 · Riesgos conocidos, no bloqueantes

| # | Riesgo | Por qué no bloquea | Cuándo habría que actuar |
|---|---|---|---|
| R1 | El motor compara **todos los pares** (O(n²)) | con 460 PMT el análisis tarda ~300 ms | ver el estudio de escalabilidad en `ESCALABILIDAD.md` |
| R2 | El texto original de una fecha ilegible se pierde al leer el KMZ; solo queda en los avisos | la fecha válida sí se conserva, que era el problema real | si se necesita auditar qué venía escrito exactamente |
| R3 | La marca de duplicado se respalda con el sufijo `~N` del identificador, no con una prueba criptográfica | un `.pmt.json` es un archivo de trabajo, no un registro oficial; la huella detecta corrupción accidental y **no se presenta como autenticación** | si el `.pmt.json` pasara a ser un registro con valor probatorio |
| R4 | El mapa base depende de un servidor de teselas externo | hay cadena de respaldo, opción «sin fondo» y hueco para un servidor de EPM | cuando TI confirme si existe uno (ver `DESCUBRIMIENTO_EPM.md`) |
| R5 | No hay autenticación | hoy la aplicación es un archivo local, no un sitio publicado | antes de publicarla en cualquier sitio accesible |

---

## 10 · Decisiones pendientes (no las puede tomar la herramienta)

| # | Decisión | Quién | Qué desbloquea |
|---|---|---|---|
| D1 | Criterios de **criticidad** (¿qué es «crítico»?) | operación de EPM | notificaciones y priorización. Hoy la plataforma presenta **hechos**, sin clasificar |
| D2 | ¿Separar `ingreso` y `salida` como tipos de cierre? | operación de EPM | exigiría actualizar generador **y** motor a la vez y migrar los KMZ existentes |
| D3 | Dónde viven los KMZ de verdad | TI de EPM | toda la automatización (ver `ARQUITECTURA_OPERATIVA.md`) |
| D4 | Identidad y control de acceso | TI/Seguridad de EPM | publicar la plataforma fuera del equipo |
| D5 | ¿Existe un servidor de mapas corporativo? | TI de EPM | retirar la dependencia de teselas externas |

---

## 11 · Historial de baselines

| Etapa | Commit | Reglas | Cifras |
|---|---|---|---|
| 2.4 + gate de cierre | `fc3042f` | 1.2.0 | sin cambios respecto a la Etapa 1 |
| 2.3 | `16c3730` | 1.2.0 | sin cambios |
| 2.2 | `9f801a0` | 1.2.0 | sin cambios |
| 2.1 | `5689f6b` | 1.2.0 | sin cambios |
| 1.2 (cierre de Etapa 1) | — | 1.2.0 | 460 · 708/708 · 174 · 68 · 6 |

**Ninguna cifra publicada ha cambiado desde el cierre de la Etapa 1.** Eso es
deliberado: todas las etapas posteriores corrigieron cómo se *presenta* y se *conserva* el
resultado, no cómo se *calcula*.
