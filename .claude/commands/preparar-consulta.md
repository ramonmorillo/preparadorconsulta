---
description: Prepara la consulta de atención farmacéutica de un paciente (cadena de agentes y scripts)
argument-hint: <ID_PACIENTE>
---

Vas a coordinar la preparación de la consulta del paciente **$ARGUMENTS**. Lee antes `CLAUDE.md`.

Tú eres el orquestador: no haces el trabajo de los agentes ni de los scripts. Los lanzas en orden,
compruebas que cada uno ha dejado su archivo y decides si se avanza. Antes de cada paso, explica al
usuario en una frase qué va a hacer; al terminar, resume en una línea qué ha producido.

Crea la carpeta `trabajo/$ARGUMENTS/` y una lista de tareas con los 6 pasos.
Si no existe `datos/pacientes/$ARGUMENTS/`, enumera los pacientes disponibles y detente.

## Pasos

1. **Lector** — lanza el subagente `lector` con el ID. Comprueba `00_perfil.json`.
2. **Calculadora** — ejecuta: `node herramientas/calcular.mjs datos/pacientes/$ARGUMENTS trabajo/$ARGUMENTS`
   Comprueba `01_calculo.json`. Si falla, enseña el error y detente: no se calcula «a mano».
3. **Detector** — lanza `detector`. Comprueba `02_alertas.json`.
4. **Planificador** — lanza `planificador`. Comprueba `03_plan.json`.
5. **Hoja** — ejecuta: `node herramientas/generar_hoja.mjs datos/pacientes/$ARGUMENTS trabajo/$ARGUMENTS`
   - Si el script rechaza la hoja (intervención no literal o punto sin alerta), relanza `planificador`
     indicándole los errores. **Máximo 2 reintentos**; si sigue fallando, detente y explica los errores.
6. **Auditor** — lanza `auditor`. Lee `04_auditoria.md`.

## Cierre

Responde con: el veredicto del auditor, la ruta de la hoja `.html` y de `04_auditoria.md`, el número de
alertas y de puntos clave, y los hallazgos ALTA o MEDIA si los hay. No pegues la hoja en el chat.
Recuerda que la hoja se abre en Chrome o Edge, se marca cada punto y el botón «Copiar» deja el texto
listo para pegar en la historia clínica.
