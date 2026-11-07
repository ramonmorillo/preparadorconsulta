// Interfaz del Preparador de consulta CMO, versión web. La lógica clínica está en nucleo.js.
import { BIBLIOTECA, REGLAS, EJEMPLOS, GUIAS } from './datos.js?v=2.0.0';
import { preparar, entradaDesdeEjemplo, leerCSV, VERSION, guion, planPosterior, crearSeguimiento, leerSeguimiento, entradaDesdeSeguimiento, unidadesPresentacion, diasSuministro } from './nucleo.js?v=2.0.0';
import * as CIMA from './cima.js?v=2.0.0';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ahoraISO = () => new Date().toISOString().slice(0, 10);

let disp = [];
let presc = [];
let ultimo = null;      // { entrada, r, ficticio }
let manuales = [];      // intervenciones añadidas por el farmacéutico
let anterior = null;    // seguimiento cargado de la visita previa
const registro = { estados: [], estadio: '', barreras: '', objetivos: [{ objetivo: '', plan: '', plazo: '' }], reestratificado: false, nuevo_nivel: '' };

// ======================= FORMULARIO =======================
const selModelo = $('modelo');
selModelo.innerHTML = '<option value="">Elija…</option>' + Object.values(BIBLIOTECA).map((b) => `<option value="${esc(b.id)}">${esc(b.herramienta)}</option>`).join('');
selModelo.addEventListener('change', () => {
  const b = BIBLIOTECA[selModelo.value];
  $('enlaceHerramienta').href = b ? b.url : 'https://ramonmorillo.es/hub-estratificacionCMO/';
  $('enlaceHerramienta').textContent = b ? `Abrir ${b.herramienta} para estratificar ↗` : 'Abrir la herramienta de estratificación ↗';
});
$('fecha_consulta').value = hoyLocal();

const filaDispVacia = () => ({ fecha: '', medicamento: '', grupo: '', envases: '1', unidades_envase: '', unidades_dia: '', dias_suministro: '', cima: null });
const filaPrescVacia = () => ({ medicamento: '', pauta: '', fecha_inicio: '', fecha_fin: '', ambito: '', cima: null });

