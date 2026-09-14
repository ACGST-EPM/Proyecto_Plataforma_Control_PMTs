/**
 * ETIQUETAS PROVISIONALES - NO ES UNA REGLA DE NEGOCIO.
 *
 * La Etapa 0 propuso tres niveles (cruce fisico / proximidad con traslape /
 * cercania sin traslape). Esa propuesta NO esta aprobada: requiere decision
 * operacional de la usuaria. Por eso vive en un archivo aparte, no toca el
 * calculo y todas sus etiquetas llevan el prefijo PROVISIONAL.
 *
 * El motor funciona sin este archivo. Existe unicamente para que el verificador
 * pueda agrupar filas y para que se pueda ver cuantos casos caeria en cada
 * combinacion antes de decidir nada.
 *
 * Las cuatro combinaciones posibles de los dos hechos independientes son:
 *
 *                        | traslape temporal SI | traslape temporal NO
 *   ---------------------|----------------------|----------------------
 *   intersecan (0 m)     | A                    | B
 *   dentro del umbral    | C                    | D
 *
 * Ninguna de las cuatro tiene todavia nombre oficial.
 */

export const COMBINACIONES = Object.freeze({
  A: 'PROVISIONAL:interseccion-con-traslape',
  B: 'PROVISIONAL:interseccion-sin-traslape',
  C: 'PROVISIONAL:proximidad-con-traslape',
  D: 'PROVISIONAL:proximidad-sin-traslape',
  E: 'PROVISIONAL:sin-evaluar-por-fechas',
});

/** Devuelve la combinacion de una relacion. No decide criticidad. */
export function combinacionDe(rel) {
  if (!rel.traslapeEvaluable) return COMBINACIONES.E;
  if (rel.intersecanFisicamente) return rel.hayTraslapeTemporal ? COMBINACIONES.A : COMBINACIONES.B;
  return rel.hayTraslapeTemporal ? COMBINACIONES.C : COMBINACIONES.D;
}

/** Reparte una lista de relaciones en las cinco combinaciones. */
export function repartir(relaciones) {
  const r = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const etiquetas = Object.entries(COMBINACIONES);
  for (const rel of relaciones) {
    const c = combinacionDe(rel);
    const clave = etiquetas.find(([, v]) => v === c)[0];
    r[clave]++;
  }
  return r;
}

/** Reparto por bandas de distancia, para ver la forma real de los datos. */
export function porBandaDeDistancia(relaciones, cortes = [0, 25, 50, 120, 243]) {
  const bandas = new Map();
  for (const rel of relaciones) {
    const d = rel.distanciaMetros;
    let etiqueta = `> ${cortes[cortes.length - 1]} m`;
    if (d === 0) etiqueta = '0 m (contacto fisico)';
    else {
      for (let i = 1; i < cortes.length; i++) {
        if (d <= cortes[i]) { etiqueta = `> ${cortes[i - 1]} y <= ${cortes[i]} m`; break; }
      }
    }
    bandas.set(etiqueta, (bandas.get(etiqueta) ?? 0) + 1);
  }
  return Object.fromEntries(bandas);
}
