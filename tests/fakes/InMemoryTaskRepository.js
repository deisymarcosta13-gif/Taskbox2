/**
 * @file InMemoryTaskRepository.js
 * @description In-memory fake implementation of TaskRepository interface for unit testing.
 * Provides full contract isolation without touching Google Sheets or external services.
 */

const { TaskRepository } = require('../../apps-script/TaskRepository.gs');

/**
 * In-memory repository conforming strictly to TaskRepository contract.
 * @implements {TaskRepository}
 */
class InMemoryTaskRepository extends TaskRepository {
  /**
   * Initializes the repository with an optional initial task array.
   *
   * @param {Array<Object>} [initialTasks=[]] - Initial state for testing.
   */
  constructor(initialTasks = []) {
    super();
    this.tasks = initialTasks.map(t => ({ ...t }));
  }

  /**
   * Retrieves all tasks matching criteria.
   *
   * @param {Object} [options={}] - Query filters.
   * @param {boolean} [options.isDeleted] - Filter by logical deletion flag.
   * @returns {Array<Object>} Deep copy of matched tasks.
   */
  findAll(options = {}) {
    let filtered = [...this.tasks];
    if (options && typeof options.isDeleted === 'boolean') {
      filtered = filtered.filter(t => t.isDeleted === options.isDeleted);
    }
    return filtered.map(t => ({ ...t }));
  }

  /**
   * Finds task by ID.
   *
   * @param {string} id - Task identifier.
   * @returns {Object|null} Copy of task or null.
   */
  findById(id) {
    const found = this.tasks.find(t => t.id === id);
    return found ? { ...found } : null;
  }

  /**
   * Saves a newly created task.
   *
   * @param {Object} task - Task to persist.
   * @returns {Object} Copy of stored task.
   */
  save(task) {
    const clone = { ...task };
    this.tasks.push(clone);
    return { ...clone };
  }

  /**
   * Updates an existing task by ID.
   *
   * @param {Object} task - Task with updated attributes.
   * @returns {Object} Updated copy.
   * @throws {Error} If task does not exist.
   */
  update(task) {
    const index = this.tasks.findIndex(t => t.id === task.id);
    if (index === -1) {
      const err = new Error(`Task with id ${task.id} not found.`);
      err.code = 'TASK_NOT_FOUND';
      throw err;
    }
    this.tasks[index] = { ...task };
    return { ...this.tasks[index] };
  }

  /**
   * Computes the next sequential ID in 'TASK-N' format.
   *
   * @returns {string} The next available TASK-N identifier.
   */
  getNextId() {
    let highestNum = 0;
    for (const t of this.tasks) {
      const match = /^TASK-(\d+)$/.exec(t.id);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) {
          highestNum = num;
        }
      }
    }
    return `TASK-${highestNum + 1}`;
  }
}

module.exports = { InMemoryTaskRepository };

