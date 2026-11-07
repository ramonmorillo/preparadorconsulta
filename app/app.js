// Interfaz del Preparador de consulta CMO (versión web). Toda la lógica clínica está en nucleo.js.
import { BIBLIOTECA, REGLAS, EJEMPLOS } from './datos.js?v=1.0.0';
import { preparar, entradaDesdeEjemplo, leerCSV, VERSION } from './nucleo.js?v=1.0.0';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

let disp = [];
let presc = [];
let ultimo = null; // último resultado, para el texto de la historia
let manuales = [];

// ---------- Formulario ----------
const selModelo = $('modelo');
selModelo.innerHTML = '<option value="">Elija…</option>' + Object.values(BIBLIOTECA).map((b) => `<option value="${esc(b.id)}">${esc(b.herramienta)}</option>`).join('');
selModelo.addEventListener('change', () => {
  const b = BIBLIOTECA[selModelo.value];
  $('enlaceHerramienta').href = b ? b.url : 'https://ramonmorillo.es/hub-estratificacionCMO/';
  $('enlaceHerramienta').textContent = b ? `Abrir ${b.herramienta} para estratificar ↗` : 'Abrir la herramienta de estratificación ↗';
});
$('fecha_consulta').value = hoyLocal();

function campo(lista, i, clave, etiqueta, tipo = 'text', extra = '') {
  return `<label${extra}>${etiqueta}<input type="${tipo}" data-lista="${lista}" data-i="${i}" data-k="${clave}" value="${esc((lista === 'disp' ? disp : presc)[i][clave] || '')}"${tipo === 'number' ? ' min="1" max="400" inputmode="numeric"' : ''}></label>`;
}
function pintarTablas() {
  const td = $('tablaDisp'); td.className = 'tabla-edit disp';
  td.innerHTML = disp.length ? disp.map((_, i) => `<div class="fila">${campo('disp', i, 'fecha', 'Fecha', 'date')}${campo('disp', i, 'grupo', 'Grupo')}${campo('disp', i, 'medicamento', 'Medicamento (opcional)', 'text', ' class="ancha"')}${campo('disp', i, 'dias_suministro', 'Días', 'number')}<button type="button" class="quitar" data-quitar="disp" data-i="${i}" aria-label="Quitar dispensación ${i + 1}">×</button></div>`).join('') : '<p class="vacia">Sin dispensaciones. Sin ellas no se puede calcular la adherencia.</p>';
  const tp = $('tablaPresc'); tp.className = 'tabla-edit presc';
  tp.innerHTML = presc.length ? presc.map((_, i) => `<div class="fila">${campo('presc', i, 'medicamento', 'Medicamento', 'text', ' class="ancha"')}${campo('presc', i, 'pauta', 'Pauta')}${campo('presc', i, 'fecha_inicio', 'Inicio', 'date')}${campo('presc', i, 'fecha_fin', 'Fin (si se suspendió)', 'date')}${campo('presc', i, 'ambito', 'Ámbito')}<button type="button" class="quitar" data-quitar="presc" data-i="${i}" aria-label="Quitar tratamiento ${i + 1}">×</button></div>`).join('') : '<p class="vacia">Sin tratamientos registrados.</p>';
}
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset && t.dataset.lista) (t.dataset.lista === 'disp' ? disp : presc)[Number(t.dataset.i)][t.dataset.k] = t.value;
});
document.addEventListener('click', (ev) => {
  const q = ev.target.closest('[data-quitar]');
  if (q) { (q.dataset.quitar === 'disp' ? disp : presc).splice(Number(q.dataset.i), 1); pintarTablas(); }
});
$('addDisp').addEventListener('click', () => { const u = disp[disp.length - 1]; disp.push({ fecha: '', grupo: u ? u.grupo : '', medicamento: u ? u.medicamento : '', dias_suministro: u ? u.dias_suministro : '' }); pintarTablas(); });
$('addPresc').addEventListener('click', () => { presc.push({ medicamento: '', pauta: '', fecha_inicio: '', fecha_fin: '', ambito: '' }); pintarTablas(); });
$('cargarCsv').addEventListener('click', () => {
  const filas = leerCSV($('csvDisp').value).map((d) => ({ fecha: d.fecha || '', grupo: d.grupo || '', medicamento: d.medicamento || '', dias_suministro: d.dias_suministro || d.dias || '' }));
  if (!filas.length) { mostrarErrores(['No se ha encontrado ninguna fila. Revise que la primera línea sea la cabecera y que las columnas vayan separadas por «;».']); return; }
  disp = disp.concat(filas); pintarTablas(); $('csvDisp').value = ''; mostrarErrores([]);
});

