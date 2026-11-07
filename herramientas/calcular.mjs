#!/usr/bin/env node
// Calculadora determinista del preparador de consulta CMO.
// Calcula PDC por grupo terapéutico, estado de la reestratificación y cambios de tratamiento.
// NO usa IA. Mismo resultado en cada ejecución (la fecha de referencia es la de la consulta, nunca "hoy").
//
// Uso: node herramientas/calcular.mjs <carpeta_paciente> <carpeta_salida>
// Lee:   <carpeta_paciente>/paciente.json, dispensaciones.csv, prescripcion.csv
//        datos/reglas/reglas.json, datos/biblioteca/<modelo>.json
// Escribe: <carpeta_salida>/01_calculo.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , dirPaciente, dirSalida] = process.argv;
if (!dirPaciente || !dirSalida) {
  console.error('Uso: node herramientas/calcular.mjs <carpeta_paciente> <carpeta_salida>');
  process.exit(1);
}

const leerJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const leerCSV = (f) => {
  const [cab, ...filas] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
  const cols = cab.split(';');
  return filas.filter(Boolean).map((l) => Object.fromEntries(l.split(';').map((v, i) => [cols[i], v.trim()])));
};
// Fechas en UTC para evitar desfases por zona horaria.
const fecha = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const DIA = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const sumarMeses = (s, n) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1 + n, d); };

const paciente = leerJSON(path.join(dirPaciente, 'paciente.json'));
const disp = leerCSV(path.join(dirPaciente, 'dispensaciones.csv'));
const presc = leerCSV(path.join(dirPaciente, 'prescripcion.csv'));
const reglas = leerJSON(path.join(RAIZ, 'datos/reglas/reglas.json'));
const modelo = paciente.modelo_cmo;
const biblioteca = leerJSON(path.join(RAIZ, `datos/biblioteca/${modelo}.json`));
const nivel = String(paciente.ultima_estratificacion.nivel);
const tConsulta = fecha(paciente.fecha_consulta);

// ---------- 1. Adherencia: PDC por grupo terapéutico ----------
const { umbral, ventana_dias } = reglas.adherencia;
const finVentana = tConsulta - DIA; // último día antes de la consulta
const inicioVentana = tConsulta - ventana_dias * DIA;
const grupos = [...new Set(disp.map((d) => d.grupo))];
const adherencia = grupos.map((g) => {
  const ds = disp.filter((d) => d.grupo === g).sort((a, b) => fecha(a.fecha) - fecha(b.fecha));
  const cubiertos = new Set();
  let siguienteLibre = -Infinity;
  for (const d of ds) {
    // Si la nueva dispensación llega antes de agotar la anterior, el sobrante se acumula (arrastre).
    const inicio = Math.max(fecha(d.fecha), siguienteLibre);
    for (let i = 0; i < Number(d.dias_suministro); i++) cubiertos.add(inicio + i * DIA);
    siguienteLibre = inicio + Number(d.dias_suministro) * DIA;
  }
  // Si el grupo empezó dentro de la ventana, la ventana empieza en la primera dispensación.
  const inicioReal = Math.max(inicioVentana, fecha(ds[0].fecha));
  let dentro = 0, total = 0;
  for (let t = inicioReal; t <= finVentana; t += DIA) { total++; if (cubiertos.has(t)) dentro++; }
  const pdc = total ? Math.round((dentro / total) * 1000) / 1000 : null;
  return {
    grupo: g,
    medicamentos: [...new Set(ds.map((d) => d.medicamento))],
    ventana: { inicio: iso(inicioReal), fin: iso(finVentana) },
    dias_cubiertos: dentro,
    dias_ventana: total,
    pdc,
    pdc_porcentaje: pdc === null ? null : `${(pdc * 100).toFixed(1).replace('.', ',')} %`,
    por_debajo_del_umbral: pdc !== null && pdc < umbral,
  };
});

// ---------- 2. Reestratificación ordinaria según el modelo ----------
const reglaPer = (reglas.periodicidad[modelo] || {})[nivel] || null;
const fEstr = paciente.ultima_estratificacion.fecha;
const diasDesde = Math.round((tConsulta - fecha(fEstr)) / DIA);
let estado = 'sin_plazo_calculable', fechaLimite = null, fechaInicioIntervalo = null;
if (reglaPer && reglaPer.plazo_max_meses) {
  fechaLimite = sumarMeses(fEstr, reglaPer.plazo_max_meses);
  fechaInicioIntervalo = reglaPer.plazo_min_meses ? sumarMeses(fEstr, reglaPer.plazo_min_meses) : null;
  if (tConsulta > fechaLimite) estado = 'vencida';
  else if (fechaInicioIntervalo && tConsulta >= fechaInicioIntervalo) estado = 'en_intervalo_de_valoracion';
  else estado = 'en_plazo';
}
const nivelBib = biblioteca.niveles ? biblioteca.niveles[nivel] : null;

// ---------- 3. Cambios de tratamiento desde la última estratificación ----------
const cambios = presc.flatMap((p) => {
  const c = [];
  if (p.fecha_inicio && fecha(p.fecha_inicio) > fecha(fEstr) && fecha(p.fecha_inicio) <= tConsulta)
    c.push({ tipo: 'inicio', medicamento: p.medicamento, grupo: p.grupo, fecha: p.fecha_inicio, ambito: p.ambito });
  if (p.fecha_fin && fecha(p.fecha_fin) > fecha(fEstr) && fecha(p.fecha_fin) <= tConsulta)
    c.push({ tipo: 'fin', medicamento: p.medicamento, grupo: p.grupo, fecha: p.fecha_fin, ambito: p.ambito });
  return c;
}).sort((a, b) => fecha(a.fecha) - fecha(b.fecha));

const salida = {
  generado_por: `herramientas/calcular.mjs v${VERSION}`,
  paciente: paciente.id,
  fecha_consulta: paciente.fecha_consulta,
  adherencia: { indicador: reglas.adherencia.indicador, umbral, ventana_dias, grupos: adherencia },
  reestratificacion: {
    herramienta: biblioteca.herramienta,
    url_herramienta: biblioteca.url,
    ultima_fecha: fEstr,
    nivel,
    dias_desde_ultima: diasDesde,
    periodicidad_texto_literal: nivelBib ? nivelBib.periodicidad : null,
    reestratificar_ademas_texto_literal: biblioteca.reestratificar_ademas || null,
    interpretacion_usada: reglaPer,
    fecha_inicio_intervalo: fechaInicioIntervalo ? iso(fechaInicioIntervalo) : null,
    fecha_limite: fechaLimite ? iso(fechaLimite) : null,
    estado,
  },
  cambios_tratamiento: {
    desde: fEstr,
    lista: cambios,
    el_modelo_pide_reestratificar_ante_cambios: reglaPer ? !!reglaPer.reestratificar_si_cambio : null,
  },
};

fs.mkdirSync(dirSalida, { recursive: true });
fs.writeFileSync(path.join(dirSalida, '01_calculo.json'), JSON.stringify(salida, null, 2));
console.log(`01_calculo.json escrito en ${dirSalida}`);
for (const a of adherencia) console.log(`  PDC ${a.grupo}: ${a.pdc_porcentaje} (${a.dias_cubiertos}/${a.dias_ventana} días)${a.por_debajo_del_umbral ? '  < umbral' : ''}`);
console.log(`  Reestratificación: ${estado}${fechaLimite ? ` (límite ${iso(fechaLimite)})` : ''}`);
console.log(`  Cambios de tratamiento desde ${fEstr}: ${cambios.length}`);
