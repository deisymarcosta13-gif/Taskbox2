/**
 * @file Code.gs
 * @description Delivery layer / Web App HTTP controller and routing dispatcher.
 * Adheres strictly to the Single Responsibility Principle (SRP) by managing incoming
 * HTTP requests (doGet and doPost), safely parsing bodies, routing actions to TaskService,
 * and serializing consistent JSON responses via ContentService.
 * Respects Google Sites integration constraints by accepting simple requests (Content-Type: text/plain)
 * to avoid CORS preflight failures inside iframes.
 * Employs lazy resolution inside functions to eliminate top-level cross-file dependency hazards.
 */

/**
 * Factory helper resolving and instantiating TaskService and SheetRepository.
 * Uses lazy resolution inside the function to guarantee that all global classes in Apps Script V8
 * are fully defined before instantiation, while retaining full compatibility with Node/Jest testing.
 *
 * @private
 * @returns {TaskService} Orchestrator service wired with SheetRepository and ScriptLock.
 */
function _getService() {
  const RepositoryClass = typeof module !== 'undefined'
    ? require('./SheetRepository.gs').SheetRepository
    : SheetRepository;

  const ServiceClass = typeof module !== 'undefined'
    ? require('./TaskService.gs').TaskService
    : TaskService;

  const repository = new RepositoryClass();
  const lock = typeof LockService !== 'undefined' && LockService.getScriptLock
    ? LockService.getScriptLock()
    : null;
  return new ServiceClass(repository, lock);
}

/**
 * Formats and serializes a JSON response using Apps Script ContentService.
 *
 * @param {Object} responsePayload - Object to be serialized.
 * @returns {Object} ContentService TextOutput instance configured as MimeType.JSON.
 */
function _createJsonResponse(responsePayload) {
  const jsonString = JSON.stringify(responsePayload);
  if (typeof ContentService !== 'undefined' && ContentService.createTextOutput) {
    return ContentService.createTextOutput(jsonString).setMimeType(ContentService.MimeType.JSON);
  }
  // Fallback for unit testing environments
  return {
    getContent: () => jsonString,
    getMimeType: () => 'JSON',
  };
}

/**
 * Dispatches a business action to the corresponding TaskService use case.
 *
 * @param {string} action - Action identifier.
 * @param {Object} payload - Parameters associated with the action.
 * @param {Object} service - TaskService instance.
 * @returns {*} The result of the use case execution.
 * @throws {Error} With code 'UNKNOWN_ACTION' if the requested action is not supported.
 */
function _handleAction(action, payload, service) {
  switch (action) {
    case 'getBoardTasks':
      return service.getBoardTasks();

    case 'getArchivedTasks':
      return service.getArchivedTasks();

    case 'createTask':
      return service.createTask(payload);

    case 'updateTaskStatus':
      if (!payload || !payload.id || !payload.status) {
        const err = new Error('Both "id" and "status" are required to update task status.');
        err.code = 'INVALID_PARAMETERS';
        throw err;
      }
      return service.updateTaskStatus(payload.id, payload.status);

    case 'updateTask':
      if (!payload || !payload.id) {
        const err = new Error('"id" is required to update a task.');
        err.code = 'INVALID_PARAMETERS';
        throw err;
      }
      return service.updateTask(payload.id, payload);

    case 'deleteTask':
      if (!payload || !payload.id) {
        const err = new Error('"id" is required to delete a task.');
        err.code = 'INVALID_PARAMETERS';
        throw err;
      }
      return service.softDeleteTask(payload.id);

    case 'restoreTask':
      if (!payload || !payload.id) {
        const err = new Error('"id" is required to restore a task.');
        err.code = 'INVALID_PARAMETERS';
        throw err;
      }
      return service.restoreTask(payload.id);

    default: {
      const err = new Error(`Unknown or unsupported action: "${action}".`);
      err.code = 'UNKNOWN_ACTION';
      throw err;
    }
  }
}

/**
 * Handles HTTP GET requests for health check and service diagnostic.
 *
 * @param {Object} [e] - Event object passed by Apps Script runtime.
 * @returns {Object} JSON response with service status.
 */
function doGet(e) {
  return _createJsonResponse({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      service: 'Taskbox Kanban API',
    },
  });
}

/**
 * Handles HTTP POST requests containing action commands from the embedded frontend.
 * Safely parses the text payload and handles all business and validation errors gracefully.
 *
 * @param {Object} e - Event object containing postData.
 * @returns {Object} JSON response conforming to standard envelope format.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      const err = new Error('Request body cannot be empty.');
      err.code = 'EMPTY_REQUEST';
      throw err;
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(e.postData.contents);
    } catch (parseError) {
      const err = new Error('Invalid JSON payload provided.');
      err.code = 'INVALID_JSON';
      err.original = parseError;
      throw err;
    }

    if (!parsedBody || typeof parsedBody !== 'object') {
      const err = new Error('Payload must be a JSON object.');
      err.code = 'INVALID_PAYLOAD';
      throw err;
    }

    const action = parsedBody.action;
    if (!action || typeof action !== 'string') {
      const err = new Error('Action property is required in request payload.');
      err.code = 'MISSING_ACTION';
      throw err;
    }

    const service = _getService();
    const result = _handleAction(action, parsedBody, service);

    return _createJsonResponse({
      success: true,
      data: result,
    });
  } catch (error) {
    return _createJsonResponse({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred.',
      },
    });
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    doGet,
    doPost,
    _handleAction,
    _createJsonResponse,
    _getService,
  };
}
