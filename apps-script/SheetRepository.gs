/**
 * @file SheetRepository.gs
 * @description Infrastructure adapter implementing the TaskRepository contract for Google Sheets.
 * Adheres strictly to the Dependency Inversion Principle (DIP): use cases and domain models
 * depend exclusively on the TaskRepository abstraction, leaving SheetRepository as the sole
 * component responsible for interacting with SpreadsheetApp and PropertiesService.
 * Adheres to the Single Responsibility Principle (SRP) by encapsulating sheet schema mapping,
 * row serialization, header initialization, and low-level sheet read/write operations.
 */

// In Apps Script V8 all files share global scope.
// When running in Node.js (Jest), import TaskRepository conditionally.
/* eslint-disable no-undef */
const _TaskRepoBase = typeof module !== 'undefined'
  ? require('./TaskRepository.gs').TaskRepository
  : TaskRepository;
/* eslint-enable no-undef */

/**
 * Standard column headers for the 'Tasks' sheet.
 * @readonly
 * @type {ReadonlyArray<string>}
 */
const TASK_SHEET_HEADERS = Object.freeze([
  'ID',
  'Title',
  'Description',
  'Status',
  'Priority',
  'StoryPoints',
  'Assignee',
  'IsDeleted',
  'DeletedAt',
  'CreatedAt',
  'UpdatedAt',
]);

/**
 * Concrete persistence adapter storing Tasks in a Google Sheet.
 * @augments TaskRepository
 */
class SheetRepository extends _TaskRepoBase {
  /**
   * Initializes the SheetRepository with optional spreadsheet ID and sheet name.
   *
   * @param {string} [spreadsheetId=null] - Google Spreadsheet ID. If omitted, reads from Script Properties.
   * @param {string} [sheetName='Tasks'] - The tab name where tasks are stored.
   */
  constructor(spreadsheetId = null, sheetName = 'Tasks') {
    super();
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
  }

  /**
   * Resolves the configured Google Spreadsheet ID.
   *
   * @private
   * @returns {string} The active Spreadsheet ID.
   * @throws {Error} With code 'MISSING_SPREADSHEET_ID' if neither parameter nor Script Property is configured.
   */
  _resolveSpreadsheetId() {
    if (this.spreadsheetId && typeof this.spreadsheetId === 'string' && this.spreadsheetId.trim() !== '') {
      return this.spreadsheetId.trim();
    }

    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const propId = PropertiesService.getScriptProperties().getProperty('TASKBOX_SPREADSHEET_ID');
      if (propId && propId.trim() !== '') {
        return propId.trim();
      }
    }

