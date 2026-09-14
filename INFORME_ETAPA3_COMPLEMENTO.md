# Cierre operativo de la Etapa 3 — reactivaciones, histórico e integración a la rama principal

> **Estado: entregado en la RAMA PRINCIPAL, listo para pruebas reales en el PC corporativo.**
> No declarado aprobado. Las cifras del motor no han cambiado.

---

## 1 · Ramas e integración

| | |
|---|---|
| **Rama de desarrollo** | `claude/compassionate-pascal-l0n57t` |
| **Rama principal identificada** | **`Proyecto_Plataforma_Control_PMTs`** (no `main` ni `master`) |
| **¿Protegida?** | **No.** Comprobado por API: `protected: false`. El push directo está permitido. |
| **Commit de principal antes de integrar** | `4de5969` — *«Subir KMZ para auditoria»* |
| **Base común** | `06837cb` |
| **Divergencia** | principal tenía **1 commit** que desarrollo no tenía; desarrollo tenía **26** |

**Estrategia: merge preservando historia, sin `--force` y sin reescribir nada.**

La rama principal traía un commit propio —`01_KMZ_Entrada.zip`— que **no** estaba en desarrollo. Se
integró **conservándolo**: la instrucción era no perder cambios válidos de principal y no destruir
evidencia, y ese archivo es de la usuaria.

⚠️ **Riesgo abierto que esto destapa:** el repositorio es **público** (`visibility: public`) y ese
ZIP contiene los KMZ reales con datos de obra. **No lo he borrado**: quitarlo del historial exige
autorización expresa y, además, **no bastaría** —seguiría en el historial de Git—. Las opciones
reales son hacer el repositorio **privado** (lo más simple y efectivo) o limpiar historia con
autorización. Está en la sección 12.

---

## 2 · El modelo de datos: qué cambió

### 2.1 · La separación

```
PMT BASE (identidad)             ACTIVACIÓN (vigencia)
  geometría · contrato             fechas
  frente · tipo de cierre          documentos de esa vez
  municipio · dirección            motivo · procedencia
```

**Cada fila es una activación** y lleva `idBase` encima. El PMT base es una **vista derivada**
(`agruparPorBase`), no una segunda estructura.

**Por qué no un árbol.** La unidad de análisis del motor es el par **(geometría, vigencia)**. Dos
activaciones del mismo cierre en fechas distintas son **dos hechos espacio-temporales distintos** y
tienen que compararse por separado con los PMT de otros contratos. Anidarlas obligaría a
desanidarlas en cada análisis, filtro, tabla y exportación, y a mantener dos formas sincronizadas.

### 2.2 · Compatibilidad, sin inventar parentescos

- Un trazado de un KMZ es **su propia base, con una sola activación**. `idBase` cae a su propio `id`.
- **Dos geometrías idénticas NO son el mismo PMT**: puede haber dos cierres distintos en el mismo
  sitio. Afirmar lo contrario sería inventar un parentesco. Hay prueba.
- Los PMT creados en la plataforma **sí** adquieren identidad explícita.
- En el `.pmt.json`, `idBase` se guarda **solo si difiere del `id`**: escribirlo siempre haría creer
  que alguien declaró esa identidad cuando nadie lo hizo.
- **El número de activación se DERIVA, nunca se lee del archivo**, y se calcula **una sola vez sobre
  el conjunto completo**. Numerar fuente a fuente dejaría dos «activación 1» de la misma base.

---

## 3 · Reactivar

```
PMT seleccionado → «↻ Nueva vigencia» → hereda identidad → CONSERVA el trazado
                 → pide solo las fechas nuevas → guarda como activación N
```

**El invariante:** el trazado se reutiliza **exactamente**. Se clona, se comprueba la igualdad al
abrir, el editor **bloquea el dibujo**, y `guardar()` **vuelve a comprobarla** —entre abrir y guardar
hay una interfaz por medio—. Compuerta **M**.

**Lo que no se hereda:** los documentos. Una resolución ampara unas fechas concretas; copiar el
número haría pasar por tramitado algo que no lo está. **DECISIÓN PENDIENTE** (pregunta P21).

**Lo que no se puede editar al reactivar:** contrato, frente, municipio y tipo de cierre. Son
identidad de la base. Si hay que cambiarlos, es un PMT nuevo.

### Trazabilidad

`historialDeBase()` responde: cuántas veces, cuándo, cuántos días cada una, cuánto pasó entre una y
la siguiente, en qué años y bajo qué contrato. Sale en la ficha y en el informe.

