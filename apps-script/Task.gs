/**
 * @file Task.gs
 * @description Domain entity, enumerations, constants, and validation rules for Tasks.
 * Implements strict domain logic adhering to Single Responsibility Principle (SRP).
 * Does not depend on any storage or presentation mechanism.
 */

/**
 * Valid task workflow statuses.
 * @readonly
 * @enum {string}
 */
const TASK_STATUS = Object.freeze({
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
});

/**
 * Valid task priority levels.
 * @readonly
 * @enum {string}
 */
const TASK_PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

/**
 * Allowed story point values based on Fibonacci sequence (1 to 13).
 * @readonly
 * @type {ReadonlyArray<number>}
 */
const FIBONACCI_POINTS = Object.freeze([1, 2, 3, 5, 8, 13]);

/**
 * Exact maximum restoration window for soft-deleted tasks in days.
 * @readonly
 * @type {number}
 */
const MAX_RESTORATION_DAYS = 30;

/**
 * Milliseconds per day constant for timestamp arithmetic.
 * @readonly
 * @type {number}
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validates and sanitizes a task payload according to domain rules.
 *
 * @param {Object} payload - Raw task data from client or service.
 * @param {boolean} [isUpdate=false] - Whether this is an update operation (some fields optional).
 * @returns {Object} Sanitized task attributes.
 * @throws {Error} If any field violates domain constraints.
 */
function validateTaskPayload(payload, isUpdate = false) {
  if (!payload || typeof payload !== 'object') {
    const error = new Error('Task payload must be a non-null object.');
    error.code = 'INVALID_PAYLOAD';
    throw error;
  }

  const result = {};

  // Title validation
  if (!isUpdate || payload.title !== undefined) {
    if (typeof payload.title !== 'string') {
      const error = new Error('Task title must be a string.');
      error.code = 'INVALID_TITLE';
      throw error;
    }
    const cleanTitle = payload.title.trim();
    if (cleanTitle.length < 1 || cleanTitle.length > 120) {
      const error = new Error('Task title must be between 1 and 120 characters.');
      error.code = 'INVALID_TITLE_LENGTH';
      throw error;
    }
    result.title = cleanTitle;
  }

  // Description validation (optional)
  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== 'string') {
      const error = new Error('Task description must be a string if provided.');
      error.code = 'INVALID_DESCRIPTION';
      throw error;
    }
    if (payload.description.length > 2000) {
      const error = new Error('Task description cannot exceed 2000 characters.');
      error.code = 'INVALID_DESCRIPTION_LENGTH';
      throw error;
    }
    result.description = payload.description.trim();
  } else if (!isUpdate) {
    result.description = '';
  }

  // Status validation
  if (payload.status !== undefined && payload.status !== null) {
    if (!Object.values(TASK_STATUS).includes(payload.status)) {
      const error = new Error(`Invalid status: ${payload.status}. Must be one of: ${Object.values(TASK_STATUS).join(', ')}.`);
      error.code = 'INVALID_STATUS';
      throw error;
    }
    result.status = payload.status;
  } else if (!isUpdate) {
    result.status = TASK_STATUS.TODO;
  }

  // Priority validation
  if (payload.priority !== undefined && payload.priority !== null) {
    if (!Object.values(TASK_PRIORITY).includes(payload.priority)) {
      const error = new Error(`Invalid priority: ${payload.priority}. Must be one of: ${Object.values(TASK_PRIORITY).join(', ')}.`);
      error.code = 'INVALID_PRIORITY';
      throw error;
    }
    result.priority = payload.priority;
  } else if (!isUpdate) {
    result.priority = TASK_PRIORITY.MEDIUM;
  }

  // Story Points validation (Fibonacci 1..13 or null)
  if (payload.storyPoints !== undefined && payload.storyPoints !== null && payload.storyPoints !== '') {
    let numericPoints = payload.storyPoints;
    if (typeof numericPoints === 'string') {
      const parsed = Number(numericPoints);
      if (!Number.isInteger(parsed)) {
        const error = new Error('Story points must be an integer from the Fibonacci sequence [1, 2, 3, 5, 8, 13].');
        error.code = 'INVALID_STORY_POINTS';
        throw error;
      }
      numericPoints = parsed;
    }

    if (!FIBONACCI_POINTS.includes(numericPoints)) {
      const error = new Error(`Invalid story points: ${payload.storyPoints}. Must be one of Fibonacci numbers [1, 2, 3, 5, 8, 13].`);
      error.code = 'INVALID_STORY_POINTS';
      throw error;
    }
    result.storyPoints = numericPoints;
  } else {
    result.storyPoints = null;
  }

  // Assignee validation (optional)
  if (payload.assignee !== undefined && payload.assignee !== null) {
    if (typeof payload.assignee !== 'string') {
      const error = new Error('Assignee must be a string if provided.');
      error.code = 'INVALID_ASSIGNEE';
      throw error;
    }
    const cleanAssignee = payload.assignee.trim();
    if (cleanAssignee.length > 80) {
      const error = new Error('Assignee cannot exceed 80 characters.');
      error.code = 'INVALID_ASSIGNEE_LENGTH';
      throw error;
    }
    result.assignee = cleanAssignee;
  } else if (!isUpdate) {
    result.assignee = '';
  }

  return result;
}

/**
 * Checks whether a soft-deleted task is still within its exact 30-day restoration window.
 *
 * @param {string|Date|null} deletedAt - ISO timestamp or Date when task was deleted.
 * @param {Date} [now=new Date()] - Reference timestamp for evaluation.
 * @returns {boolean} True if within exact 30 days window, false otherwise.
 */
function isRestorable(deletedAt, now = new Date()) {
  if (!deletedAt) {
    return false;
  }

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) {
    return false;
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const diffMs = currentTime - deletedTime;

  // Exact 30 days boundary in milliseconds
  return diffMs >= 0 && diffMs <= MAX_RESTORATION_DAYS * MS_PER_DAY;
}

/**
 * Factory creating a canonical Task domain entity.
 *
 * @param {Object} rawPayload - Raw validated or unvalidated data.
 * @param {string} id - The assigned TASK-N identifier.
 * @returns {Object} Complete Task entity.
 */
function createTaskEntity(rawPayload, id) {
  if (!id || typeof id !== 'string' || !/^TASK-\d+$/.test(id)) {
    const error = new Error(`Invalid Task ID format: ${id}. Must match 'TASK-N'.`);
    error.code = 'INVALID_TASK_ID';
    throw error;
  }

  const validated = validateTaskPayload(rawPayload, false);
  const nowIso = new Date().toISOString();

  return {
    id,
    title: validated.title,
    description: validated.description,
    status: validated.status,
    priority: validated.priority,
    storyPoints: validated.storyPoints,
    assignee: validated.assignee,
    isDeleted: false,
    deletedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TASK_STATUS,
    TASK_PRIORITY,
    FIBONACCI_POINTS,
    MAX_RESTORATION_DAYS,
    MS_PER_DAY,
    validateTaskPayload,
    isRestorable,
    createTaskEntity,
  };
}

