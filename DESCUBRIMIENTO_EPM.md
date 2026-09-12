# Qué necesitamos preguntarle a TI de EPM

> **Para qué sirve esta hoja.** Para que Leydi no tenga que inventar qué preguntar. Cada pregunta
> viene con **por qué importa**, **qué decisión desbloquea** y **cuál es la respuesta mínima útil**.
>
> **Cómo usarla.** Se puede enviar tal cual. Si TI solo contesta las cinco primeras, ya sirve: están
> ordenadas por lo que más desbloquea.
>
> **Importante:** no hace falta que TI conceda nada todavía. En esta fase solo necesitamos **saber
> qué hay**. Ninguna pregunta pide credenciales, ni acceso, ni que se cree nada.

---

## Contexto para quien reciba esto (dos párrafos)

El Centro de Gestión Servicios Técnicos usa una herramienta que cruza los Planes de Manejo de
Tránsito de los contratos de obra y detecta dónde y cuándo dos contratos distintos van a interferir
entre sí. Hoy es **un archivo HTML que se abre con doble clic**: no necesita servidor, ni internet,
ni instalar nada, y los datos no salen del equipo.

Lo que queremos resolver es de dónde salen los archivos de entrada (KMZ). Hoy viven en la carpeta de
un solo equipo y no hay forma de saber cuál es la última versión de cada uno. **No pedimos
autorización para nada todavía**: solo necesitamos saber qué existe para no diseñar contra algo que
no hay.

---

## Bloque 1 · Dónde pueden vivir los archivos *(lo que más desbloquea)*

### P1. ¿La organización tiene SharePoint Online?
- **Por qué importa:** es el sitio natural para los KMZ, con permisos y versiones.
- **Desbloquea:** toda la arquitectura recomendada (A).
- **Respuesta mínima:** sí / no.

### P2. ¿Se puede crear (o usar) una biblioteca de documentos para PMT, y quién la administraría?
- **Por qué importa:** sin un sitio único, los archivos siguen viviendo en un equipo.
- **Desbloquea:** que la plataforma lea de un sitio y no de una carpeta personal.
- **Respuesta mínima:** sí/no, y el nombre del área que la administraría.

### P3. ¿El versionado de esa biblioteca estaría activado? ¿Con qué límite?
- **Por qué importa:** nos ahorra construir el histórico. SharePoint conserva entre 100 y 50.000
  versiones en modo manual, o hasta 500 en automático.
- **Desbloquea:** poder responder «qué decía este PMT el 3 de marzo» sin desarrollar nada.
- **Respuesta mínima:** activado sí/no, y el límite.

### P4. ¿Hay alguna restricción sobre cómo se estructuran las carpetas?
- **Por qué importa:** la **ruta completa no puede pasar de 400 caracteres**, hay caracteres no
  admitidos, y —esto sí condiciona el diseño— **el disparador de Power Automate no se activa en
  subcarpetas**.
- **Desbloquea:** decidir si la estructura es `Año/Contrato/` o todo plano.
- **Respuesta mínima:** convención de carpetas y de nombres que haya que respetar.

### P5. Hoy, ¿cómo llega un KMZ desde el contratista hasta EPM?
- **Por qué importa:** es el único punto del proceso que el repositorio no documenta, y de él
  depende todo lo demás.
- **Desbloquea:** saber dónde empieza la automatización.
- **Respuesta mínima:** el canal (correo, Teams, carpeta, portal de proveedores) y quién lo recibe.

---

## Bloque 2 · Automatización

### P6. ¿Power Automate está disponible? ¿Con qué licencia?
- **Por qué importa:** el conector de SharePoint es estándar, pero **compartir flujos con conectores
  premium exige licencia Premium o por flujo**.
- **Desbloquea:** si se puede avisar automáticamente al llegar un archivo.
- **Respuesta mínima:** disponible sí/no, y qué licencia tiene el equipo.

### P7. ¿Qué dice la política DLP sobre los conectores que necesitaríamos?
- **Por qué importa:** si la política pone SharePoint y el destino de aviso en grupos incompatibles,
  **el flujo se suspende y el disparador no se activa**. Es un fallo silencioso, y conviene saberlo
  antes que después.
- **Desbloquea:** saber si la automatización es viable o hay que pedir una excepción.
- **Respuesta mínima:** la clasificación de SharePoint, Outlook y Teams en la política.

### P8. ¿Se puede registrar una aplicación en Entra ID para leer **solo** esa biblioteca?
- **Por qué importa:** existe el permiso `Sites.Selected`, que da acceso **solo a los sitios que se
  elijan** en vez de a todo SharePoint. Es lo que hay que pedir: mínimo privilegio.
- **Desbloquea:** que la plataforma lea sin que nadie seleccione archivos a mano.
- **Respuesta mínima:** si el proceso existe, cuánto tarda, y quién da el consentimiento.
- **Nota:** no lo pedimos todavía. Preguntamos si es posible.

---

## Bloque 3 · Dónde se usaría

