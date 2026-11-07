// Pruebas de la versión web: el núcleo (app/nucleo.js) debe dar el mismo PDC, plazo y cambios
// que la calculadora de la versión con agentes (herramientas/calcular.mjs) en los 4 pacientes ficticios.
// Uso: node --test pruebas/nucleo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as N from '../app/nucleo.js';
import * as D from '../app/datos.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const id of Object.keys(D.EJEMPLOS)) {
  test(`${id}: mismo resultado que calcular.mjs`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
    execFileSync('node', [path.join(RAIZ, 'herramientas/calcular.mjs'), path.join(RAIZ, 'datos/pacientes', id), tmp]);
    const ref = JSON.parse(fs.readFileSync(path.join(tmp, '01_calculo.json'), 'utf8'));
    const r = N.preparar(N.entradaDesdeEjemplo(D.EJEMPLOS[id]), D);
    assert.deepEqual(r.errores, []);
    assert.deepEqual(r.calculo.adherencia.grupos.map((g) => [g.grupo, g.dias_cubiertos, g.dias_ventana, g.pdc]), ref.adherencia.grupos.map((g) => [g.grupo, g.dias_cubiertos, g.dias_ventana, g.pdc]));
    assert.equal(r.calculo.reestratificacion.estado, ref.reestratificacion.estado);
    assert.equal(r.calculo.reestratificacion.fecha_limite, ref.reestratificacion.fecha_limite);
    assert.equal(r.calculo.cambios.lista.length, ref.cambios_tratamiento.lista.length);
    assert.ok(r.auditoria.aprobada);
  });
}

test('PDC esperado en VIH-01 (81,7 %, 147/180)', () => {
  const g = N.preparar(N.entradaDesdeEjemplo(D.EJEMPLOS['VIH-01']), D).calculo.adherencia.grupos[0];
  assert.equal(g.dias_cubiertos, 147); assert.equal(g.dias_ventana, 180); assert.equal(g.pdc_porcentaje, '81,7 %');
});

test('Las negaciones no generan señal', () => {
  const s = N.lector({ notas: '## 2026-01-01 · x\nSin náuseas ni vómitos. Niega olvidos de dosis. Refiere cefalea leve.' }).senales;
  assert.deepEqual(s.map((x) => x.tipo), ['efectos_adversos']);
});

test('Toda intervención propuesta es literal de la biblioteca', () => {
  for (const ej of Object.values(D.EJEMPLOS)) {
    const e = N.entradaDesdeEjemplo(ej);
    const lista = new Set(D.BIBLIOTECA[e.modelo].niveles[e.nivel].intervenciones.map((i) => i.texto));
    for (const k of N.preparar(e, D).plan.puntos) assert.ok(lista.has(k.intervencion_literal), k.intervencion_literal);
  }
});

test('Validación: fechas imposibles, dispensación posterior y días no válidos', () => {
  const base = N.entradaDesdeEjemplo(D.EJEMPLOS['VIH-01']);
  assert.ok(N.preparar({ ...base, fecha_estratificacion: '2026-02-31' }, D).errores.length);
  assert.ok(N.preparar({ ...base, dispensaciones: [{ fecha: '2026-12-01', grupo: 'TAR', dias_suministro: '30' }] }, D).errores.length);
  assert.ok(N.preparar({ ...base, dispensaciones: [{ fecha: '2026-10-01', grupo: 'TAR', dias_suministro: '0' }] }, D).errores.length);
});
