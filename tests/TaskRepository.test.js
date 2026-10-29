/**
 * @file TaskRepository.test.js
 * @description Unit tests for TaskRepository interface definition and contract enforcement.
 */

const { TaskRepository } = require('../apps-script/TaskRepository');

describe('TaskRepository Contract', () => {
  test('should throw "not implemented" error when calling abstract methods directly', () => {
    const repo = new TaskRepository();

    expect(() => repo.findAll()).toThrow('Method TaskRepository.findAll() must be implemented.');
    expect(() => repo.findById('TASK-1')).toThrow('Method TaskRepository.findById() must be implemented.');
    expect(() => repo.save({})).toThrow('Method TaskRepository.save() must be implemented.');
    expect(() => repo.update({})).toThrow('Method TaskRepository.update() must be implemented.');
    expect(() => repo.getNextId()).toThrow('Method TaskRepository.getNextId() must be implemented.');
  });

  test('subclass implementing all methods should execute successfully', () => {
    class ConcreteRepository extends TaskRepository {
      constructor() {
        super();
        this.tasks = [];
      }
      findAll() {
        return this.tasks;
      }
      findById(id) {
        return this.tasks.find(t => t.id === id) || null;
      }
      save(task) {
        this.tasks.push(task);
        return task;
      }
      update(task) {
        const index = this.tasks.findIndex(t => t.id === task.id);
        if (index >= 0) this.tasks[index] = task;
        return task;
      }
      getNextId() {
        return `TASK-${this.tasks.length + 1}`;
      }
    }

    const concrete = new ConcreteRepository();
    expect(concrete.getNextId()).toBe('TASK-1');
    expect(concrete.findAll()).toEqual([]);

    const sample = { id: 'TASK-1', title: 'Test Task' };
    concrete.save(sample);
    expect(concrete.findById('TASK-1')).toEqual(sample);
  });
});

