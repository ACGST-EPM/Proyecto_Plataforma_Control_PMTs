/**
 * CATALOGO MAESTRO EMBEBIDO.
 *
 * ══ POR QUE VA DENTRO DEL CODIGO ══════════════════════════════════════════
 *
 * La aplicacion tiene que funcionar con doble clic y sin internet. Si el
 * catalogo se leyera de un archivo suelto, crear un PMT dejaria de funcionar en
 * cuanto alguien moviera la carpeta.
 *
 * ══ COMO SE ACTUALIZA ═════════════════════════════════════════════════════
 *
 * Este archivo es una COPIA de `contratos_db.json`, que es el maestro que
 * gobierna EPM. Se regenera con `npm run construir:catalogo`. La aplicacion
 * ademas deja cargar un catalogo mas nuevo desde la interfaz, sin reconstruir
 * nada, para que una alta de contrato no dependa de un despliegue.
 *
 * NO CONTIENE NADA SENSIBLE: contrato, contratista, proyecto y municipios son
 * los mismos datos que ya viajan dentro de cada KMZ.
 *
 * NO EDITAR A MANO: se regenera. Edite `contratos_db.json`.
 * Generado el 2026-09-14 · 3 contrato(s).
 */
export const CATALOGO_EMBEBIDO = [
 {
  "contrato": "CW323402",
  "contratista": "CONSORCIO_INFRAESTRUCTURA_DE_AGUAS_2024",
  "proyecto": "ORFELINATO",
  "municipios": [
   "Medellín"
  ]
 },
 {
  "contrato": "CW322377",
  "contratista": "Consorcio AMT24",
  "proyecto": "AMPLIACION_TANQUES",
  "municipios": [
   "Medellín",
   "Envigado"
  ]
 },
 {
  "contrato": "CW328120",
  "contratista": "SANEAR S.A.S",
  "proyecto": "EDIE1",
  "municipios": [
   "Medellín"
  ]
 }
];
