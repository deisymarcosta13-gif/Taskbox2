# Desglose de Tareas: Spec 001 - Tablero Kanban

Este documento desglosa la implementación de la **Spec 001** en fases y tareas atómicas, ordenadas secuencialmente bajo Spec-Driven Development (SDD). Cada tarea debe completarse y validarse con pruebas antes de avanzar a la siguiente.

---

## Fase 1: Configuración del Entorno de Pruebas y Tipos Base

- [x] **TASK-01.1: Configurar entorno de pruebas unitarias (`package.json`)**
  - Configurar Jest y scripts de ejecución (`npm test`, `npm test:watch`).
  - Configurar soporte para pruebas de archivos Apps Script sin transformar módulos (`NODE_ENV=test`).
  - *Criterio de éxito*: `npm test` se ejecuta correctamente en el entorno de desarrollo.

- [x] **TASK-01.2: Definir el Contrato del Repositorio (`apps-script/TaskRepository.gs`)**
  - Documentar la interfaz abstracta `TaskRepository` con JSDoc (`@interface`).
  - Definir las firmas de métodos: `findAll(options)`, `findById(id)`, `save(task)`, `update(task)` y `getNextId()`.
  - Exportar para entorno de pruebas (`if (typeof module !== 'undefined') module.exports = ...`).
  - *Criterio de éxito*: Contrato tipado sin dependencias de infraestructura ni de `SpreadsheetApp`.

---

## Fase 2: Capa de Dominio y Validaciones (`Task.gs`)

- [x] **TASK-02.1: Implementar entidad y validaciones de dominio (`apps-script/Task.gs`)**
  - Definir constantes de dominio: `TASK_STATUS` (`TODO`, `IN_PROGRESS`, `DONE`), `TASK_PRIORITY` (`LOW`, `MEDIUM`, `HIGH`) y `FIBONACCI_POINTS` (`[1, 2, 3, 5, 8, 13]`).
  - Implementar función de validación `validateTaskPayload(data, isUpdate)`:
    - `title`: obligatorio, 1 a 120 caracteres tras sanitizado (`trim()`).
    - `description`: opcional, máx. 2000 caracteres.
    - `status`: miembro válido del enum.
    - `priority`: miembro válido del enum.
    - `storyPoints`: `null` o valor perteneciente a la serie Fibonacci (`1, 2, 3, 5, 8, 13`).
  - Implementar función de cálculo de caducidad `isRestorable(deletedAt, maxDays = 30)`:
    - Retorna `true` si la diferencia en milisegundos respecto a la fecha actual es menor o igual a 30 días naturales ($30 \times 24 \times 60 \times 60 \times 1000$ ms).
  - Implementar fábrica `createTaskEntity(payload, nextId)` con marcas temporales UTC ISO 8601 (`createdAt`, `updatedAt`, `isDeleted: false`, `deletedAt: null`).
  - Exportar para pruebas.
  - *Criterio de éxito*: Todas las funciones documentadas con JSDoc y sin dependencias externas.

- [x] **TASK-02.2: Crear pruebas unitarias de dominio (`tests/Task.test.js`)**
  - Pruebas tabulares con `test.each` para validación de títulos válidos e inválidos (vacíos, espacios, >120 caracteres).
  - Pruebas para valores de Fibonacci válidos (`1, 2, 3, 5, 8, 13`) e inválidos (`0, 4, 7, 21, -1, 'cinco'`).
  - Pruebas de ventana de restauración: tareas eliminadas hace 1, 15, 29 días (restaurables) vs. 30 días y 1 segundo, 31, 60 días (expiradas).
  - *Criterio de éxito*: 100% de pruebas pasando en `tests/Task.test.js`.

---

## Fase 3: Capa de Casos de Uso y Orquestación (`TaskService.gs`)

- [x] **TASK-03.1: Implementar repositorio fake en memoria para pruebas (`tests/fakes/InMemoryTaskRepository.js`)**
  - Crear clase/objeto que implemente el contrato `TaskRepository` almacenando tareas en memoria.
  - Implementar generación incremental simulada de `TASK-N`.
  - *Criterio de éxito*: Permite probar `TaskService` en aislamiento completo de Google Sheets.

- [x] **TASK-03.2: Implementar lógica de negocio en `apps-script/TaskService.gs`**
  - Inyección de dependencias: constructor/fábrica que recibe `TaskRepository` y opcionalmente `lockProvider`.
  - Implementar `getBoardTasks()`: obtiene y retorna solo tareas activas (`isDeleted === false`).
  - Implementar `getArchivedTasks()`: obtiene tareas eliminadas e inyecta propiedad calculada `isRestorable` y `daysRemaining`.
  - Implementar `createTask(payload)`:
    - Adquirir `LockService.getScriptLock().waitLock(15000)`.
    - Generar el siguiente `TASK-N` atómicamente.
    - Validar entidad y persistir mediante `repository.save()`.
    - Liberar lock en bloque `finally`.
  - Implementar `updateTaskStatus(id, newStatus)`:
    - Validar existencia y transición de estado permitida.
    - Actualizar `status` y marca temporal `updatedAt`.
  - Implementar `updateTask(id, payload)`:
    - Actualizar campos editables respetando inmutabilidad de `id` y `createdAt`.
  - Implementar `softDeleteTask(id)`:
    - Marcar `isDeleted = true`, `deletedAt = new Date().toISOString()`.
  - Implementar `restoreTask(id)`:
    - Verificar que la tarea esté eliminada y dentro de la ventana de 30 días mediante `isRestorable`.
    - Arrojar error controlado `RESTORATION_PERIOD_EXPIRED` si superó los 30 días.
    - Restaurar: `isDeleted = false`, `deletedAt = null`, `updatedAt = now`.
  - Exportar para pruebas.
  - *Criterio de éxito*: Lógica desacoplada con control estricto de concurrencia y validaciones de negocio.