### P9. ¿Se permiten aplicaciones personalizadas en Teams?
- **Por qué importa:** una pestaña en Teams sería la forma natural de que el equipo la abra. No hace
  falta publicarla en la tienda, pero **el administrador tiene que permitirlo** y puede tardar 24 h.
- **Desbloquea:** decidir si la plataforma se abre desde Teams o desde un archivo.
- **Respuesta mínima:** permitido sí/no.

### P10. ¿Existe un catálogo de aplicaciones de SharePoint, y se admiten soluciones SPFx?
- **Por qué importa:** es lo que haría falta para la arquitectura B. **No la recomendamos**, pero
  cambia el panorama si la respuesta es «sí y es fácil».
- **Desbloquea:** descartar o reconsiderar B.
- **Respuesta mínima:** existe sí/no; quién despliega.

### P11. ¿Hay suscripción de Azure disponible para el área?
- **Por qué importa:** solo haría falta para la arquitectura C, la única con coste seguro.
- **Desbloquea:** saber si C es siquiera una opción.
- **Respuesta mínima:** sí/no, y si habría presupuesto.

---

## Bloque 4 · Mapas

### P12. ¿EPM tiene un servidor de mapas propio? (ArcGIS Enterprise, GeoServer, WMS, WMTS o XYZ)
- **Por qué importa:** hoy el mapa de fondo se carga de un servidor externo. Eso **le dice a ese
  servidor qué zona se está mirando** (no los PMT, pero sí el área de interés), y depende de que la
  red corporativa no lo bloquee.
- **Desbloquea:** retirar la dependencia externa. **La aplicación ya tiene el hueco preparado**: se
  configura desde la interfaz, sin tocar código.
- **Respuesta mínima:** existe sí/no; si existe, la dirección y el tipo de servicio.
- **Detalle técnico útil:** si es ArcGIS, necesitamos saber si publica en **Web Mercator
  (WKID 102100/3857)**. Si usa otra proyección, la integración es bastante más cara.

### P13. ¿La red corporativa permite cargar teselas de servidores externos?
- **Por qué importa:** si las bloquea, el mapa de fondo sale en blanco. Ya pasó una vez y costó una
  etapa entera encontrarlo.
- **Desbloquea:** saber si hay que ir con «sin mapa de fondo» por defecto.
- **Respuesta mínima:** permitido sí/no; si hay proxy, si altera las cabeceras.

### P14. ¿Hay restricciones de CSP o de proxy que afecten a una página que se abre desde un archivo local?
- **Por qué importa:** la aplicación funciona sin internet, pero el mapa de fondo y cualquier
  integración futura pasan por la red.
- **Respuesta mínima:** si hay una política que podamos leer.

---

## Bloque 5 · Gobierno de datos *(no técnico, pero es lo que puede parar todo)*

### P15. ¿Los KMZ de PMT tienen alguna clasificación de información?
- **Por qué importa:** dicen dónde y cuándo va a haber obra. No es público, pero necesitamos saber
  cómo está clasificado para tratarlo bien.
- **Desbloquea:** si se pueden guardar en el equipo, si pueden salir de la red, si se pueden
  publicar.
- **Respuesta mínima:** la clasificación que aplique.

### P16. ¿Hay alguna objeción a que la herramienta guarde datos en el equipo de quien la usa?
- **Por qué importa:** queremos poder ofrecer «recuperar la última sesión», pero **no vamos a
  guardar nada sin decirlo ni sin que se pueda borrar**.
- **Desbloquea:** la persistencia local (§6 de `ARQUITECTURA_OPERATIVA.md`).
- **Respuesta mínima:** permitido sí/no; con qué condiciones.

### P17. Si algún día se publica, ¿cuál es el camino aprobado para identidad corporativa?
- **Por qué importa:** hoy **no está publicada** y no hace falta. Cuando haga falta, no queremos
  improvisar.
- **Desbloquea:** el workstream de seguridad.
- **Respuesta mínima:** el mecanismo estándar de la organización.

---

## Lo que NO estamos pidiendo

Para que quede claro en la conversación con TI:

- ❌ No pedimos credenciales de nadie.
- ❌ No pedimos que se cree ningún recurso todavía.
- ❌ No pedimos permisos amplios: si algún día pedimos acceso, será `Sites.Selected` sobre **una**
  biblioteca.
- ❌ No estamos subiendo datos de EPM a ninguna nube de terceros. **El repositorio es público y por
  eso nunca lleva KMZ, ni CSV de producción, ni proyectos guardados.**

## Lo que podemos hacer mientras tanto

- **Todo lo que no depende del tenant ya está construido**: modelo de fuentes y versiones, detección
  de cambios, bitácora, y una maqueta que lo demuestra (`dist/Vista_previa_Datos.html`).
- Si la respuesta a P1 y P2 tarda, se puede empezar por la **arquitectura D**: mover los KMZ a una
  carpeta de OneDrive/SharePoint sincronizada. **No depende de nadie**, saca los archivos del equipo
  y aporta histórico con el versionado nativo.
