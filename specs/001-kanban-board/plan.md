# Plan Técnico 001: Tablero Kanban (Clon de Jira para Google Sites)

## 1. Resumen de la Solución Técnica

Este plan define la arquitectura e implementación técnica para el Tablero Kanban (Spec 001) sobre Google Apps Script (V8) y un frontend web autocontenido para incrustación en Google Sites.

La solución implementa una **Arquitectura en Capas desacoplada con Inversión de Dependencias (DIP)**:
1. **Capa de Dominio (`Task.gs`)**: Entidad de negocio pura, validaciones de título, estados (`TODO`, `IN_PROGRESS`, `DONE`), prioridades (`LOW`, `MEDIUM`, `HIGH`), serie Fibonacci para estimaciones (`1, 2, 3, 5, 8, 13`), y reglas temporales de restauración (30 días naturales).
2. **Capa de Contrato (`TaskRepository.gs`)**: Define la interfaz abstracta `TaskRepository` mediante JSDoc `@interface` que desacopla el almacenamiento de los casos de uso.
3. **Capa de Aplicación / Casos de Uso (`TaskService.gs`)**: Orquesta las operaciones de negocio (`getBoardTasks`, `createTask`, `updateTaskStatus`, `updateTask`, `softDeleteTask`, `restoreTask`, `getArchivedTasks`). Emplea `LockService` para garantizar consistencia y unicidad en la generación de IDs autoincrementales `TASK-N`.
4. **Capa de Infraestructura / Persistencia (`SheetRepository.gs`)**: Implementa `TaskRepository` operando sobre Google Sheets mediante `SpreadsheetApp`. Gestiona mapeo fila-objeto, encabezados canónicos y Script Properties (`TASKBOX_SPREADSHEET_ID`).
5. **Capa de Entrega HTTP (`Code.gs`)**: Exposición como Web App vía `doGet` y `doPost`. Resuelve peticiones enviadas como `Content-Type: text/plain` (para evitar preflight CORS en Google Sites) y despacha respuestas serializadas en JSON mediante `ContentService`.
6. **Capa de Presentación (`frontend-embeds/kanban.html`)**: Tablero autocontenido (HTML, CSS y JavaScript Vanilla sin dependencias pesadas). Soporta Drag & Drop con API HTML5 nativa + botones accesibles de transición directa, modal de creación/edición, indicador de Story Points e interfaz de papelera temporal.

---

## 2. Diagrama de Arquitectura y Flujo de Datos

```
+---------------------------------------------------------------------------------+
|                                 GOOGLE SITES                                    |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |                       frontend-embeds/kanban.html                       |   |
|   |   - Tablero Kanban (TODO / IN_PROGRESS / DONE)                          |   |
|   |   - Drag & Drop nativo + Botones alternativos de transición             |   |
|   |   - Modal de tarea (Story points Fibonacci 1..13) + Vista de papelera   |   |
|   +-------------------------------------------------------------------------+   |
|                                       |                                         |
|                  fetch POST (Content-Type: text/plain)                          |
+---------------------------------------|-----------------------------------------+
                                        v
+---------------------------------------------------------------------------------+
|                       GOOGLE APPS SCRIPT WEB APP (/exec)                        |
|                                                                                 |
|   [ Code.gs ]                                                                   |
|       - Punto de entrada doPost(e) / doGet(e)                                   |
|       - Enrutamiento por acción (list, create, move, update, delete, restore)   |
|       - Serialización JSON con ContentService (MimeType.JSON)                   |
|                                       |                                         |
|                                       v                                         |
|   [ TaskService.gs ] (Capa de Aplicación)                                       |
|       - Orquestación de casos de uso                                            |
|       - Bloqueo de concurrencia (LockService.getScriptLock)                     |
|       - Generación atómica de IDs TASK-N                                        |
|       - Validación de ventana de 30 días para restauración                      |
|                               |                               |                 |
|                               v                               v                 |
|             [ Task.gs ] (Dominio)             [ TaskRepository.gs ] (Contrato)  |
|             - Validaciones de campos                - @interface TaskRepository |
|             - Fibonacci [1,2,3,5,8,13]                        ^                 |
|                                                               |                 |
|                                                               v                 |
|                                              [ SheetRepository.gs ]             |
|                                              - Implementación concreta          |
|                                              - Acceso único a SpreadsheetApp    |
|                                                               |                 |
+---------------------------------------------------------------|-----------------+
                                                                v
                                                 +------------------------------+
                                                 |         GOOGLE SHEETS        |
                                                 | Hoja canónica: 'Tasks'       |
                                                 | ID obtenido de ScriptProps   |
                                                 +------------------------------+
```