**Sin ninguna valoración.** Reactivar mucho puede ser una obra compleja bien gestionada o una mal
planeada, y desde aquí no se distingue. Una prueba comprueba que el resultado no contiene ninguna
palabra de juicio.

---

## 4 · Operativo e histórico

### 4.1 · Una sola fecha de referencia

| Origen | Cuándo | Referencia |
|---|---|---|
| `hoy` | vista operativa | el día de hoy |
| `elegida` | recorrido temporal | el día que se recorre |
| `periodo` | consulta histórica | el último instante del tramo |

**De ella se deriva todo.** Compuerta **N** vigila que nadie más use `Date.now()` para clasificar
(se permite como *valor por defecto de parámetro*, que es el patrón inyectable correcto).

### 4.2 · Alcances y qué recortan

| Alcance | Qué enseña |
|---|---|
| **Operativo** (por defecto) | lo que no ha terminado antes de la referencia |
| **Histórico** | un año concreto — un PMT sale en **todo año que su vigencia toque** |
| **Todo** | sin recorte |

**El alcance es una VISTA, nunca un borrado.** Compuerta **O**.

### 4.3 · Coincidencia y articulación tienen alcances distintos

- **Coincidencia espacial** — basta con que **uno** de los dos siga operativo. Que donde hoy trabaja
  alguien hubo otra intervención es contexto útil.
- **Articulación requerida** — exige que **el traslape siga vivo** (`traslapeFin ≥ referencia`).
  Articular es acordar sobre un tramo compartido; si ya pasó entero, no queda nada que acordar.
  Una articulación caducada **se degrada a coincidencia espacial, no desaparece**: los dos siguen
  compartiendo sitio, y eso no ha caducado. El hecho (`hayTraslapeTemporal`, `traslapeInicio`,
  `traslapeFin`) queda **intacto** y vuelve entero al mirar aquella fecha.

### 4.4 · El recorrido temporal

Mover el recorrido a una fecha pasada **devuelve lo que pasaba entonces**, relaciones incluidas.
Ocultar históricos **nunca** significa borrar relaciones pasadas.

---

## 5 · Informe y exportaciones

**El informe declara el contexto EN EL TÍTULO:**

- *«Informe operativo de PMTs — al 2026-09-14»*
- *«Consulta histórica de PMTs — Año 2025»*

Un informe retrospectivo **habla en pasado** («articulaciones que hubo») y lo advierte arriba.
Declara además la fecha de referencia y su origen. Trae sección de **PMT reutilizados** cuando la hay.

**Exportaciones:** ahora usan `nombreConProcedencia()` —que existía y **nadie llamaba**— con el
contexto temporal dentro del nombre. Dos exportaciones del mismo día, una operativa y otra histórica,
ya no se pisan ni se confunden. **El CSV legado conserva su nombre exacto**: es un invariante.

---

## 6 · Defectos encontrados y cerrados en este bloque

| # | Defecto | Clase de error |
|---|---|---|
| 10 | Ciclo de importaciones `filtrado ↔ temporalidad`: reventaba la construcción | dependencia circular con el propio ladrillo |
| 11 | `arguments.callee` — no existe en un módulo ES | patrón de otra época |
| 12 | Un `return` dejaba **sin conectar Guardar y Cancelar** al reactivar | salida temprana en una función que hace dos cosas |
| 13 | La columna de situación **se vaciaba al pulsar una fila** | el mismo dato calculado en un camino y no en los otros |
| 14 | El historial decía «1 activación» en vista operativa | confundir «lo que se ve» con «lo que hay» |
| 15 | Las exportaciones **no usaban `nombreConProcedencia`** | una función correcta que nadie llama |
| 16 | `fijarFiltros()` **descartaba `alcance` y `anio` en silencio** | una función que reconstruye y una lista desactualizada |
| 17 | Los radios medían **0×0**: sin superficie no reciben clics | ocultar sacando de la capa de interacción |
| 18 | **Reactivar quedaba bloqueado** si el contrato no estaba en el catálogo | aplicar la regla de «crear» a algo que no crea |
| 19 | Fixtures con fechas escritas a mano: al pasar, media suite falló sola | prueba cuyo significado cambia con el calendario |
| 20 | La vista operativa podía **dejar la pantalla vacía sin explicar nada** | estado vacío legítimo indistinguible de un fallo |
| 21 | `prepararReactivacion` **lanzaba** con geometría circular | promete `{ok:false}` y revienta |
| 22 | `referencia({ms:NaN})` hacía que **todo pasara por vigente**, en silencio | NaN envenena toda comparación sin dar error |

