# Modelo de información futuro y publicación corporativa

> **Qué es este documento.** Dos preguntas que se hacen siempre juntas y se responden por
> separado: *¿cómo debería estar organizada la información cuando esto deje de vivir en
> archivos sueltos?* (§1–§5) y *¿qué hace falta para publicarla dentro de EPM?* (§6–§9).
>
> **Cómo leerlo.** Nada aquí es una promesa. Cada afirmación va marcada, y la escala de la
> segunda parte es deliberadamente más severa que un simple «sí/no», porque «se puede hacer»
> y «está permitido hacerlo» son cosas distintas que se confunden todo el tiempo.

---

## 1 · Qué hay hoy, dicho sin adornos

La unidad de información de la plataforma es **una fila**. Cada fila es una **activación** de un
PMT: una geometría con una vigencia. Lleva encima `idBase`, que dice a qué PMT base pertenece.
El «PMT base» no existe como objeto: es una **vista derivada** (`agruparPorBase`).

Esto **es correcto y no fue un atajo**. La unidad de análisis del motor es el par
*(geometría, vigencia)*: anidar las activaciones dentro de un objeto PMT obligaría a desanidarlas
en cada análisis, cada filtro, cada tabla y cada exportación, manteniendo dos formas de lo mismo
sincronizadas. Se descartó a propósito, y la decisión sigue en pie.

Lo que sí es una limitación, y hay que nombrarla:

| Limitación | Consecuencia real |
|---|---|
| La identidad del PMT **la propone el archivo**, no un registro corporativo | dos KMZ del mismo cierre hechos por dos personas son dos PMT distintos |
| Los **documentos** son tres campos de texto dentro de la descripción | no tienen fecha, ni autor, ni estado propio: solo «hay código» o «no hay» |
| La **geometría** no tiene versiones | corregir un trazado sustituye al anterior y el anterior deja de existir |
| El **catálogo de contratos** viaja embebido en la aplicación | actualizarlo exige volver a construir el archivo |

Ninguna de las cuatro impide trabajar hoy. Las cuatro se vuelven caras cuando haya más de un
equipo cargando datos.

---

## 2 · A dónde tiene que llegar el modelo

```
   CONTRATO ──────────────┐            (dato maestro, de quien gobierna la contratación)
      │                   │
      ▼                   ▼
   PMT BASE            FRENTE / PROYECTO
   · identificador corporativo estable   ← HOY lo propone el archivo
   · geometría con VERSIONES             ← HOY solo hay una
   · municipio, tipo de cierre, dirección
      │
      ├── ACTIVACIÓN 1 ── vigencia · documentos de ESA vez · motivo
      ├── ACTIVACIÓN 2 ── vigencia · documentos de ESA vez · motivo
      └── ACTIVACIÓN n
                 │
                 └── DOCUMENTO  · tipo (resolución / permiso / cierre)
                                · código · fecha · quién lo registró
                                · PERTENECE A UNA ACTIVACIÓN   ← P21, resuelta
```

Cinco cambios, en orden de lo que desbloquea cada uno:

1. **Identificador corporativo del PMT base.** Hoy un KMZ sin identidad explícita es su propia
   base, y dos geometrías idénticas **no** se consideran el mismo PMT (puede haber dos cierres
   distintos en el mismo sitio; inventar parentescos sería peor). Un identificador que venga de
   EPM resuelve esto sin adivinar nada. **VALIDAR EPM**: ¿existe ya un consecutivo de PMT?
2. **El documento como objeto, no como campo de texto.** Con tipo, código, fecha y quién lo
   registró. Es lo que permite responder «¿desde cuándo está vencida esta resolución?», que hoy
   no se puede responder porque no hay fecha que mirar.
3. **Geometría versionada.** Corregir un trazado deja de destruir el anterior. Importa porque
   todas las distancias medidas dependen de la geometría: sin versiones, un informe de hace un
   mes no se puede reproducir.
4. **Catálogo de contratos como fuente, no como constante.** El mecanismo ya existe
   (`app/fuentes/`): un contrato nuevo sería un cambio de fuente, no una nueva versión del
   programa.
5. **Registro de quién hizo qué.** La bitácora ya existe y ya anota; lo que le falta es una
   identidad real. Hoy el actor es `equipo-local` y **se dice que lo es**.

---

## 3 · Lo que NO puede cambiar al migrar

Esto es lo importante de este documento. Un modelo nuevo que rompa cualquiera de estos puntos
sería un retroceso, por muy ordenado que quede el diagrama:

