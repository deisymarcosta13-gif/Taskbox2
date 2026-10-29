/**
 * @file Code.test.js
 * @description Comprehensive unit tests for delivery layer (doGet, doPost, and routing in Code.gs).
 */

const {
  doGet,
  doPost,
  _handleAction,
  _createJsonResponse,
} = require('../apps-script/Code.gs');

describe('Code.gs Delivery Layer', () => {
  let mockService;

  beforeEach(() => {
    mockService = {
      getBoardTasks: jest.fn(() => [{ id: 'TASK-1', title: 'Task 1' }]),
      getArchivedTasks: jest.fn(() => [{ id: 'TASK-2', isDeleted: true }]),
      createTask: jest.fn(payload => ({ id: 'TASK-3', ...payload })),
      updateTaskStatus: jest.fn((id, status) => ({ id, status })),
      updateTask: jest.fn((id, payload) => ({ id, ...payload })),
      softDeleteTask: jest.fn(id => ({ id, isDeleted: true })),
      restoreTask: jest.fn(id => ({ id, isDeleted: false })),
    };

    global.ContentService = {
      MimeType: { JSON: 'JSON' },
      createTextOutput: jest.fn(str => {
        let mime = 'TEXT';
        return {
          setMimeType: jest.fn(type => {
            mime = type;
            return {
              getContent: () => str,
              getMimeType: () => mime,
            };
          }),
          getContent: () => str,
          getMimeType: () => mime,
        };
      }),
    };
  });

  afterEach(() => {
    delete global.ContentService;
  });

  describe('doGet (Health Check)', () => {
    test('should return healthy status in standard JSON format', () => {
      const response = doGet();
      const content = JSON.parse(response.getContent());

      expect(content.success).toBe(true);
      expect(content.data.status).toBe('healthy');
      expect(content.data.service).toBe('Taskbox Kanban API');
      expect(response.getMimeType()).toBe('JSON');
    });
  });

  describe('_handleAction routing', () => {
    test('getBoardTasks should call service.getBoardTasks', () => {
      const res = _handleAction('getBoardTasks', {}, mockService);
      expect(mockService.getBoardTasks).toHaveBeenCalled();
      expect(res).toEqual([{ id: 'TASK-1', title: 'Task 1' }]);
    });

    test('getArchivedTasks should call service.getArchivedTasks', () => {
      const res = _handleAction('getArchivedTasks', {}, mockService);
      expect(mockService.getArchivedTasks).toHaveBeenCalled();
      expect(res).toEqual([{ id: 'TASK-2', isDeleted: true }]);
    });

    test('createTask should pass payload to service.createTask', () => {
      const payload = { action: 'createTask', title: 'New Task', storyPoints: 5 };
      const res = _handleAction('createTask', payload, mockService);
      expect(mockService.createTask).toHaveBeenCalledWith(payload);
      expect(res.id).toBe('TASK-3');
    });

    test('updateTaskStatus should update status and validate parameters', () => {
      const res = _handleAction('updateTaskStatus', { id: 'TASK-1', status: 'IN_PROGRESS' }, mockService);
      expect(mockService.updateTaskStatus).toHaveBeenCalledWith('TASK-1', 'IN_PROGRESS');
      expect(res.status).toBe('IN_PROGRESS');

      expect(() => _handleAction('updateTaskStatus', { id: 'TASK-1' }, mockService)).toThrow();
    });

    test('deleteTask should soft delete by id', () => {
      const res = _handleAction('deleteTask', { id: 'TASK-1' }, mockService);
      expect(mockService.softDeleteTask).toHaveBeenCalledWith('TASK-1');
      expect(res.isDeleted).toBe(true);
    });

    test('restoreTask should restore task by id', () => {
      const res = _handleAction('restoreTask', { id: 'TASK-1' }, mockService);
      expect(mockService.restoreTask).toHaveBeenCalledWith('TASK-1');
      expect(res.isDeleted).toBe(false);
    });

    test('should throw UNKNOWN_ACTION for unsupported actions', () => {
      expect(() => _handleAction('unsupported', {}, mockService)).toThrow();
      try {
        _handleAction('unsupported', {}, mockService);
      } catch (err) {
        expect(err.code).toBe('UNKNOWN_ACTION');
      }
    });
  });

  describe('doPost (Integration with PostData & Error Handling)', () => {
    test('should reject empty or missing body with EMPTY_REQUEST', () => {
      const res1 = doPost(null);
      const json1 = JSON.parse(res1.getContent());
      expect(json1.success).toBe(false);
      expect(json1.error.code).toBe('EMPTY_REQUEST');

      const res2 = doPost({ postData: {} });
      const json2 = JSON.parse(res2.getContent());
      expect(json2.success).toBe(false);
      expect(json2.error.code).toBe('EMPTY_REQUEST');
    });

    test('should reject malformed JSON with INVALID_JSON', () => {
      const res = doPost({ postData: { contents: '{ malformed json: }' } });
      const json = JSON.parse(res.getContent());
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVALID_JSON');
    });

    test('should reject payload missing action property with MISSING_ACTION', () => {
      const res = doPost({ postData: { contents: JSON.stringify({ title: 'No Action' }) } });
      const json = JSON.parse(res.getContent());
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('MISSING_ACTION');
    });

    test('should gracefully handle business logic and validation errors', () => {
      // Mock an error thrown from service
      const res = doPost({
        postData: {
          contents: JSON.stringify({
            action: 'invalidActionHere',
          }),
        },
      });
      const json = JSON.parse(res.getContent());
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNKNOWN_ACTION');
    });
  });
});

