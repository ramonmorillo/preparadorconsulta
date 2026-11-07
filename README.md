# Preparador de consulta CMO

Herramienta docente para preparar la consulta de atención farmacéutica de un paciente externo con
un modelo CMO publicado. A partir de los datos del paciente genera una **hoja de consulta** con:

- perfil del paciente (cada dato con su cita literal),
- adherencia calculada (PDC) por código, sin IA,
- estado de la reestratificación según la periodicidad de su adaptación CMO,
- alertas y **puntos clave**, cada uno con una intervención **literal** del modelo CMO de su patología
  y el enlace a su herramienta del [hub de estratificación CMO](https://ramonmorillo.es/hub-estratificacionCMO/),
- marcado de cada punto (realizado / no realizado / no procede) y texto listo para la historia clínica.

> **Material docente. Pacientes FICTICIOS.** No introducir datos de pacientes reales sin seudonimizar
> ni sin la autorización de su centro. Herramienta de apoyo: no sustituye el juicio del farmacéutico.

## Cómo se usa (con Claude Code)

1. Abre esta carpeta en Claude Code.
2. Escribe `/preparar-consulta VIH-01` (pacientes de ejemplo: `VIH-01`, `VIH-02`, `RESP-01`, `RESP-02`).
3. Abre `trabajo/<ID>/Hoja_consulta_<ID>.html` en Chrome o Edge.

Requiere Node.js (para los dos scripts de `herramientas/`).

## Qué hay en el repositorio

| Carpeta | Contenido |
|---|---|
| `CLAUDE.md`, `.claude/` | La cadena de agentes (lector, detector, planificador, auditor) y el comando `/preparar-consulta` |
| `herramientas/` | `calcular.mjs` (PDC, plazos, cambios) y `generar_hoja.mjs` (hoja + comprobaciones duras) |
| `plantilla/` | Plantilla HTML de la hoja de consulta |
| `datos/biblioteca/` | Intervenciones y periodicidad de las 10 herramientas CMO del hub, extraídas literalmente de su código, con repositorio y versión de origen |
| `datos/reglas/` | Umbral de adherencia (PDC < 90 %) y traducción a meses de las periodicidades |
| `datos/pacientes/` | 4 pacientes ficticios (2 VIH, 2 respiratorio) |
| `ejemplos/` | Resultado completo de un paciente de ejemplo |

## Estado

Versión 0.1 (borrador para el taller de Santiago, 16/11/2026). Pendiente de validar por el autor:
traducción de periodicidades a meses, ventana del PDC (180 días), periodicidad de Esclerosis Múltiple
e Inmunomediadas, y los pacientes ficticios.

Las adaptaciones del modelo CMO son propiedad de la Sociedad Española de Farmacia Hospitalaria (SEFH).
Autor: Dr. Ramón Morillo Verdugo.
