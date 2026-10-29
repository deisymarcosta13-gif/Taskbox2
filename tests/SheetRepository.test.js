/**
 * @file SheetRepository.test.js
 * @description Comprehensive unit tests for SheetRepository with mocked SpreadsheetApp and PropertiesService.
 */

const { SheetRepository, TASK_SHEET_HEADERS } = require('../apps-script/SheetRepository.gs');

describe('SheetRepository Infrastructure Adapter', () => {
  let mockSheet;
  let mockSpreadsheet;
  let fakeSheetRows;

  beforeEach(() => {
    fakeSheetRows = [
      [...TASK_SHEET_HEADERS], // row 0: headers
    ];

    mockSheet = {
      appendRow: jest.fn(row => {
        fakeSheetRows.push([...row]);
      }),
      getDataRange: jest.fn(() => ({
        getValues: () => fakeSheetRows.map(r => [...r]),
      })),
      getRange: jest.fn((rowIndex, colIndex, numRows, numCols) => ({
        setValues: jest.fn(rows => {
          fakeSheetRows[rowIndex - 1] = [...rows[0]];
        }),
      })),
    };

    mockSpreadsheet = {
      getSheetByName: jest.fn(name => (name === 'Tasks' ? mockSheet : null)),
      insertSheet: jest.fn(name => {
        fakeSheetRows = [];
        return mockSheet;
      }),
    };

    global.SpreadsheetApp = {
      openById: jest.fn(id => {
        if (id === 'valid-sheet-id') {
          return mockSpreadsheet;
        }
        throw new Error(`Spreadsheet not found for id: ${id}`);
      }),
    };

    global.PropertiesService = {
      getScriptProperties: jest.fn(() => ({
        getProperty: jest.fn(key => (key === 'TASKBOX_SPREADSHEET_ID' ? 'valid-sheet-id' : null)),
      })),
    };
  });

  afterEach(() => {
    delete global.SpreadsheetApp;
    delete global.PropertiesService;
  });

  describe('Spreadsheet Resolution & Initialization', () => {
    test('should resolve ID from constructor parameter', () => {
      const repo = new SheetRepository('valid-sheet-id');
      expect(repo._resolveSpreadsheetId()).toBe('valid-sheet-id');
    });

    test('should resolve ID from Script Properties when omitted in constructor', () => {
      const repo = new SheetRepository();
      expect(repo._resolveSpreadsheetId()).toBe('valid-sheet-id');
    });

    test('should throw MISSING_SPREADSHEET_ID if no ID is configured', () => {
      global.PropertiesService.getScriptProperties = () => ({ getProperty: () => null });
      const repo = new SheetRepository(null);

      expect(() => repo._resolveSpreadsheetId()).toThrow('Missing spreadsheet ID.');
      try {
        repo._resolveSpreadsheetId();
      } catch (err) {
        expect(err.code).toBe('MISSING_SPREADSHEET_ID');
      }
    });

    test('should insert sheet with canonical headers if tab does not exist', () => {
      mockSpreadsheet.getSheetByName.mockReturnValueOnce(null);
      const repo = new SheetRepository('valid-sheet-id');
      const sheet = repo._getSheet();

      expect(mockSpreadsheet.insertSheet).toHaveBeenCalledWith('Tasks');
      expect(sheet.appendRow).toHaveBeenCalledWith([...TASK_SHEET_HEADERS]);
    });
  });

  describe('Row Serialization & Deserialization', () => {
    const repo = new SheetRepository('valid-sheet-id');

    test.each([
      {
        name: 'full active task',
        row: [
          'TASK-1',
          'Title 1',
          'Description 1',
          'IN_PROGRESS',
          'HIGH',
          5,
          'user@example.com',
          false,
          '',
          '2026-10-29T10:00:00.000Z',
          '2026-10-29T10:30:00.000Z',
        ],
        expected: {
          id: 'TASK-1',
          title: 'Title 1',
          description: 'Description 1',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          storyPoints: 5,
          assignee: 'user@example.com',
          isDeleted: false,
          deletedAt: null,
          createdAt: '2026-10-29T10:00:00.000Z',
          updatedAt: '2026-10-29T10:30:00.000Z',
        },
      },
      {
        name: 'soft-deleted task with string boolean and date object',
        row: [
          'TASK-2',
          'Title 2',
          '',
          'TODO',
          'LOW',
          '', // null story points
          '',
          'TRUE',
          new Date('2026-10-25T08:00:00.000Z'),
          new Date('2026-10-20T08:00:00.000Z'),
          new Date('2026-10-25T08:00:00.000Z'),
        ],
        expected: {
          id: 'TASK-2',
          title: 'Title 2',
          description: '',
          status: 'TODO',
          priority: 'LOW',
          storyPoints: null,
          assignee: '',
          isDeleted: true,
          deletedAt: '2026-10-25T08:00:00.000Z',
          createdAt: '2026-10-20T08:00:00.000Z',
          updatedAt: '2026-10-25T08:00:00.000Z',
        },
      },
    ])('rowToTask: should deserialize $name', ({ row, expected }) => {
      expect(repo.rowToTask(row)).toEqual(expected);
    });

    test('rowToTask should ignore invalid or empty ID rows', () => {
      expect(repo.rowToTask(['', 'Title'])).toBeNull();
      expect(repo.rowToTask(['INVALID-ID', 'Title'])).toBeNull();
      expect(repo.rowToTask([])).toBeNull();
    });

    test('taskToRow: should convert task object to flat array matching canonical columns', () => {
      const task = {
        id: 'TASK-5',
        title: 'Task 5',
        description: 'Details',
        status: 'DONE',
        priority: 'MEDIUM',
        storyPoints: 13,
        assignee: 'Alice',
        isDeleted: false,
        deletedAt: null,
        createdAt: '2026-10-29T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z',
      };

      const row = repo.taskToRow(task);
      expect(row).toEqual([
        'TASK-5',
        'Task 5',
        'Details',
        'DONE',
        'MEDIUM',
        13,
        'Alice',
        false,
        '',
        '2026-10-29T10:00:00.000Z',
        '2026-10-29T10:00:00.000Z',
      ]);
    });
  });

  describe('CRUD Operations on Mock Sheet', () => {
    let repo;

    beforeEach(() => {
      repo = new SheetRepository('valid-sheet-id');
    });

    test('getNextId: should return TASK-1 on empty sheet and TASK-N+1 based on max ID', () => {
      expect(repo.getNextId()).toBe('TASK-1');

      fakeSheetRows.push(['TASK-3', 'Task 3']);
      fakeSheetRows.push(['TASK-10', 'Task 10']);
      fakeSheetRows.push(['TASK-2', 'Task 2']);

      expect(repo.getNextId()).toBe('TASK-11');
    });

    test('save: should append row and return stored task', () => {
      const newTask = {
        id: 'TASK-1',
        title: 'New Sheet Task',
        description: '',
        status: 'TODO',
        priority: 'MEDIUM',
        storyPoints: 8,
        assignee: 'Bob',
        isDeleted: false,
        deletedAt: null,
        createdAt: '2026-10-29T10:00:00.000Z',
        updatedAt: '2026-10-29T10:00:00.000Z',
      };

      const saved = repo.save(newTask);
      expect(saved).toEqual(newTask);
      expect(fakeSheetRows).toHaveLength(2);
      expect(fakeSheetRows[1][0]).toBe('TASK-1');
      expect(fakeSheetRows[1][5]).toBe(8);
    });

    test('findAll: should return tasks filtered by isDeleted', () => {
      repo.save({ id: 'TASK-1', title: 'Task 1', isDeleted: false });
      repo.save({ id: 'TASK-2', title: 'Task 2', isDeleted: true });
      repo.save({ id: 'TASK-3', title: 'Task 3', isDeleted: false });

      const all = repo.findAll();
      expect(all).toHaveLength(3);

      const active = repo.findAll({ isDeleted: false });
      expect(active).toHaveLength(2);
      expect(active.map(t => t.id)).toEqual(['TASK-1', 'TASK-3']);

      const archived = repo.findAll({ isDeleted: true });
      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe('TASK-2');
    });

    test('findById: should return matching task or null if absent', () => {
      repo.save({ id: 'TASK-1', title: 'Task 1', isDeleted: false });

      expect(repo.findById('TASK-1')).not.toBeNull();
      expect(repo.findById('TASK-1').title).toBe('Task 1');
      expect(repo.findById('TASK-999')).toBeNull();
    });

    test('update: should modify cells of existing task row', () => {
      repo.save({ id: 'TASK-1', title: 'Old Title', status: 'TODO' });

      const updated = repo.update({
        id: 'TASK-1',
        title: 'New Title',
        status: 'IN_PROGRESS',
        storyPoints: 5,
      });

      expect(updated.title).toBe('New Title');
      const found = repo.findById('TASK-1');
      expect(found.title).toBe('New Title');
      expect(found.status).toBe('IN_PROGRESS');
      expect(found.storyPoints).toBe(5);
    });

    test('update: should throw TASK_NOT_FOUND when task ID does not exist', () => {
      expect(() => repo.update({ id: 'TASK-999', title: 'None' })).toThrow();
      try {
        repo.update({ id: 'TASK-999', title: 'None' });
      } catch (err) {
        expect(err.code).toBe('TASK_NOT_FOUND');
      }
    });
  });
});

