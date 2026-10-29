/**
 * @file Task.test.js
 * @description Comprehensive unit tests for Task domain logic and validations.
 */

const {
  TASK_STATUS,
  TASK_PRIORITY,
  FIBONACCI_POINTS,
  MAX_RESTORATION_DAYS,
  MS_PER_DAY,
  validateTaskPayload,
  isRestorable,
  createTaskEntity,
} = require('../apps-script/Task.gs');

describe('Task Domain Logic & Validations', () => {
  describe('Constants & Enums', () => {
    test('should define frozen status and priority enums', () => {
      expect(TASK_STATUS).toEqual({
        TODO: 'TODO',
        IN_PROGRESS: 'IN_PROGRESS',
        DONE: 'DONE',
      });
      expect(TASK_PRIORITY).toEqual({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
      });
      expect(Object.isFrozen(TASK_STATUS)).toBe(true);
      expect(Object.isFrozen(TASK_PRIORITY)).toBe(true);
    });

    test('should contain exact Fibonacci series 1..13', () => {
      expect(FIBONACCI_POINTS).toEqual([1, 2, 3, 5, 8, 13]);
      expect(Object.isFrozen(FIBONACCI_POINTS)).toBe(true);
    });

    test('should set exact 30 restoration days', () => {
      expect(MAX_RESTORATION_DAYS).toBe(30);
    });
  });

  describe('validateTaskPayload', () => {
    test('should throw if payload is not an object', () => {
      expect(() => validateTaskPayload(null)).toThrow('Task payload must be a non-null object.');
      expect(() => validateTaskPayload('string')).toThrow();
    });

    test.each([
      { name: 'valid title', title: 'Task Title', expected: 'Task Title' },
      { name: 'trims whitespace', title: '  Whitespace Title  ', expected: 'Whitespace Title' },
      { name: 'single character', title: 'A', expected: 'A' },
      { name: 'maximum 120 chars', title: 'A'.repeat(120), expected: 'A'.repeat(120) },
    ])('should accept valid title: $name', ({ title, expected }) => {
      const result = validateTaskPayload({ title });
      expect(result.title).toBe(expected);
    });

    test.each([
      { name: 'empty string', title: '', errCode: 'INVALID_TITLE_LENGTH' },
      { name: 'only spaces', title: '    ', errCode: 'INVALID_TITLE_LENGTH' },
      { name: 'exceeds 120 chars', title: 'A'.repeat(121), errCode: 'INVALID_TITLE_LENGTH' },
      { name: 'non-string number', title: 12345, errCode: 'INVALID_TITLE' },
      { name: 'undefined on create', title: undefined, errCode: 'INVALID_TITLE' },
    ])('should reject invalid title: $name', ({ title, errCode }) => {
      expect(() => validateTaskPayload({ title }, false)).toThrow();
      try {
        validateTaskPayload({ title }, false);
      } catch (err) {
        expect(err.code).toBe(errCode);
      }
    });

    test.each([
      { name: 'null points', input: null, expected: null },
      { name: 'undefined points', input: undefined, expected: null },
      { name: 'empty string', input: '', expected: null },
      { name: 'numeric 1', input: 1, expected: 1 },
      { name: 'numeric 2', input: 2, expected: 2 },
      { name: 'numeric 3', input: 3, expected: 3 },
      { name: 'numeric 5', input: 5, expected: 5 },
      { name: 'numeric 8', input: 8, expected: 8 },
      { name: 'numeric 13', input: 13, expected: 13 },
      { name: 'string "5" from dropdown', input: '5', expected: 5 },
      { name: 'string "13" from dropdown', input: '13', expected: 13 },
    ])('should validate allowed story points: $name', ({ input, expected }) => {
      const res = validateTaskPayload({ title: 'Task', storyPoints: input });
      expect(res.storyPoints).toBe(expected);
    });

    test.each([
      { name: 'non-fibonacci number 4', input: 4 },
      { name: 'non-fibonacci number 7', input: 7 },
      { name: 'number 0', input: 0 },
      { name: 'number 21', input: 21 },
      { name: 'float 5.5', input: 5.5 },
      { name: 'string float "5.5"', input: '5.5' },
      { name: 'text "five"', input: 'five' },
    ])('should reject invalid story points: $name', ({ input }) => {
      expect(() => validateTaskPayload({ title: 'Task', storyPoints: input })).toThrow();
      try {
        validateTaskPayload({ title: 'Task', storyPoints: input });
      } catch (err) {
        expect(err.code).toBe('INVALID_STORY_POINTS');
      }
    });

    test('should apply default status and priority on creation', () => {
      const result = validateTaskPayload({ title: 'My Task' }, false);
      expect(result.status).toBe(TASK_STATUS.TODO);
      expect(result.priority).toBe(TASK_PRIORITY.MEDIUM);
      expect(result.description).toBe('');
      expect(result.assignee).toBe('');
    });

    test('should reject invalid status and priority', () => {
      expect(() => validateTaskPayload({ title: 'Task', status: 'UNKNOWN' })).toThrow();
      expect(() => validateTaskPayload({ title: 'Task', priority: 'CRITICAL' })).toThrow();
    });
  });

  describe('isRestorable (Exact 30-day Window)', () => {
    const baseNow = new Date('2026-10-29T12:00:00.000Z');

    test.each([
      {
        name: 'deleted 1 hour ago',
        deletedAt: new Date(baseNow.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        expected: true,
      },
      {
        name: 'deleted 15 days ago',
        deletedAt: new Date(baseNow.getTime() - 15 * MS_PER_DAY).toISOString(),
        expected: true,
      },
      {
        name: 'deleted 29 days ago',
        deletedAt: new Date(baseNow.getTime() - 29 * MS_PER_DAY).toISOString(),
        expected: true,
      },
      {
        name: 'deleted exactly 30 days ago (exact boundary)',
        deletedAt: new Date(baseNow.getTime() - 30 * MS_PER_DAY).toISOString(),
        expected: true,
      },
      {
        name: 'deleted 30 days and 1 second ago',
        deletedAt: new Date(baseNow.getTime() - (30 * MS_PER_DAY + 1000)).toISOString(),
        expected: false,
      },
      {
        name: 'deleted 31 days ago',
        deletedAt: new Date(baseNow.getTime() - 31 * MS_PER_DAY).toISOString(),
        expected: false,
      },
      {
        name: 'deleted 60 days ago',
        deletedAt: new Date(baseNow.getTime() - 60 * MS_PER_DAY).toISOString(),
        expected: false,
      },
      {
        name: 'null timestamp',
        deletedAt: null,
        expected: false,
      },
      {
        name: 'invalid date string',
        deletedAt: 'not-a-date',
        expected: false,
      },
      {
        name: 'future date (clock skew / negative diff)',
        deletedAt: new Date(baseNow.getTime() + 10000).toISOString(),
        expected: false,
      },
    ])('should evaluate restoration window: $name', ({ deletedAt, expected }) => {
      expect(isRestorable(deletedAt, baseNow)).toBe(expected);
    });
  });

  describe('createTaskEntity', () => {
    test('should create valid task entity with TASK-N id and default metadata', () => {
      const entity = createTaskEntity(
        {
          title: 'Implement Board',
          description: 'Kanban view details',
          priority: 'HIGH',
          storyPoints: 8,
          assignee: 'Alice',
        },
        'TASK-1'
      );

      expect(entity.id).toBe('TASK-1');
      expect(entity.title).toBe('Implement Board');
      expect(entity.description).toBe('Kanban view details');
      expect(entity.status).toBe('TODO');
      expect(entity.priority).toBe('HIGH');
      expect(entity.storyPoints).toBe(8);
      expect(entity.assignee).toBe('Alice');
      expect(entity.isDeleted).toBe(false);
      expect(entity.deletedAt).toBeNull();
      expect(typeof entity.createdAt).toBe('string');
      expect(typeof entity.updatedAt).toBe('string');
    });

    test.each(['1', 'TASK', 'TASK-', 'task-1', 'ID-123'])(
      'should reject invalid ID format: %s',
      invalidId => {
        expect(() => createTaskEntity({ title: 'Task' }, invalidId)).toThrow();
        try {
          createTaskEntity({ title: 'Task' }, invalidId);
        } catch (err) {
          expect(err.code).toBe('INVALID_TASK_ID');
        }
      }
    );
  });
});

