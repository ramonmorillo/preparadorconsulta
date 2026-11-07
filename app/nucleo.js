// Núcleo del Preparador de consulta CMO (versión web, gratuita y local).
// Cinco módulos de reglas, deterministas y auditables, sin IA generativa:
//   lector → calculadora → detector → planificador → auditor.
// Nada se envía ni se guarda: todo se calcula en el navegador.
// El mismo archivo se usa en el navegador y en las pruebas con Node.

export const VERSION = '1.0.0';
const DIA = 86400000;

// ---------- Utilidades ----------
export const fechaUTC = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null; // rechaza 31/02
};
export const iso = (t) => new Date(t).toISOString().slice(0, 10);
const sumarMeses = (s, n) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1 + n, d); };
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/** Lee CSV separado por «;» con cabecera. Acepta también fechas dd/mm/aaaa. */
export function leerCSV(texto) {
  const lineas = String(texto || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return [];
  const cols = lineas[0].split(';').map((c) => c.trim().toLowerCase());
  return lineas.slice(1).map((l) => {
    const v = l.split(';').map((x) => x.trim());
    const o = Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
    for (const k of Object.keys(o)) {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(o[k]);
      if (m) o[k] = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return o;
  });
}

// ---------- Validación de la entrada ----------
export function validar(e, BIBLIOTECA) {
  const errores = [];
  if (!BIBLIOTECA[e.modelo]) errores.push('Elija el modelo CMO de la patología.');
  if (!['1', '2', '3'].includes(String(e.nivel))) errores.push('Indique el nivel CMO (1, 2 o 3) asignado con la herramienta del hub.');
  const tC = fechaUTC(e.fecha_consulta), tE = fechaUTC(e.fecha_estratificacion);
  if (!tC) errores.push(e.fecha_consulta ? 'La fecha de la consulta no es válida.' : 'Indique la fecha de la consulta.');
  if (!tE) errores.push(e.fecha_estratificacion ? 'La fecha de la última estratificación no es válida.' : 'Indique la fecha de la última estratificación.');
  if (tC && tE && tE > tC) errores.push('La última estratificación no puede ser posterior a la consulta.');
  (e.dispensaciones || []).forEach((d, i) => {
    if (!fechaUTC(d.fecha)) errores.push(`Dispensación ${i + 1}: fecha no válida.`);
    else if (tC && fechaUTC(d.fecha) >= tC) errores.push(`Dispensación ${i + 1}: la fecha debe ser anterior a la consulta.`);
    const n = Number(d.dias_suministro);
    if (!Number.isInteger(n) || n <= 0 || n > 400) errores.push(`Dispensación ${i + 1}: los días de suministro deben ser un número entero entre 1 y 400.`);
    if (!String(d.grupo || '').trim()) errores.push(`Dispensación ${i + 1}: falta el grupo terapéutico.`);
  });
  (e.prescripcion || []).forEach((p, i) => {
    if (p.fecha_inicio && !fechaUTC(p.fecha_inicio)) errores.push(`Tratamiento ${i + 1}: fecha de inicio no válida.`);
    if (p.fecha_fin && !fechaUTC(p.fecha_fin)) errores.push(`Tratamiento ${i + 1}: fecha de fin no válida.`);
  });
  return errores;
}

// ---------- 1. Lector: señales en la nota, con cita literal ----------
const SENALES = [
  { tipo: 'adherencia', titulo: 'Posible problema de adherencia referido', re: /olvid|deja(do|r)? de tomar|no (se )?(lo |la |los |las )?toma|salt(a|ó|ado|arse) (alguna |la |una )?dosis|mala adherencia|falta de adherencia|baja adherencia|incumpl|dificultad(es)? (para|con) (tomar|la toma|las tomas|la dosis|el tratamiento)|no recog/i },
  { tipo: 'efectos_adversos', titulo: 'Posible efecto adverso referido', re: /n[áa]usea|v[óo]mito|diarrea|mareo|cefalea|erupci[óo]n|exantema|prurito|picor|astenia|cansancio|insomnio|efectos? adversos?|reacci[óo]n(es)? adversa|intoleranci|mala tolerancia/i },
  { tipo: 'control', titulo: 'Posible mal control de la enfermedad', re: /persist(e|en|encia)|mal control|no controlad|empeora|exacerbaci|crisis|ingres(o|ó)|urgencias|rebrote|brote/i },
];
const NEGACION = /\b(sin|niega|no refiere|no presenta|no ha presentado|ausencia de|no precisa|no ha precisado|nunca)\b/i;
const RESUELTO = /resuelt|desaparec|ya no|remiti|mejor[íi]a completa/i;

/** Divide la nota en frases conservando el texto literal y la fecha del apartado («## 2026-03-10 · …»). */
export function frasesDeNota(nota) {
  const frases = [];
  let fecha = null;
  for (const linea of String(nota || '').replace(/\r/g, '').split('\n')) {
    const h = /^#{1,6}\s*(\d{4}-\d{2}-\d{2})/.exec(linea);
    if (h) { fecha = h[1]; continue; }
    if (/^#/.test(linea) || !linea.trim()) continue;
    for (const f of linea.match(/[^.!?]+[.!?]?/g) || []) {
      const t = f.trim();
      if (t.length > 2) frases.push({ texto: t, fecha });
    }
  }
  return frases;
}

export function lector(e) {
  const perfil = [];
  const B = (dato, cita, fuente) => perfil.push({ dato, cita, fuente });
  if (e.patologia) B(`Patología: ${e.patologia}`, null, 'formulario');
  if (e.edad) B(`Edad: ${e.edad} años${e.sexo ? ` · ${e.sexo}` : ''}`, null, 'formulario');
  const tC = fechaUTC(e.fecha_consulta);
  for (const p of e.prescripcion || []) {
    const activo = !p.fecha_fin || (fechaUTC(p.fecha_fin) && fechaUTC(p.fecha_fin) >= tC);
    if (activo && p.medicamento) B(`Tratamiento activo: ${p.medicamento}${p.pauta ? `, ${p.pauta}` : ''}${p.ambito ? ` (${p.ambito})` : ''}`, null, 'tratamiento');
  }
  const senales = [];
  for (const f of frasesDeNota(e.notas)) {
    for (const s of SENALES) {
      const m = s.re.exec(f.texto);
      if (!m) continue;
      const antes = f.texto.slice(0, m.index);
      const negada = NEGACION.test(antes.slice(-40));
      if (negada) continue; // «sin náuseas», «niega olvidos»: no es señal
      const resuelta = RESUELTO.test(f.texto);
      senales.push({ tipo: s.tipo, titulo: s.titulo, resuelta, cita: f.texto, fecha: f.fecha, termino: m[0] });
      B(`${s.titulo}${f.fecha ? ` (nota del ${f.fecha})` : ''}${resuelta ? ' — la nota lo da por resuelto' : ''}`, f.texto, 'nota');
    }
  }
  return { perfil, senales };
}

// ---------- 2. Calculadora: PDC, reestratificación y cambios (idéntica a herramientas/calcular.mjs) ----------
export function calculadora(e, REGLAS, BIBLIOTECA) {
  const tConsulta = fechaUTC(e.fecha_consulta);
  const { umbral, ventana_dias } = REGLAS.adherencia;
  const finVentana = tConsulta - DIA;
  const inicioVentana = tConsulta - ventana_dias * DIA;
  const disp = e.dispensaciones || [];
  const grupos = [...new Set(disp.map((d) => d.grupo.trim()))];
  const adherencia = grupos.map((g) => {
    const ds = disp.filter((d) => d.grupo.trim() === g).sort((a, b) => fechaUTC(a.fecha) - fechaUTC(b.fecha));
    const cubiertos = new Set();
    let siguienteLibre = -Infinity;
    for (const d of ds) {
      const inicio = Math.max(fechaUTC(d.fecha), siguienteLibre); // arrastre del sobrante
      const n = Number(d.dias_suministro);
      for (let i = 0; i < n; i++) cubiertos.add(inicio + i * DIA);
      siguienteLibre = inicio + n * DIA;
    }
    const inicioReal = Math.max(inicioVentana, fechaUTC(ds[0].fecha));
    let dentro = 0, total = 0;
    for (let t = inicioReal; t <= finVentana; t += DIA) { total++; if (cubiertos.has(t)) dentro++; }
    const pdc = total ? Math.round((dentro / total) * 1000) / 1000 : null;
    return { grupo: g, medicamentos: [...new Set(ds.map((d) => d.medicamento).filter(Boolean))], ventana: { inicio: iso(inicioReal), fin: iso(finVentana) }, dias_cubiertos: dentro, dias_ventana: total, pdc, pdc_porcentaje: pdc === null ? null : pct(pdc), por_debajo_del_umbral: pdc !== null && pdc < umbral, ultimo_dia_cubierto: iso(siguienteLibre - DIA) };
  });

  const nivel = String(e.nivel);
  const bib = BIBLIOTECA[e.modelo];
  const regla = ((REGLAS.periodicidad[e.modelo] || {})[nivel]) || null;
  const fEstr = e.fecha_estratificacion;
  let estado = 'sin_plazo_calculable', fechaLimite = null, fechaInicioIntervalo = null;
  if (regla && regla.plazo_max_meses) {
    fechaLimite = sumarMeses(fEstr, regla.plazo_max_meses);
    fechaInicioIntervalo = regla.plazo_min_meses ? sumarMeses(fEstr, regla.plazo_min_meses) : null;
    if (tConsulta > fechaLimite) estado = 'vencida';
    else if (fechaInicioIntervalo && tConsulta >= fechaInicioIntervalo) estado = 'en_intervalo_de_valoracion';
    else estado = 'en_plazo';
  }
  const cambios = (e.prescripcion || []).flatMap((p) => {
    const c = [];
    const ti = fechaUTC(p.fecha_inicio), tf = fechaUTC(p.fecha_fin), te = fechaUTC(fEstr);
    if (ti && ti > te && ti <= tConsulta) c.push({ tipo: 'inicio', medicamento: p.medicamento, fecha: p.fecha_inicio, ambito: p.ambito });
    if (tf && tf > te && tf <= tConsulta) c.push({ tipo: 'fin', medicamento: p.medicamento, fecha: p.fecha_fin, ambito: p.ambito });
    return c;
  }).sort((a, b) => fechaUTC(a.fecha) - fechaUTC(b.fecha));

  return {
    adherencia: { indicador: REGLAS.adherencia.indicador, umbral, ventana_dias, grupos: adherencia },
    reestratificacion: {
      herramienta: bib.herramienta, url: bib.url, ultima_fecha: fEstr, nivel,
      dias_desde_ultima: Math.round((tConsulta - fechaUTC(fEstr)) / DIA),
      periodicidad_texto: bib.niveles[nivel].periodicidad || (bib.periodicidad_complementaria || {})[nivel] || null, reestratificar_ademas: bib.reestratificar_ademas,
      interpretacion: regla, fecha_inicio_intervalo: fechaInicioIntervalo ? iso(fechaInicioIntervalo) : null,
      fecha_limite: fechaLimite ? iso(fechaLimite) : null, estado,
    },
    cambios: { desde: fEstr, lista: cambios, modelo_pide_reestratificar: regla ? !!regla.reestratificar_si_cambio : false },
    suministro: [...(e.dispensaciones || []), ...(e.prescripcion || [])].filter((x) => x.cima && x.cima.psum).map((x) => ({ medicamento: x.cima.nombre, consultado: x.cima.consultado }))
      .filter((x, i, a) => a.findIndex((y) => y.medicamento === x.medicamento) === i),
  };
}

// ---------- 3. Detector: reglas de alerta explícitas ----------
export function detector(calc, lec) {
  const alertas = [];
  const add = (a) => alertas.push({ id: `A${alertas.length + 1}`, ...a });
  for (const g of calc.adherencia.grupos) {
    if (g.por_debajo_del_umbral) add({ tipo: 'accion', regla: 'pdc_bajo_umbral', clase: 'adherencia', titulo: `Adherencia (${g.grupo}) por debajo del ${Math.round(calc.adherencia.umbral * 100)} %`, detalle: `PDC ${g.pdc_porcentaje} (${g.dias_cubiertos}/${g.dias_ventana} días) entre ${g.ventana.inicio} y ${g.ventana.fin}.` });
  }
  const r = calc.reestratificacion;
  if (r.estado === 'vencida') add({ tipo: 'accion', regla: 'reestratificacion', clase: 'reestratificacion', titulo: 'Reestratificación vencida', detalle: `Última estratificación ${r.ultima_fecha} (nivel ${r.nivel}); fecha límite ${r.fecha_limite}.` });
  else if (r.estado === 'en_intervalo_de_valoracion') add({ tipo: 'accion', regla: 'reestratificacion', clase: 'reestratificacion', titulo: 'Dentro del intervalo de reestratificación', detalle: `Última estratificación ${r.ultima_fecha}; intervalo desde ${r.fecha_inicio_intervalo} hasta ${r.fecha_limite}.` });
  const cambios = calc.cambios.lista;
  if (cambios.length && calc.cambios.modelo_pide_reestratificar && r.estado !== 'vencida') add({ tipo: 'accion', regla: 'reestratificacion', clase: 'reestratificacion', titulo: 'Reestratificar por cambio de tratamiento', detalle: `El modelo ${r.herramienta} recomienda reestratificar ante cambios de tratamiento.` });
  if (cambios.length) add({ tipo: 'informativa', regla: 'cambio_tratamiento', clase: 'cambio', titulo: 'Cambios de tratamiento desde la última estratificación', detalle: cambios.map((c) => `${c.tipo === 'inicio' ? 'Inicio' : 'Fin'} de ${c.medicamento} el ${c.fecha}${c.ambito ? ` (${c.ambito})` : ''}`).join('; ') + '.' });
  for (const p of calc.suministro || []) add({ tipo: 'accion', regla: 'problema_suministro', clase: 'suministro', titulo: `Problema de suministro en CIMA: ${p.medicamento}`, detalle: `CIMA indica problemas de suministro para ${p.medicamento} (consultado el ${p.consultado}). Compruebe la disponibilidad antes de la dispensación.` });
  if (!calc.adherencia.grupos.length) add({ tipo: 'informativa', regla: 'sin_dispensaciones', clase: 'sin_datos', titulo: 'Adherencia no calculada', detalle: 'No se han introducido dispensaciones.' });
  const tE = fechaUTC(r.ultima_fecha);
  for (const s of lec.senales) {
    // Lo anotado en la visita de la última estratificación (o antes) ya se valoró al estratificar: es antecedente.
    const antecedente = s.fecha && fechaUTC(s.fecha) && fechaUTC(s.fecha) <= tE;
    const info = s.resuelta || antecedente;
    const motivo = s.resuelta ? ' (resuelto según la nota)' : antecedente ? ' (antecedente: anterior o igual a la última estratificación)' : '';
    add({ tipo: info ? 'informativa' : 'accion', regla: 'senal_nota', clase: s.tipo, titulo: s.titulo + motivo, detalle: `Detectado en la nota${s.fecha ? ` del ${s.fecha}` : ''} por la expresión «${s.termino}». Confírmelo con el paciente.`, cita: s.cita });
  }
  return alertas;
}

// ---------- 4. Planificador: intervenciones literales del nivel, por reglas ----------
const MAPA = {
  adherencia: /adherencia/i,
  reestratificacion: /estratific|reevalu|revalora|valoración multidimensional/i,
  efectos_adversos: /reacci(o|ó)n(es)? adversa|seguridad|tolerab|efectos adversos|toxicidad/i,
  control: /objetivo|efectividad|eficacia/i,
};
// Para «control» no valen las intervenciones que en realidad son de adherencia.
const EXCLUIR = { control: /adherencia/i };
const esCoordinacion = (i) => /coordinaci/i.test(i.categoria || '');
export function planificador(alertas, modelo, nivel, BIBLIOTECA, maxPuntos = 6) {
  const lista = BIBLIOTECA[modelo].niveles[String(nivel)].intervenciones;
  const usados = new Set();
  const puntos = [];
  const sinPunto = [];
  // Orden de prioridad: reestratificación, adherencia, resto.
  const orden = [...alertas.filter((a) => a.tipo === 'accion')].sort((a, b) => rango(a) - rango(b));
  for (const a of orden) {
    const re = MAPA[a.clase];
    if (!re) { sinPunto.push({ id: a.id, motivo: 'sin_regla' }); continue; }
    // Si otra alerta de la misma clase ya tiene puntos, esta queda cubierta por ellos.
    const yaCubierta = puntos.filter((k) => alertas.find((x) => x.id === k.alerta_id)?.clase === a.clase);
    if (yaCubierta.length) { sinPunto.push({ id: a.id, motivo: 'cubierta', por: yaCubierta.map((k) => k.id) }); continue; }
    const candidatas = lista
      .filter((i) => re.test(i.texto) && !(EXCLUIR[a.clase] && EXCLUIR[a.clase].test(i.texto)) && !usados.has(i.texto))
      .sort((x, y) => esCoordinacion(x) - esCoordinacion(y)); // coordinación, al final
    if (!candidatas.length) { sinPunto.push({ id: a.id, motivo: 'sin_intervencion' }); continue; }
    for (const i of candidatas.slice(0, a.clase === 'reestratificacion' ? 1 : 2)) {
      if (puntos.length >= maxPuntos) break;
      usados.add(i.texto);
      puntos.push({ id: `K${puntos.length + 1}`, alerta_id: a.id, categoria: i.categoria, intervencion_literal: i.texto, origen: 'automatico' });
    }
  }
  return { puntos, sinPunto };
}
const rango = (a) => (a.clase === 'reestratificacion' ? 0 : a.clase === 'adherencia' ? 1 : 2);

// ---------- 5. Auditor: comprobaciones mecánicas ----------
export function auditor(entrada, lec, calc, alertas, plan, BIBLIOTECA) {
  const lista = new Set(BIBLIOTECA[entrada.modelo].niveles[String(entrada.nivel)].intervenciones.map((i) => i.texto));
  const ids = new Set(alertas.map((a) => a.id));
  const nota = String(entrada.notas || '');
  const c = [];
  const ok = (texto, bien, detalle) => c.push({ texto, bien, detalle: detalle || '' });
  const noLit = plan.puntos.filter((k) => !lista.has(k.intervencion_literal));
  ok('Cada punto clave usa una intervención literal del nivel del paciente', !noLit.length, noLit.map((k) => k.id).join(', '));
  const huerf = plan.puntos.filter((k) => k.origen === 'automatico' && !ids.has(k.alerta_id));
  ok('Cada punto clave automático está vinculado a una alerta', !huerf.length, huerf.map((k) => k.id).join(', '));
  const citas = [...lec.perfil.filter((p) => p.cita), ...alertas.filter((a) => a.cita)];
  const malas = citas.filter((x) => !nota.includes(x.cita));
  ok(`Las ${citas.length} citas de la nota aparecen literalmente en ella`, !malas.length, malas.map((x) => x.cita.slice(0, 40)).join(' | '));
  const cifras = alertas.filter((a) => a.regla === 'pdc_bajo_umbral').every((a) => calc.adherencia.grupos.some((g) => a.detalle.includes(g.pdc_porcentaje)));
  ok('Las cifras de adherencia de las alertas coinciden con el cálculo', cifras);
  ok('El nivel CMO no se ha modificado (lo asigna la herramienta del hub)', String(calc.reestratificacion.nivel) === String(entrada.nivel));
  for (const x of plan.sinPunto) {
    if (x.motivo === 'cubierta') ok(`${x.id}: cubierta por ${x.por.join(', ')}`, true);
    else ok(`${x.id}: ninguna intervención del nivel encaja automáticamente; elija una de la lista si procede`, true);
  }
  return { comprobaciones: c, aprobada: c.every((x) => x.bien) };
}

// ---------- Cadena completa ----------
export function preparar(entrada, { BIBLIOTECA, REGLAS }) {
  const errores = validar(entrada, BIBLIOTECA);
  if (errores.length) return { errores };
  const lec = lector(entrada);
  const calc = calculadora(entrada, REGLAS, BIBLIOTECA);
  const alertas = detector(calc, lec);
  const plan = planificador(alertas, entrada.modelo, entrada.nivel, BIBLIOTECA);
  const auditoria = auditor(entrada, lec, calc, alertas, plan, BIBLIOTECA);
  return { errores: [], lector: lec, calculo: calc, alertas, plan, auditoria, version: VERSION };
}

/** Convierte un ejemplo (archivos de datos/pacientes) en la entrada del formulario. */
export function entradaDesdeEjemplo(ej) {
  const p = ej.paciente;
  return {
    modelo: p.modelo_cmo, nivel: String(p.ultima_estratificacion.nivel), fecha_estratificacion: p.ultima_estratificacion.fecha,
    fecha_consulta: p.fecha_consulta, patologia: p.patologia, edad: p.edad, sexo: p.sexo,
    dispensaciones: leerCSV(ej.dispensaciones).map((d) => ({ fecha: d.fecha, grupo: d.grupo, medicamento: d.medicamento, dias_suministro: d.dias_suministro })),
    prescripcion: leerCSV(ej.prescripcion).map((r) => ({ medicamento: r.medicamento, pauta: r.pauta, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, ambito: r.ambito })),
    notas: ej.notas,
  };
}


// ---------- Durante la consulta: guion de entrevista motivacional ----------
/** Construye el guion a partir de la guía de la adaptación CMO publicada del modelo y de las alertas de acción. */
export function guion(alertas, modelo, GUIAS) {
  const g = GUIAS[modelo];
  if (!g) return { disponible: false };
  const clases = [...new Set(alertas.filter((a) => a.tipo === 'accion').map((a) => a.clase))];
  if (!clases.length) clases.push('mantenimiento');
  const NOMBRES = { adherencia: 'Adherencia', efectos_adversos: 'Efectos adversos o miedo al tratamiento', control: 'Control de la enfermedad', reestratificacion: 'Reestratificación', suministro: 'Suministro', mantenimiento: 'Paciente sin alertas: mantener lo conseguido' };
  const usadas = new Set(); // cada bloque de preguntas aparece una sola vez, en el primer foco que lo usa
  const focos = clases.map((c) => {
    const preguntas = (g.preguntas || []).filter((q) => (q.para || []).includes(c) && !usadas.has(q.ancla));
    preguntas.forEach((q) => usadas.add(q.ancla));
    return { clase: c, nombre: NOMBRES[c] || c, preguntas, estrategias: ((g.por_problema || {})[c]) || [] };
  }).filter((f) => f.preguntas.length || f.estrategias.length);
  return {
    disponible: true, documento: g.documento, estructura: g.estructura, tecnicas: g.tecnicas || [], errores: g.errores || [],
    resistencias: g.resistencias || [], objetivos: g.objetivos || null, escalas: g.escalas || [], estadios: g.estadios || [], focos,
  };
}

// ---------- Después de la consulta: plan hasta la próxima ----------
const SEGUIMIENTO_ENTRE_VISITAS = /telefarmacia|teleasistencia|entre visitas|telem[áa]tic|contacto adicional|contactos intermedios/i;
/**
 * registro: { reestratificado: bool, nuevo_nivel, estados: [{texto, estado, comentario}], objetivos: [{objetivo, plan, plazo}], barreras, estadio }
 */
export function planPosterior(entrada, res, registro, { BIBLIOTECA, REGLAS }) {
  const nivelFinal = registro.reestratificado && ['1', '2', '3'].includes(String(registro.nuevo_nivel)) ? String(registro.nuevo_nivel) : String(entrada.nivel);
  const base = registro.reestratificado ? entrada.fecha_consulta : entrada.fecha_estratificacion;
  const regla = ((REGLAS.periodicidad[entrada.modelo] || {})[nivelFinal]) || null;
  const bib = BIBLIOTECA[entrada.modelo];
  const proxima = regla && regla.plazo_max_meses ? iso(sumarMeses(base, regla.plazo_max_meses)) : null;
  const periodicidad = bib.niveles[nivelFinal].periodicidad || (bib.periodicidad_complementaria || {})[nivelFinal] || null;
  const cobertura = res.calculo.adherencia.grupos.map((g) => ({ grupo: g.grupo, ultimo_dia_cubierto: g.ultimo_dia_cubierto }));
  const entreVisitas = bib.niveles[nivelFinal].intervenciones.filter((i) => SEGUIMIENTO_ENTRE_VISITAS.test(i.texto));
  const estados = registro.estados || [];
  return {
    nivel_final: nivelFinal, cambio_de_nivel: nivelFinal !== String(entrada.nivel),
    proxima_reestratificacion: proxima, base_calculo: base, periodicidad_texto: periodicidad,
    cobertura,
    seguimiento_entre_visitas: entreVisitas,
    pendientes: estados.filter((x) => x.estado === 'no_realizado' || !x.estado),
    realizados: estados.filter((x) => x.estado === 'realizado'),
    objetivos: (registro.objetivos || []).filter((o) => o.objetivo && o.objetivo.trim()),
  };
}

// ---------- Archivo de seguimiento (sin servidor) ----------
export const FORMATO_SEGUIMIENTO = 'preparador-consulta-cmo/seguimiento@1';
export function crearSeguimiento(entrada, plan, registro) {
  return {
    formato: FORMATO_SEGUIMIENTO, version_herramienta: VERSION, guardado: entrada.fecha_consulta,
    aviso: 'Archivo de trabajo sin datos identificativos. Guárdelo según la política de su centro.',
    entrada: { ...entrada, notas: entrada.notas || '' },
    nivel_final: plan.nivel_final, fecha_estratificacion_final: plan.cambio_de_nivel || registro.reestratificado ? entrada.fecha_consulta : entrada.fecha_estratificacion,
    registro: { estadio: registro.estadio || '', barreras: registro.barreras || '', estados: registro.estados || [], objetivos: plan.objetivos },
    proxima_reestratificacion: plan.proxima_reestratificacion,
  };
}
export function leerSeguimiento(texto) {
  let o;
  try { o = JSON.parse(texto); } catch { return { error: 'El archivo no es un seguimiento válido.' }; }
  if (!o || o.formato !== FORMATO_SEGUIMIENTO) return { error: 'El archivo no es un seguimiento del Preparador de consulta CMO.' };
  return { seguimiento: o };
}
/** Prepara la entrada de la nueva consulta a partir del seguimiento anterior. */
export function entradaDesdeSeguimiento(seg, fechaConsultaNueva) {
  const e = seg.entrada;
  return {
    ...e, nivel: String(seg.nivel_final), fecha_estratificacion: seg.fecha_estratificacion_final, fecha_consulta: fechaConsultaNueva,
    notas: e.notas || '',
  };
}

// ---------- CIMA: unidades por envase a partir del nombre de la presentación ----------
/** «BIKTARVY …, 30 comprimidos» → 30. Devuelve null si no se puede leer con seguridad. */
export function unidadesPresentacion(nombre) {
  const t = String(nombre || '');
  const i = t.lastIndexOf(',');
  if (i < 0) return null;
  const m = /^\s*(\d+)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i.exec(t.slice(i + 1));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? { unidades: n, forma: m[2].trim() } : null;
}
export function diasSuministro(envases, unidadesEnvase, unidadesDia) {
  const e = Number(envases), u = Number(unidadesEnvase), d = Number(String(unidadesDia).replace(',', '.'));
  if (!(e > 0) || !(u > 0) || !(d > 0)) return null;
  return Math.floor((e * u) / d);
}
