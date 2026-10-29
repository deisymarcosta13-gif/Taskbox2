/**
 * @file TaskService.test.js
 * @description Comprehensive unit tests for TaskService use cases using in-memory fake repository.
 */

const { TaskService } = require('../apps-script/TaskService.gs');
const { InMemoryTaskRepository } = require('./fakes/InMemoryTaskRepository');
const { MS_PER_DAY } = require('../apps-script/Task.gs');

describe('TaskService Use Cases', () => {
  let fakeRepo;
  let fakeLock;
  let service;

  beforeEach(() => {
    fakeRepo = new InMemoryTaskRepository();
    fakeLock = {
      waitLock: jest.fn(),
      releaseLock: jest.fn(),
    };
    service = new TaskService(fakeRepo, fakeLock);
  });

  describe('Constructor & Lock Management', () => {
    test('should throw error if initialized without repository', () => {
      expect(() => new TaskService(null)).toThrow('TaskService requires a valid TaskRepository implementation.');
      try {
        new TaskService(null);
      } catch (err) {
        expect(err.code).toBe('INVALID_REPOSITORY');
      }
    });

    test('should acquire and release lock on write operations', () => {
      service.createTask({ title: 'Lock Test' });
      expect(fakeLock.waitLock).toHaveBeenCalledWith(15000);
      expect(fakeLock.releaseLock).toHaveBeenCalled();
    });

    test('should release lock even if operation throws an error', () => {
      expect(() => service.createTask({ title: '' })).toThrow();
      expect(fakeLock.releaseLock).toHaveBeenCalled();
    });

    test('should throw CONCURRENCY_LOCK_TIMEOUT when waitLock fails', () => {
      fakeLock.waitLock.mockImplementationOnce(() => {
        throw new Error('Lock timeout');
      });

      expect(() => service.createTask({ title: 'Timeout Test' })).toThrow();
      try {
        service.createTask({ title: 'Timeout Test' });
      } catch (err) {
        expect(err.code).toBe('CONCURRENCY_LOCK_TIMEOUT');
      }
    });
  });

  describe('createTask & getBoardTasks', () => {
    test('should create tasks with sequential TASK-N IDs', () => {
      const task1 = service.createTask({ title: 'First Task', storyPoints: 3 });
      const task2 = service.createTask({ title: 'Second Task', storyPoints: 5, priority: 'HIGH' });

      expect(task1.id).toBe('TASK-1');
      expect(task1.title).toBe('First Task');
      expect(task1.status).toBe('TODO');
      expect(task1.storyPoints).toBe(3);

      expect(task2.id).toBe('TASK-2');
      expect(task2.title).toBe('Second Task');
      expect(task2.priority).toBe('HIGH');
      expect(task2.storyPoints).toBe(5);
    });

    test('getBoardTasks should return only active tasks, excluding soft-deleted ones', () => {
      service.createTask({ title: 'Active 1' });
      const task2 = service.createTask({ title: 'Active 2' });
      service.createTask({ title: 'Active 3' });

      service.softDeleteTask(task2.id);

      const boardTasks = service.getBoardTasks();
      expect(boardTasks).toHaveLength(2);
      expect(boardTasks.map(t => t.id)).toEqual(['TASK-1', 'TASK-3']);
    });
  });

  describe('updateTaskStatus (Kanban transitions)', () => {
    test.each([
      { from: 'TODO', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'DONE' },
      { from: 'DONE', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'TODO' },
    ])('should transition task from $from to $to', ({ to }) => {
      const task = service.createTask({ title: 'Moving Task' });
      const updated = service.updateTaskStatus(task.id, to);

      expect(updated.status).toBe(to);
      expect(service.repository.findById(task.id).status).toBe(to);
    });

    test('should reject invalid status', () => {
      const task = service.createTask({ title: 'Task' });
      expect(() => service.updateTaskStatus(task.id, 'INVALID_STATUS')).toThrow();
      try {
        service.updateTaskStatus(task.id, 'INVALID_STATUS');
      } catch (err) {
        expect(err.code).toBe('INVALID_STATUS');
      }
    });

    test('should throw TASK_NOT_FOUND if updating non-existent or deleted task', () => {
      expect(() => service.updateTaskStatus('TASK-999', 'DONE')).toThrow();
      try {
        service.updateTaskStatus('TASK-999', 'DONE');
      } catch (err) {
        expect(err.code).toBe('TASK_NOT_FOUND');
      }

      const task = service.createTask({ title: 'Delete me' });
      service.softDeleteTask(task.id);
      expect(() => service.updateTaskStatus(task.id, 'DONE')).toThrow();
    });
  });

  describe('updateTask (Editing attributes)', () => {
    test('should update editable attributes and preserve immutable fields', () => {
      const original = service.createTask({
        title: 'Original Title',
        description: 'Original Desc',
        storyPoints: 2,
      });

      const updated = service.updateTask(original.id, {
        title: 'Updated Title',
        storyPoints: 8,
        priority: 'HIGH',
        assignee: 'Bob',
      });

      expect(updated.id).toBe(original.id);
      expect(updated.createdAt).toBe(original.createdAt);
      expect(updated.title).toBe('Updated Title');
      expect(updated.storyPoints).toBe(8);
      expect(updated.priority).toBe('HIGH');
      expect(updated.assignee).toBe('Bob');
      expect(updated.description).toBe('Original Desc'); // Unchanged
    });
  });

  describe('Soft Delete & Exact 30-Day Restoration Window', () => {
    const baseNow = new Date('2026-10-29T12:00:00.000Z');

    test('softDeleteTask should mark task as deleted with timestamp', () => {
      const task = service.createTask({ title: 'To Delete' });
      const deleted = service.softDeleteTask(task.id);

      expect(deleted.isDeleted).toBe(true);
      expect(typeof deleted.deletedAt).toBe('string');
      expect(service.getBoardTasks()).toHaveLength(0);
    });

    test('getArchivedTasks should calculate isRestorable and daysRemaining accurately', () => {
      const task = service.createTask({ title: 'In Trash' });
      service.softDeleteTask(task.id);

      // Modify deletedAt to 10 days ago for testing
      const tenDaysAgoIso = new Date(baseNow.getTime() - 10 * MS_PER_DAY).toISOString();
      const raw = fakeRepo.findById(task.id);
      raw.deletedAt = tenDaysAgoIso;
      fakeRepo.update(raw);

      const archived = service.getArchivedTasks(baseNow);
      expect(archived).toHaveLength(1);
      expect(archived[0].isRestorable).toBe(true);
      expect(archived[0].daysRemaining).toBe(20);
    });

    test('restoreTask should successfully restore task within exact 30 days', () => {
      const task = service.createTask({ title: 'Restore Me' });
      service.softDeleteTask(task.id);

      // Deleted 29 days ago
      const twentyNineDaysAgoIso = new Date(baseNow.getTime() - 29 * MS_PER_DAY).toISOString();
      const raw = fakeRepo.findById(task.id);
      raw.deletedAt = twentyNineDaysAgoIso;
      fakeRepo.update(raw);

      const restored = service.restoreTask(task.id, baseNow);
      expect(restored.isDeleted).toBe(false);
      expect(restored.deletedAt).toBeNull();
      expect(service.getBoardTasks()).toHaveLength(1);
    });

    test('restoreTask should reject restoration if exact 30-day window expired', () => {
      const task = service.createTask({ title: 'Expired Task' });
      service.softDeleteTask(task.id);

      // Deleted 31 days ago
      const thirtyOneDaysAgoIso = new Date(baseNow.getTime() - 31 * MS_PER_DAY).toISOString();
      const raw = fakeRepo.findById(task.id);
      raw.deletedAt = thirtyOneDaysAgoIso;
      fakeRepo.update(raw);

      expect(() => service.restoreTask(task.id, baseNow)).toThrow();
      try {
        service.restoreTask(task.id, baseNow);
      } catch (err) {
        expect(err.code).toBe('RESTORATION_PERIOD_EXPIRED');
      }

      // Ensure task remains deleted
      expect(service.getBoardTasks()).toHaveLength(0);
    });
  });
});

