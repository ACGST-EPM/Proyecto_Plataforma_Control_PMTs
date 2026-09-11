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
- `Plataforma_PMTs.html` — dashboard (Bootstrap + DataTables + Select2). Lee `reporte_dinamico.csv`.
- `contratos_db.json` — base maestra de contratos (contrato → contratista, proyecto, municipios[]).
- `DOCUMENTACION_Plataforma_PMTs_EPM.md` — documento maestro con todo el detalle.
- `AUDITORIA_ETAPA0_Plataforma_PMTs.md` — auditoría técnica del estado real (Etapa 0, aprobada).
- `INFORME_ETAPA1.md` — resultados de la Etapa 1.
- `motor/` — **motor geoespacial y temporal nuevo, en paralelo** (Etapa 1). No sustituye a nada
  todavía. Ver `motor/README.md` para las decisiones técnicas; `motor/dist/verificador.html` se abre
  con doble clic y compara el motor de QGIS con el nuevo, caso por caso.

Repo publicado: `ACGST-EPM/Control-y-Articulacion-de-PMTs-EPM` (GitHub Pages).
Carpeta local: `C:\Users\lmarinza\PLATAFORMA_PMTs` (subcarpetas: `01_KMZ_Entrada`, `02_Proyecto_QGIS`, `Control-y-Articulacion-de-PMTs-EPM`).

## Estado de la migración (Etapa 1 terminada, en pausa para auditoría)
- El motor nuevo (`motor/`) corre **en paralelo**: no sustituye al tablero, no retira QGIS ni
  qgis2web, no toca el generador. `proceso_pmt_qgis.py` queda **congelado** como referencia; no se
  corrige para hacerlo coincidir con el nuevo.
- `motor/src/legado/replica.js` reproduce el motor de QGIS **con sus defectos a propósito**. No
  arregles nada ahí: su valor es poder demostrar qué hacía el sistema anterior.
- El núcleo separa HECHOS (distancia, contacto, traslape) de su CLASIFICACIÓN. No metas reglas de
  criticidad dentro del cálculo: van en `provisional.js` y siguen sin aprobarse.
- Parámetros aprobados: umbral **120 m reales** (configurable), traslape con **fecha y hora**,
  tolerancia **0 minutos**. El ~243 m del legado es solo línea base de comparación.
- **Nunca subas al repositorio** los KMZ de `01_KMZ_Entrada`, `reporte_dinamico.csv` ni los
  `crudo_*.json`: el repositorio es público y esos archivos llevan datos operativos y personales.

## Invariantes que NO debes romper (si cambias una punta, actualiza la otra)
- **Formato del campo Descripción del KMZ** (lo produce el generador y lo lee el motor):
  `fecha_inicio: AAAA-MM-DD HH:MM:SS | fecha_fin: ... | tipo_cierre: <total|parcial|ingreso y salida> | direccion: ... | municipio: ... | contrato: ... | contratista: ... | proyecto: ...`
  Separador ` | `. Los textos libres eliminan cualquier `|` interno.
- **Lista cerrada `tipo_cierre`**: `total`, `parcial`, `ingreso y salida`.
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
