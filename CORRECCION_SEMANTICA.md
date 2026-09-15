# Corrección semántica final — antes de la prueba de usuaria

> Tres decisiones de la entrega anterior estaban mal. Dos eran **incoherencias mías**: afirmaba una
> cosa en el código y la contraria en la documentación. Este documento dice qué estaba mal, qué se
> corrigió, y qué se midió con los datos reales.

---

## 1 · La coincidencia espacial exigía solo UN extremo vivo

### Qué estaba implementado

```js
return esOperativo(a, ref) || esOperativo(b, ref);   // ← bastaba uno
```

**Sí, estaba usando «uno vivo».** Lo documenté como decisión deliberada, razonando que «que donde
hoy trabaja alguien hubo otra intervención es contexto útil».

### Por qué estaba mal

Ese razonamiento confunde dos cosas distintas:

| | |
|---|---|
| **Contexto histórico del lugar** | Sí es útil — y para eso está la vista histórica |
| **Capacidad de coordinar AHORA** | Para coordinar hacen falta **dos partes** |

Coordinar con un contrato cuya obra terminó hace cuatro meses no es posible: no hay nada que acordar
con quien ya se fue. Presentarlo en la vista operativa como algo sobre lo que actuar **promete una
acción que no existe**.

### La regla implementada

`relevanciaDeRelacion()` devuelve **tres** valores, no dos:

| Combinación | Resultado |
|---|---|
| histórico + histórico | **NO accionable** |
| histórico + vigente | **NO accionable** |
| histórico + futuro | **NO accionable** |
| vigente + vigente | **SÍ** |
| vigente + futuro | **SÍ** |
| futuro + futuro | **SÍ** |
| cualquiera + vigencia no determinada | **NO EVALUABLE** |

La relación **no se borra**: sigue en la base, sale en el histórico, y vuelve entera al consultar la
fecha pertinente. Prueba explícita de cada fila, en las dos direcciones (A/B = B/A).

### Medido sobre los 8 KMZ reales

| | Antes | Ahora |
|---|---:|---:|
| Relaciones presentadas como accionables | **95** | **27** |
| De ellas, con un extremo ya vencido | 68 | **0** |

Dos tercios de lo que la vista operativa presentaba como pendiente **no se podía atender**.

---

## 2 · «Sin vigencia» se estaba contando como operativo

### Qué pasaba

Confirmado: `esOperativo` devolvía `true` para «sin vigencia», y por eso el informe decía
**183 operativos** cuando 174 + 8 = **182**.

Lo había escrito a propósito, razonando que esconderlo equivaldría a afirmar que había terminado.

### Por qué estaba mal

El razonamiento tenía una mitad buena y una mitad mala, y la mala pesa más:

- es **cierto** que esconderlo afirma que terminó;
- pero **contarlo como operativo afirma que NO ha terminado**, y eso tampoco se sabe.

Las dos son afirmaciones sobre algo desconocido. La respuesta correcta no es elegir una: es **no
responder que sí**. Es el mismo principio que atraviesa el producto desde la Etapa 1 —«no se pudo
analizar» nunca se presenta como «no hay»— y lo había roto justo aquí.

### Lo implementado

- Estado propio con nombre propio: **«Vigencia no determinada»** (antes «sin vigencia utilizable»).
- `esAccionable()` exige **VIGENTE o FUTURO**. Nada más.
- `operativos = vigentes + futuros`, y `repartirPorSituacion` devuelve `cuadra`: las cuatro
  categorías son excluyentes y cubren el total.
- **Lo que se cuenta y lo que se enseña es lo mismo** — hay prueba y compuerta.
- **Se conserva y se anuncia**: sale en «Todo», en Calidad de los datos, y la vista operativa muestra
  un aviso con botón para ir a verlo. No desaparece en silencio.
- **Defecto adicional encontrado**: un PMT sin vigencia **no pertenece a ningún año**, así que
  tampoco salía en ninguna consulta histórica. Correcto, pero invisible: solo aparecía en «Todo»,
  que casi nadie abre. Ahora se dice junto al selector de año.

### Verificado con datos reales

```
166 vigentes + 8 programados + 285 vencidos + 1 vigencia no determinada = 460  ✓ cuadra
operativos = 166 + 8 = 174                                                    ✓
PMT que se enseñan en operativo = 174                                          ✓ coinciden
```

---

## 3 · El código decidía una regla jurídica que la documentación declaraba pendiente

### La contradicción

En el informe escribí:

> «Los documentos no se heredan: una resolución ampara unas fechas concretas.»

Y en el mismo informe:

> «P21 — ¿los documentos se renuevan al reactivar? — **decisión pendiente**.»

**No se puede declarar algo pendiente y a la vez resolverlo en el código.** La afirmación estaba
implementada: `prepararReactivacion` ponía los tres códigos a `null` y la razón estaba escrita como
un hecho jurídico.

### Por qué las dos salidas fáciles son erróneas

| Salida | Qué afirma |
|---|---|
| Copiar el código | que el documento **sigue siendo válido** para la vigencia nueva |
| No guardar nada | que **no lo es** — y además borra una evidencia que alguien tendrá que mirar |

Las dos son decisiones jurídicas. El programa no puede tomarlas.

### El modelo neutral

