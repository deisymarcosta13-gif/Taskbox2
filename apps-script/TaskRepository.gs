/**
 * @file TaskRepository.gs
 * @description Contract and abstract definition for task persistence.
 * Adheres strictly to the Dependency Inversion Principle (DIP): domain and use cases
 * depend solely on this abstraction rather than any concrete persistence implementation
 * (such as Google Sheets or external databases).
 */

/**
 * Task persistence repository interface.
 * Any concrete persistence adapter (e.g. SheetRepository, InMemoryTaskRepository)
 * must implement this contract.
 *
 * @interface TaskRepository
 */
class TaskRepository {
  /**
   * Retrieves all tasks matching the specified criteria.
   *
   * @param {Object} [options] - Query options.
   * @param {boolean} [options.isDeleted] - Filter by logical deletion status.
   * @returns {Array<Object>} List of task entities.
   * @throws {Error} If not implemented by concrete subclass.
   */
  findAll(options) {
    throw new Error('Method TaskRepository.findAll() must be implemented.');
  }

  /**
   * Finds a single task by its unique identifier.
   *
   * @param {string} id - The task identifier (e.g. 'TASK-1').
   * @returns {Object|null} The task entity if found, null otherwise.
   * @throws {Error} If not implemented by concrete subclass.
   */
  findById(id) {
    throw new Error('Method TaskRepository.findById() must be implemented.');
  }

  /**
   * Persists a newly created task.
   *
   * @param {Object} task - The task entity to store.
   * @returns {Object} The stored task entity.
   * @throws {Error} If not implemented by concrete subclass.
   */
  save(task) {
    throw new Error('Method TaskRepository.save() must be implemented.');
  }

  /**
   * Updates an existing persisted task.
   *
   * @param {Object} task - The task entity containing modified values.
   * @returns {Object} The updated task entity.
   * @throws {Error} If not implemented by concrete subclass.
   */
  update(task) {
    throw new Error('Method TaskRepository.update() must be implemented.');
  }

  /**
   * Generates the next sequential task identifier atomically (e.g. 'TASK-1', 'TASK-2').
   *
   * @returns {string} The next available identifier.
   * @throws {Error} If not implemented by concrete subclass.
   */
  getNextId() {
    throw new Error('Method TaskRepository.getNextId() must be implemented.');
  }
}

if (typeof module !== 'undefined') {
  module.exports = { TaskRepository };
}

