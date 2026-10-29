# Especificación 001: Tablero Kanban (Clon de Jira para Google Sites)

## 1. Visión General y Propósito

El objetivo de esta especificación es definir el sistema de tablero Kanban embebible para Google Sites, inspirado en la experiencia de Jira. El sistema permite gestionar tareas a lo largo de un flujo de trabajo típico mediante una interfaz visual responsiva integrada por iframe, respaldada por Google Apps Script y persistida en Google Sheets bajo una arquitectura desacoplada y mantenible.

---

## 2. Modelo de Datos (`Task`)

Cada tarea en el sistema cuenta con los siguientes campos y restricciones:

| Campo | Tipo | Obligatorio | Valores / Restricciones | Descripción |
|---|---|---|---|---|
| `id` | String | Sí | Formato `TASK-N` (ej. `TASK-1`, `TASK-2`), autoincremental y único. | Identificador único de negocio de la tarea. |
| `title` | String | Sí | Longitud entre 1 y 120 caracteres. Sin espacios en blanco vacíos. | Resumen o título de la tarea. |
| `description` | String | No | Texto libre (máximo 2000 caracteres). | Descripción detallada de los requisitos o contexto. |
| `status` | Enum | Sí | `TODO`, `IN_PROGRESS`, `DONE`. Por defecto: `TODO`. | Columna actual del flujo Kanban. |
| `priority` | Enum | Sí | `LOW`, `MEDIUM`, `HIGH`. Por defecto: `MEDIUM`. | Prioridad asignada a la tarea. |
| `storyPoints` | Number / Integer | No | Valores de la serie Fibonacci: `1`, `2`, `3`, `5`, `8`, `13` (o `null`). | Estimación de esfuerzo o tiempo en story points. |
| `assignee` | String | No | Cadena de texto (nombre o correo, máx. 80 caracteres). | Responsable asignado para la tarea. |
| `isDeleted` | Boolean | Sí | `true` o `false`. Por defecto: `false`. | Indicador de borrado lógico (papelera). |
| `deletedAt` | String (ISO 8601) | No | Fecha/hora ISO cuando `isDeleted` es `true`; `null` en caso contrario. | Marca temporal de eliminación para control de caducidad. |
| `createdAt` | String (ISO 8601) | Sí | Formato UTC ISO 8601 generado en el servidor al crear. | Marca temporal de creación. |
| `updatedAt` | String (ISO 8601) | Sí | Formato UTC ISO 8601 actualizado en cada modificación. | Marca temporal de última edición. |

---

## 3. Requerimientos Funcionales

### RF-01: Visualización del Tablero Kanban
- El sistema debe renderizar tres columnas visuales: **Por Hacer (`TODO`)**, **En Progreso (`IN_PROGRESS`)** y **Completado (`DONE`)**.
- Las tarjetas deben mostrar: `id`, `title`, `priority` (con indicador visual), `storyPoints` (insignia numérica), `assignee` y controles de transición rápida.
- Las tareas marcadas con borrado lógico (`isDeleted: true`) no deben aparecer en el tablero principal.

### RF-02: Creación de Tareas
- Permite registrar una nueva tarea enviando `title`, `description` (opcional), `priority` (opcional, default `MEDIUM`), `storyPoints` (opcional, serie Fibonacci 1..13) y `assignee` (opcional).
- El sistema asigna el siguiente `id` autoincremental disponible con formato `TASK-N` de forma atómica garantizando unicidad.
- El estado inicial de toda tarea creada es siempre `TODO`.

### RF-03: Transición de Estados (Movimiento Kanban)
- El usuario puede mover tarjetas entre columnas mediante **arrastrar y soltar (Drag & Drop)** nativo en navegadores de escritorio.
- El usuario dispone adicionalmente de **botones de acción rápida / menú contextual** en cada tarjeta para transferirla directamente a las columnas adyacentes, garantizando accesibilidad y compatibilidad en dispositivos táctiles o dentro de iframes restrictivos de Google Sites.
- Al cambiar de columna, el estado se actualiza en el backend (`status`) junto con la fecha `updatedAt`.

### RF-04: Edición de Tareas
- Permite modificar el título, descripción, prioridad, story points y responsable de una tarea existente.
- No se permite editar el `id`, ni la fecha de creación `createdAt`.

