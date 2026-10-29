# AGENTS.md — Clon de Jira para Google Sites

Guía operativa obligatoria para agentes en el desarrollo bajo Spec-Driven Development (SDD).

## Stack y Estructura

- **Backend**: Google Apps Script (V8) desplegado como aplicación web, sincronizado con `clasp`.
    - `apps-script/Code.gs`: Entrega. Puntos de entrada `doGet`/`doPost`, enrutamiento y respuestas JSON (`ContentService`).
    - `apps-script/TaskService.gs`: Casos de uso y orquestación.
    - `apps-script/SheetRepository.gs`: Infraestructura. Único archivo que usa `SpreadsheetApp`.
    - `apps-script/appsscript.json`: Manifiesto (runtime, zona horaria, acceso web, scopes OAuth).
    - `apps-script/Task.gs`: Entidad de dominio, enumeraciones, constantes y validaciones.
    - `apps-script/TaskRepository.gs`: Contrato abstracto del repositorio con JSDoc `@interface`.
- **Frontend**: HTML, CSS y JS puro y autocontenido en `frontend-embeds/` para incrustar en Google Sites; consume el backend solo vía HTTP (`fetch` a la URL `/exec`).
- **Agentes**: `.antigravity/agents/` (`coordinator`, `planner`, `implementer`, `reviewer`). Las reglas viven en este archivo y en la constitución; los agentes las referencian, no las duplican.
- **Constitución**: `docs/constitution.md`. Léela al inicio de cada tarea.
- **Especificaciones**: `specs/<NNN-nombre>/` (`spec.md`, `plan.md`, `tasks.md`).
- **Alcance global**: todos los `.gs` comparten un único ámbito global. No ejecutes código en el nivel superior de un archivo ni repitas nombres entre archivos.

## Comandos

- **Sincronizar al proyecto Apps Script**: `clasp push`
- **Traer cambios remotos**: `clasp pull`
- **Ejecutar pruebas**: `npm test`
- **Abrir el proyecto en el editor web**: `clasp open`

## Límites

### 🚨 Obligatorio: Documentación Técnica de Máxima Prioridad (Innegociable)
- **Documentación exhaustiva con JSDoc es obligatoria en todo archivo, función, clase y estructura pública**:
  - **Encabezado `@file`**: propósito arquitectónico, diseño SOLID aplicado (ej. SRP, DIP) y restricciones del módulo.
  - **Bloque JSDoc completo en cada función o método**:
    - Propósito explícito y claro de la función.
    - `@param` con tipos precisos y descripción de cada argumento.
    - `@return` con tipo y detalle de lo retornado.
    - `@throws` con los códigos de error controlados (`err.code`) y las condiciones exactas de falla.
    - Garantías de concurrencia e hilos/bloqueos (por ejemplo, el uso de `LockService`, tiempos de espera en ms y manejo en bloques `finally`).
  - Ninguna tarea se considerará aprobada ni terminada si falta documentación JSDoc rigurosa en cualquier función o archivo público.

### ✅ Siempre
- Leer `docs/constitution.md` y `MEMORY.md` al iniciar cualquier tarea.
- Verificar que exista la spec activa en `specs/<NNN-nombre>/` (`spec.md`, `plan.md`, `tasks.md`). Si no existe, detente y pídela; no la inventes.
- Presentar el plan de 3 puntos (archivos y cambios; casos límite y decisiones por confirmar; actualizaciones de `AGENTS.md` y `MEMORY.md`) y esperar aprobación explícita antes de escribir código.
- Código, identificadores y comentarios técnicos en inglés; UI, mensajes visibles y documentación en español.
- Incluir pruebas con cada cambio y ejecutarlas con `npm test` antes de dar la tarea por terminada.
- Actualizar `MEMORY.md` al finalizar (máximo ~50 líneas).

### ⚠️ Pregunta antes
- Modificar el contrato del repositorio (`TaskRepository`) o las firmas públicas de `TaskService`.
- Cambiar `appsscript.json` (scopes OAuth, `webapp.access`, `executeAs`) o ejecutar un despliegue.
- Añadir dependencias o modificar `package.json`.
- Cambios arquitectónicos estructurales o reorganización de carpetas.

### 🚫 Nunca
- Escribir código sin plan aprobado. Excepción: cambios triviales (typos en comentarios o documentación, formato sin alterar lógica, notas menores en `MEMORY.md`), declarándolos antes como triviales para permitir el veto.
- Usar `SpreadsheetApp` fuera de `SheetRepository.gs`: la lógica de negocio depende solo del contrato del repositorio.
- Escribir en la hoja de cálculo real desde las pruebas.
- Dejar IDs de hojas, claves o credenciales en el código o en el repositorio; usa *Script Properties*. No versiones credenciales de `clasp`.
- Reescribir la constitución sin aprobación. Si una regla suya cita Go o Excel, aplica su equivalente en Apps Script/JS y propón la enmienda.

## Integración con Google Sites

- Apps Script no permite fijar cabeceras CORS personalizadas. Desde el frontend usa peticiones simples (POST con `Content-Type: text/plain`) y responde siempre JSON con `ContentService`.
- El frontend debe funcionar dentro de un iframe de Google Sites sin depender de cookies de terceros.

## Pruebas

- **Ubicación**: `tests/`, un archivo `*.test.js` por archivo `.gs` probado.
- **Patrón**: pruebas tabulares con `test.each` y casos nombrados (`name`, `input`, `expected`, `expectErr`).
- **Aislamiento**: en pruebas de `TaskService`, usa fakes en memoria que cumplan el contrato del repositorio. En pruebas de `SheetRepository`, mockea `SpreadsheetApp`.
- **Exportación**: Los `.gs` no son módulos; exporta para pruebas con `if (typeof module !== 'undefined') module.exports = { ... };`.
