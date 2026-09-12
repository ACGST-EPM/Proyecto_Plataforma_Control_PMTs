# Modelo de amenazas — proporcionado a lo que esto es

> **Qué es esta herramienta hoy:** un archivo HTML que se abre con doble clic, sin servidor, sin
> cuentas y sin internet. Los datos que maneja son **operativos de EPM**: direcciones de obra,
> fechas, contratos y contratistas. No hay datos de salud ni financieros; sí hay información que
> dice **dónde va a haber obra y cuándo**, que no es pública.
>
> Un modelo de amenazas desproporcionado es tan inútil como no tener ninguno: si pide cifrado de
> disco para abrir un KMZ, nadie lo lee. Esto se ciñe a lo que puede pasar de verdad.

---

## 1 · Qué se protege, y de quién

| Activo | Por qué importa | Amenaza realista |
|---|---|---|
| Contenido de los KMZ | dice dónde y cuándo habrá obra | que acabe en un sitio público sin querer |
| `.pmt.json` | lleva los mismos datos | igual, y además que alguien lo edite y se le crea |
| El propio repositorio | es **público** | subir un archivo con datos operativos |
| El equipo de quien la usa | es donde se abre todo | un archivo malicioso que aproveche la herramienta |
| La confianza en las cifras | es el producto entero | que la herramienta presente algo como calculado cuando no lo fue |

**Quién no está en el modelo:** un atacante con acceso al equipo de la usuaria. Si alguien tiene eso,
tiene los KMZ directamente, y nada que haga una página puede evitarlo. Decir lo contrario sería
vender humo.

---

## 2 · Superficies de entrada, una por una

### 2.1 · KMZ / KML de origen desconocido — **la superficie principal**

Es el único sitio por donde entra algo que la herramienta no escribió.

| Riesgo | Estado | Detalle |
|---|---|---|
| XML con entidades externas (XXE) | **mitigado** | el parser es propio (`motor/src/io/xml.js`) y no resuelve entidades externas ni DTD |
| Bomba de expansión de entidades | **mitigado** | mismo motivo: sin expansión de entidades no hay bomba |
| ZIP bomb (KMZ que descomprime a gigabytes) | **mitigado** | hay cinco límites declarados en `motor/src/io/zip.js`: archivo 64 MB, entrada descomprimida 64 MB, total 128 MB, factor de expansión 400× y 10.000 entradas. Se comprobó el caso real: ratio medido de 1029 a 1 |
| Rutas de escape en el ZIP (`../../`) | **mitigado** | nada se escribe en disco: solo se lee el KML de dentro |
| Coordenadas imposibles | **mitigado** | se validan rango y finitud; fuera del planeta se descarta con aviso |
| Texto malicioso en campos (XSS) | **mitigado** | todo lo que va al DOM pasa por `esc()`. Se revisó cada `innerHTML` |
| Fechas absurdas | **mitigado** | calendario real, no expresión regular |
| Geometrías degeneradas | **mitigado** | validación explícita por tipo |
| Archivo gigante | **mitigado** | tope de 64 MB, con mensaje entendible (`app/nucleo/ingesta.js` lo traduce a lenguaje llano) |
| Contenido alterado dentro del ZIP | **mitigado** | se comprueba el **CRC-32** de cada entrada extraída |
| Se descomprime más de lo necesario | **mitigado** | se lee el directorio entero, pero solo se descomprime la entrada que se va a usar |

### 2.2 · `.pmt.json`

| Riesgo | Estado |
|---|---|
| Imponer resultados falsos | **cerrado en la Etapa 2.2**: las relaciones no se guardan; se recalculan siempre |
| Fechas contradictorias | **cerrado en la 2.3**: el texto manda y los milisegundos se descartan |
| Inflar contadores | **cerrado en la 2.4**: la marca de duplicado exige respaldo en el identificador |
| Esquema inventado | **cerrado**: se rechaza 0, −1, no enteros y futuros |
| Identificadores repetidos | **cerrado**: se descartan con aviso |
| `huella` presentada como firma | **cerrado**: se declara como detección de corrupción accidental, no autenticación |

### 2.3 · El navegador y el equipo

| Riesgo | Estado |
|---|---|
| `localStorage` con datos operativos | **acotado**: solo guarda la preferencia de mapa base, ningún dato de PMT |
| Descargas | las genera la propia página; no se abre nada automáticamente |
| Enlaces externos | no hay enlaces salientes en la aplicación |

### 2.4 · El mapa base

Cargar teselas de un servidor externo **le dice a ese servidor qué zona se está mirando**, por las
coordenadas de cada tesela. No revela los PMT, pero sí el área de interés.

