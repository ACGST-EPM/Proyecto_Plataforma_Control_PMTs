# Plataforma de Control y Articulación de PMTs — Grupo EPM

Control de los Planes de Manejo de Tránsito: captura estandarizada de trazados,
detección de interferencias y cercanías espacio-temporales entre contratos, y
visualización en mapa con filtros, tablas e informe.

## Empezar

**Si solo quiere usarla:** abra `dist/Plataforma_PMTs.html` con doble clic,
arrastre sus KMZ o KML y listo. No hay que instalar nada ni tener internet.

**Si va a tocar el código:**

```bash
npm run preparar       # instala dependencias de desarrollo (npm ci, versiones fijas)
npm test               # 229 pruebas del motor + 75 de la aplicación
npm run test:navegador # 31 pruebas en Chromium real sobre el archivo de dist/
npm run construir      # regenera dist/Plataforma_PMTs.html y dist/verificador.html
```

Requiere **Node 18 o superior** (por `DecompressionStream`, que es lo que abre
los KMZ sin librerías externas).

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `dist/Plataforma_PMTs.html` | **La aplicación.** Un solo archivo, doble clic, sin internet. |
| `app/` | Código fuente de la aplicación. Ver `app/README.md`. |
| `motor/` | Motor geoespacial y temporal. 218 pruebas. Ver `motor/README.md`. |
| `motor/dist/verificador.html` | Compara el motor nuevo con el de QGIS, caso por caso. |
| `Generador_KMZ.html` | Captura estandarizada de trazados y genera los KMZ. |
| `contratos_db.json` | Base maestra de contratos. |
| `MATRIZ_PARIDAD_ETAPA2.md` | Comparación capacidad por capacidad: tablero histórico vs. aplicación nueva. |
| `PROPUESTA_AUTOMATIZACION.md` | Propuesta de automatización futura. **Nada conectado; para decidir.** |

### Referencia histórica, ya no necesaria para operar

| Ruta | Estado |
|---|---|
| `proceso_pmt_qgis.py` | **Congelado.** Se conserva como oráculo de regresión: el motor nuevo reproduce su salida fila por fila (708/708). No se modifica. |
| `Plataforma_PMTs.html` | Tablero anterior. Depende de `reporte_dinamico.csv`, de un mapa de qgis2web en `<iframe>` y de la API de GitHub. Sustituido por `dist/Plataforma_PMTs.html`. Se conserva mientras dure la transición. |

## Criterios de análisis

- **Distancia:** mínima real entre las geometrías originales. Umbral **120 m**,
  configurable.
- **Tiempo:** **fecha y hora** reales, tolerancia **0 minutos**.
- **Regla invariante:** dos frentes del mismo contrato nunca son interferencia
  entre contratos.
- **Hechos, no criticidad:** se informa la distancia, si hay contacto físico y
  si hay coincidencia temporal, por separado. La clasificación operativa
  («crítico», «alto») **todavía no está definida** y no se inventa.

## Estado

Etapa 1 (motor en paralelo) cerrada y auditada de forma independiente.
Etapa 2 (integración y flujo directo KMZ/KML) implementada, y corregida en las
Etapas **2.1** y **2.2** tras dos auditorías independientes. La 2.1 arregló el
mapa base y nueve regresiones; la **2.2** rediseñó la persistencia para que un
proyecto guardado no pueda dictar resultados, y corrigió la semántica temporal,
la gestión de fuentes y el informe. Detalle original de la 2.1 tras la prueba real de la usuaria y una auditoría funcional: mapa
base, simbología, filtros cruzados, paginación, informe ejecutivo, gestión de
archivos y proyectos guardables.
La publicación corporativa se evalúa en una etapa específica: la aplicación está
diseñada para no depender estructuralmente de GitHub Pages.

## Datos

Los KMZ de producción, `reporte_dinamico.csv` y los `crudo_*.json` **no están en
el repositorio y no deben añadirse**: contienen información operativa y personal,
y el repositorio es público.