- **Cada fila sigue siendo una activación.** El motor compara pares *(geometría, vigencia)*.
- **Reactivar reutiliza el trazado EXACTAMENTE**, y se comprueba que es idéntico.
- **NO EVALUABLE ≠ VERDADERO ≠ FALSO**, en el espacio, en el tiempo y en los documentos.
- **Un dato derivado nunca sustituye al motor.** Las relaciones se recalculan siempre.
- **«Pendiente» nunca es un código.** El estado se deriva de la ausencia del dato.
- **Los documentos pertenecen a la ACTIVACIÓN, no al PMT base** (P21, respondida). Una activación
  nueva nace sin códigos propios y queda pendiente; el número de la anterior se conserva como
  historia en `documentosPrevios` y nunca cuenta como registrado.
- **Ocultar no es borrar.** Los alcances temporales son vistas.
- **Ninguna cifra viaja sin su alcance.**

**P21 se respondió y se implementó SIN MIGRAR NADA**, que era justamente la prueba de que el diseño
estaba bien puesto: la evidencia ya vivía en su propia clave, separada del campo del código, así que
bastó cambiar cómo se interpreta. Ningún proyecto guardado necesitó tocarse.

---

## 4 · Cómo se llega ahí sin un salto al vacío

No hace falta —ni conviene— un cambio de modelo de una vez. El orden que no rompe nada:

| Paso | Qué añade | Qué NO toca | Se puede hacer… |
|---|---|---|---|
| 1 | identificador corporativo **opcional** en el KMZ y en el editor | nada: si no viene, se comporta como hoy | en cuanto EPM diga si existe |
| 2 | fecha y autor en cada documento, opcionales | los tres códigos siguen donde están | ya, sin depender de nadie |
| 3 | el catálogo de contratos como fuente | el catálogo embebido sigue de respaldo | ya |
| 4 | geometría versionada | la geometría vigente sigue siendo la que se mide | después de 1 |
| 5 | identidad real en la bitácora | nada | solo con autenticación (§8) |

Los pasos 2 y 3 **no dependen de ninguna respuesta de EPM** y son los que más reducen el trabajo
manual. Los pasos 1, 4 y 5 sí dependen.

---

## 5 · Lo que este modelo NO resuelve

Conviene decirlo para que nadie lo espere:

- **No convierte un PMT en un trámite.** La plataforma no aprueba, no firma y no notifica.
- **No sustituye al criterio de quien coordina.** Sigue sin clasificar criticidad, y eso es
  deliberado.
- **No arregla un dato mal capturado en origen.** Lo detecta y lo señala; no lo adivina.

---

## 6 · Publicación corporativa: cuatro preguntas, no una

La confusión más cara de este proyecto sería decir «se puede publicar» cuando lo que se ha
comprobado es solo que **funciona**. Son cuatro cosas distintas:

| Eje | Qué significa | Quién lo responde |
|---|---|---|
| **1 · Técnicamente posible** | está demostrado que funciona, aquí, con estos datos | este repositorio |
| **2 · Licenciado** | los términos del proveedor permiten este uso | el proveedor |
| **3 · Permitido por TI** | la política de EPM lo permite en su red y con sus datos | TI de EPM |
| **4 · Confirmado en EPM** | alguien de EPM lo ha dicho **por escrito** | EPM |

Un «sí» en el eje 1 no implica nada sobre los otros tres. Esta distinción **ya está en el código**:
`app/nucleo/mapas-base.js` guarda por proveedor `{ funciona, licencia, ti, epm }` y ninguno de los
cuatro se rellena solo.

---

## 7 · Estado real, eje por eje

### Mapas base

| Proveedor | 1 · Funciona | 2 · Licencia | 3 · TI | 4 · EPM |
|---|---|---|---|---|
| Esri «Calles» | **sí**, comprobado | **por validar** — los términos de Esri distinguen uso con y sin cuenta | **por validar** | **no confirmado** |
| Esri «Satélite» | **sí**, comprobado | **por validar** | **por validar** | **no confirmado** |
| OpenStreetMap | **sí** donde hay salida a internet | **permisiva** (ODbL, con atribución) | **por validar** | **no confirmado** |
| Servidor de EPM | **sin evidencia de que exista** | — | — | **no confirmado** |

**No se afirma que el uso corporativo de Esri en EPM esté autorizado.** No hay ningún documento
que lo diga, y este proyecto no está en posición de interpretar sus términos de licencia.

