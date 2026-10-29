# Taskbox — Clon de Jira para Google Sites

Sistema de gestión de tareas tipo Kanban diseñado específicamente para incrustarse en Google Sites, respaldado por Google Apps Script (V8) y persistido de forma estructurada en Google Sheets.

---

## 1. Estructura y Orden de Archivos en Google Apps Script

En Google Apps Script (V8), todos los archivos comparten el mismo ámbito global y el orden de evaluación depende estrictamente de **el orden en que los archivos aparecen listados en el panel izquierdo del editor web (los cuales son reordenables manualmente)**.

Dado que `SheetRepository` hereda estáticamente de `TaskRepository` (`class SheetRepository extends TaskRepository`), el contrato base **debe ser evaluado antes** que su implementación. Por ello, el orden obligatorio de los archivos en el editor de Apps Script es:

1. **`Task.gs`**: Entidad de dominio, enums (`TASK_STATUS`, `TASK_PRIORITY`), serie Fibonacci y validaciones.
2. **`TaskRepository.gs`**: Contrato abstracto `@interface` base de persistencia.
3. **`SheetRepository.gs`**: Adaptador concreto de persistencia (`extends TaskRepository`) que interactúa con `SpreadsheetApp`.
4. **`TaskService.gs`**: Casos de uso y orquestación con Script Locks (`LockService`). Emplea resolución perezosa (`_getDomain()`).
5. **`Code.gs`**: Puntos de entrada HTTP `doGet` y `doPost`. Emplea resolución perezosa (`_getService()`).

> **Nota para usuarios de clasp**:
> Si sincronizas el proyecto mediante Google Clasp, puedes configurar la propiedad `filePushOrder` en tu archivo `.clasp.json` para garantizar que la API de Apps Script guarde los archivos en esta secuencia exacta:
> ```json
> {
>   "scriptId": "TU_SCRIPT_ID",
>   "rootDir": "./apps-script",
>   "filePushOrder": [
>     "Task.js",
>     "TaskRepository.js",
>     "SheetRepository.js",
>     "TaskService.js",
>     "Code.js"
>   ]
> }
> ```

---

## 2. Configuración y Despliegue en Google Apps Script

1. **Crear o vincular una Hoja de Cálculo**:
   - Crea una hoja de Google Sheets en blanco.
   - Copia su ID (la cadena alfanumérica en la URL entre `/d/` y `/edit`).
2. **Configurar Script Properties**:
   - En tu proyecto de Google Apps Script: *Configuración del proyecto* (icono de engranaje) $\rightarrow$ *Propiedades de la secuencia de comandos*.
   - Agrega la propiedad:
     - **Propiedad**: `TASKBOX_SPREADSHEET_ID`
     - **Valor**: `TU_SPREADSHEET_ID`
3. **Desplegar como Aplicación Web**:
   - Haz clic en **Implementar** $\rightarrow$ **Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
   - Copia la URL generada que termina en `/exec`.

---

## 3. Uso del Frontend (Tablero Kanban)

1. Abre [`frontend-embeds/kanban.html`](frontend-embeds/kanban.html) en tu navegador (o incrusta el código en Google Sites con la opción *Insertar* $\rightarrow$ *Insertar código*).
2. Haz clic en el botón superior **`⚙️ URL Backend`**.
3. Pega la URL `/exec` de tu Web App y presiona **Guardar**.
4. ¡El tablero cargará las tareas automáticamente!

---

## 4. Pruebas Automatizadas

El proyecto cuenta con una suite completa de pruebas unitarias ejecutadas con Jest:

```bash
npm test
```