| Estado | Detalle |
|---|---|
| **declarado** | el proveedor es intercambiable y hay opción **«Sin mapa de fondo»** |
| **sin credenciales** | ninguna clave de API, ni la habrá: iría en un archivo público |
| **preparado** | hay un hueco para un servidor de EPM, configurable sin tocar código |

### 2.5 · El generador (`Generador_KMZ.html`)

| Riesgo | Estado |
|---|---|
| «Clave de administrador» presentada como seguridad | **corregido**: ahora se declara como seguro contra ediciones accidentales, que es lo que es |
| **Clave por defecto escrita en claro en un comentario** | **retirada del archivo**, pero **sigue en el historial de Git de un repositorio público**. Por eso hay que **CAMBIARLA**, no basta con borrarla |
| Tres CDN externas (Bootstrap, Leaflet, JSZip) | **abierto**: el generador **no funciona sin internet** y se rompe si la red corporativa bloquea `unpkg`. Además, quien controle esas CDN ejecuta código en el navegador de quien abra el generador |
| XSS en las tablas | **revisado, sin hallazgos**: los campos del usuario van escapados |

---

## 3 · Lo que una página estática NO puede dar

Conviene dejarlo por escrito para que nadie lo prometa:

- **No puede autenticar.** Cualquier clave que necesite para funcionar se la entrega al navegador.
- **No puede autorizar.** No hay nada que decida quién ve qué.
- **No puede auditar quién hizo algo.** Sin identidad, no hay a quién atribuir.
- **No puede impedir que se copie un archivo.** Quien lo abre ya lo tiene.

Lo que **sí** puede: no empeorar las cosas. No pedir credenciales, no mandar datos a ninguna parte,
no guardar nada sin decirlo, y no presentar como calculado lo que no lo fue.

---

## 4 · Reglas del repositorio (se cumplen hoy)

- **Nunca** se suben los KMZ de `01_KMZ_Entrada`, `reporte_dinamico.csv` ni los `crudo_*.json`.
- **Nunca** se suben `.pmt.json`: llevan los mismos datos operativos.
- Las pruebas usan **fixtures sintéticos**; no hay un solo dato real de EPM en el repositorio.
- No hay secretos, claves de API ni direcciones internas en el código. *(Comprobado: el sello de
  procedencia tiene una prueba que falla si aparece una URL o un correo dentro.)*

---

## 5 · Lo que falta, con su plan

> **Nota honesta sobre este apartado.** El primer borrador de este documento daba por abiertos dos
> riesgos —ZIP bomb y tamaño de entrada— que en realidad **ya estaban cerrados** en
> `motor/src/io/zip.js` desde la Etapa 1. Se comprobó contra el código antes de publicarlo y se
> corrigió. Queda escrito porque un modelo de amenazas que inventa riesgos gasta el mismo crédito
> que uno que los oculta.

| # | Riesgo abierto | Propuesta | Coste |
|---|---|---|---|
| S1 | **El generador depende de tres CDN** (Bootstrap, Leaflet, JSZip) | vendorizarlas, igual que se hizo con Leaflet en la plataforma. Además de la disponibilidad, quien controle esas CDN ejecuta código en el navegador de quien abra el generador | medio: hay que descargar las librerías y comprobar sus licencias |
| S2 | **La clave por defecto del generador está en el historial público de Git** | **cambiarla.** Borrarla del archivo no la borra del historial. Es una acción de operación, no de código | inmediato |
| S3 | Los límites del ZIP están en el motor, pero **el `.pmt.json` no tiene tope de tamaño** | aplicar el mismo criterio al abrir un proyecto | bajo |
| S4 | Sin identidad ni control de acceso | solo hace falta si la plataforma se publica. Dos rutas evaluadas | **VALIDAR EPM** |
| S5 | El día que los archivos lleguen de un origen menos controlado, habrá que **revisar los límites** pensando en un remitente que no es el propio equipo | revisar `LIMITES_POR_DEFECTO` y el rechazo por lote | bajo, pero **antes** de automatizar la entrada |

---

## 6 · Si algún día se publica

Dos rutas evaluadas en el documento maestro, ninguna decidida:

- **(A) Cloudflare Access con PIN de un solo uso** sobre Cloudflare Pages — lo más cercano al
  requisito («solo correos `@epm.com.co`, con código que cambia cada vez») y poco código.
- **(B) Azure Static Web Apps con Entra ID** — SSO corporativo; **restringir a un solo tenant exige
  un proveedor personalizado, y eso exige el plan Standard, que es de pago**.

En los dos casos hace falta TI/Seguridad de EPM: dominio propio y gobierno de datos. Ver
`INVESTIGACION_MICROSOFT_EPM.md` y `DESCUBRIMIENTO_EPM.md`.