Lo que sí está resuelto técnicamente y conviene no volver a romper: el mapa base **nunca** lleva
`crossOrigin` (fue la causa del mapa en blanco tras un proxy corporativo), no se usa el prefijo
`{s}.`, y hay respaldo automático entre proveedores. La aplicación **funciona sin mapa base**: los
trazados, las distancias y las relaciones no dependen de él.

### Publicación de la aplicación

| Opción | 1 · Funciona | 2 · Licencia | 3 · TI | 4 · EPM |
|---|---|---|---|---|
| Archivo local, doble clic | **sí**, es lo que se usa hoy | propia | **sí**, de hecho ya ocurre | **sí**, se está usando |
| GitHub Pages (repositorio público) | **sí** | propia | **por validar** | **no confirmado** |
| Cloudflare Pages + Access con PIN de un solo uso | **sí** en general; **no probado aquí** | de pago según plan | **por validar** | **no confirmado** |
| Azure Static Web Apps + Entra ID | **sí** en general; **no probado aquí** | la restricción por dominio exige plan Standard **de pago** | **por validar** | **no confirmado** |
| SharePoint / Power Platform / Teams | **no comprobado**: no hay acceso | según licenciamiento de EPM | **por validar** | **no confirmado** |

**No se afirma que Power Apps, Power Automate, SharePoint, SPFx, aplicaciones de Teams, Azure ni
Entra ID estén habilitados para este equipo.** No hay evidencia de ninguno. Lo que hay es
documentación oficial de qué permitiría cada uno *si* estuvieran habilitados
(`INVESTIGACION_MICROSOFT_EPM.md`).

---

## 8 · Autenticación: qué se puede y qué no

El requisito planteado es: **solo correos `@epm.com.co`, con un código de un solo uso que cambia
en cada acceso**.

Lo que hay que decir con claridad: **un sitio estático no puede autenticar a nadie.** Todo lo que
viaja al navegador es público por definición. Cualquier «clave» escrita en el HTML o el JavaScript
está a la vista de quien abra el archivo — no es una protección débil, **no es una protección**.

| Afirmación | Verdad |
|---|---|
| «Ponemos una contraseña en el JavaScript» | **falso como seguridad.** Es un cartel, no una puerta |
| «Cloudflare Access con PIN de un solo uso hace lo pedido» | **cierto en su función**, pero exige dominio propio y decisión de TI |
| «Entra ID da SSO corporativo» | **cierto**, y además restringir por dominio exige plan de pago |
| «Mientras tanto no hay riesgo» | **falso.** Ver el riesgo abierto abajo |

Hoy, por tanto: la contención real es **que el archivo vive en el equipo de quien lo usa**. Eso es
todo, y es honesto decirlo así.

### Riesgo abierto, que no se tapa

**El repositorio es PÚBLICO y la rama principal contiene `01_KMZ_Entrada.zip` (commit `4de5969`)
con datos de obra reales.** Se conserva a propósito: borrar historia de Git exige autorización
expresa y, además, **no bastaría** — lo que estuvo público hay que darlo por copiado.

La contención se propone **por separado**, no dentro de un cambio de producto, y necesita una
decisión de EPM: hacer privado el repositorio, o aceptar el riesgo por escrito. Mientras tanto el
riesgo se mantiene **visible** en `INFORME_ETAPA3.md` y aquí.

---

## 9 · Qué hay que preguntar, y qué desbloquea cada respuesta

Las 22 preguntas completas están en `DESCUBRIMIENTO_EPM.md`. Las que bloquean *este* documento:

| # | Pregunta | Desbloquea |
|---|---|---|
| ~~P21~~ | ~~¿Una resolución ampara unas fechas concretas?~~ **RESPONDIDA**: cada activación tiene la suya. Implementado | — |
| — | ¿El **cierre del permiso de rotura** sigue la misma regla? *(se asumió que sí, por ser el cierre de ese permiso)* | confirmar una asunción ya implementada |
| — | ¿Existe un consecutivo corporativo de PMT? | el paso 1 del §4 |
| — | ¿Qué mapa base puede usar EPM, y con qué licencia? | la tabla del §7 |
| — | ¿Puede el repositorio ser privado? | el §8 |
| — | ¿Hay Microsoft 365 con Power Platform habilitado para este equipo? | toda la fila de SharePoint del §7 |

Ninguna de las cinco es técnica. Las cinco se responden con una conversación, no con código.