- [x] **TASK-03.3: Crear pruebas unitarias de servicio (`tests/TaskService.test.js`)**
  - Pruebas de creación de tarea y asignación secuencial `TASK-1`, `TASK-2`.
  - Pruebas de movimiento entre columnas (`TODO` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `DONE`).
  - Pruebas de borrado lógico y exclusión del tablero principal.
  - Pruebas de restauración exitosa dentro de los 30 días y rechazo post-30 días.
  - *Criterio de éxito*: Suite de pruebas completa pasando con `InMemoryTaskRepository`.

---

## Fase 4: Capa de Persistencia (`SheetRepository.gs`)

- [x] **TASK-04.1: Implementar adaptador de Google Sheets (`apps-script/SheetRepository.gs`)**
  - Obtener Spreadsheet ID desde `PropertiesService.getScriptProperties().getProperty('TASKBOX_SPREADSHEET_ID')`.
  - Crear o inicializar hoja 'Tasks' con cabeceras estándar si no existe:
    `['ID', 'Title', 'Description', 'Status', 'Priority', 'StoryPoints', 'Assignee', 'IsDeleted', 'DeletedAt', 'CreatedAt', 'UpdatedAt']`.
  - Implementar `rowToTask(row)` y `taskToRow(task)`.
  - Implementar métodos del contrato: `findAll`, `findById`, `save`, `update`, `getNextId`.
  - *Criterio de éxito*: Cumple estrictamente la interfaz `TaskRepository`.

- [x] **TASK-04.2: Crear pruebas unitarias para el repositorio de hojas (`tests/SheetRepository.test.js`)**
  - Mockear `SpreadsheetApp` y `PropertiesService`.
  - Probar conversión bidireccional fila $\leftrightarrow$ objeto `Task`.
  - Probar cálculo de `getNextId` con hoja vacía (`TASK-1`) y con registros previos (`TASK-15` $\rightarrow$ `TASK-16`).
  - *Criterio de éxito*: Pruebas de integración simulada pasando al 100%.

---

## Fase 5: Capa de Entrega Web App (`Code.gs`)

- [x] **TASK-05.1: Implementar enrutador y respuestas HTTP (`apps-script/Code.gs`)**
  - Implementar `doGet(e)`: Retorna información de estado y versión del servicio en JSON.
  - Implementar `doPost(e)`:
    - Extraer contenido desde `e.postData.contents` (manejando `Content-Type: text/plain`).
    - Enrutar acciones: `getBoardTasks`, `getArchivedTasks`, `createTask`, `updateTaskStatus`, `updateTask`, `deleteTask`, `restoreTask`.
    - Envolver respuestas exitosas en `{ success: true, data: ... }`.
    - Capturar errores controlados en `{ success: false, error: { code, message } }`.
    - Responder con `ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON)`.
  - *Criterio de éxito*: Compatibilidad total con peticiones simples CORS de Google Sites.

- [x] **TASK-05.2: Crear pruebas para la entrega HTTP (`tests/Code.test.js`)**
  - Pruebas de parseo de payloads enviados como texto plano.
  - Verificación del formato de salida JSON y manejo de excepciones controladas.
  - *Criterio de éxito*: Pruebas del despachador ejecutadas satisfactoriamente.

---

## Fase 6: Frontend Embed para Google Sites (`frontend-embeds/kanban.html`)

- [x] **TASK-06.1: Maquetación y estilos del Tablero Kanban (`frontend-embeds/kanban.html`)**
  - Estructura HTML5 y CSS responsivo moderno inspirado en Jira (paleta neutra, tarjetas elevadas, badges de prioridad).
  - 3 Columnas: Por Hacer (`TODO`), En Progreso (`IN_PROGRESS`), Completado (`DONE`).
  - Indicador numérico distintivo para Story Points (serie Fibonacci).
  - Botones de acción rápida en cada tarjeta para transición accesible inmediata.
  - Modal para creación y edición de tareas con selector de Fibonacci (`1, 2, 3, 5, 8, 13`).
  - Panel / pestaña de papelera para visualizar tareas eliminadas con contador de días restantes y botón de restaurar.

- [x] **TASK-06.2: Lógica de interacción en JavaScript puro**
  - Implementar Drag & Drop nativo con eventos HTML5 (`dragstart`, `dragover`, `drop`).
  - Implementar transiciones mediante clics de botón alternativo.
  - Implementar cliente API `callApi(action, data)` con `fetch(..., { method: 'POST', body: JSON.stringify(...) })`.
  - Feedback visual de carga (spinners/skeletons) y notificaciones de éxito/error tipo toast.
  - *Criterio de éxito*: Tablero 100% funcional dentro de un iframe sin dependencias externas ni cookies de terceros.

---

## Fase 7: Validación Integral y Documentación

- [x] **TASK-07.1: Ejecución completa de pruebas automatizadas**
  - Ejecutar `npm test` verificando que pasen todas las suites (`Task`, `TaskService`, `SheetRepository`, `Code`).
- [x] **TASK-07.2: Actualización de documentación y cierre**
  - Actualizar `MEMORY.md` reflejando la culminación de la especificación 001.
  - Verificar coherencia de JSDoc en todo el código fuente.

