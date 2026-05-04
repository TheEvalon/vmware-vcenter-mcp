/**
 * Base class for all errors raised by the vCenter MCP server.
 */
export class VCenterError extends Error {
  public readonly status: number | undefined;
  public readonly code: string;
  public readonly details: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'VCenterError';
    this.status = options.status;
    this.code = options.code ?? 'vcenter_error';
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Raised when authentication fails or the cached session is invalid.
 */
export class AuthenticationError extends VCenterError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 401, code: 'authentication_failed', details });
    this.name = 'AuthenticationError';
  }
}

/**
 * Raised when the caller lacks privileges for the requested action.
 */
export class AuthorizationError extends VCenterError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 403, code: 'permission_denied', details });
    this.name = 'AuthorizationError';
  }
}

/**
 * Raised when the requested resource does not exist.
 */
export class NotFoundError extends VCenterError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 404, code: 'not_found', details });
    this.name = 'NotFoundError';
  }
}

/**
 * Raised when vCenter rejects the request as malformed or invalid.
 */
export class InvalidRequestError extends VCenterError {
  constructor(message: string, details?: unknown) {
    super(message, { status: 400, code: 'invalid_request', details });
    this.name = 'InvalidRequestError';
  }
}

/**
 * Raised when a long-running task fails or times out.
 */
export class TaskFailedError extends VCenterError {
  public readonly taskId: string | undefined;

  constructor(message: string, options: { taskId?: string; details?: unknown } = {}) {
    super(message, { code: 'task_failed', details: options.details });
    this.name = 'TaskFailedError';
    this.taskId = options.taskId;
  }
}

/**
 * Maps an HTTP status code and parsed body into the closest VCenterError.
 * Falls back to a generic VCenterError when nothing better fits.
 */
export const mapHttpError = (status: number, body: unknown, fallbackMessage: string): VCenterError => {
  const message = extractMessage(body) ?? fallbackMessage;
  if (status === 401) return new AuthenticationError(message, body);
  if (status === 403) return new AuthorizationError(message, body);
  if (status === 404) return new NotFoundError(message, body);
  if (status === 400 || status === 422) return new InvalidRequestError(message, body);
  return new VCenterError(message, { status, code: extractCode(body), details: body });
};

const extractMessage = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b['error_message'] === 'string') return b['error_message'] as string;
  if (typeof b['message'] === 'string') return b['message'] as string;
  if (b['localized_message'] && typeof (b['localized_message'] as { default_message?: unknown }).default_message === 'string') {
    return (b['localized_message'] as { default_message: string }).default_message;
  }
  if (typeof b['default_message'] === 'string') return b['default_message'] as string;
  if (typeof b['fault_string'] === 'string') return b['fault_string'] as string;
  return undefined;
};

const extractCode = (body: unknown): string => {
  if (!body || typeof body !== 'object') return 'vcenter_error';
  const b = body as Record<string, unknown>;
  if (typeof b['error_type'] === 'string') return b['error_type'] as string;
  if (typeof b['type'] === 'string') return b['type'] as string;
  return 'vcenter_error';
};
