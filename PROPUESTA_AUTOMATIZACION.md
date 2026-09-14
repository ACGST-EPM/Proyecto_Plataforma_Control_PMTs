# Propuesta de automatización del proceso de PMTs

> **Nada de lo descrito aquí está implementado ni conectado.** Es una propuesta
> para decidir. No se ha contactado con ningún servicio corporativo.
>
> **Sobre EPM no se afirma nada sin evidencia.** Este documento no dice que
> SharePoint, OneDrive, Power Automate, Teams o Azure estén habilitados, con qué
> licencia ni con qué permisos. Todo eso aparece como **por confirmar con TI**.

## Dónde está hoy el trabajo manual

Recorriendo el proceso real, quedan estos puntos de fricción:

1. Cada contratista envía sus KMZ por correo o los deja en una carpeta.
2. Alguien los reúne a mano en `01_KMZ_Entrada`.
3. Hay que abrir la aplicación y arrastrarlos uno por uno. *(Etapa 2.1 ya permite
   guardar el proyecto, así que esto pasa de diario a ocasional.)*
4. No queda registro de **quién** envió qué ni **cuándo**.
5. Si un contratista manda una versión corregida, nadie avisa: hay que notarlo.
6. El resultado se comparte como archivo suelto; no hay histórico comparable.

## Lo que ya está preparado para conectarse

La Etapa 2.1 deja **dos puntos de enganche** deliberados, para que automatizar más
adelante no exija reescribir la aplicación:

| Punto de enganche | Dónde está | Qué permitiría |
|---|---|---|
| **Origen de archivos** | `app/nucleo/ingesta.js` recibe `{nombre, datos}`, no `File` del navegador | Sustituir «arrastrar» por «leer de una biblioteca» cambiando solo quién llama |
| **Proyecto `.pmt.json`** | `app/nucleo/proyecto.js`, con esquema versionado | Guardar y recuperar análisis desde cualquier almacén, no solo del disco |

El motor y la interfaz no saben de dónde vienen los archivos. Es la condición para
que un cambio de origen sea un módulo nuevo y no una reescritura.

## Propuestas, ordenadas por relación valor/esfuerzo

### A. Carpeta de entrada, releída con un clic · **empezar por aquí**

Que la aplicación recuerde una carpeta que la usuaria haya elegido y, al volver,
relea sus KMZ para detectar los nuevos o modificados sin arrastrarlos otra vez.

> **CORRECCIÓN.** Una versión anterior de este documento llamaba a esto «carpeta
> vigilada sin permisos». Las dos cosas eran inexactas y conviene separarlas con
> cuidado, porque de ahí salen expectativas que luego no se cumplen:

| Qué es | Qué exige | ¿Disponible? |
|---|---|---|
| **Acceso local iniciado por la usuaria** — ella elige la carpeta en un diálogo | Nada más que su clic | Sí, hoy |
| **Permiso persistente del navegador** — recordar esa carpeta entre sesiones | Que el navegador lo ofrezca **y** que la usuaria lo conceda; puede caducar o revocarse; una política corporativa puede desactivarlo | **Por confirmar en el equipo real de EPM** |
| **Relectura con la aplicación abierta** | La pestaña abierta. No hay «vigilancia» en segundo plano | Sí, con lo anterior |
| **Ejecución autónoma/desatendida** — que se procese sin nadie delante | Que el análisis salga del navegador a un servicio, con su custodia de datos y su autenticación | **No, y no es esta etapa** |

- **Dependencia/licencia:** ninguna de terceros. Usa la API de acceso al sistema
  de archivos del propio navegador.
- **Permisos:** el de la usuaria sobre su carpeta. **No** da acceso a nada más.
  Si TI aplica políticas de navegador, pueden bloquear esta API: hay que
  comprobarlo en un equipo real antes de prometer nada.
- **Seguridad:** los datos no salen del equipo. Es el modelo actual.
- **Valor:** alto — elimina el paso manual más repetitivo.
- **Complejidad:** baja (1-2 días) más la comprobación en el equipo de la usuaria.
- **Limitaciones honestas:** Firefox no soporta esta API; desde `file://` puede
  estar restringida, así que probablemente haya que servir la aplicación por
  HTTP(S) —lo que a su vez depende de la etapa de publicación corporativa—; y
  **nunca** habrá procesamiento mientras la aplicación esté cerrada.

### B. Histórico de proyectos y comparación entre versiones

Guardar cada análisis con fecha y poder responder «¿qué cambió desde la semana pasada?».

