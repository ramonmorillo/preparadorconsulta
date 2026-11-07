#!/usr/bin/env node
// Genera app/datos.js para la versión web a partir de datos/biblioteca, datos/reglas y datos/pacientes.
// No modifica ningún texto: copia literalmente intervenciones y periodicidades.
// Uso: node herramientas/generar_datos_web.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p), 'utf8'));

const ORDEN = ['vih', 'vhb-vhd', 'respiratorio', 'riesgo-cardiovascular', 'esclerosis-multiple', 'migrana', 'inmunomediadas', 'pediatria', 'oncohematologia', 'coagulopatias'];
const biblioteca = {};
for (const id of ORDEN) {
  const b = leer(`datos/biblioteca/${id}.json`);
  const niveles = {};
  for (const n of ['1', '2', '3']) {
    let lista;
    if (b.niveles && b.niveles[n] && b.niveles[n].intervenciones) {
      lista = b.niveles[n].intervenciones.map((i) => ({ categoria: i.categoria || null, texto: i.texto }));
    } else if (id === 'riesgo-cardiovascular') {
      // Catálogo con nivel mínimo por intervención: el nivel N incluye las de nivel >= N (acumulativo).
      lista = b.catalogo_completo.filter((c) => c.level >= Number(n)).map((c) => ({ categoria: c.category || null, texto: c.label }));
    } else if (id === 'inmunomediadas') {
      lista = b.catalogo_completo.filter((c) => (c.recommendedLevels || []).includes(Number(n))).map((c) => ({ categoria: c.category || null, texto: c.text }));
    } else lista = [];
    niveles[n] = {
      periodicidad: b.niveles && b.niveles[n] ? b.niveles[n].periodicidad || null : null,
      intervenciones: lista,
    };
  }
  biblioteca[id] = {
    id, herramienta: b.herramienta, url: b.url, tipo_catalogo: b.tipo_catalogo,
    origen: `${b.repositorio} @ ${b.commit} (${b.fecha_commit})`,
    reestratificar_ademas: b.reestratificar_ademas || null,
    aviso: b.aviso || b.nota_acumulacion || null,
    niveles,
  };
}

const reglas = leer('datos/reglas/reglas.json');

const ejemplos = {};
for (const id of fs.readdirSync(path.join(RAIZ, 'datos/pacientes')).sort()) {
  const d = `datos/pacientes/${id}/`;
  ejemplos[id] = {
    paciente: leer(d + 'paciente.json'),
    dispensaciones: fs.readFileSync(path.join(RAIZ, d + 'dispensaciones.csv'), 'utf8'),
    prescripcion: fs.readFileSync(path.join(RAIZ, d + 'prescripcion.csv'), 'utf8'),
    notas: fs.readFileSync(path.join(RAIZ, d + 'notas.md'), 'utf8'),
  };
}

const salida = `// Archivo generado por herramientas/generar_datos_web.mjs. No editar a mano.
export const BIBLIOTECA = ${JSON.stringify(biblioteca, null, 1)};
export const REGLAS = ${JSON.stringify(reglas, null, 1)};
export const EJEMPLOS = ${JSON.stringify(ejemplos, null, 1)};
`;
fs.mkdirSync(path.join(RAIZ, 'app'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'app/datos.js'), salida);
for (const id of ORDEN) console.log(id.padEnd(24), ['1', '2', '3'].map((n) => biblioteca[id].niveles[n].intervenciones.length).join(' / '));
