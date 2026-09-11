/** Utilidades compartidas por las herramientas de linea de comandos. */
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Lee una carpeta de .kmz/.kml y la devuelve en el formato que espera el motor. */
export async function cargarCarpeta(ruta) {
  const nombres = (await readdir(ruta)).filter((n) => /\.(kmz|kml)$/i.test(n)).sort();
  const archivos = [];
  for (const n of nombres) {
    const b = await readFile(join(ruta, n));
    archivos.push({ nombre: basename(n), datos: new Uint8Array(b) });
  }
  return archivos;
}

/** Lector de CSV correcto (comillas dobles escapadas, saltos dentro de campo). */
export function leerCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const filas = [];
  let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); campo = ''; filas.push(fila); fila = []; }
    else if (c === '\r') { /* se ignora */ }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.length > 1 || (f[0] ?? '').trim() !== '');
}

export const pad = (s, n) => String(s).padEnd(n);
export const num = (s, n) => String(s).padStart(n);