    const err = new Error(
      'Missing spreadsheet ID. Please provide it in constructor or set "TASKBOX_SPREADSHEET_ID" in Script Properties.'
    );
    err.code = 'MISSING_SPREADSHEET_ID';
    throw err;
  }

  /**
   * Obtains the target Google Sheet tab, creating and initializing it with canonical headers if absent.
   *
   * @private
   * @returns {Object} Google Spreadsheet Sheet object.
   * @throws {Error} If SpreadsheetApp cannot open the document.
   */
  _getSheet() {
    const id = this._resolveSpreadsheetId();
    if (typeof SpreadsheetApp === 'undefined') {
      const err = new Error('SpreadsheetApp is not available in the current runtime environment.');
      err.code = 'SPREADSHEET_APP_UNAVAILABLE';
      throw err;
    }

    const ss = SpreadsheetApp.openById(id);
    let sheet = ss.getSheetByName(this.sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(this.sheetName);
      sheet.appendRow([...TASK_SHEET_HEADERS]);
    }

    return sheet;
  }

  /**
   * Converts a date cell value (string, Date, or empty) to a clean ISO 8601 UTC string or null.
   *
   * @private
   * @param {*} value - Raw cell value.
   * @returns {string|null} Normalized ISO 8601 string or null.
   */
  _normalizeIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  /**
   * Deserializes a tabular row array into a canonical Task domain entity.
   *
   * @param {Array<*>} row - Array of cells representing columns [ID, Title, ..., UpdatedAt].
   * @returns {Object|null} Hydrated Task object or null if ID column is empty.
   */
  rowToTask(row) {
    if (!row || !Array.isArray(row) || row.length === 0) return null;

    const rawId = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
    if (!rawId || !/^TASK-\d+$/.test(rawId)) {
      return null;
    }

    const title = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
    const description = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';
    const status = row[3] !== undefined && row[3] !== null ? String(row[3]).trim() : 'TODO';
    const priority = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : 'MEDIUM';

    // Story Points normalization (integer or null)
    let storyPoints = null;
    if (row[5] !== undefined && row[5] !== null && row[5] !== '') {
      const parsedPoints = Number(row[5]);
      if (Number.isInteger(parsedPoints)) {
        storyPoints = parsedPoints;
      }
    }

    const assignee = row[6] !== undefined && row[6] !== null ? String(row[6]).trim() : '';

    // Logical delete boolean conversion
    const rawDeleted = row[7];
    const isDeleted = rawDeleted === true || rawDeleted === 'TRUE' || rawDeleted === 'true' || rawDeleted === 1;

    const deletedAt = this._normalizeIsoDate(row[8]);
    const createdAt = this._normalizeIsoDate(row[9]) || new Date().toISOString();
    const updatedAt = this._normalizeIsoDate(row[10]) || createdAt;

    return {
      id: rawId,
      title,
      description,
      status,
      priority,
      storyPoints,
      assignee,
      isDeleted,
      deletedAt,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Serializes a canonical Task domain entity into a flat row array matching headers.
   *
   * @param {Object} task - Task domain entity.
   * @returns {Array<*>} Row cell array [ID, Title, ..., UpdatedAt].
   */
  taskToRow(task) {
    return [
      task.id,
      task.title || '',
      task.description || '',
      task.status || 'TODO',
      task.priority || 'MEDIUM',
      task.storyPoints !== null && task.storyPoints !== undefined ? task.storyPoints : '',
      task.assignee || '',
      Boolean(task.isDeleted),
      task.deletedAt || '',
      task.createdAt || new Date().toISOString(),
      task.updatedAt || new Date().toISOString(),
    ];
  }

  /**
   * Retrieves all tasks from the sheet, filtering by deletion status if requested.
   *
   * @param {Object} [options={}] - Query options.
   * @param {boolean} [options.isDeleted] - If boolean, filters active vs soft-deleted tasks.
   * @returns {Array<Object>} List of task entities.
   */
  findAll(options = {}) {
    const sheet = this._getSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange ? dataRange.getValues() : [];

    if (values.length <= 1) {
      return [];
    }

    const tasks = [];
    // Skip header row at index 0
    for (let i = 1; i < values.length; i++) {
      const task = this.rowToTask(values[i]);
      if (task) {
        if (options && typeof options.isDeleted === 'boolean') {
          if (task.isDeleted === options.isDeleted) {
            tasks.push(task);
          }
        } else {
          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * Finds a task by its unique TASK-N identifier.
   *
   * @param {string} id - Identifier to locate.
   * @returns {Object|null} Found task entity or null.
   */
  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const cleanId = id.trim();

    const sheet = this._getSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange ? dataRange.getValues() : [];

    for (let i = 1; i < values.length; i++) {
      const cellId = values[i][0] !== undefined && values[i][0] !== null ? String(values[i][0]).trim() : '';
      if (cellId === cleanId) {
        return this.rowToTask(values[i]);
      }
    }

    return null;
  }

  /**
   * Appends a new task row to the bottom of the Google Sheet.
   *
   * @param {Object} task - Task domain entity to persist.
   * @returns {Object} Stored task copy.
   */
  save(task) {
    const sheet = this._getSheet();
    const rowData = this.taskToRow(task);
    sheet.appendRow(rowData);
    return { ...task };
  }

  /**
   * Updates an existing task row by replacing its cells.
   *
   * @param {Object} task - Task domain entity with modified values.
   * @returns {Object} Updated task copy.
   * @throws {Error} With code 'TASK_NOT_FOUND' if ID does not correspond to an existing row.
   */
  update(task) {
    if (!task || !task.id) {
      const err = new Error('Task entity with valid id is required for update.');
      err.code = 'INVALID_TASK';
      throw err;
    }

    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      const cellId = values[i][0] !== undefined && values[i][0] !== null ? String(values[i][0]).trim() : '';
      if (cellId === task.id) {
        const rowIndex = i + 1; // 1-based indexing for Google Sheets
        const rowData = this.taskToRow(task);
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        return { ...task };
      }
    }

    const err = new Error(`Task with id ${task.id} not found in sheet.`);
    err.code = 'TASK_NOT_FOUND';
    throw err;
  }

  /**
   * Computes the next sequential ID in 'TASK-N' format based on the maximum numeric suffix found in column A.
   *
   * @returns {string} Next available TASK-N identifier.
   */
  getNextId() {
    const sheet = this._getSheet();
    const values = sheet.getDataRange().getValues();

    let maxNum = 0;
    for (let i = 1; i < values.length; i++) {
      const cellVal = values[i][0];
      if (cellVal !== undefined && cellVal !== null) {
        const match = /^TASK-(\d+)$/.exec(String(cellVal).trim());
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    return `TASK-${maxNum + 1}`;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    SheetRepository,
    TASK_SHEET_HEADERS,
  };
}

