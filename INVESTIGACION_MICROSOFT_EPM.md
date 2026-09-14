# Dónde podría vivir esto — investigación con documentación oficial

> **Regla que atraviesa todo el documento:** en ningún sitio se afirma que EPM tenga algo.
> La columna «¿Confirmado en EPM?» dice **NO** en todas las filas, y seguirá diciéndolo hasta que TI
> responda el cuestionario de `DESCUBRIMIENTO_EPM.md`.
>
> Fecha de la consulta: **septiembre de 2026**. Las fuentes son documentación oficial de Microsoft;
> no se ha usado ningún blog como evidencia principal.

---

## 1 · Qué es técnicamente posible, y qué exige cada cosa

| Tecnología | ¿Sirve para lo nuestro? | Licencia | Permiso de TI | ¿Confirmado en EPM? |
|---|---|---|---|---|
| **SharePoint Online · biblioteca de documentos** | **Sí.** Es el sitio natural para los KMZ: carpetas, permisos, versiones | incluida en M365 con SharePoint | crear el sitio o la biblioteca | **NO** |
| **Versionado de biblioteca** | **Sí**, resuelve el histórico sin construir nada | incluido | activarlo y fijar el límite | **NO** |
| **Microsoft Graph · `driveItem` + `delta`** | **Sí.** `delta` da exactamente «qué cambió desde la última vez» | incluida | **registro de aplicación + consentimiento de administrador** | **NO** |
| **Graph · notificaciones de cambio (webhooks)** | Sí, pero **necesita un extremo público** que reciba el aviso | incluida | registro + el extremo | **NO** |
| **Power Automate · disparador de archivo creado/modificado** | **Sí**, y sin escribir código | el conector de SharePoint es estándar; **compartir flujos con conectores premium exige licencia Premium o por flujo** | crear el flujo; **la política DLP puede bloquearlo** | **NO** |
| **SPFx (elemento web dentro de SharePoint)** | Sí: la plataforma viviría dentro del portal | incluida | **catálogo de aplicaciones + un administrador que la despliegue** | **NO** |
| **Teams · aplicación personalizada (pestaña)** | Sí: una pestaña que abre la plataforma | incluida | **el administrador debe permitir aplicaciones personalizadas**; puede tardar 24 h en activarse | **NO** |
| **Power Apps / Power Pages** | Mal encaje: nuestro motor es JavaScript y el mapa es Leaflet | requiere plan | sí | **NO** |
| **Azure Static Web Apps** | Sí, con identidad corporativa | **restringir a un tenant exige proveedor personalizado ⇒ plan Standard (de pago)** | suscripción de Azure + registro de aplicación | **NO** |
| **Azure Functions** | Solo si hace falta cálculo en servidor. **Hoy no hace falta** | consumo | suscripción | **NO** |
| **Entra ID · registro de aplicación** | Necesario para casi todo lo de Graph | incluida | **consentimiento de administrador del tenant** | **NO** |

### Detalles que cambian una decisión

