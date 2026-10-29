# Constitución del Proyecto — Clon de Jira para Google Sites

Esta constitución establece los ocho principios inmutables que rigen todo el ciclo de desarrollo y arquitectura del sistema. Las enmiendas a este documento requieren aprobación explícita del usuario y deben registrarse obligatoriamente en el historial al final de este archivo.

## Principios Innegociables

### 1. Principios SOLID Estrictos (DIP y SRP al Centro)
- La arquitectura sigue estrictamente los principios SOLID, con especial énfasis en la Inversión de Dependencias (DIP) y la Responsabilidad Única (SRP).
- La lógica de negocio (`Task.gs`, `TaskService.gs`) depende exclusivamente del contrato abstracto del repositorio (`TaskRepository`, documentado con JSDoc `@interface`), jamás de `SpreadsheetApp` ni de implementaciones concretas como `SheetRepository.gs`.
- El almacenamiento en hojas de cálculo de Google se encuentra completamente desacoplado para permitir su sustitución transparente por otro motor de persistencia sin alterar los casos de uso.

### 2. La Especificación Manda (SDD)
- Ninguna línea de código de producción se implementa sin una especificación activa formalizada (`specs/<NNN-nombre>/spec.md`), su plan técnico (`plan.md`) y su desglose de tareas (`tasks.md`).
- El comportamiento del software debe corresponder exactamente a los requerimientos y límites definidos en la especificación vigente.

### 3. Separación Estricta entre Backend y Frontend
- La lógica de negocio, validaciones y orquestación de datos residen íntegramente en el backend de Google Apps Script (`apps-script/`).
- El frontend (`frontend-embeds/`) es una capa de presentación estática, ligera y autocontenida (HTML, CSS y JS puro) diseñada para incrustarse en Google Sites, comunicándose únicamente vía HTTP con la aplicación web de Apps Script.

### 4. Pruebas Automatizadas Obligatorias
- Todo servicio, caso de uso y adaptador de datos debe contar con pruebas unitarias o de integración automatizadas ejecutables mediante `npm test`.
- No se consideran terminadas las tareas que no incluyan sus correspondientes casos de prueba y pasen limpias en el entorno local.

### 5. Protección de Datos y Compatibilidad con Google Sites
- Se garantiza la consistencia, validación e integridad de los datos en todas las operaciones.
- El sistema debe funcionar sin interrupciones dentro de iframes de Google Sites. Dado que Apps Script no permite fijar cabeceras CORS personalizadas, el frontend usa peticiones simples compatibles con CORS (por ejemplo, POST con `Content-Type: text/plain`) y el backend responde JSON mediante `ContentService`, con las políticas de acceso mínimas necesarias.
- Identificadores de hojas, claves y credenciales no se versionan; se almacenan en Script Properties.

### 6. Idioma y Convenciones
- Código fuente, identificadores, firmas y comentarios técnicos: exclusivamente en inglés.
- Interfaz de usuario, mensajes visibles al usuario y documentación funcional/arquitectónica: exclusivamente en español.

### 7. Documentación Técnica de Alta Calidad y Claridad Explicativa
- Todo archivo fuente, función y estructura pública debe contar con comentarios JSDoc que expliquen obligatoriamente: propósito, diseño SOLID, parámetros, retornos, errores controlados y garantías de concurrencia (por ejemplo, el uso de `LockService` en escrituras).

### 8. Protocolo Pre-Implementación Obligatorio (Planificación Previa)
- Antes de escribir o modificar código de producción en cada tarea, el agente debe presentar obligatoriamente un plan de 3 puntos que detalle:
  1. Archivos a crear o modificar y qué cambios específicos se aplicarán en cada uno.
  2. Casos límite y decisiones de diseño que el usuario deba confirmar o resolver antes de empezar.
  3. Actualizaciones previstas tanto en `AGENTS.md` como en `MEMORY.md`.
- El agente debe esperar la aprobación explícita del usuario antes de aplicar cambios en el código.
- **Excepción de cambios triviales:** se permite omitir el plan formal exclusivamente para correcciones ortográficas en comentarios o documentación existente, formateo de código sin alteración lógica o ajustes de notas en `MEMORY.md`. Antes de aplicar cualquier cambio bajo esta excepción, el agente debe declarar explícitamente que el cambio es trivial para permitir el veto oportuno del usuario.

## Historial de Enmiendas

| Fecha | Cambio aplicado | Motivo |
|---|---|---|
| 2026-10-29 | Incorporación de regla de espera de aprobación explícita, excepción acotada para cambios triviales con declaración previa, definición formal de control de cambios y precisión en rutas SDD (`specs/<NNN-nombre>/`). | Auditoría de gobierno y fortalecimiento de buenas prácticas de agentes bajo SDD. |
| 2026-10-29 | Migración de la plataforma de Go/Excel a Google Apps Script/Hojas de cálculo: se adaptan los principios 1, 3, 4, 5, 6 y 7 (contrato `TaskRepository`, `npm test`, JSDoc, CORS con peticiones simples y secretos en Script Properties). Los principios 2 y 8 conservan su significado. | Cambio de arquitectura hacia Apps Script para despliegue integrado con Google Sites. |
