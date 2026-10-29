# MEMORY.md — Clon de Jira para Google Sites

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Última actualización: 2026-10-29

## Estado actual

- **Spec 001 (Tablero Kanban) completada al 100% y blindada contra orden de carga en Apps Script**:
  - `Code.gs`: Resolución perezosa en `_getService()` eliminando constantes top-level.
  - `TaskService.gs`: Resolución perezosa mediante `_getDomain()` eliminando `_TaskDomain` top-level.
  - `SheetRepository.gs`: Mantiene herencia estática `extends TaskRepository`. Orden obligatorio documentado en `README.md`.
  - Pruebas automatizadas: 94 pruebas pasando limpias al 100% en 5 suites (`npm test`).
  - `appsscript.json`: Sin tocar (se conserva intacto según aprobación del usuario).

## Decisiones técnicas tomadas

- Backend en Apps Script (V8) y persistencia en Google Sheets.
- **Orden de archivos en el editor de Apps Script**: En Apps Script el orden de ejecución inicial depende del orden de los archivos en el árbol del editor (reordenables manualmente):
  `1. Task.gs -> 2. TaskRepository.gs -> 3. SheetRepository.gs -> 4. TaskService.gs -> 5. Code.gs`.
- Propuesta opcional para Clasp documentada en `README.md`: `filePushOrder` en `.clasp.json`.
- Acceso web temporal: `ANYONE_ANONYMOUS` para versión 1.0; se exigirá autenticación en versiones futuras.

## Aprendizajes y errores a evitar

- En Apps Script V8, evitar inicializaciones `const X = ClaseGlobal` a nivel superior (fuera de funciones) porque provocan `ReferenceError` si el archivo se evalúa antes en el árbol del editor. Usar siempre resolución perezosa dentro de las funciones.
- Las herencias `class B extends A` no pueden ser perezosas: la clase base debe estar en un archivo ubicado antes en el panel del editor.
- Actualizaciones en Apps Script requieren siempre "Nueva versión" en Administrar implementaciones para refrescar la URL `/exec`.
- IDs de hojas en Script Properties (`TASKBOX_SPREADSHEET_ID`), nunca en el repositorio.

## Próximos pasos

- El usuario copiará los 5 archivos en el orden indicado a su editor de Apps Script y creará una Nueva Versión del despliegue.