```
activación nueva
  ├── resolucionPmt: null          ← sin código PROPIO: nadie ha tramitado nada aquí
  └── documentosPrevios: { resolucionPmt: 'RES-1001-2026', ... }
                                    ← EVIDENCIA, en su propia clave
```

Tres estados derivados, no dos:

| Estado | Significa |
|---|---|
| `REGISTRADO` | esta activación tiene su propio código |
| `PENDIENTE` | no hay código, y no hay ninguno anterior al que mirar |
| `HEREDADO_POR_CONFIRMAR` | **hay uno anterior, y su aplicabilidad está por confirmar** |

Reglas que lo sostienen:

- el código anterior **nunca ocupa el campo del propio** — si lo hiciera, en la siguiente lectura
  sería indistinguible de uno tramitado para esta vigencia, y la decisión quedaría tomada por
  accidente;
- **no suma a `registrados`** ni hace `completo`;
- la casilla del editor sale **vacía**, con el documento anterior **al lado**: precargarla haría que
  cualquiera pulsara guardar y quedara registrado sin que nadie lo comprobara;
- se ve en el editor, la tabla, la ficha y el seguimiento documental, con las palabras
  **«Previo disponible · aplicabilidad por confirmar»**;
- sobrevive a guardar y abrir el proyecto.

**P21 sigue siendo decisión pendiente.** Cuando EPM responda, se implementa **sin migración
destructiva**: la evidencia ya está guardada y solo cambia cómo se interpreta.

Y hay una compuerta (**R**) que, además de comprobar el comportamiento, **busca la afirmación
jurídica en el código** y falla si reaparece.

---

## 4 · Otras inferencias buscadas en la semántica Base/Activación

Revisión acotada a lo introducido en el complemento anterior. Encontrado:

| Dónde | Inferencia | Qué se hizo |
|---|---|---|
| Años | Un PMT sin vigencia no pertenece a ningún año → invisible en histórico | Se conserva la regla (es correcta) y **se anuncia** junto al selector |
| Relaciones | La lectura operativa afirmaba «articulación» o «sin coincidencia» aunque un extremo no se pudiera situar | Tercer valor: `NO_EVALUABLE`, con `lecturaOperativaEnContexto` |
| Exportación | El CSV no distinguía activaciones ni situación | Columnas `PMT_BASE`, `ACTIVACION`, `SITUACION`, `DOC_POR_CONFIRMAR`, **al final** |
| Informe | Decía «182 operativos» sin enseñar de dónde salían | Desglose con la suma escrita |

**Revisado y correcto, sin cambios:** numeración derivada (no leída del archivo); `contrato` como
parte de la identidad de la base; renumeración al retirar una activación; bloqueo de edición de los
campos de base al reactivar; comparación exacta de geometría sin tolerancia.

---

## 5 · El histórico, protegido con pruebas

Ocho afirmaciones, cada una cerrando una forma distinta de perder información:

| | |
|---|---|
| M1 | ocultar un vencido **no lo elimina** |
| M2 | cambiar de año **lo recupera** |
| M3 | mover la referencia al pasado recupera **PMT y relaciones** |
| M4 | una reactivación nueva **no sobrescribe** la anterior |
| M5 | editar la activación 3 **no modifica** la 1 ni la 2 |
| M6 | el PMT base mantiene **todas** sus activaciones |
| M7 | cinco reactivaciones encadenadas: la geometría **no deriva ni un decimal** |
| M8 | el histórico y la evidencia documental sobreviven a **guardar y abrir** |

---

## 6 · Presentación

La banda de contexto lleva **la cuenta escrita**, en una línea, no en cinco tarjetas:

```
📍 Operativo · al 2026-09-15    174 operativos = 166 vigentes + 8 programados │ 285 vencidos │ 460 en total
```

Cinco tarjetas iguales dirían que las cinco cifras importan igual, y no es verdad: la que se mira
todos los días es «operativos»; las demás existen para poder **comprobarla**. Si hay PMT con vigencia
no determinada, se nombran con esas palabras y en color de aviso.

---

## 7 · Suites

```
Motor ......................  259
Aplicación (lógica pura) ...  258
Navegador real .............   77
Compuertas de entrega ......   18   (A..R)
```

Las tres compuertas nuevas (P, Q, R) se probaron **restaurando la regla antigua a propósito**: las
tres la detectaron.


---

# Epílogo · P21 fue respondida (2026-09-15)

Este documento describe una corrección hecha **cuando la regla todavía no existía**, y su
conclusión —«no se puede declarar algo pendiente y a la vez resolverlo en el código»— sigue siendo
la correcta para aquel momento. Se conserva tal cual, sin retocar, porque es el registro de lo que
se decidió y por qué.

**La regla llegó después.** La responsable funcional del proceso en EPM la dio así:

> «Cada PMT y sus reactivaciones para nuevas vigencias tienen una resolución independiente, al igual
> sucede con los permisos de rotura.»

Con ella, el tercer estado —«Previo disponible · aplicabilidad por confirmar»— **se retiró**: existía
para no decidir, y ya hay quien decidió. Una activación nueva queda **Pendiente** de sus tres
documentos, y el número que tuvo la anterior se conserva como **historia**, nunca como documento de
esta vigencia.

**No hubo migración**, exactamente como este documento anticipaba: la evidencia ya estaba guardada
en su propia clave. El detalle está en el apéndice de `INFORME_ETAPA_EVOLUCION.md`.