function campo(lista, i, k, etiqueta, tipo = 'text', clase = '', extra = '') {
  const v = (lista === 'disp' ? disp : presc)[i][k] ?? '';
  return `<label class="${clase}">${etiqueta}<input type="${tipo}" data-lista="${lista}" data-i="${i}" data-k="${k}" value="${esc(v)}"${extra}></label>`;
}
function insigniaCima(f) {
  if (!f.cima) return '<span class="insignia gris">sin verificar en CIMA</span>';
  return `<span class="insignia ok">CIMA ✓ ${f.cima.cn ? `CN ${esc(f.cima.cn)}` : `n.º ${esc(f.cima.nregistro)}`}</span>${f.cima.psum ? ' <span class="insignia mal">problema de suministro</span>' : ''}`;
}
function bloqueMedicamento(lista, i) {
  const f = (lista === 'disp' ? disp : presc)[i];
  return `<div class="med"><label>Medicamento<input type="text" data-lista="${lista}" data-i="${i}" data-k="medicamento" value="${esc(f.medicamento)}" placeholder="Nombre comercial o principio activo"></label>
    <div class="med-acc"><button type="button" class="sec peq" data-cima="${lista}" data-i="${i}">Buscar en CIMA</button> ${insigniaCima(f)}</div>
    <div class="cima-res" id="cima-${lista}-${i}" aria-live="polite"></div></div>`;
}
function pintarTablas() {
  const td = $('tablaDisp'); td.className = 'tabla-edit disp';
  td.innerHTML = disp.length ? disp.map((f, i) => `<div class="fila">${campo('disp', i, 'fecha', 'Fecha', 'date', 'c-fecha')}${bloqueMedicamento('disp', i)}${campo('disp', i, 'grupo', 'Grupo terapéutico', 'text', 'c-grupo')}${campo('disp', i, 'envases', 'Envases', 'number', 'c-env', ' min="1" inputmode="numeric"')}${campo('disp', i, 'unidades_envase', 'Unidades/envase', 'number', 'c-uenv', ' min="1" inputmode="numeric"')}${campo('disp', i, 'unidades_dia', 'Unidades/día', 'text', 'c-udia', ' inputmode="decimal" placeholder="1 o 0,25"')}${campo('disp', i, 'dias_suministro', 'Días de suministro', 'number', 'c-dias', ' min="1" max="400" inputmode="numeric"')}<button type="button" class="quitar" data-quitar="disp" data-i="${i}" aria-label="Quitar dispensación ${i + 1}">×</button></div>`).join('') : '<p class="vacia">Sin dispensaciones. Sin ellas no se puede calcular la adherencia.</p>';
  const tp = $('tablaPresc'); tp.className = 'tabla-edit presc';
  tp.innerHTML = presc.length ? presc.map((f, i) => `<div class="fila">${bloqueMedicamento('presc', i)}${campo('presc', i, 'pauta', 'Pauta', 'text', 'c-pauta')}${campo('presc', i, 'fecha_inicio', 'Inicio', 'date', 'c-ini')}${campo('presc', i, 'fecha_fin', 'Fin (si se suspendió)', 'date', 'c-fin')}${campo('presc', i, 'ambito', 'Ámbito', 'text', 'c-amb')}<button type="button" class="quitar" data-quitar="presc" data-i="${i}" aria-label="Quitar tratamiento ${i + 1}">×</button></div>`).join('') : '<p class="vacia">Sin tratamientos registrados.</p>';
}
function recalcularDias(i) {
  const f = disp[i];
  const d = diasSuministro(f.envases, f.unidades_envase, f.unidades_dia);
  if (d !== null) {
    f.dias_suministro = String(d);
    const inp = document.querySelector(`input[data-lista="disp"][data-i="${i}"][data-k="dias_suministro"]`);
    if (inp) inp.value = f.dias_suministro;
  }
}
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.dataset || !t.dataset.lista) return;
  const fila = (t.dataset.lista === 'disp' ? disp : presc)[Number(t.dataset.i)];
  fila[t.dataset.k] = t.value;
  if (t.dataset.k === 'medicamento' && fila.cima && t.value !== fila.cima.nombre) {
    fila.cima = null; // escrito a mano: deja de estar verificado
    const acc = t.closest('.med')?.querySelector('.med-acc');
    if (acc) acc.innerHTML = `<button type="button" class="sec peq" data-cima="${t.dataset.lista}" data-i="${t.dataset.i}">Buscar en CIMA</button> ${insigniaCima(fila)}`;
  }
  if (t.dataset.lista === 'disp' && ['envases', 'unidades_envase', 'unidades_dia'].includes(t.dataset.k)) recalcularDias(Number(t.dataset.i));
});
document.addEventListener('click', async (ev) => {
  const q = ev.target.closest('[data-quitar]');
  if (q) { (q.dataset.quitar === 'disp' ? disp : presc).splice(Number(q.dataset.i), 1); pintarTablas(); return; }
  const c = ev.target.closest('[data-cima]');
  if (c) { await buscarCima(c.dataset.cima, Number(c.dataset.i)); return; }
  const m = ev.target.closest('[data-elegir-med]');
  if (m) { await elegirMedicamento(m.dataset.lista, Number(m.dataset.i), m.dataset.elegirMed); return; }
  const p = ev.target.closest('[data-elegir-pres]');
  if (p) { elegirPresentacion(p.dataset.lista, Number(p.dataset.i), Number(p.dataset.elegirPres)); }
});
$('addDisp').addEventListener('click', () => {
  const u = disp[disp.length - 1];
  const n = filaDispVacia();
  if (u) Object.assign(n, { medicamento: u.medicamento, grupo: u.grupo, envases: u.envases, unidades_envase: u.unidades_envase, unidades_dia: u.unidades_dia, dias_suministro: u.dias_suministro, cima: u.cima });
  disp.push(n); pintarTablas();
});
$('addPresc').addEventListener('click', () => { presc.push(filaPrescVacia()); pintarTablas(); });
$('cargarCsv').addEventListener('click', () => {
  const filas = leerCSV($('csvDisp').value).map((d) => ({ ...filaDispVacia(), fecha: d.fecha || '', grupo: d.grupo || '', medicamento: d.medicamento || '', dias_suministro: d.dias_suministro || d.dias || '' }));
  if (!filas.length) { mostrarErrores(['No se ha encontrado ninguna fila. Revise que la primera línea sea la cabecera y que las columnas vayan separadas por «;».']); return; }
  disp = disp.concat(filas); pintarTablas(); $('csvDisp').value = ''; mostrarErrores([]);
});