---

## 3. Especificación Técnica por Componente

### 3.1. Dominio: `apps-script/Task.gs`
- **Estructura del Objeto `Task`**:
  - `id`: `string` (`TASK-1`, `TASK-2`, ...)
  - `title`: `string` (1..120 caracteres, trim)
  - `description`: `string` (máx. 2000 caracteres, opcional)
  - `status`: `'TODO' | 'IN_PROGRESS' | 'DONE'`
  - `priority`: `'LOW' | 'MEDIUM' | 'HIGH'`
  - `storyPoints`: `1 | 2 | 3 | 5 | 8 | 13 | null`
  - `assignee`: `string` (máx. 80 caracteres, opcional)
  - `isDeleted`: `boolean` (default `false`)
  - `deletedAt`: `string | null` (ISO 8601)
  - `createdAt`: `string` (ISO 8601 UTC)
  - `updatedAt`: `string` (ISO 8601 UTC)
- **Funciones de Dominio**:
  - `validateTaskPayload(data, isUpdate)`: Valida campos obligatorios, enum de prioridades, estados y Fibonacci.
  - `isRestorable(deletedAtStr, now)`: Evalúa si una tarea con borrado lógico se encuentra dentro de los 30 días naturales.
  - `FIBONACCI_POINTS`: Constante congelada `[1, 2, 3, 5, 8, 13]`.

### 3.2. Contrato de Repositorio: `apps-script/TaskRepository.gs`
Define el contrato abstracto mediante JSDoc:
- `findAll(options)`: Retorna lista de tareas (filtro por `isDeleted`).
- `findById(id)`: Retorna la tarea o `null`.
- `save(task)`: Inserta una nueva tarea.
- `update(task)`: Actualiza una tarea existente.
- `getNextId()`: Retorna el siguiente identificador `TASK-N` basado en el registro más alto.

### 3.3. Casos de Uso: `apps-script/TaskService.gs`
- **Inyección de Dependencias**: El constructor o fábrica recibe una instancia que cumple `TaskRepository`.
- **Garantías de Concurrencia**:
  - `createTask(payload)`: Adquiere script lock (`LockService.getScriptLock().waitLock(15000)`), obtiene `getNextId()`, valida y almacena.
  - `restoreTask(id)`: Adquiere lock, verifica que `isDeleted === true`, evalúa regla de 30 días (`isRestorable`). Si es válida, resetea `isDeleted: false` y `deletedAt: null`; de lo contrario, arroja error controlado `RESTORATION_PERIOD_EXPIRED`.
  - `updateTaskStatus(id, newStatus)`: Valida la transición y actualiza `updatedAt`.

### 3.4. Infraestructura: `apps-script/SheetRepository.gs`
- **Configuración**: Lee el ID de la hoja desde `PropertiesService.getScriptProperties().getProperty('TASKBOX_SPREADSHEET_ID')`. Si no existe, lanza un error con instrucción de configuración.
- **Estructura de Columnas en Google Sheets** (Fila 1 = Encabezados):
  1. `ID`
  2. `Title`
  3. `Description`
  4. `Status`
  5. `Priority`
  6. `StoryPoints`
  7. `Assignee`
  8. `IsDeleted`
  9. `DeletedAt`
  10. `CreatedAt`
  11. `UpdatedAt`
- **Conversión Bidireccional**:
  - `rowToTask(row)`: Mapea celdas a objeto `Task` con tipado estricto (booleanos, números, fechas ISO).
  - `taskToRow(task)`: Convierte entidad a array de celdas para `appendRow` o `setValues`.

