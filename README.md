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

### 1. Versión web (gratuita, para todos)

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
| `pruebas/` | `node --test pruebas/nucleo.test.mjs`: la versión web da el mismo cálculo que la versión con agentes |

Si cambia la biblioteca o las reglas, regenerar los datos de la web con `node herramientas/generar_datos_web.mjs`.

## Estado

Versión 1.0 (taller de Santiago, 16/11/2026). Pendiente de validar por el autor: traducción de
periodicidades a meses, ventana del PDC (180 días) y arrastre de sobrantes en cambios de régimen,
periodicidad de Esclerosis Múltiple e Inmunomediadas.

Las adaptaciones del modelo CMO son propiedad de la Sociedad Española de Farmacia Hospitalaria (SEFH).
Autor: Dr. Ramón Morillo Verdugo.