// ----- CIMA -----
const fichasCima = new Map();
async function buscarCima(lista, i) {
  const f = (lista === 'disp' ? disp : presc)[i];
  const caja = $(`cima-${lista}-${i}`);
  if (!f.medicamento || f.medicamento.trim().length < 3) { caja.innerHTML = '<p class="nota">Escriba al menos 3 letras del nombre comercial o del principio activo.</p>'; return; }
  caja.innerHTML = '<p class="nota">Buscando en CIMA…</p>';
  try {
    const res = await CIMA.buscar(f.medicamento);
    const caja = $(`cima-${lista}-${i}`); if (!caja) return;
    if (!res.length) { caja.innerHTML = '<p class="nota">CIMA no devuelve resultados. Pruebe con otro nombre o con el principio activo.</p>'; return; }
    caja.innerHTML = `<ul class="lista-cima">${res.map((m) => `<li><button type="button" class="enlace-boton" data-elegir-med="${esc(m.nregistro)}" data-lista="${lista}" data-i="${i}">${esc(m.nombre)}</button> <span class="sub">${esc(m.cpresc)}${m.comerc ? '' : ' · no comercializado'}${m.psum ? ' · problema de suministro' : ''}</span></li>`).join('')}</ul>`;
  } catch (e) {
    const caja = $(`cima-${lista}-${i}`); if (!caja) return;
    caja.innerHTML = '<p class="nota">No se ha podido consultar CIMA (sin conexión o servicio no disponible). Puede escribir el medicamento a mano: quedará marcado como «sin verificar».</p>';
  }
}
async function elegirMedicamento(lista, i, nregistro) {
  const caja = $(`cima-${lista}-${i}`);
  caja.innerHTML = '<p class="nota">Cargando presentaciones…</p>';
  try {
    const fi = await CIMA.ficha(nregistro);
    const caja = $(`cima-${lista}-${i}`); if (!caja) return;
    fichasCima.set(`${lista}-${i}`, fi);
    const pres = fi.presentaciones.filter((p) => p.comerc).length ? fi.presentaciones.filter((p) => p.comerc) : fi.presentaciones;
    if (!pres.length) { aplicarCima(lista, i, fi, null); return; }
    caja.innerHTML = `<p class="nota">${esc(fi.nombre)} · elija la presentación:</p><ul class="lista-cima">${pres.map((p) => `<li><button type="button" class="enlace-boton" data-elegir-pres="${fi.presentaciones.indexOf(p)}" data-lista="${lista}" data-i="${i}">${esc(p.nombre)}</button> <span class="sub">CN ${esc(p.cn)}${p.psum ? ' · problema de suministro' : ''}</span></li>`).join('')}</ul>`;
  } catch (e) {
    const caja = $(`cima-${lista}-${i}`); if (!caja) return;
    caja.innerHTML = '<p class="nota">No se ha podido cargar la ficha de CIMA. Inténtelo de nuevo o escriba el medicamento a mano.</p>';
  }
}
function elegirPresentacion(lista, i, idx) {
  const fi = fichasCima.get(`${lista}-${i}`);
  if (fi) aplicarCima(lista, i, fi, fi.presentaciones[idx]);
}
function aplicarCima(lista, i, fi, pres) {
  const f = (lista === 'disp' ? disp : presc)[i];
  const nombre = pres ? pres.nombre : fi.nombre;
  f.medicamento = nombre;
  f.cima = { nregistro: fi.nregistro, cn: pres ? pres.cn : null, nombre, psum: !!(fi.psum || (pres && pres.psum)), atc4: fi.atc4, ficha_tecnica: fi.ficha_tecnica, prospecto: fi.prospecto, pactivos: fi.pactivos, consultado: ahoraISO() };
  if (lista === 'disp') {
    if (!f.grupo && fi.atc4) f.grupo = fi.atc4.nombre;
    const u = pres ? unidadesPresentacion(pres.nombre) : null;
    if (u) f.unidades_envase = String(u.unidades);
    recalcularDias(i);
  }
  pintarTablas();
}

// ----- Ejemplos y seguimiento -----
function cargarEntrada(e) {
  selModelo.value = e.modelo; selModelo.dispatchEvent(new Event('change'));
  document.querySelectorAll('input[name=nivel]').forEach((r) => { r.checked = r.value === String(e.nivel); });
  for (const k of ['fecha_estratificacion', 'fecha_consulta', 'patologia', 'edad', 'sexo', 'notas']) $(k).value = e[k] ?? '';
  disp = (e.dispensaciones || []).map((d) => ({ ...filaDispVacia(), ...d }));
  presc = (e.prescripcion || []).map((p) => ({ ...filaPrescVacia(), ...p }));
  pintarTablas();
  $('resultado').hidden = true; $('cadena').hidden = true; mostrarErrores([]);
}
document.querySelectorAll('[data-ejemplo]').forEach((b) => b.addEventListener('click', () => {
  anterior = null; $('avisoSeguimiento').hidden = true;
  cargarEntrada(entradaDesdeEjemplo(EJEMPLOS[b.dataset.ejemplo]));
  document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('formulario').dataset.ficticio = b.dataset.ejemplo;
}));
document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
$('archivoSeguimiento').addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const { seguimiento, error } = leerSeguimiento(await f.text());
  const aviso = $('avisoSeguimiento');
  aviso.hidden = false;
  if (error) { aviso.className = 'aviso-seguimiento mal'; aviso.textContent = error; return; }
  anterior = seguimiento;
  cargarEntrada(entradaDesdeSeguimiento(seguimiento, hoyLocal()));
  aviso.className = 'aviso-seguimiento';
  aviso.innerHTML = `Seguimiento de la consulta del <strong>${esc(seguimiento.guardado)}</strong> cargado. Añada las dispensaciones y cambios desde entonces y pulse «Preparar consulta»: en «Antes» verá los acuerdos de esa visita.`;
  delete $('formulario').dataset.ficticio;
  document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  ev.target.value = '';
});

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
$('formulario').addEventListener('input', () => { delete $('formulario').dataset.ficticio; document.querySelectorAll('[data-ejemplo]').forEach((x) => x.setAttribute('aria-pressed', 'false')); });

// ======================= EJECUCIÓN =======================
$('formulario').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const entrada = leerFormulario();
  const r = preparar(entrada, { BIBLIOTECA, REGLAS });
  if (r.errores.length) { mostrarErrores(r.errores); $('errores').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  mostrarErrores([]);
  ultimo = { entrada, r, ficticio: $('formulario').dataset.ficticio || null };
  manuales = [];
  registro.estados = []; registro.estadio = ''; registro.barreras = ''; registro.objetivos = [{ objetivo: '', plan: '', plazo: '' }]; registro.reestratificado = false; registro.nuevo_nivel = '';
  await pintarCadena(r);
  pintarAntes(); pintarDurante(); pintarDespues();
  $('resultado').hidden = false;
  mostrarFase('antes');
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
    if (!reducir) await new Promise((res) => setTimeout(res, 220));
    const li = $(`paso${i}`);
    const fallo = i === 4 && !r.auditoria.aprobada;
    li.className = fallo ? 'fallo' : 'hecho';
    li.querySelector('.estado').textContent = fallo ? '!' : '✓';
    li.querySelector('.resumen').textContent = pasos[i][1];
  }
}

