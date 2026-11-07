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

// ---------- v2: guion, plan posterior, seguimiento y CIMA ----------
test('Guion: existe para las 9 adaptaciones con documento y no repite preguntas', () => {
  for (const m of ['vih', 'respiratorio', 'esclerosis-multiple', 'riesgo-cardiovascular', 'vhb-vhd', 'coagulopatias', 'pediatria', 'oncohematologia', 'migrana']) {
    const g = N.guion([{ tipo: 'accion', clase: 'adherencia' }, { tipo: 'accion', clase: 'control' }], m, D.GUIAS);
    assert.ok(g.disponible, m); assert.ok(g.estructura.pasos.length >= 4, m);
    const anclas = g.focos.flatMap((f) => f.preguntas.map((q) => q.ancla));
    assert.equal(new Set(anclas).size, anclas.length, `${m}: preguntas repetidas`);
  }
  assert.equal(N.guion([], 'inmunomediadas', D.GUIAS).disponible, false);
});

test('Plan posterior: reestratificar hoy recalcula la próxima fecha con el nivel nuevo', () => {
  const e = N.entradaDesdeEjemplo(D.EJEMPLOS['RESP-02']);
  const r = N.preparar(e, D);
  const sin = N.planPosterior(e, r, { estados: [], objetivos: [] }, D);
  assert.equal(sin.proxima_reestratificacion, '2027-02-01'); // 2026-08-01 + 6 meses (nivel 1)
  const con = N.planPosterior(e, r, { reestratificado: true, nuevo_nivel: '2', estados: [], objetivos: [] }, D);
  assert.equal(con.nivel_final, '2'); assert.equal(con.proxima_reestratificacion, '2027-11-16'); // consulta + 12 meses
  assert.equal(con.cobertura[0].ultimo_dia_cubierto, '2026-11-23');
});

test('Seguimiento: se guarda y se vuelve a cargar con el nivel y la fecha finales', () => {
  const e = N.entradaDesdeEjemplo(D.EJEMPLOS['VIH-01']);
  const r = N.preparar(e, D);
  const reg = { reestratificado: true, nuevo_nivel: '1', estados: [{ texto: 'x', estado: 'no_realizado' }], objetivos: [{ objetivo: 'o', plan: 'p', plazo: '2026-12-01' }] };
  const plan = N.planPosterior(e, r, reg, D);
  const txt = JSON.stringify(N.crearSeguimiento(e, plan, reg));
  const { seguimiento } = N.leerSeguimiento(txt);
  const e2 = N.entradaDesdeSeguimiento(seguimiento, '2027-01-10');
  assert.equal(e2.nivel, '1'); assert.equal(e2.fecha_estratificacion, '2026-11-16'); assert.equal(e2.fecha_consulta, '2027-01-10');
  assert.ok(N.leerSeguimiento('{"x":1}').error);
});

test('CIMA: unidades por envase y días de suministro', () => {
  assert.equal(N.unidadesPresentacion('BIKTARVY 50 MG/200 MG/25 MG COMPRIMIDOS RECUBIERTOS CON PELICULA, 30 comprimidos').unidades, 30);
  assert.equal(N.unidadesPresentacion('NUCALA 100 MG SOLUCION INYECTABLE EN PLUMA PRECARGADA, 1 pluma precargada de 1 ml').unidades, 1);
  assert.equal(N.unidadesPresentacion('SIN UNIDADES'), null);
  assert.equal(N.diasSuministro(2, 56, 3), 37);
  assert.equal(N.diasSuministro(1, 30, 0), null);
});

test('Problema de suministro marcado en CIMA genera alerta', () => {
  const e = N.entradaDesdeEjemplo(D.EJEMPLOS['VIH-01']);
  e.dispensaciones[0].cima = { nombre: 'BIKTARVY', psum: true, consultado: '2026-11-07' };
  assert.ok(N.preparar(e, D).alertas.some((a) => a.regla === 'problema_suministro'));
});