### 3.5. Capa de Entrega: `apps-script/Code.gs`
- **Protocolo de Comunicación**:
  - `doGet(e)`: Diagnóstico y healthcheck de la API (`{ status: "ok", service: "Taskbox API" }`).
  - `doPost(e)`: Procesa el cuerpo de la petición.
    - Soporta parseo de `e.postData.contents` aun cuando venga como `text/plain` desde el frontend.
    - Acciones soportadas vía `payload.action`:
      - `getBoardTasks`: Retorna tareas activas (`isDeleted = false`).
      - `getArchivedTasks`: Retorna tareas en papelera con cálculo de días restantes para restauración.
      - `createTask`: Crea una nueva tarea.
      - `updateTaskStatus`: Mueve tarea entre columnas.
      - `updateTask`: Edita campos de la tarea.
      - `deleteTask`: Borrado lógico (`isDeleted = true`).
      - `restoreTask`: Restaura tarea si está dentro de la ventana de 30 días.
- **Formato de Respuesta Estándar**:
  ```json
  { "success": true, "data": { ... } }
  { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
  ```

### 3.6. Frontend Embed: `frontend-embeds/kanban.html`
- **Tecnologías**: HTML5 semántico, CSS3 moderno (flexbox/grid) con variables de diseño inspiradas en Jira, y Vanilla JS (cero frameworks).
- **Módulos Internos**:
  - **Tablero Kanban**: Columnas `TODO`, `IN_PROGRESS`, `DONE` con Drag & Drop nativo (`dragstart`, `dragover`, `drop`) y botones alternativos de acción en la tarjeta (`[→ En Progreso]`, `[→ Completado]`).
  - **Insignias Visuales**: Indicadores de prioridad con código de color y badge distintivo para Story Points (Fibonacci).
  - **Modal de Tarea**: Formulario para creación y edición con selector desplegable de Story Points (`1, 2, 3, 5, 8, 13`).
  - **Pestaña / Vista de Papelera**: Lista de tareas eliminadas con contador visual de "Días restantes para restaurar" y botón de restauración.
  - **Capa API Client**: Función `callApi(action, payload)` que realiza `fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, ...payload }) })`.

---

## 4. Estrategia de Pruebas Automatizadas

Siguiendo el Principio 4 de la Constitución, se implementarán pruebas unitarias exhaustivas con **Jest** en la carpeta `tests/`:

1. **`tests/Task.test.js`**:
   - Pruebas tabulares (`test.each`) para validación de títulos, longitud máxima, estados permitidos y serie Fibonacci.
   - Casos de prueba para el cálculo de la ventana de restauración de 30 días (fechas dentro de los 30 días vs. fecha límite de 31+ días).
2. **`tests/TaskService.test.js`**:
   - Pruebas con un repositorio fake en memoria (`InMemoryTaskRepository`) que implementa `TaskRepository`.
   - Verificación de flujos de negocio: creación de tareas, transición de columnas, rechazo de restauración tras 30 días.
   - Aislamiento total de `SpreadsheetApp`.
3. **`tests/SheetRepository.test.js`**:
   - Pruebas de serialización fila-a-objeto y objeto-a-fila mockeando `SpreadsheetApp`.
4. **`tests/Code.test.js`**:
   - Verificación de enrutamiento y serialización de respuestas estándar en `doPost`.

---

## 5. Matriz de Trazabilidad de Requerimientos

| Requerimiento (Spec 001) | Componente Técnico | Verificación / Prueba |
|---|---|---|
| **RF-01** (Visualización tablero) | `kanban.html`, `Code.gs`, `TaskService.gs` | `tests/TaskService.test.js` (filtrado de activas) |
| **RF-02** (Creación con ID `TASK-N` y Fibonacci) | `Task.gs`, `TaskService.gs`, `SheetRepository.gs` | `tests/Task.test.js`, `tests/TaskService.test.js` |
| **RF-03** (Transición Drag & Drop + Botones) | `kanban.html`, `TaskService.gs` | `tests/TaskService.test.js` (cambio de status) |
| **RF-04** (Edición de tarea) | `Task.gs`, `TaskService.gs` | `tests/TaskService.test.js` |
| **RF-05** (Borrado lógico y 30 días restauración) | `Task.gs`, `TaskService.gs`, `kanban.html` | `tests/Task.test.js` (ventana 30 días) |
| **RNF-01** (Compatibilidad Google Sites CORS) | `kanban.html` (`fetch text/plain`), `Code.gs` | Inspección de headers y prueba de entrega |
| **RNF-02** (SOLID DIP persistencia) | `TaskRepository.gs`, `SheetRepository.gs` | Aislamiento verificado en pruebas unitarias |
| **RNF-03** (Concurrencia `LockService`) | `TaskService.gs` | Verificación de llamadas `waitLock` / `releaseLock` |