// Pestañas
const FASES = ['antes', 'durante', 'despues'];
function mostrarFase(f) {
  for (const x of FASES) {
    $(`panel-${x}`).hidden = x !== f;
    $(`tab-${x}`).setAttribute('aria-selected', String(x === f));
    $(`tab-${x}`).tabIndex = x === f ? 0 : -1;
  }
  if (f === 'despues') pintarDespues();
}
FASES.forEach((f, i) => {
  $(`tab-${f}`).addEventListener('click', () => mostrarFase(f));
  $(`tab-${f}`).addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      const j = (i + (ev.key === 'ArrowRight' ? 1 : FASES.length - 1)) % FASES.length;
      mostrarFase(FASES[j]); $(`tab-${FASES[j]}`).focus();
    }
  });
});

const ESTADOS = { realizado: 'Realizado', no_realizado: 'No realizado', no_procede: 'No procede' };
function textoEstado(e) { return { vencida: 'Reestratificación vencida', en_intervalo_de_valoracion: 'En intervalo de valoración', en_plazo: 'En plazo', sin_plazo_calculable: 'Plazo no calculable por fechas' }[e] || e; }
function claseEstado(e) { return { vencida: 'mal', en_plazo: 'bien' }[e] || 'neutra'; }
const pag = (p) => `<span class="fuente">p. ${esc(p)}</span>`;
function puntosTodos() { return [...ultimo.r.plan.puntos, ...manuales]; }

