# Preparador de consulta CMO

Herramienta para preparar la consulta de atención farmacéutica de un paciente externo con un modelo CMO
publicado. Genera una **hoja de consulta** con:

- perfil del paciente y señales de la nota de consulta (con su cita literal),
- adherencia calculada (PDC de los últimos 180 días, alerta por debajo del 90 %),
- estado de la reestratificación según la periodicidad de su adaptación CMO,
- alertas y **puntos clave**, cada uno con una intervención **literal** del modelo CMO de su patología,
- marcado de cada punto (realizado / no realizado / no procede) y texto listo para la historia clínica.

> Herramienta de apoyo: no sustituye el juicio del farmacéutico. No introducir datos identificativos.

## Dos versiones

### 1. Versión web (gratuita, para todos) — v2.0

Acompaña toda la consulta:

- **Antes:** perfil, PDC, reestratificación según la adaptación CMO, alertas, puntos clave y, si se carga el archivo de la visita anterior, sus acuerdos.
- **Durante:** guion de entrevista motivacional del capítulo de Motivación de la adaptación CMO publicada de su patología (estructura, preguntas del propio documento, estrategias por problema, resistencias, objetivos y escalas, cada punto con su página), y registro de lo que ocurre.
- **Después:** próxima reestratificación, medicación cubierta hasta, seguimiento entre visitas que contempla su nivel, texto para la historia clínica, hoja de acuerdos para el paciente y archivo de seguimiento para la próxima consulta.
- **Medicamentos desde CIMA** (AEMPS): presentación, código nacional, grupo ATC, unidades por envase para calcular los días de suministro y alerta de problemas de suministro.


**https://ramonmorillo.es/preparadorconsulta/**

Funciona en el navegador, sin cuenta ni instalación, como el resto de herramientas del
[Hub de Estratificación CMO](https://ramonmorillo.es/hub-estratificacionCMO/). Todo se calcula en el navegador:
no se envía ni se guarda nada. Cinco módulos de reglas, sin IA generativa:
lector → calculadora → detector → planificador → auditor (`app/nucleo.js`).

### 2. Versión con agentes de IA (Claude Code)

La misma cadena con subagentes de Claude Code (`CLAUDE.md`, `.claude/`) y dos scripts deterministas
(`herramientas/calcular.mjs`, `herramientas/generar_hoja.mjs`). Requiere Claude Code y Node.js.
Se lanza con `/preparar-consulta VIH-01`.

## Contenido

| Carpeta | Contenido |
|---|---|
| `index.html`, `app/` | Versión web |
| `CLAUDE.md`, `.claude/`, `herramientas/`, `plantilla/` | Versión con agentes |
| `datos/biblioteca/` | Intervenciones y periodicidad de las 10 herramientas CMO del hub, extraídas literalmente de su código, con versión de origen |
| `datos/reglas/` | Umbral de adherencia y traducción a meses de las periodicidades |
| `datos/pacientes/` | 4 pacientes ficticios (2 VIH, 2 respiratorio) |
| `datos/guia/` | Guion de entrevista motivacional de cada adaptación CMO: estructura, preguntas, estrategias y escalas, con página y un fragmento literal («ancla») del documento |
| `pruebas/` | `node --test pruebas/nucleo.test.mjs` (13 pruebas) y `python3 pruebas/verificar_guias.py <textos>` (135 anclas comprobadas contra los documentos originales) |

Si cambia la biblioteca o las reglas, regenerar los datos de la web con `node herramientas/generar_datos_web.mjs`.

## Estado

Versión 2.0 (talleres del 16 y 18 de noviembre de 2026). Pendiente de validar por el autor: traducción de
periodicidades a meses, ventana del PDC (180 días) y arrastre de sobrantes en cambios de régimen,
tabla de estados motivacionales de migraña (reconstruida del documento en Markdown) y periodicidad de Inmunomediadas (indicada por el autor; sin adaptación publicada).

Las adaptaciones del modelo CMO son propiedad de la Sociedad Española de Farmacia Hospitalaria (SEFH).
Autor: Dr. Ramón Morillo Verdugo.