document.querySelectorAll('[data-ejemplo]').forEach((b) => b.addEventListener('click', () => {
  const e = entradaDesdeEjemplo(EJEMPLOS[b.dataset.ejemplo]);
  selModelo.value = e.modelo; selModelo.dispatchEvent(new Event('change'));
  document.querySelectorAll('input[name=nivel]').forEach((r) => { r.checked = r.value === e.nivel; });
  for (const k of ['fecha_estratificacion', 'fecha_consulta', 'patologia', 'edad', 'sexo', 'notas']) $(k).value = e[k] ?? '';
  disp = e.dispensaciones.map((d) => ({ ...d })); presc = e.prescripcion.map((p) => ({ ...p }));
  pintarTablas();
  document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('resultado').hidden = true; $('cadena').hidden = true; mostrarErrores([]);
  $('formulario').dataset.ficticio = b.dataset.ejemplo;
}));
document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', 'false'));

function mostrarErrores(lista) {
  const c = $('errores');
  c.hidden = !lista.length;
  c.innerHTML = lista.length ? `<strong>Revise estos datos:</strong><ul>${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
}

function leerFormulario() {
  const nivel = document.querySelector('input[name=nivel]:checked');
  return {
    modelo: selModelo.value, nivel: nivel ? nivel.value : '',
    fecha_estratificacion: $('fecha_estratificacion').value, fecha_consulta: $('fecha_consulta').value,
    patologia: $('patologia').value.trim(), edad: $('edad').value, sexo: $('sexo').value,
    dispensaciones: disp.filter((d) => d.fecha || d.grupo || d.dias_suministro).map((d) => ({ ...d, grupo: String(d.grupo || '').trim() })),
    prescripcion: presc.filter((p) => p.medicamento),
    notas: $('notas').value,
  };
}

// ---------- Ejecución ----------
$('formulario').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const entrada = leerFormulario();
  const r = preparar(entrada, { BIBLIOTECA, REGLAS });
  if (r.errores.length) { mostrarErrores(r.errores); $('errores').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  mostrarErrores([]);
  ultimo = { entrada, r, ficticio: $('formulario').dataset.ficticio || null };
  manuales = [];
  await pintarCadena(r);
  pintarHoja();
});
// Cualquier cambio en el formulario deja de ser un ejemplo ficticio intacto.
$('formulario').addEventListener('input', () => { delete $('formulario').dataset.ficticio; document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', 'false')); });

async function pintarCadena(r) {
  const c = $('cadena'); c.hidden = false;
  const g = r.calculo.adherencia.grupos;
  const pasos = [
    ['Lector', `${r.lector.perfil.length} datos de perfil · ${r.lector.senales.length} señales en la nota, con cita literal`],
    ['Calculadora', `${g.length ? g.map((x) => `PDC ${x.grupo} ${x.pdc_porcentaje}`).join(' · ') : 'sin dispensaciones'} · reestratificación: ${textoEstado(r.calculo.reestratificacion.estado).toLowerCase()}`],
    ['Detector', `${r.alertas.filter((a) => a.tipo === 'accion').length} alertas de acción · ${r.alertas.filter((a) => a.tipo !== 'accion').length} informativas`],
    ['Planificador', `${r.plan.puntos.length} puntos clave con intervención literal del nivel ${r.calculo.reestratificacion.nivel}`],
    ['Auditor', r.auditoria.aprobada ? 'todas las comprobaciones superadas' : 'hay comprobaciones no superadas: revise la hoja'],
  ];
  c.innerHTML = '<h2>Cadena de preparación</h2><ol>' + pasos.map(([n], i) => `<li id="paso${i}"><span class="estado">${i + 1}</span><div><div class="nombre">${n}</div><div class="resumen">en espera…</div></div></li>`).join('') + '</ol>';
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let i = 0; i < pasos.length; i++) {
    if (!reducir) await new Promise((res) => setTimeout(res, 260));
    const li = $(`paso${i}`);
    const fallo = i === 4 && !r.auditoria.aprobada;
    li.className = fallo ? 'fallo' : 'hecho';
    li.querySelector('.estado').textContent = fallo ? '!' : '✓';
    li.querySelector('.resumen').textContent = pasos[i][1];
  }
}

const ESTADOS = { realizado: 'Realizado', no_realizado: 'No realizado', no_procede: 'No procede' };
function textoEstado(e) { return { vencida: 'Reestratificación vencida', en_intervalo_de_valoracion: 'En intervalo de valoración', en_plazo: 'En plazo', sin_plazo_calculable: 'Plazo no calculable por fechas' }[e] || e; }
function claseEstado(e) { return { vencida: 'mal', en_plazo: 'bien' }[e] || 'neutra'; }

function pintarHoja() {
  const { entrada, r, ficticio } = ultimo;
  const e = r.calculo.reestratificacion;
  const bib = BIBLIOTECA[entrada.modelo];
  const lista = bib.niveles[e.nivel].intervenciones;
  const puntos = [...r.plan.puntos, ...manuales];
  const usados = new Set(puntos.map((k) => k.intervencion_literal));
  const h = [];
  h.push(`<div class="hoja-cab">${ficticio ? `<span class="ficticio">PACIENTE FICTICIO ${esc(ficticio)} · material docente</span>` : ''}<h2>Hoja de preparación de consulta</h2><div class="sub">${esc([entrada.patologia, entrada.edad ? `${entrada.edad} años` : '', entrada.sexo].filter(Boolean).join(' · '))}${entrada.patologia || entrada.edad ? ' · ' : ''}Consulta del ${esc(entrada.fecha_consulta)}</div></div>`);
  h.push(`<section><h3>Estratificación CMO</h3><div class="fila-nivel"><div><div class="nivelgrande">Nivel ${esc(e.nivel)}</div><div class="sub">${esc(e.herramienta)} · última estratificación ${esc(e.ultima_fecha)}</div></div><div><span class="etq ${claseEstado(e.estado)}">${esc(textoEstado(e.estado))}</span>${e.fecha_limite ? `<div class="sub">Fecha límite: ${esc(e.fecha_limite)}</div>` : ''}</div></div>`);
  if (e.periodicidad_texto) h.push(`<p class="nota">Periodicidad del modelo: «${esc(e.periodicidad_texto)}»${e.reestratificar_ademas ? ` · Además: «${esc(e.reestratificar_ademas.join(' '))}»` : ''}</p>`);
  else h.push('<p class="nota">La herramienta de este modelo no declara periodicidad de reestratificación: consulte el documento de la adaptación.</p>');
  h.push(`<p class="nota">El nivel lo asigna la herramienta CMO, no esta hoja. Los niveles no son comparables entre patologías. <a href="${esc(e.url)}" target="_blank" rel="noopener">Abrir ${esc(e.herramienta)} ↗</a></p></section>`);
  const g = r.calculo.adherencia.grupos;
  h.push(`<section><h3>Adherencia (PDC, últimos ${REGLAS.adherencia.ventana_dias} días)</h3>${g.length ? `<table><thead><tr><th>Grupo</th><th>PDC</th><th>Días cubiertos</th><th>Periodo</th></tr></thead><tbody>${g.map((a) => `<tr><td>${esc(a.grupo)}</td><td><span class="etq ${a.por_debajo_del_umbral ? 'mal' : 'bien'}">${esc(a.pdc_porcentaje)}</span></td><td>${a.dias_cubiertos} / ${a.dias_ventana}</td><td>${esc(a.ventana.inicio)} a ${esc(a.ventana.fin)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No calculada: no hay dispensaciones.</p>'}<p class="nota">Umbral: ${Math.round(REGLAS.adherencia.umbral * 100)} %. Calculado a partir de las dispensaciones; si una dispensación llega antes de agotar la anterior, el sobrante se suma.</p></section>`);
  if (r.lector.perfil.length) h.push(`<section><h3>Perfil del paciente</h3><table><tbody>${r.lector.perfil.map((p) => `<tr><td>${esc(p.dato)}${p.cita ? `<div class="cita">«${esc(p.cita)}»</div>` : ''}</td></tr>`).join('')}</tbody></table></section>`);
  h.push(`<section><h3>Alertas</h3><ul class="alertas">${r.alertas.length ? r.alertas.map((a) => `<li class="${a.tipo === 'accion' ? '' : 'info'}"><strong>${esc(a.id)} · ${esc(a.titulo)}</strong><div>${esc(a.detalle)}</div>${a.cita ? `<div class="cita">«${esc(a.cita)}»</div>` : ''}</li>`).join('') : '<li class="info">Sin alertas.</li>'}</ul></section>`);
  h.push(`<section><h3>Puntos clave para esta consulta</h3>${puntos.length ? '' : '<p class="sub">No hay puntos clave automáticos. Si lo considera, añada intervenciones de la lista.</p>'}${puntos.map((k, i) => `<div class="punto" data-i="${i}"><div class="motivo">${esc(k.id)} · ${k.origen === 'manual' ? 'añadido por el farmacéutico' : `por ${esc(k.alerta_id)}`}${k.categoria ? ` · ${esc(k.categoria)}` : ''}</div><div class="texto">${esc(k.intervencion_literal)}</div><div class="estados" role="radiogroup" aria-label="Estado de ${esc(k.id)}">${Object.entries(ESTADOS).map(([v, t]) => `<label><input type="radio" name="estado-${i}" value="${v}"><span>${t}</span></label>`).join('')}</div><input type="text" class="comentario" placeholder="Comentario (opcional)" aria-label="Comentario de ${esc(k.id)}"></div>`).join('')}`);
  const libres = lista.filter((x) => !usados.has(x.texto));
  if (libres.length) h.push(`<div class="anadir"><select id="selManual" aria-label="Añadir otra intervención del nivel"><option value="">Añadir otra intervención del nivel ${esc(e.nivel)}…</option>${libres.map((x) => `<option>${esc(x.texto)}</option>`).join('')}</select><button type="button" class="sec" id="btnManual">Añadir</button></div>`);
  h.push('</section>');
  h.push(`<section><details><summary>Todas las intervenciones del nivel ${esc(e.nivel)} (${lista.length})</summary><ul>${lista.map((x) => `<li>${x.categoria ? `<span class="sub">${esc(x.categoria)}:</span> ` : ''}${esc(x.texto)}</li>`).join('')}</ul><p class="nota">Texto literal de ${esc(bib.herramienta)} (${esc(bib.origen)}). ${bib.tipo_catalogo ? `Tipo de catálogo: ${esc(bib.tipo_catalogo)}.` : ''}</p></details></section>`);
  h.push(`<section class="no-imprimir"><h3>Verificación automática</h3><ul class="auditoria">${r.auditoria.comprobaciones.map((c) => `<li><span class="${c.bien ? 'si' : 'no'}">${c.bien ? '✓' : '✗'}</span> ${esc(c.texto)}${c.detalle ? ` <span class="sub">(${esc(c.detalle)})</span>` : ''}</li>`).join('')}</ul></section>`);
  h.push(`<section><h3>Texto para la historia clínica</h3><div class="botones no-imprimir"><button type="button" class="principal" id="btnGenerar">Generar texto</button><button type="button" class="sec" id="btnCopiar">Copiar</button><button type="button" class="sec" id="btnImprimir">Imprimir / PDF</button></div><textarea id="textoHC" aria-label="Texto para la historia clínica" placeholder="Marque el estado de cada punto y pulse «Generar texto»."></textarea><div id="avisoCopia" aria-live="polite"></div></section>`);
  h.push(`<p class="nota">Herramienta de apoyo; no sustituye el juicio del farmacéutico. Preparador de consulta CMO v${VERSION}.</p>`);
  const res = $('resultado');
  res.className = 'hoja'; res.hidden = false; res.innerHTML = h.join('');
  res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const bm = $('btnManual');
  if (bm) bm.addEventListener('click', () => {
    const v = $('selManual').value; if (!v) return;
    const it = lista.find((x) => x.texto === v);
    manuales.push({ id: `K${puntos.length + 1}`, alerta_id: null, categoria: it.categoria, intervencion_literal: it.texto, origen: 'manual' });
    const estado = guardarEstados();
    pintarHoja(); restaurarEstados(estado);
  });
  $('btnGenerar').addEventListener('click', generarTexto);
  $('btnCopiar').addEventListener('click', copiar);
  $('btnImprimir').addEventListener('click', () => window.print());
}

function guardarEstados() {
  return [...document.querySelectorAll('.punto')].map((d) => ({ v: d.querySelector('input[type=radio]:checked')?.value || null, c: d.querySelector('.comentario').value }));
}
function restaurarEstados(est) {
  document.querySelectorAll('.punto').forEach((d, i) => {
    if (!est[i]) return;
    if (est[i].v) d.querySelector(`input[value=${est[i].v}]`).checked = true;
    d.querySelector('.comentario').value = est[i].c;
  });
}

function generarTexto() {
  const { entrada, r } = ultimo;
  const e = r.calculo.reestratificacion;
  const puntos = [...r.plan.puntos, ...manuales];
  const L = [`ATENCIÓN FARMACÉUTICA - CONSULTA ${entrada.fecha_consulta}`];
  L.push(`Modelo CMO: ${e.herramienta}, nivel ${e.nivel} (última estratificación ${e.ultima_fecha}; ${textoEstado(e.estado).toLowerCase()}).`);
  const g = r.calculo.adherencia.grupos;
  if (g.length) L.push(`Adherencia (PDC ${REGLAS.adherencia.ventana_dias} días): ${g.map((a) => `${a.grupo} ${a.pdc_porcentaje}`).join('; ')}.`);
  const al = r.alertas.filter((a) => a.tipo === 'accion').map((a) => a.titulo);
  if (al.length) L.push(`Alertas: ${al.join('; ')}.`);
  const grupos = { realizado: [], no_realizado: [], no_procede: [], sin: [] };
  document.querySelectorAll('.punto').forEach((d) => {
    const k = puntos[Number(d.dataset.i)];
    const v = d.querySelector('input[type=radio]:checked')?.value || 'sin';
    const c = d.querySelector('.comentario').value.trim();
    grupos[v].push(`- ${k.intervencion_literal}${c ? ` (${c})` : ''}`);
  });
  if (grupos.realizado.length) L.push('Actuaciones realizadas:\n' + grupos.realizado.join('\n'));
  if (grupos.no_realizado.length) L.push('Actuaciones pendientes:\n' + grupos.no_realizado.join('\n'));
  if (grupos.no_procede.length) L.push('No proceden:\n' + grupos.no_procede.join('\n'));
  if (grupos.sin.length) L.push('Sin valorar:\n' + grupos.sin.join('\n'));
  $('textoHC').value = L.join('\n');
  $('avisoCopia').textContent = '';
}
function copiar() {
  const ta = $('textoHC');
  if (!ta.value) generarTexto();
  const ok = () => { $('avisoCopia').textContent = 'Texto copiado. Péguelo en la historia clínica.'; };
  const viejo = () => { ta.select(); try { document.execCommand('copy'); ok(); } catch { $('avisoCopia').textContent = 'No se pudo copiar: seleccione el texto y cópielo a mano.'; } };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(ok, viejo); else viejo();
}

pintarTablas();