**Versionado de SharePoint.** Los límites se fijan a nivel de organización, sitio o biblioteca. En
modo manual se admite entre **100 y 50.000** versiones mayores; el modo automático conserva hasta
**500** versiones con una cadencia decreciente (horaria hasta 60 días, diaria hasta 180, semanal
después). Para los PMT, donde un archivo se corrige unas pocas veces, cualquiera de los dos sobra.
([límites de versión](https://learn.microsoft.com/en-us/sharepoint/library-version-limits) ·
[visión general](https://learn.microsoft.com/en-us/sharepoint/document-library-version-history-limits))

**Límites de archivo y ruta.** Hasta **250 GB** por archivo — los KMZ pesan decenas de KB, así que
sobra. La **ruta completa decodificada no puede pasar de 400 caracteres**, y eso sí importa: una
estructura `Sitio/Biblioteca/Año/Contrato/Proyecto/archivo.kmz` con nombres largos se acerca.
Conviene **carpetas cortas**. Hay caracteres no admitidos y no se permiten espacios al principio ni
al final. ([límites de SharePoint](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits) ·
[restricciones](https://support.microsoft.com/en-us/onedrive/restrictions-and-limitations-in-onedrive-and-sharepoint))

**Graph `delta`.** Es la forma recomendada de descubrir archivos y detectar cambios a escala: se
guarda un testigo y la siguiente llamada devuelve solo lo que cambió. Con webhooks, el patrón
oficial es **responder 202 enseguida y después pedir el delta**.
([delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0) ·
[notificaciones](https://learn.microsoft.com/en-us/graph/change-notifications-overview) ·
[buenas prácticas](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/scan-guidance?view=odsp-graph-online))

> **Esto encaja exactamente con lo que ya está construido.** `app/fuentes/` distingue nuevo /
> modificado / movido / eliminado por su cuenta, con huellas. Un adaptador de Graph podría usar
> `delta` para **saber a quién preguntar**, y la huella seguiría siendo quien decide si el contenido
> cambió de verdad. Las dos cosas se complementan; ninguna sustituye a la otra.

**Permisos de Graph: el detalle que decide.** `Sites.Selected` permite dar acceso **solo a los
sitios que se elijan**, en vez de a todo SharePoint. Requiere consentimiento de administrador y,
además, que un administrador conceda explícitamente el permiso sobre el sitio concreto. Es la opción
de **mínimo privilegio** y la que hay que pedir. ([RSC y Graph](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins-modernize/understanding-rsc-for-msgraph-and-sharepoint-online) ·
[consentimiento](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent))

**Power Automate: dos trampas documentadas.**
1. **Las subcarpetas no disparan.** «Cuando se crea o modifica un archivo» **no** se activa en
   subcarpetas; hay que crear un flujo por carpeta. Eso condiciona la estructura de carpetas.
2. **DLP puede suspender el flujo.** Si la política de datos de la organización clasifica los
   conectores en grupos incompatibles, **el flujo se suspende y el disparador no se activa**.
([conector SharePoint](https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/sharepoint-connector-actions-triggers) ·
[problemas de disparadores](https://learn.microsoft.com/en-us/power-automate/triggers-troubleshoot) ·
[DLP](https://learn.microsoft.com/en-us/power-automate/prevent-data-loss))

**SPFx.** Se despliega en el **catálogo de aplicaciones**, que crea un administrador del tenant.
Solo los administradores del catálogo pueden instalar; pueden delegar. Existe despliegue a nivel de
sitio si no se quiere todo el tenant.
([despliegue](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/tenant-scoped-deployment) ·
[catálogo por sitio](https://learn.microsoft.com/en-us/sharepoint/dev/general-development/site-collection-app-catalog))

**Teams.** Una aplicación interna **no necesita publicarse en la tienda**: se distribuye dentro de
la organización. Pero el administrador tiene que activar «permitir aplicaciones personalizadas», y
**puede tardar hasta 24 horas** en surtir efecto.
([aplicaciones personalizadas](https://learn.microsoft.com/en-us/microsoftteams/teams-custom-app-policies-and-settings) ·
[subir](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/apps-upload))

**Azure Static Web Apps.** El proveedor de Entra ID preconfigurado **deja entrar a cualquier cuenta
Microsoft**. Para limitar a un solo tenant hay que configurar un proveedor personalizado, y eso
**solo está en el plan Standard**, que es de pago.
([autenticación](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization) ·
[personalizada](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom))

---

## 2 · Cuatro arquitecturas completas

### A · SharePoint + Power Automate + la aplicación tal cual  ← **RECOMENDADA**

```
  Contratista → Generador (KMZ)
       ↓
  Biblioteca de SharePoint  (carpetas por año/contrato · versionado activado)
       ↓  Power Automate: cuando se crea o modifica → anota y avisa
  La usuaria abre la plataforma y sincroniza desde la biblioteca
       ↓
  Informe · exportaciones · bitácora
```

- **Qué hay que construir:** un adaptador `proveedorSharePoint` que cumpla `listar()` y `leer()`.
  Nada más: el resto ya existe.
- **Qué hay que pedir a TI:** una biblioteca, versionado activado y (para leer sin intervención) un
  registro de aplicación con `Sites.Selected`.
- **Complejidad** baja · **Dependencia de TI** media · **Coste** probablemente ninguno con las
  licencias de M365 ya existentes, salvo que haga falta un conector premium.

### B · SPFx dentro del portal de SharePoint

```
  Biblioteca de SharePoint → elemento web SPFx (la plataforma dentro del portal) → Teams
```

- **Ventaja real:** la identidad ya está resuelta. Quien entra al portal ya es quien dice ser, sin
  construir nada.
- **Coste real:** la aplicación deja de ser un archivo que se abre con doble clic. Hay que montar
  una cadena de compilación de SPFx, mantenerla al ritmo de las versiones de SharePoint, y cada
  cambio pasa por el catálogo de aplicaciones y por un administrador.
- **Complejidad** alta · **Dependencia de TI** alta · **Mantenimiento** alto.

### C · Almacenamiento corporativo + servicio en Azure + Entra ID

```
  SharePoint/OneDrive → Azure Function (webhook de Graph + delta) → Static Web App con Entra ID
```

- **Ventaja:** es la única que permite que el análisis ocurra **sin que nadie abra nada** y que el
  resultado esté disponible para varias personas.
- **Coste:** deja de ser una herramienta local y pasa a ser un servicio: suscripción, despliegue,
  vigilancia, plan Standard para restringir el tenant, y un responsable. **Es saltar de una
  herramienta a un sistema.**
- **Complejidad** alta · **Dependencia de TI** alta · **Coste** el único con coste seguro.

### D · Seguir como hoy, con la carpeta compartida

```
  Carpeta de OneDrive/SharePoint sincronizada en el equipo → la plataforma lee esa carpeta
```

- **Ventaja:** cero dependencia de TI. Funciona mañana.
- **Límite honesto:** el navegador **no puede vigilar una carpeta**. Hay que volver a elegir los
  archivos. Sí se gana algo real: **los archivos dejan de vivir en un solo equipo** y el histórico lo
  aporta el versionado de OneDrive.
- **Complejidad** ninguna · **Dependencia de TI** ninguna.

### Comparación

| | A · SP + Flow | B · SPFx | C · Azure | D · carpeta |
|---|---|---|---|---|
| Complejidad | baja | alta | alta | ninguna |
| Seguridad / identidad | la de SharePoint | la del portal | la mejor | la de la carpeta |
| Gobierno de datos | bueno | bueno | bueno | aceptable |
| Experiencia | buena | muy buena | muy buena | igual que hoy |
| Automatización | parcial | parcial | completa | ninguna |
| Mantenimiento | bajo | alto | alto | ninguno |
| Dependencia de TI | media | alta | alta | ninguna |
| Coste / licencias | probablemente nada | nada extra | **sí** | nada |
| Escalabilidad | buena | buena | la mejor | limitada |
| **¿Cabe el motor actual sin reescribirlo?** | **sí** | sí, empaquetado | sí | **sí** |
| **¿Funciona sin backend?** | **sí** | sí | no | **sí** |
| Dónde viven los KMZ | biblioteca | biblioteca | biblioteca | carpeta |
| Auditoría | de SharePoint + la nuestra | ídem | la más completa | la nuestra |
| Histórico | versionado nativo | ídem | ídem | versionado de OneDrive |

---

## 3 · Recomendación

> **Preferida: A — SharePoint + Power Automate + la aplicación tal cual.**
> **Alternativa: D — carpeta compartida**, que se puede empezar mañana y no cierra ninguna puerta.
> **`CONDICIONADA A VALIDACIÓN EPM`** en los dos casos.

Por qué A y no B ni C:

1. **Conserva lo que mejor funciona.** La plataforma es un archivo que se abre con doble clic, sin
   internet y sin instalar nada. B y C lo destruyen. Eso no es nostalgia: es lo que permite que
   funcione en una obra sin cobertura y que no dependa de que un servicio esté levantado.
2. **Resuelve el problema de verdad**, que no es la interfaz: es que los KMZ viven en un equipo y
   nadie sabe cuál es la última versión. Eso lo arregla la biblioteca con versionado.
3. **Es la única cuyo coste de construcción es un archivo.** El adaptador `listar()`/`leer()`.
4. **No cierra ninguna puerta.** Si mañana se quiere B o C, el motor y la gestión de fuentes se
   reutilizan enteros.

Por qué D como alternativa: porque **no depende de nadie** y ya resuelve la mitad del problema.
Es el paso que se puede dar mientras TI responde.

**Qué haría cambiar la recomendación:**
- si la política DLP bloquea el conector de SharePoint en Power Automate → A pierde su parte de
  automatización y se queda cerca de D;
- si TI no concede `Sites.Selected` → hay que volver a elegir archivos a mano, y A ≈ D;
- si aparece el requisito de que **varias personas** vean el análisis actualizado sin abrir nada →
  entonces sí hace falta C, con su coste.

---

## 4 · Mapa base corporativo (Fase P)

La arquitectura de proveedor ya está desacoplada (`app/nucleo/mapas-base.js`). Qué habría que
soportar el día que exista un servidor de EPM:

| Interfaz | Esfuerzo | Nota |
|---|---|---|
| **XYZ** (`/{z}/{x}/{y}.png`) | **ninguno: ya funciona** | es lo que usa el hueco «corporativo» de hoy |
| **WMTS** | bajo | si publica `RESTful` con plantilla, es XYZ con otro nombre. Si solo admite `KVP`, hace falta una pequeña traducción |
| **WMS** | medio | Leaflet trae `L.tileLayer.wms` de serie; habría que exponer capa y CRS |
| **ArcGIS REST** | medio | `esri-leaflet` **solo admite el esquema Web Mercator (WKID 102100/3857)**; otra proyección exigiría `Proj4Leaflet`, que es otra dependencia y rompería el archivo único. Se puede usar la exportación XYZ del servicio si está publicada ([Esri Leaflet](https://developers.arcgis.com/esri-leaflet/api-reference/layers/tiled-map-layer/)) |

**Qué NO se va a hacer:** integrar credenciales. Una clave en un archivo público no es una clave. Si
el servidor corporativo exige autenticación, tiene que resolverla la red (el servidor solo accesible
desde dentro) o una identidad delante del sitio, nunca la página.

---

## Fuentes

- [Set version limits for a document library](https://learn.microsoft.com/en-us/sharepoint/library-version-limits)
- [Version history limits overview](https://learn.microsoft.com/en-us/sharepoint/document-library-version-history-limits)
- [SharePoint limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits)
- [Restrictions and limitations in OneDrive and SharePoint](https://support.microsoft.com/en-us/onedrive/restrictions-and-limitations-in-onedrive-and-sharepoint)
- [driveItem: delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0)
- [Change notifications overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
- [Best practices for discovering files and detecting changes at scale](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/scan-guidance?view=odsp-graph-online)
- [Understanding Resource Specific Consent for Microsoft Graph and SharePoint Online](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins-modernize/understanding-rsc-for-msgraph-and-sharepoint-online)
- [Grant tenant-wide admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent)
- [SharePoint connector for Power Automate](https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/sharepoint-connector-actions-triggers)
- [Troubleshoot common issues with Power Automate triggers](https://learn.microsoft.com/en-us/power-automate/triggers-troubleshoot)
- [Data loss prevention (DLP) policy creation](https://learn.microsoft.com/en-us/power-automate/prevent-data-loss)
- [Tenant-scoped solution deployment for SPFx](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/tenant-scoped-deployment)
- [Use the site collection app catalog](https://learn.microsoft.com/en-us/sharepoint/dev/general-development/site-collection-app-catalog)
- [Manage custom app policies and settings (Teams)](https://learn.microsoft.com/en-us/microsoftteams/teams-custom-app-policies-and-settings)
- [Upload your custom app (Teams)](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/apps-upload)
- [Authenticate and authorize Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Custom authentication in Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom)
- [L.esri.TiledMapLayer](https://developers.arcgis.com/esri-leaflet/api-reference/layers/tiled-map-layer/)