// ======================= 1 · ANTES =======================
function pintarAntes() {
  const { entrada, r, ficticio } = ultimo;
  const e = r.calculo.reestratificacion;
  const h = [];
  h.push(`<div class="hoja-cab">${ficticio ? `<span class="ficticio">PACIENTE FICTICIO ${esc(ficticio)} · material docente</span>` : ''}<h2>Antes de la consulta</h2><div class="sub">${esc([entrada.patologia, entrada.edad ? `${entrada.edad} años` : '', entrada.sexo].filter(Boolean).join(' · '))}${entrada.patologia || entrada.edad ? ' · ' : ''}Consulta del ${esc(entrada.fecha_consulta)}</div></div>`);
  if (anterior) {
    const ob = (anterior.registro.objetivos || []);
    const pen = (anterior.registro.estados || []).filter((x) => x.estado !== 'realizado' && x.estado !== 'no_procede');
    h.push(`<section class="previa"><h3>Acuerdos de la consulta anterior (${esc(anterior.guardado)})</h3>${ob.length ? `<p class="sub">Objetivos acordados:</p><ul>${ob.map((o) => `<li><strong>${esc(o.objetivo)}</strong>${o.plan ? ` — ${esc(o.plan)}` : ''}${o.plazo ? ` <span class="sub">(plazo ${esc(o.plazo)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="sub">No se registraron objetivos.</p>'}${pen.length ? `<p class="sub">Actuaciones que quedaron pendientes:</p><ul>${pen.map((x) => `<li>${esc(x.texto)}</li>`).join('')}</ul>` : ''}${anterior.registro.estadio ? `<p class="sub">Estadio o estado motivacional anotado: ${esc(anterior.registro.estadio)}</p>` : ''}<p class="nota">Revise con el paciente si se han cumplido.</p></section>`);
  }
  h.push(`<section><h3>Estratificación CMO</h3><div class="fila-nivel"><div><div class="nivelgrande">Nivel ${esc(e.nivel)}</div><div class="sub">${esc(e.herramienta)} · última estratificación ${esc(e.ultima_fecha)}</div></div><div><span class="etq ${claseEstado(e.estado)}">${esc(textoEstado(e.estado))}</span>${e.fecha_limite ? `<div class="sub">Fecha límite: ${esc(e.fecha_limite)}</div>` : ''}</div></div>`);
  h.push(e.periodicidad_texto ? `<p class="nota">Periodicidad: «${esc(e.periodicidad_texto)}»${e.reestratificar_ademas ? ` · Además: «${esc(e.reestratificar_ademas.join(' '))}»` : ''}</p>` : '<p class="nota">Sin periodicidad declarada para este modelo: consulte el documento de la adaptación.</p>');
  h.push(`<p class="nota">El nivel lo asigna la herramienta CMO, no esta hoja. Los niveles no son comparables entre patologías. <a href="${esc(e.url)}" target="_blank" rel="noopener">Abrir ${esc(e.herramienta)} ↗</a></p></section>`);
  const g = r.calculo.adherencia.grupos;
  h.push(`<section><h3>Adherencia (PDC, últimos ${REGLAS.adherencia.ventana_dias} días)</h3>${g.length ? `<table><thead><tr><th>Grupo</th><th>PDC</th><th>Días cubiertos</th><th>Periodo</th></tr></thead><tbody>${g.map((a) => `<tr><td>${esc(a.grupo)}</td><td><span class="etq ${a.por_debajo_del_umbral ? 'mal' : 'bien'}">${esc(a.pdc_porcentaje)}</span></td><td>${a.dias_cubiertos} / ${a.dias_ventana}</td><td>${esc(a.ventana.inicio)} a ${esc(a.ventana.fin)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No calculada: no hay dispensaciones.</p>'}<p class="nota">Umbral: ${Math.round(REGLAS.adherencia.umbral * 100)} %. Si una dispensación llega antes de agotar la anterior, el sobrante se suma.</p></section>`);
  if (r.lector.perfil.length) h.push(`<section><h3>Perfil del paciente</h3><table><tbody>${r.lector.perfil.map((p) => `<tr><td>${esc(p.dato)}${p.cita ? `<div class="cita">«${esc(p.cita)}»</div>` : ''}</td></tr>`).join('')}</tbody></table></section>`);
  h.push(`<section><h3>Alertas</h3><ul class="alertas">${r.alertas.length ? r.alertas.map((a) => `<li class="${a.tipo === 'accion' ? '' : 'info'}"><strong>${esc(a.id)} · ${esc(a.titulo)}</strong><div>${esc(a.detalle)}</div>${a.cita ? `<div class="cita">«${esc(a.cita)}»</div>` : ''}</li>`).join('') : '<li class="info">Sin alertas.</li>'}</ul></section>`);
  const p = puntosTodos();
  h.push(`<section><h3>Puntos clave para esta consulta</h3>${p.length ? `<ol class="puntos-lista">${p.map((k) => `<li><strong>${esc(k.intervencion_literal)}</strong> <span class="sub">${k.origen === 'manual' ? 'añadido por el farmacéutico' : `por ${esc(k.alerta_id)}`}${k.categoria ? ` · ${esc(k.categoria)}` : ''}</span></li>`).join('')}</ol>` : '<p class="sub">No hay puntos clave automáticos.</p>'}<p class="nota">Se marcan como realizados en «2 · Durante».</p></section>`);
  h.push(`<section class="no-imprimir"><h3>Verificación automática</h3><ul class="auditoria">${r.auditoria.comprobaciones.map((c) => `<li><span class="${c.bien ? 'si' : 'no'}">${c.bien ? '✓' : '✗'}</span> ${esc(c.texto)}${c.detalle ? ` <span class="sub">(${esc(c.detalle)})</span>` : ''}</li>`).join('')}</ul></section>`);
  h.push('<div class="botones no-imprimir"><button type="button" class="principal" data-ir="durante">Continuar: durante la consulta →</button><button type="button" class="sec" data-imprimir>Imprimir / PDF</button></div>');
  $('panel-antes').innerHTML = h.join('');
}

// ======================= 2 · DURANTE =======================
function pintarDurante() {
  const { entrada, r } = ultimo;
  const gi = guion(r.alertas, entrada.modelo, GUIAS);
  const lista = BIBLIOTECA[entrada.modelo].niveles[String(entrada.nivel)].intervenciones;
  const p = puntosTodos();
  const h = ['<div class="hoja-cab"><h2>Durante la consulta</h2><div class="sub">Guion de entrevista motivacional y registro de lo que ocurre</div></div>'];
  if (!gi.disponible) {
    h.push(`<section><h3>Guion de entrevista motivacional</h3><p>No hay una adaptación CMO publicada con capítulo de Motivación para ${esc(BIBLIOTECA[entrada.modelo].herramienta)}. Aplique la entrevista motivacional del modelo CMO general.</p><p class="nota"><a href="https://www.sefh.es/mapex/cmo-motivacion.php" target="_blank" rel="noopener">Motivación en el modelo CMO (MAPEX) ↗</a></p></section>`);
  } else {
    const d = gi.documento; const dn = `${d.titulo}${d.anio ? ` (${d.anio})` : ''}`;
    h.push(`<section><h3>Guion: ${esc(gi.estructura.nombre)}</h3><p class="nota">Fuente: ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(dn)} ↗</a>` : esc(dn)} · capítulo ${esc(d.capitulo)}, pp. ${esc(d.paginas)}.</p><ol class="guion">${gi.estructura.pasos.map((s) => `<li><div class="paso-tit"><span class="sub">${esc(s.fase)}</span> ${esc(s.titulo)}</div><ul>${s.hacer.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${pag(s.pagina)}</li>`).join('')}</ol></section>`);
    for (const f of gi.focos) {
      if (!f.preguntas.length && !f.estrategias.length) continue;
      h.push(`<section class="foco"><h3>Para hoy: ${esc(f.nombre)}</h3>${f.preguntas.map((q) => `<p class="sub">${esc(q.tema)} ${pag(q.pagina)}</p><ul class="preguntas">${q.ejemplos.map((x) => `<li>«${esc(x)}»</li>`).join('')}</ul>`).join('')}${f.estrategias.length ? `<p class="sub">Estrategias que propone la adaptación:</p><ul>${f.estrategias.map((x) => `<li>${esc(x.texto)} ${pag(x.pagina)}</li>`).join('')}</ul>` : ''}</section>`);
    }
    const extra = [];
    if (gi.tecnicas.length) extra.push(`<p class="sub">Técnicas</p><ul>${gi.tecnicas.map((x) => `<li>${esc(x.texto)} ${pag(x.pagina)}</li>`).join('')}</ul>`);
    if (gi.errores.length) extra.push(`<p class="sub">Errores que evitar</p><ul>${gi.errores.map((x) => `<li>${esc(x.texto)} ${pag(x.pagina)}</li>`).join('')}</ul>`);
    if (gi.resistencias.length) extra.push(`<p class="sub">Si aparece resistencia</p><ul>${gi.resistencias.map((x) => `<li>${esc(x.texto)} ${pag(x.pagina)}</li>`).join('')}</ul>`);
    if (gi.objetivos) extra.push(`<p class="sub">Cómo pactar los objetivos</p><ul><li>${esc(gi.objetivos.texto)} ${pag(gi.objetivos.pagina)}</li></ul>`);
    if (gi.escalas.length) extra.push(`<p class="sub">Escalas que menciona la adaptación (opcionales)</p><ul>${gi.escalas.map((x) => `<li><strong>${esc(x.nombre)}</strong>: ${esc(x.uso)} ${pag(x.pagina)}</li>`).join('')}</ul>`);
    if (extra.length) h.push(`<section><details open><summary>Técnicas, resistencias, objetivos y escalas</summary>${extra.join('')}</details></section>`);
  }
  // Registro
  const estadios = gi.disponible && gi.estadios.length ? gi.estadios.map((x) => x.estadio) : (gi.disponible && /estados de situación/i.test(gi.estructura.nombre) ? gi.estructura.pasos.map((x) => x.titulo) : []);
  h.push(`<section><h3>Registro de la consulta</h3>
    ${estadios.length ? `<label>Estadio o estado motivacional del paciente<select id="regEstadio"><option value="">—</option>${estadios.map((x) => `<option${registro.estadio === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : `<label>Estadio o situación motivacional (opcional)<input type="text" id="regEstadio" value="${esc(registro.estadio)}"></label>`}
    <label>Barreras que refiere el paciente<textarea id="regBarreras" rows="3">${esc(registro.barreras)}</textarea></label>
  </section>`);
  h.push(`<section><h3>Puntos clave: ¿qué se ha hecho?</h3>${p.map((k, i) => `<div class="punto" data-i="${i}"><div class="motivo">${esc(k.id)} · ${k.origen === 'manual' ? 'añadido por el farmacéutico' : `por ${esc(k.alerta_id)}`}${k.categoria ? ` · ${esc(k.categoria)}` : ''}</div><div class="texto">${esc(k.intervencion_literal)}</div><div class="estados" role="radiogroup" aria-label="Estado de ${esc(k.id)}">${Object.entries(ESTADOS).map(([v, t]) => `<label><input type="radio" name="estado-${i}" value="${v}"${(registro.estados[i] || {}).estado === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div><input type="text" class="comentario" placeholder="Comentario (opcional)" aria-label="Comentario de ${esc(k.id)}" value="${esc((registro.estados[i] || {}).comentario || '')}"></div>`).join('') || '<p class="sub">No hay puntos clave automáticos.</p>'}
    ${(() => { const libres = lista.filter((x) => !p.some((k) => k.intervencion_literal === x.texto)); return libres.length ? `<div class="anadir"><select id="selManual" aria-label="Añadir otra intervención del nivel"><option value="">Añadir otra intervención del nivel ${esc(entrada.nivel)}…</option>${libres.map((x) => `<option>${esc(x.texto)}</option>`).join('')}</select><button type="button" class="sec" id="btnManual">Añadir</button></div>` : ''; })()}
  </section>`);
  h.push(`<section><h3>Objetivos acordados con el paciente</h3><p class="nota">${gi.disponible && gi.objetivos ? esc(gi.objetivos.texto) : 'Objetivos claros, realistas y alcanzables, con un plan y un plazo.'}</p><div id="objetivos">${registro.objetivos.map((o, i) => `<div class="objetivo"><label class="ancha">Objetivo<input type="text" data-obj="${i}" data-k="objetivo" value="${esc(o.objetivo)}" placeholder="p. ej. no olvidar la dosis de la noche"></label><label class="ancha">Plan de acción<input type="text" data-obj="${i}" data-k="plan" value="${esc(o.plan)}" placeholder="p. ej. alarma en el móvil a las 22:00"></label><label>Plazo<input type="date" data-obj="${i}" data-k="plazo" value="${esc(o.plazo)}"></label></div>`).join('')}</div><button type="button" class="sec" id="addObjetivo">+ Añadir objetivo</button></section>`);
  h.push(`<section><h3>Reestratificación</h3><label class="fila-check"><input type="checkbox" id="regReestr"${registro.reestratificado ? ' checked' : ''}> He reestratificado hoy con <a href="${esc(r.calculo.reestratificacion.url)}" target="_blank" rel="noopener">${esc(r.calculo.reestratificacion.herramienta)} ↗</a></label>
    <fieldset class="nivel" id="regNivel" ${registro.reestratificado ? '' : 'disabled'}><legend>Nivel resultante</legend>${['1', '2', '3'].map((n) => `<label><input type="radio" name="nuevoNivel" value="${n}"${registro.nuevo_nivel === n ? ' checked' : ''}> ${n}</label>`).join('')}</fieldset></section>`);
  h.push('<div class="botones no-imprimir"><button type="button" class="principal" data-ir="despues">Continuar: después de la consulta →</button></div>');
  $('panel-durante').innerHTML = h.join('');
  $('addObjetivo').addEventListener('click', () => { guardarRegistro(); registro.objetivos.push({ objetivo: '', plan: '', plazo: '' }); pintarDurante(); });
  const bm = $('btnManual');
  if (bm) bm.addEventListener('click', () => {
    const v = $('selManual').value; if (!v) return;
    guardarRegistro();
    const it = lista.find((x) => x.texto === v);
    manuales.push({ id: `K${puntosTodos().length + 1}`, alerta_id: null, categoria: it.categoria, intervencion_literal: it.texto, origen: 'manual' });
    pintarAntes(); pintarDurante();
  });
}
$('panel-durante').addEventListener('input', guardarRegistro);
$('panel-durante').addEventListener('change', guardarRegistro);
function guardarRegistro() {
  const pd = $('panel-durante');
  const est = pd.querySelector('#regEstadio'); if (est) registro.estadio = est.value;
  const bar = pd.querySelector('#regBarreras'); if (bar) registro.barreras = bar.value;
  registro.estados = [...pd.querySelectorAll('.punto')].map((d) => ({ texto: puntosTodos()[Number(d.dataset.i)].intervencion_literal, estado: d.querySelector('input[type=radio]:checked')?.value || '', comentario: d.querySelector('.comentario').value.trim() }));
  pd.querySelectorAll('[data-obj]').forEach((inp) => { registro.objetivos[Number(inp.dataset.obj)][inp.dataset.k] = inp.value; });
  const re = pd.querySelector('#regReestr');
  if (re) { registro.reestratificado = re.checked; pd.querySelector('#regNivel').disabled = !re.checked; }
  registro.nuevo_nivel = pd.querySelector('input[name=nuevoNivel]:checked')?.value || '';
}

// ======================= 3 · DESPUÉS =======================
function pintarDespues() {
  if (!ultimo) return;
  if (!$('panel-durante').hidden || $('panel-durante').innerHTML) guardarRegistro();
  const { entrada, r } = ultimo;
  const plan = planPosterior(entrada, r, registro, { BIBLIOTECA, REGLAS });
  const h = ['<div class="hoja-cab"><h2>Después de la consulta</h2><div class="sub">Plan hasta la próxima consulta</div></div>'];
  if (registro.reestratificado && !registro.nuevo_nivel) h.push('<p class="errores">Ha marcado que reestratificó: indique el nivel resultante en «2 · Durante».</p>');
  h.push(`<section><h3>Próxima reestratificación</h3>${plan.proxima_reestratificacion ? `<div class="nivelgrande">${esc(plan.proxima_reestratificacion)}</div>` : '<p>Sin plazo calculable por fechas para este modelo y nivel.</p>'}<p class="sub">Nivel ${esc(plan.nivel_final)}${plan.cambio_de_nivel ? ` (antes nivel ${esc(entrada.nivel)})` : ''} · calculada desde ${esc(plan.base_calculo)}${plan.periodicidad_texto ? ` · «${esc(plan.periodicidad_texto)}»` : ''}</p></section>`);
  if (plan.cobertura.length) h.push(`<section><h3>Medicación cubierta hasta</h3><table><tbody>${plan.cobertura.map((c) => `<tr><td>${esc(c.grupo)}</td><td><strong>${esc(c.ultimo_dia_cubierto)}</strong></td></tr>`).join('')}</tbody></table><p class="nota">Programe la próxima dispensación antes de esa fecha (calculado con las dispensaciones introducidas).</p></section>`);
  if (plan.seguimiento_entre_visitas.length) h.push(`<section><h3>Seguimiento entre visitas que contempla su nivel</h3><ul>${plan.seguimiento_entre_visitas.map((i) => `<li>${esc(i.texto)}</li>`).join('')}</ul><p class="nota">Texto literal de ${esc(BIBLIOTECA[entrada.modelo].herramienta)}, nivel ${esc(plan.nivel_final)}.</p></section>`);
  h.push(`<section><h3>Para revisar en la próxima consulta</h3>${plan.objetivos.length ? `<p class="sub">Objetivos acordados</p><ul>${plan.objetivos.map((o) => `<li><strong>${esc(o.objetivo)}</strong>${o.plan ? ` — ${esc(o.plan)}` : ''}${o.plazo ? ` <span class="sub">(plazo ${esc(o.plazo)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="sub">No se han registrado objetivos.</p>'}${plan.pendientes.length ? `<p class="sub">Actuaciones pendientes o sin valorar</p><ul>${plan.pendientes.map((x) => `<li>${esc(x.texto)}${x.comentario ? ` <span class="sub">(${esc(x.comentario)})</span>` : ''}</li>`).join('')}</ul>` : ''}</section>`);
  h.push(`<section><h3>Texto para la historia clínica</h3><textarea id="textoHC" aria-label="Texto para la historia clínica">${esc(textoHC(plan))}</textarea><div class="botones no-imprimir"><button type="button" class="principal" id="btnCopiar">Copiar</button></div><div id="avisoCopia" aria-live="polite"></div></section>`);
  h.push(`<section id="hojaPaciente" class="hoja-paciente"><h3>Hoja de acuerdos para el paciente</h3>${hojaPaciente(plan)}<div class="botones no-imprimir"><button type="button" class="sec" id="btnImprimirPaciente">Imprimir hoja del paciente</button></div></section>`);
  h.push(`<section class="no-imprimir"><h3>Guardar el seguimiento</h3><p class="ayuda">Descarga un archivo (sin datos identificativos) para cargarlo en la próxima consulta con «Cargar seguimiento anterior». Guárdelo según la política de su centro.</p><button type="button" class="principal" id="btnGuardar">Guardar seguimiento (.json)</button></section>`);
  $('panel-despues').innerHTML = h.join('');
  $('btnCopiar').addEventListener('click', copiar);
  $('btnImprimirPaciente').addEventListener('click', () => { document.body.classList.add('imprimir-paciente'); window.print(); document.body.classList.remove('imprimir-paciente'); });
  $('btnGuardar').addEventListener('click', () => guardarSeguimiento(plan));
}
function textoHC(plan) {
  const { entrada, r } = ultimo;
  const e = r.calculo.reestratificacion;
  const L = [`ATENCIÓN FARMACÉUTICA - CONSULTA ${entrada.fecha_consulta}`];
  L.push(`Modelo CMO: ${e.herramienta}, nivel ${e.nivel} (última estratificación ${e.ultima_fecha}; ${textoEstado(e.estado).toLowerCase()}).`);
  if (registro.reestratificado && registro.nuevo_nivel) L.push(`Reestratificado hoy: nivel ${registro.nuevo_nivel}.`);
  const g = r.calculo.adherencia.grupos;
  if (g.length) L.push(`Adherencia (PDC ${REGLAS.adherencia.ventana_dias} días): ${g.map((a) => `${a.grupo} ${a.pdc_porcentaje}`).join('; ')}.`);
  const al = r.alertas.filter((a) => a.tipo === 'accion').map((a) => a.titulo);
  if (al.length) L.push(`Alertas: ${al.join('; ')}.`);
  if (registro.estadio) L.push(`Estadio/estado motivacional: ${registro.estadio}.`);
  if (registro.barreras.trim()) L.push(`Barreras referidas: ${registro.barreras.trim()}`);
  const gr = { realizado: [], no_realizado: [], no_procede: [], sin: [] };
  registro.estados.forEach((x) => gr[x.estado || 'sin'].push(`- ${x.texto}${x.comentario ? ` (${x.comentario})` : ''}`));
  if (gr.realizado.length) L.push('Actuaciones realizadas:\n' + gr.realizado.join('\n'));
  if (gr.no_realizado.length) L.push('Actuaciones pendientes:\n' + gr.no_realizado.join('\n'));
  if (gr.no_procede.length) L.push('No proceden:\n' + gr.no_procede.join('\n'));
  if (gr.sin.length) L.push('Sin valorar:\n' + gr.sin.join('\n'));
  if (plan.objetivos.length) L.push('Objetivos acordados:\n' + plan.objetivos.map((o) => `- ${o.objetivo}${o.plan ? `. Plan: ${o.plan}` : ''}${o.plazo ? `. Plazo: ${o.plazo}` : ''}`).join('\n'));
  if (plan.proxima_reestratificacion) L.push(`Próxima reestratificación: ${plan.proxima_reestratificacion} (nivel ${plan.nivel_final}).`);
  if (plan.cobertura.length) L.push(`Medicación cubierta hasta: ${plan.cobertura.map((c) => `${c.grupo} ${c.ultimo_dia_cubierto}`).join('; ')}.`);
  return L.join('\n');
}
function hojaPaciente(plan) {
  const ob = plan.objetivos;
  return `<p>Hoy hemos revisado su tratamiento juntos. Esto es lo que hemos acordado:</p>
    ${ob.length ? `<ol class="acuerdos">${ob.map((o) => `<li><strong>${esc(o.objetivo)}</strong>${o.plan ? `<div>Cómo lo haremos: ${esc(o.plan)}</div>` : ''}${o.plazo ? `<div>Lo revisaremos antes del ${esc(o.plazo)}</div>` : ''}</li>`).join('')}</ol>` : '<p class="sub">(Escriba en «2 · Durante» los objetivos acordados para que aparezcan aquí.)</p>'}
    ${plan.cobertura.length ? `<p>Su medicación está cubierta hasta el <strong>${esc(plan.cobertura.map((c) => c.ultimo_dia_cubierto).sort()[0])}</strong>. Recuerde recogerla antes de esa fecha.</p>` : ''}
    <p>Si tiene dudas o algún problema con su tratamiento antes de la próxima visita, contacte con la consulta de Farmacia.</p>`;
}
function copiar() {
  const ta = $('textoHC');
  const ok = () => { $('avisoCopia').textContent = 'Texto copiado. Péguelo en la historia clínica.'; };
  const viejo = () => { ta.select(); try { document.execCommand('copy'); ok(); } catch { $('avisoCopia').textContent = 'No se pudo copiar: seleccione el texto y cópielo a mano.'; } };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(ok, viejo); else viejo();
}
function guardarSeguimiento(plan) {
  const seg = crearSeguimiento(ultimo.entrada, plan, registro);
  const blob = new Blob([JSON.stringify(seg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `seguimiento_${ultimo.entrada.modelo}_${ultimo.entrada.fecha_consulta}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener('click', (ev) => {
  const ir = ev.target.closest('[data-ir]');
  if (ir) { mostrarFase(ir.dataset.ir); $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (ev.target.closest('[data-imprimir]')) window.print();
});

pintarTablas();