### RF-05: Borrado Lógico y Ventana de Restauración
- Al eliminar una tarea, no se borra la fila física de Google Sheets; se marca `isDeleted = true` y se registra la marca de tiempo `deletedAt = now()`.
- **Ventana de restauración**: Las tareas en estado de borrado lógico cuentan con un periodo máximo de restauración de **30 días naturales**.
- Durante este periodo de 30 días, las tareas pueden ser consultadas desde una vista de papelera/archivo y restauradas a su estado original (`isDeleted = false`, `deletedAt = null`).
- Transcurrido el límite de 30 días naturales desde `deletedAt`, la tarea se considera permanentemente caducada y no elegible para restauración (sujeta a purga o archivado definitivo).

---

## 4. Requerimientos No Funcionales

### RNF-01: Integración y Compatibilidad con Google Sites
- La interfaz debe funcionar íntegramente dentro de un iframe de Google Sites sin depender de almacenamiento con cookies de terceros.
- Todas las peticiones HTTP desde el frontend hacia la URL `/exec` de Apps Script deben ser peticiones simples (POST con `Content-Type: text/plain;charset=utf-8`) procesando respuestas JSON para evitar bloqueos de política CORS.

### RNF-02: Desacoplamiento de Persistencia (Arquitectura Limpia)
- La lógica de negocio (`Task.gs`, `TaskService.gs`) depende exclusivamente de la abstracción contractual `TaskRepository` y desconoce la existencia de `SpreadsheetApp`.
- La persistencia concreta reside en `SheetRepository.gs`, administrando una hoja de cálculo estructurada con encabezados canónicos y Script Properties para almacenar el Spreadsheet ID.

### RNF-03: Control de Concurrencia e Integridad
- Las operaciones de escritura en backend (creación de ID incremental, actualización de estado, borrado/restauración) deben protegerse utilizando `LockService.getScriptLock()` con un tiempo de espera controlado (ej. 10 a 30 segundos) para evitar duplicidad de IDs o sobreescritura de estados.

### RNF-04: Resiliencia y Manejo de Errores
- Toda respuesta del backend debe seguir una estructura JSON consistente:
  - Éxito: `{ "success": true, "data": ... }`
  - Fallo controlado: `{ "success": false, "error": { "code": string, "message": string } }`

---

## 5. Criterios de Aceptación (Gherkin)

### Escenario 1: Creación exitosa de tarea con story points Fibonacci
- **Dado** que el usuario abre el modal de nueva tarea,
- **Cuando** ingresa el título "Configurar autenticación", prioridad "HIGH" y estimación de puntos "5",
- **Entonces** el sistema guarda la tarea asignándole el siguiente ID autoincremental (ej. `TASK-12`),
- **Y** la tarea aparece en la columna `TODO` con la insignia de 5 puntos y prioridad alta.

### Escenario 2: Validación de serie Fibonacci en estimación
- **Dado** que se envía una solicitud de creación o edición de tarea,
- **Cuando** el valor de `storyPoints` no pertenece a `[1, 2, 3, 5, 8, 13]`,
- **Entonces** el sistema rechaza la operación con un error de validación `INVALID_STORY_POINTS`.

### Escenario 3: Transición de columna por Drag & Drop y por botón alternativo
- **Dado** una tarea `TASK-5` ubicada en la columna `TODO`,
- **Cuando** el usuario la arrastra a la columna `IN_PROGRESS` o presiona el botón "Mover a En Progreso",
- **Entonces** la tarjeta se ubica visualmente en `IN_PROGRESS`,
- **Y** se envía la actualización al backend cambiando su estado a `IN_PROGRESS` y actualizando `updatedAt`.

### Escenario 4: Borrado lógico y restauración dentro del plazo permitido
- **Dado** una tarea `TASK-3` activa,
- **Cuando** el usuario ejecuta la acción de eliminar,
- **Entonces** la tarea desaparece del tablero principal, marcándose `isDeleted = true` y registrando la fecha actual en `deletedAt`.
- **Y si** dentro de los 30 días posteriores el usuario solicita restaurar la tarea,
- **Entonces** la tarea vuelve a mostrarse en su columna correspondiente del tablero principal con `isDeleted = false`.

### Escenario 5: Rechazo de restauración posterior al plazo de expiración (30 días)
- **Dado** una tarea eliminada lógicamente cuya fecha `deletedAt` supera los 30 días naturales,
- **Cuando** se solicita su restauración,
- **Entonces** el sistema responde con error `RESTORATION_PERIOD_EXPIRED` impidiendo la reactivación.

