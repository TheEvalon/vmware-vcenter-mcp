import { request } from 'undici';
import type { VCenterConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { AuthenticationError, mapHttpError, VCenterError } from './errors.js';
import { getHttpAgent } from './http-agent.js';
import { SessionManager, SESSION_HEADER_NAME } from './session-manager.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface HttpRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * If true, do not retry the request after a 401 response. Used by the
   * login flow itself to avoid infinite recursion.
   */
  skipReauth?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

/**
 * Shared low-level HTTP client used by both the Automation REST and VI/JSON
 * clients. Handles session header injection, automatic re-auth on 401 and
 * structured error mapping.
 */
export class HttpClient {
  protected readonly config: VCenterConfig;
  protected readonly session: SessionManager;

  constructor(config: VCenterConfig, session: SessionManager) {
    this.config = config;
    this.session = session;
  }

  /**
   * Performs a JSON-in / JSON-out HTTP request against the configured vCenter.
   * Adds the cached session header, retries once on 401 after re-authenticating,
   * and converts non-2xx responses into typed VCenterError instances.
   */
  async json<T = unknown>(
    method: HttpMethod,
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const sessionId = await this.session.getSessionId();
    const response = await this.send(method, path, sessionId, options);
    if (response.status === 401 && !options.skipReauth) {
      logger.debug('Got 401, refreshing vCenter session and retrying once');
      this.session.invalidate();
      const fresh = await this.session.getSessionId();
      const retry = await this.send(method, path, fresh, { ...options, skipReauth: true });
      return this.handle<T>(method, path, retry);
    }
    return this.handle<T>(method, path, response);
  }

  private async send(
    method: HttpMethod,
    path: string,
    sessionId: string,
    options: HttpRequestOptions,
  ): Promise<{ status: number; headers: Record<string, string>; rawBody: string }> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      accept: 'application/json',
      [SESSION_HEADER_NAME]: sessionId,
      ...(options.headers ?? {}),
    };
    let payload: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = headers['content-type'] ?? 'application/json';
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    logger.trace('vCenter HTTP', { method, url });
    let res: Awaited<ReturnType<typeof request>>;
    try {
      res = await request(url, {
        method,
        headers,
        body: payload,
        dispatcher: getHttpAgent(this.config),
      });
    } catch (err) {
      throw new VCenterError(`Network error talking to vCenter (${method} ${path}): ${(err as Error).message}`, {
        code: 'network_error',
        cause: err,
      });
    }
    const rawBody = await res.body.text();
    return {
      status: res.statusCode,
      headers: flattenHeaders(res.headers),
      rawBody,
    };
  }

  private handle<T>(
    method: HttpMethod,
    path: string,
    response: { status: number; headers: Record<string, string>; rawBody: string },
  ): HttpResponse<T> {
    const parsed = parseJson(response.rawBody);
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401) {
        throw new AuthenticationError('vCenter rejected request after re-authentication', parsed);
      }
      throw mapHttpError(response.status, parsed, `${method} ${path} failed (${response.status})`);
    }
    return {
      status: response.status,
      headers: response.headers,
      body: parsed as T,
    };
  }

  private buildUrl(path: string, query: HttpRequestOptions['query']): string {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, this.config.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

const parseJson = (raw: string): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const flattenHeaders = (headers: Record<string, string | string[] | undefined>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }
  return out;
};
