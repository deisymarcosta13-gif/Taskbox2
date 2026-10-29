/**
 * @file TaskService.gs
 * @description Application layer / Use Cases orchestrator for Task management.
 * Implements Dependency Inversion Principle (DIP): depends solely on the abstract
 * TaskRepository contract and does not know anything about SpreadsheetApp or Google Sheets.
 * Adheres to Single Responsibility Principle (SRP) by managing task lifecycle workflows,
 * concurrency locking, and business rule enforcement.
 * Employs lazy domain resolution via _getDomain() to eliminate top-level cross-file dependency hazards.
 */

/**
 * Lazy resolver for Task domain constants, enums, and functions.
 * Resolves symbols at runtime execution inside methods rather than at file load time,
 * eliminating top-level execution order hazards in Google Apps Script V8 while maintaining
 * seamless compatibility with Node.js/Jest environments.
 *
 * @private
 * @returns {Object} Object containing TASK_STATUS, TASK_PRIORITY, FIBONACCI_POINTS,
 *                    MAX_RESTORATION_DAYS, MS_PER_DAY, validateTaskPayload, isRestorable, createTaskEntity.
 */
function _getDomain() {
  if (typeof module !== 'undefined') {
    return require('./Task.gs');
  }
  return {
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

/**
 * Service orchestrating Task business use cases.
 */
class TaskService {
  /**
   * Constructs the TaskService instance.
   *
   * @param {Object} repository - Instance conforming to TaskRepository contract.
   * @param {Object} [lockProvider=null] - Lock mechanism (e.g. LockService.getScriptLock()).
   */
  constructor(repository, lockProvider = null) {
    if (!repository || typeof repository.findAll !== 'function') {
      const err = new Error('TaskService requires a valid TaskRepository implementation.');
      err.code = 'INVALID_REPOSITORY';
      throw err;
    }
    this.repository = repository;
    this.lockProvider = lockProvider;
  }

  /**
   * Acquires a script execution lock if a lock provider is configured.
   *
   * @private
   * @param {number} [timeoutMs=15000] - Lock timeout in milliseconds.
   * @throws {Error} With code 'CONCURRENCY_LOCK_TIMEOUT' if lock acquisition fails.
   */
  _acquireLock(timeoutMs = 15000) {
    if (this.lockProvider && typeof this.lockProvider.waitLock === 'function') {
      try {
        this.lockProvider.waitLock(timeoutMs);
      } catch (e) {
        const err = new Error('Could not acquire concurrency lock. Server is busy, please retry.');
        err.code = 'CONCURRENCY_LOCK_TIMEOUT';
        err.original = e;
        throw err;
      }
    }
  }

  /**
   * Releases the acquired script execution lock.
   *
   * @private
   */
  _releaseLock() {
    if (this.lockProvider && typeof this.lockProvider.releaseLock === 'function') {
      try {
        this.lockProvider.releaseLock();
      } catch (e) {
        // Suppress release lock errors in finally blocks
      }
    }
  }

  /**
   * Retrieves all active tasks for the Kanban board (excludes soft-deleted tasks).
   *
   * @returns {Array<Object>} List of active task entities.
   */
  getBoardTasks() {
    return this.repository.findAll({ isDeleted: false });
  }

  /**
   * Retrieves all soft-deleted tasks in trash with restoration eligibility metadata.
   *
   * @param {Date} [referenceTime=new Date()] - Optional reference time for unit testing.
   * @returns {Array<Object>} List of soft-deleted task objects enriched with restoration metadata.
   */
  getArchivedTasks(referenceTime = new Date()) {
    const domain = _getDomain();
    const archived = this.repository.findAll({ isDeleted: true });
    const nowTime = referenceTime instanceof Date ? referenceTime.getTime() : new Date(referenceTime).getTime();

    return archived.map(task => {
      const deletedTime = task.deletedAt ? new Date(task.deletedAt).getTime() : 0;
      const elapsedDays = deletedTime > 0 ? (nowTime - deletedTime) / domain.MS_PER_DAY : 999;
      const daysRemaining = Math.max(0, Math.ceil(domain.MAX_RESTORATION_DAYS - elapsedDays));
      const canRestore = domain.isRestorable(task.deletedAt, referenceTime);

      return {
        ...task,
        isRestorable: canRestore,
        daysRemaining: canRestore ? daysRemaining : 0,
      };
    });
  }

  /**
   * Creates a new task atomically with an incremental TASK-N identifier.
   *
   * @param {Object} payload - Task creation attributes.
   * @returns {Object} The newly created and stored Task entity.
   * @throws {Error} If validation fails or lock cannot be acquired.
   */
  createTask(payload) {
    const domain = _getDomain();
    this._acquireLock(15000);
    try {
      const nextId = this.repository.getNextId();
      const entity = domain.createTaskEntity(payload, nextId);
      return this.repository.save(entity);
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Updates the workflow status of an active task (Kanban column transition).
   *
   * @param {string} id - Task identifier (e.g. 'TASK-1').
   * @param {string} newStatus - New status ('TODO', 'IN_PROGRESS', or 'DONE').
   * @returns {Object} Updated task entity.
   * @throws {Error} With code 'TASK_NOT_FOUND' if task doesn't exist,
   *                 or 'INVALID_STATUS' if status is unrecognized.
   */
  updateTaskStatus(id, newStatus) {
    const domain = _getDomain();
    if (!Object.values(domain.TASK_STATUS).includes(newStatus)) {
      const err = new Error(`Invalid status: ${newStatus}. Must be one of: ${Object.values(domain.TASK_STATUS).join(', ')}.`);
      err.code = 'INVALID_STATUS';
      throw err;
    }

    this._acquireLock(10000);
    try {
      const existing = this.repository.findById(id);
      if (!existing || existing.isDeleted) {
        const err = new Error(`Task with id ${id} not found or is in trash.`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }

      existing.status = newStatus;
      existing.updatedAt = new Date().toISOString();
      return this.repository.update(existing);
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Updates editable attributes of an active task.
   * Preserves immutable fields: id, createdAt, isDeleted, deletedAt.
   *
   * @param {string} id - Task identifier.
   * @param {Object} payload - Attributes to update.
   * @returns {Object} Updated task entity.
   * @throws {Error} With code 'TASK_NOT_FOUND' if task doesn't exist.
   */
  updateTask(id, payload) {
    const domain = _getDomain();
    this._acquireLock(10000);
    try {
      const existing = this.repository.findById(id);
      if (!existing || existing.isDeleted) {
        const err = new Error(`Task with id ${id} not found or is in trash.`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }

      const validated = domain.validateTaskPayload(payload, true);

      if (validated.title !== undefined) existing.title = validated.title;
      if (validated.description !== undefined) existing.description = validated.description;
      if (validated.status !== undefined) existing.status = validated.status;
      if (validated.priority !== undefined) existing.priority = validated.priority;
      if (validated.storyPoints !== undefined) existing.storyPoints = validated.storyPoints;
      if (validated.assignee !== undefined) existing.assignee = validated.assignee;

      existing.updatedAt = new Date().toISOString();
      return this.repository.update(existing);
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Soft-deletes a task moving it to trash.
   *
   * @param {string} id - Task identifier.
   * @returns {Object} Soft-deleted task entity.
   * @throws {Error} With code 'TASK_NOT_FOUND' if task does not exist.
   */
  softDeleteTask(id) {
    this._acquireLock(10000);
    try {
      const existing = this.repository.findById(id);
      if (!existing || existing.isDeleted) {
        const err = new Error(`Task with id ${id} not found or already in trash.`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }

      const nowIso = new Date().toISOString();
      existing.isDeleted = true;
      existing.deletedAt = nowIso;
      existing.updatedAt = nowIso;

      return this.repository.update(existing);
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Restores a soft-deleted task from trash if within exact 30-day window.
   *
   * @param {string} id - Task identifier.
   * @param {Date} [referenceTime=new Date()] - Reference time for validation.
   * @returns {Object} Restored task entity.
   * @throws {Error} With code 'TASK_NOT_FOUND' if not in trash,
   *                 or 'RESTORATION_PERIOD_EXPIRED' if deletedAt > 30 days.
   */
  restoreTask(id, referenceTime = new Date()) {
    const domain = _getDomain();
    this._acquireLock(15000);
    try {
      const existing = this.repository.findById(id);
      if (!existing || !existing.isDeleted) {
        const err = new Error(`Task with id ${id} not found in trash.`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }

      if (!domain.isRestorable(existing.deletedAt, referenceTime)) {
        const err = new Error(`Cannot restore task ${id}: the 30-day restoration period has expired.`);
        err.code = 'RESTORATION_PERIOD_EXPIRED';
        throw err;
      }

      existing.isDeleted = false;
      existing.deletedAt = null;
      existing.updatedAt = new Date().toISOString();

      return this.repository.update(existing);
    } finally {
      this._releaseLock();
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    TaskService,
    _getDomain,
  };
}
