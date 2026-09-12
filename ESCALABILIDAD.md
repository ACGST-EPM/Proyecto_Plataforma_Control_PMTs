# Escalabilidad del motor — medido, no estimado

> **Regla que se ha seguido:** no optimizar lo que no duele. Este documento existe para saber
> **cuándo** empezará a doler, y qué hacer entonces — no para hacerlo ahora.

---

## 1 · La medida

Motor actual, Node v22, con trazados generados **manteniendo la densidad real** de los 8 KMZ
(460 trazados en ~0,15° × 0,15° del Valle de Aburrá). Amontonarlos todos en el mismo sitio mediría
el peor caso; esparcirlos, el mejor. Se mantiene la proporción para que el número signifique algo.

| PMT | Pares posibles | Distancias calculadas | Relaciones | Tiempo | Por PMT |
|---:|---:|---:|---:|---:|---:|
| 460 | 105.570 | 96.982 | 40 | **0,27 s** | 0,59 ms |
| 1.000 | 499.500 | 458.332 | 69 | **0,78 s** | 0,78 ms |
| 2.500 | 3.123.750 | 2.864.582 | 167 | **4,7 s** | 1,87 ms |
| 5.000 | 12.497.500 | 11.458.332 | 342 | **21,0 s** | 4,21 ms |
| 10.000 | 49.995.000 | 45.833.332 | 710 | **110,9 s** | 11,09 ms |

El crecimiento es **cuadrático y limpio**: al doblar los PMT, el tiempo se multiplica por algo más
de cuatro. Nada se desvía de eso, lo que descarta que haya un problema distinto escondido.

---

## 2 · Lo que la medida destapa

**El prefiltro por caja envolvente no descarta ni un solo par.** `paresDescartadosPorCaja` vale 0
en todas las corridas. No es un fallo: es **deliberado y está documentado** en
`motor/src/geo/cajas.js`:

> *«Las cajas en grados no acotan los segmentos proyectados en ENU. La conversión anterior
> sobreestimaba incluso pares de puntos en los polos. Cero es una cota demostrable para TODOS los
> tipos: desactiva esa poda.»*

Es decir: en una etapa anterior se prefirió **ser correcto a ser rápido**, porque la cota que había
descartaba pares que estaban **a dos metros de distancia real**. Fue la decisión correcta. Una poda
que descarta una interferencia real es un defecto grave; una que no descarta nada solo es lenta.

Pero deja el margen de mejora más grande del sistema: de 45,8 millones de distancias calculadas con
10.000 PMT, **solo 710 pares están dentro de los 120 m**. Un prefiltro correcto eliminaría más del
99,99 % del trabajo.

---

## 3 · A partir de cuándo duele

| Volumen | Tiempo | Veredicto |
|---|---|---|
| **460** (hoy) | 0,27 s | imperceptible. **No tocar nada** |
| **1.000** | 0,78 s | sigue siendo instantáneo para quien lo usa |
| **2.500** | 4,7 s | empieza a notarse. Aquí conviene **mover el cálculo a un Web Worker**, no para ir más rápido, sino para que la pantalla no se congele |
| **5.000** | 21 s | inaceptable en una interacción. **Aquí hace falta el prefiltro espacial** |
| **10.000** | 111 s | inviable sin índice espacial |

### ¿Es realista llegar ahí?

Hoy: **8 contratos, 460 PMT**. Para llegar a 5.000 harían falta del orden de 85 contratos activos a
la vez con la densidad actual. **HIPÓTESIS**: no parece el escenario del próximo año, pero acumular
histórico sí puede llevar ahí — si en lugar de sustituir los KMZ se conservan todas las versiones,
el volumen crece sin que crezca la obra. Por eso el histórico debe poder **excluirse del análisis**
(§6).

---

## 4 · Qué hacer, en este orden

### 1º · Prefiltro espacial correcto — el que más rinde

No hay que reintroducir la cota que se retiró. Hay una **rigurosa** y sencilla, sobre cajas en
grados, que nunca descarta un par que pueda estar cerca:

```
  separación en latitud:   Δφ (grados) × 110.574 m      (arco de meridiano MÍNIMO)
  separación en longitud:  Δλ (grados) × 111.320 m × cos(φ_peor)
                           φ_peor = la latitud MÁS CERCANA AL POLO de las dos cajas
  cota inferior = max(las dos), y 0 si las cajas se solapan
```

Es una cota inferior demostrable: usa el arco de meridiano más corto y el coseno más pequeño, así
que **subestima siempre**. Y subestimar es justo lo que hace segura una poda.

- **Ganancia esperada**: > 99 % de los pares descartados con datos urbanos dispersos.
- **Riesgo**: alto si se hace mal — por eso la prueba obligatoria es **ejecutar el motor con y sin
  poda sobre los 8 KMZ reales y exigir las mismas 174 relaciones**, y una prueba de propiedad que
  compruebe que la cota nunca supera la distancia real.

### 2º · Índice espacial (rejilla o R-tree) — si el prefiltro no basta

Con la poda, el coste pasa a depender de los pares *candidatos*, no de los posibles. Si aun así
sobra trabajo, una **rejilla uniforme de 120 m** es más simple que un R-tree y suficiente: se
consultan las nueve celdas vecinas. Un R-tree solo compensa con geometrías de tamaños muy dispares.

### 3º · Web Worker — cuando el problema sea la pantalla, no el reloj

El motor es lógica pura sin DOM: **ya está preparado**. Mueve el cálculo fuera del hilo de la
interfaz para que no se congele. No acelera nada; cambia una espera muerta por una espera con
barra de progreso.

### 4º · Relaciones incrementales — el último, no el primero

Recalcular solo los pares afectados por un cambio exige saber qué pares puede tocar un PMT nuevo,
y eso **necesita el índice del paso 2**. Hacerlo antes es construir sobre nada.

### 5º · Procesamiento en servidor — probablemente nunca

Rompe la mejor propiedad del producto: que sea un archivo que se abre con doble clic, sin internet
y sin instalar nada. Solo tiene sentido si el volumen supera lo que un navegador puede con índice
espacial, y eso está muy lejos de 10.000 PMT.

---

## 5 · Memoria

No es el cuello de botella y no lo será antes que el tiempo: las geometrías de los 8 KMZ ocupan
pocos MB, y el motor no construye la matriz de pares — recorre en bucle y guarda solo las relaciones
que superan el filtro (710 con 10.000 PMT). El tiempo se agota mucho antes que la memoria.

---

## 6 · Lo que NO se ha hecho, a propósito

- **No se ha tocado el motor.** A 460 PMT tarda 0,27 s. Cambiar el cálculo para ahorrar décimas
  introduciría riesgo en lo único que está auditado contra un oráculo (708/708 filas).
- **No se ha reintroducido la poda.** La fórmula de §4 está escrita para cuando haga falta, con la
  prueba que tendría que pasar.
- **No se ha medido en el navegador.** El motor es el mismo código y el orden de magnitud no cambia;
  lo que cambiaría es que la pantalla se congela, y eso ya está dicho en el paso 3.

---

## 7 · Reproducir esta medida

El guion está en el historial de la sesión y se reconstruye en diez líneas: generar `n` trazados con
la densidad indicada, llamar a `calcularRelaciones` y leer `estadisticas`. Lo que importa es la
receta, no el archivo: **mantener la densidad constante** y mirar `paresDescartadosPorCaja`, que es
el número que dice si la poda está haciendo algo.
