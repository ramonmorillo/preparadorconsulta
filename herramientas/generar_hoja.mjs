#!/usr/bin/env node
// Genera la hoja de consulta HTML a partir de los archivos de trabajo de un paciente.
// Las cifras (PDC, fechas, nivel) se toman SIEMPRE de 01_calculo.json, nunca del texto de un agente.
// Antes de generar, comprueba mecánicamente:
//   - que cada punto clave cita una intervención que existe LITERALMENTE en el nivel del paciente;
//   - que cada punto clave está vinculado a una alerta existente.
// Si algo falla, no genera la hoja y explica por qué.
//
// Uso: node herramientas/generar_hoja.mjs <carpeta_paciente> <carpeta_trabajo>
// Lee: paciente.json, <trabajo>/00_perfil.json, 01_calculo.json, 02_alertas.json, 03_plan.json
// Escribe: <trabajo>/Hoja_consulta_<id>.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , dirPaciente, dirTrabajo] = process.argv;
if (!dirPaciente || !dirTrabajo) {
  console.error('Uso: node herramientas/generar_hoja.mjs <carpeta_paciente> <carpeta_trabajo>');
  process.exit(1);
}
const leer = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.error(`ERROR: no se puede leer ${f}: ${e.message}`); process.exit(1); }
};

const paciente = leer(path.join(dirPaciente, 'paciente.json'));
const perfil = leer(path.join(dirTrabajo, '00_perfil.json'));
const calculo = leer(path.join(dirTrabajo, '01_calculo.json'));
const alertas = leer(path.join(dirTrabajo, '02_alertas.json'));
const plan = leer(path.join(dirTrabajo, '03_plan.json'));
const bib = leer(path.join(RAIZ, `datos/biblioteca/${paciente.modelo_cmo}.json`));
const nivel = String(paciente.ultima_estratificacion.nivel);
const intervNivel = bib.niveles && bib.niveles[nivel] ? bib.niveles[nivel].intervenciones : (bib.catalogo_completo || []).map((c) => ({ categoria: c.category || null, texto: c.text || c.label }));

// ---------- Comprobaciones duras ----------
const errores = [];
const textos = new Set(intervNivel.map((i) => i.texto));
const idsAlerta = new Set((alertas.alertas || []).map((a) => a.id));
for (const k of plan.puntos_clave || []) {
  if (!textos.has(k.intervencion_literal)) errores.push(`${k.id}: la intervención no existe literalmente en el nivel ${nivel} de ${bib.herramienta}: «${k.intervencion_literal}»`);
  if (!idsAlerta.has(k.alerta_id)) errores.push(`${k.id}: está vinculado a la alerta ${k.alerta_id}, que no existe en 02_alertas.json`);
}
if (errores.length) {
  console.error('NO SE GENERA LA HOJA. Errores:\n- ' + errores.join('\n- '));
  process.exit(2);
}

const r = calculo.reestratificacion;
const datos = {
  generado_por: `herramientas/generar_hoja.mjs v${VERSION} (cifras de ${calculo.generado_por})`,
  paciente: { id: paciente.id, ficticio: !!paciente.ficticio, edad: paciente.edad, sexo: paciente.sexo, patologia: paciente.patologia, fecha_consulta: paciente.fecha_consulta },
  estratificacion: { herramienta: r.herramienta, url: r.url_herramienta, nivel: r.nivel, ultima_fecha: r.ultima_fecha, estado: r.estado, fecha_limite: r.fecha_limite, periodicidad_texto: r.periodicidad_texto_literal },
  umbral_pdc_texto: `${Math.round(calculo.adherencia.umbral * 100)} %`,
  ventana_pdc_texto: `${calculo.adherencia.ventana_dias} días`,
  adherencia: calculo.adherencia.grupos.map((g) => ({ grupo: g.grupo, pdc_porcentaje: g.pdc_porcentaje, dias_cubiertos: g.dias_cubiertos, dias_ventana: g.dias_ventana, ventana_inicio: g.ventana.inicio, ventana_fin: g.ventana.fin, por_debajo_del_umbral: g.por_debajo_del_umbral })),
  perfil: perfil.items || [],
  alertas: alertas.alertas || [],
  puntos_clave: plan.puntos_clave || [],
  intervenciones_nivel: intervNivel,
};

const plantilla = fs.readFileSync(path.join(RAIZ, 'plantilla/hoja_consulta.html'), 'utf8');
const json = JSON.stringify(datos).replace(/</g, '\\u003c'); // evita cerrar el <script> por accidente
if (!plantilla.includes('/*DATOS_CONSULTA*/')) { console.error('ERROR: la plantilla no tiene el marcador /*DATOS_CONSULTA*/'); process.exit(1); }
const salida = path.join(dirTrabajo, `Hoja_consulta_${paciente.id}.html`);
fs.writeFileSync(salida, plantilla.replace('/*DATOS_CONSULTA*/', () => json));
console.log(`Hoja generada: ${salida}`);
console.log(`  ${datos.alertas.length} alertas · ${datos.puntos_clave.length} puntos clave · ${intervNivel.length} intervenciones del nivel ${nivel}`);
