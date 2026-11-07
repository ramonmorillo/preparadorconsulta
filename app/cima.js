// Consulta a la API REST pública de CIMA (AEMPS) desde el navegador.
// CIMA permite llamadas desde cualquier origen (Access-Control-Allow-Origin: *), comprobado el 07/11/2026.
// Solo se envía el texto buscado; nunca datos del paciente.

const BASE = 'https://cima.aemps.es/cima/rest';

async function pedir(url, { signal } = {}) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!r.ok) throw new Error(`CIMA respondió ${r.status}`);
  return r.json();
}

/** Busca por nombre comercial y por principio activo; devuelve medicamentos únicos, comercializados primero. */
export async function buscar(texto, opciones = {}) {
  const q = encodeURIComponent(String(texto || '').trim());
  if (q.length < 3) return [];
  const [a, b] = await Promise.allSettled([
    pedir(`${BASE}/medicamentos?nombre=${q}`, opciones),
    pedir(`${BASE}/medicamentos?practiv1=${q}`, opciones),
  ]);
  if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
  const vistos = new Map();
  for (const res of [a, b]) {
    if (res.status !== 'fulfilled') continue;
    for (const m of res.value.resultados || []) if (!vistos.has(m.nregistro)) vistos.set(m.nregistro, m);
  }
  return [...vistos.values()]
    .map((m) => ({ nregistro: m.nregistro, nombre: m.nombre, comerc: !!m.comerc, cpresc: m.cpresc || '', psum: !!m.psum }))
    .sort((x, y) => (y.comerc - x.comerc) || x.nombre.localeCompare(y.nombre, 'es'))
    .slice(0, 25);
}

/** Ficha de un medicamento: presentaciones, ATC, problemas de suministro y enlaces a ficha técnica y prospecto. */
export async function ficha(nregistro, opciones = {}) {
  const m = await pedir(`${BASE}/medicamento?nregistro=${encodeURIComponent(nregistro)}`, opciones);
  const atc4 = (m.atcs || []).find((a) => a.nivel === 4) || null;
  const docs = Object.fromEntries((m.docs || []).map((d) => [d.tipo, d.url]));
  return {
    nregistro: m.nregistro, nombre: m.nombre, cpresc: m.cpresc || '', psum: !!m.psum,
    pactivos: (m.principiosActivos || []).map((p) => p.nombre).join(', '),
    atc4: atc4 ? { codigo: atc4.codigo, nombre: atc4.nombre } : null,
    ficha_tecnica: docs[1] || null, prospecto: docs[2] || null,
    presentaciones: (m.presentaciones || []).map((p) => ({ cn: p.cn, nombre: p.nombre, comerc: !!p.comerc, psum: !!p.psum })),
  };
}