- **Técnicamente posible:** sí, sobre el formato `.pmt.json` que ya existe.
- **Valor:** alto — hoy no hay forma de ver la evolución.
- **Complejidad:** media (3-5 días). El identificador estable de cada trazado ya
  permite emparejar dos análisis registro a registro; es la misma técnica que usa
  `motor/herramientas/comparar.mjs`.
- **No requiere permisos ni infraestructura.**

### C. Deduplicación y control de versiones de los KMZ

Avisar cuando llega un KMZ que es idéntico a otro ya cargado, o una versión
corregida del mismo frente.

- **Técnicamente posible:** sí. El motor ya calcula una huella de contenido
  (`huellaContenido`) y detecta duplicados exactos.
- **Valor:** medio-alto. **Complejidad:** baja.

> **Sobre Microsoft 365, OneDrive, SharePoint, Teams y Power Automate:** este
> documento **no afirma que ninguno esté habilitado en el tenant de EPM**, ni con
> qué licencia, ni con qué políticas. Todo lo que sigue es lo que sería posible
> *si* lo estuviera, y cada punto queda **pendiente de validación con TI/EPM**.

### D. Biblioteca corporativa de documentos como origen

Que los contratistas depositen sus KMZ en una biblioteca y la aplicación los lea.

- **Técnicamente posible:** sí, mediante la API del servicio correspondiente.
- **Dependencia/licencia:** **por confirmar con TI.** Requiere una aplicación
  registrada en el directorio corporativo y consentimiento de administrador.
- **Permiso requerido:** **sí, de TI y de Seguridad.**
- **Seguridad:** aquí sí sale información de la máquina del usuario. Exige revisión
  de gobierno de datos. **No se puede hacer con una clave metida en el JavaScript**
  (el sitio sería público y la clave quedaría a la vista): necesita autenticación
  del usuario con su propia cuenta corporativa.
- **Valor:** muy alto — cierra el círculo completo.
- **Complejidad:** alta, y la mayor parte del esfuerzo no es técnico sino de
  habilitación. **Cuándo:** después de resolver la publicación corporativa.

### E. Procesamiento automático al llegar un archivo, y avisos

Que al depositarse un KMZ se dispare el análisis y se notifique si aparece una
interferencia nueva.

- **Técnicamente posible:** sí, con un motor de flujos corporativo o un servicio propio.
- **Bloqueo real:** el análisis corre hoy **en el navegador**. Para ejecutarlo sin
  nadie delante habría que llevar el motor a un servicio. **Es viable sin
  reescribirlo**: el motor es JavaScript sin dependencias y corre igual en Node —
  de hecho sus 229 pruebas se ejecutan así.
- **Requiere:** decidir dónde se ejecuta y quién custodia los datos. **Pendiente de
  la etapa de publicación corporativa.**
- **Advertencia:** un aviso automático necesita una regla que diga qué merece aviso.
  **Esa regla es justamente la clasificación de criticidad que aún no está decidida.**
  Sin ella, o se avisa de las 174 relaciones o no se avisa de ninguna.

### F. Registro de quién cargó qué y cuándo

- **Técnicamente posible** solo si hay identidad de usuario, es decir, después de D.
- Mientras tanto hay una aproximación útil y sin coste: el proyecto `.pmt.json` ya
  guarda fecha, archivos y criterios. Añadir un campo de «responsable» escrito a mano
  es trivial, pero **no es trazabilidad real**: es una anotación. Conviene no
  presentarlo como algo que no es.

## Orden recomendado

1. **A** (carpeta releída con un clic) y **C** (deduplicación) — semanas. **A**
   necesita comprobar antes, en el equipo real de la usuaria, si la política de
   navegador de EPM permite el permiso persistente de carpeta.
2. **B** (histórico y comparación) — valor alto, sin infraestructura.
3. Decisión de **criticidad** — bloquea E y condiciona el informe.
4. Publicación corporativa — bloquea D, E y F.
5. **D**, **E**, **F** — cuando lo anterior esté resuelto.

## Lo que NO conviene hacer

- **No** meter claves ni tokens en la aplicación para alcanzar un servicio
  corporativo. El sitio es público; una clave ahí es una clave regalada.
- **No** montar un servidor propio solo para automatizar la carga: el cálculo cabe
  en el navegador y un servidor añade custodia de datos, autenticación y
  mantenimiento sin resolver nada que hoy duela.
- **No** automatizar avisos antes de tener la regla de criticidad.