**El 18 y el 20 son los más importantes para el uso real**: con el catálogo actual (3 contratos) y
los KMZ reales, **ningún PMT habría sido reactivable**; y al abrir la herramienta con los PMT del año
pasado, la pantalla habría salido vacía sin explicación.

**El 15 es instructivo**: la compuerta J **pasaba**, porque probaba la función, no su uso. Una prueba
que verifica una capacidad no verifica que el producto la ejerza.

---

## 7 · Pruebas

```
Motor ......................  259
Aplicación (lógica pura) ...  245   (+45 en este bloque)
Navegador real .............   74   (+8 en este bloque)
Compuertas de entrega ......   15   (A..O)
```

Las tres compuertas nuevas se **rompieron a propósito** para comprobar que detectan su infracción:
las tres saltaron. Igual que las doce anteriores.

**Rendimiento con 5.000 activaciones** (se recorren en cada repintado): `inventarioDeAnios` 6 ms ·
`agruparPorBase` 13 ms · `revisarCoherenciaDeBases` 6 ms. Con prueba que vigila el derrumbe.

---

## 8 · Qué archivo debe abrir Leydi

```
dist/Plataforma_PMTs.html
```

Doble clic. Sin internet, sin instalar nada. Instrucciones paso a paso en **`GUIA_LEYDI.md`**,
sección 9.

Si el mapa de fondo sale gris porque la red de EPM lo bloquea, **los trazados se siguen dibujando y
todas las cifras son correctas**: el fondo es decoración.

---

## 9 · Compatibilidad

| Qué | Estado |
|---|---|
| KMZ y KML existentes | **Se leen exactamente igual.** Sin identidad de base: cada uno es su propia base. |
| `.pmt.json` de etapas anteriores | **Se abren igual.** Sin `idBase`, cada trazado es su propia base. |
| CSV legado (11 columnas) | **Intacto**, nombre incluido. Compuerta C. |
| Campo Descripción del KMZ | **Intacto**: los 8 campos históricos siguen primero y en orden. |
| Identificadores | **No se pierde ninguno.** `idBase` se añade; `id` no se toca. |

---

## 10 · Lo que NO se hizo

- **No se integró SharePoint, Power Automate ni autenticación corporativa.** Estaba excluido.
- **No se activó el modelo espacial de 240 m.** Sigue siendo candidato.
- **No se introdujo criticidad** ni ninguna valoración de las reactivaciones.
- **No se reescribió historia de Git, ni se usó `--force`, ni se borró evidencia.**
- **No se inventó ninguna regla jurídica** sobre los documentos.

---

## 11 · Riesgos residuales

1. **Volumen en el navegador.** Medida hecha en lógica pura, no en repintado del DOM con miles de
   filas y un mapa con miles de geometrías.
2. **Consulta espacial por proximidad** («¿qué había exactamente aquí?») no existe: hoy se llega
   filtrando por año y municipio sobre el mapa. La arquitectura no lo impide.
3. **Cadena de dos proyectos** (reactivar un PMT venido de un proyecto que venía de otro) no probada.
4. **Cartografía contra un servidor real** sigue sin observación directa: no hay salida a internet
   desde el entorno de desarrollo.
5. **Bases incoherentes**: si dos fuentes declaran la misma `idBase` con trazados o contratos
   distintos, se **avisa** pero no se corrige. No sabemos cuál es la buena.

---

## 12 · Bloqueos y decisiones pendientes

### Bloqueo corporativo detectado

**Ninguno técnico:** la rama principal no está protegida y acepta push directo.

**Uno de gobierno de datos, y es serio:** el repositorio es **público** y la rama principal contiene
`01_KMZ_Entrada.zip` con datos de obra reales, subido en el commit `4de5969`. No se ha tocado.
Opciones: hacer el repositorio privado, o limpiar historia con autorización expresa. **Requiere
decisión de Leydi.**

### Decisiones que siguen sin tomarse

1. Sustituir «distancia ≤ 120 m» por zonas de 120 + 120 m.
2. Cualquier criterio de criticidad.
3. Proveedor cartográfico para producción.
4. Almacenamiento y autenticación corporativos; permisos del contratista.
5. Política de persistencia local.
6. Arquitectura Microsoft definitiva.
7. Reglas jurídicas de plazos y secuencia de documentos.
8. **A qué nivel pertenece cada documento** (base o activación) — pregunta **P21**.
9. **Si interesa registrar la causa de una reactivación**, y con qué lista cerrada — pregunta **P22**.
   Convertir esto en indicador de desempeño del contratista **no** lo va a decidir la herramienta.
