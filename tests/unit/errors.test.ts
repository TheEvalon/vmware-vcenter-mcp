import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  InvalidRequestError,
  NotFoundError,
  TaskFailedError,
  VCenterError,
  mapHttpError,
} from '../../src/client/errors.js';

describe('mapHttpError', () => {
  it('maps 401 to AuthenticationError', () => {
    const err = mapHttpError(401, { error_message: 'bad creds' }, 'fallback');
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe('bad creds');
  });

  it('maps 403 to AuthorizationError', () => {
    const err = mapHttpError(403, { message: 'denied' }, 'fallback');
    expect(err).toBeInstanceOf(AuthorizationError);
  });

  it('maps 404 to NotFoundError', () => {
    const err = mapHttpError(404, { error_message: 'gone' }, 'fb');
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('maps 400/422 to InvalidRequestError', () => {
    expect(mapHttpError(400, {}, 'fb')).toBeInstanceOf(InvalidRequestError);
    expect(mapHttpError(422, {}, 'fb')).toBeInstanceOf(InvalidRequestError);
  });

  it('falls back to VCenterError for other statuses', () => {
    const err = mapHttpError(500, { error_type: 'internal_error' }, 'fb');
    expect(err).toBeInstanceOf(VCenterError);
    expect(err.code).toBe('internal_error');
    expect(err.status).toBe(500);
  });

  it('extracts localized_message.default_message when present', () => {
    const err = mapHttpError(500, { localized_message: { default_message: 'localized' } }, 'fb');
    expect(err.message).toBe('localized');
  });

  it('uses fallback when body has no usable message', () => {
    const err = mapHttpError(500, {}, 'fallback msg');
    expect(err.message).toBe('fallback msg');
  });
});

describe('TaskFailedError', () => {
  it('includes the task id', () => {
    const err = new TaskFailedError('boom', { taskId: 'task-1' });
    expect(err.taskId).toBe('task-1');
    expect(err.code).toBe('task_failed');
  });
});
