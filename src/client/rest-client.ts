import { HttpClient } from './http-client.js';
import type { HttpRequestOptions, HttpResponse } from './http-client.js';

const REST_BASE = '/api';

/**
 * Convenience wrapper around the vSphere Automation REST API rooted at /api.
 * Handlers can call get/post/patch/del with relative paths
 * (e.g. `/vcenter/vm`).
 */
export class RestClient extends HttpClient {
  /**
   * GETs JSON from `/api{path}`.
   */
  async get<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.json<T>('GET', this.buildPath(path), options);
    return res.body;
  }

  /**
   * GET that returns the full HttpResponse instead of just the body. Useful
   * when callers need response headers (e.g. for paging cursors).
   */
  async getRaw<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    return this.json<T>('GET', this.buildPath(path), options);
  }

  /**
   * POSTs JSON to `/api{path}`.
   */
  async post<T = unknown>(path: string, body?: unknown, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.json<T>('POST', this.buildPath(path), { ...options, body });
    return res.body;
  }

  /**
   * PATCHes JSON at `/api{path}`.
   */
  async patch<T = unknown>(path: string, body?: unknown, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.json<T>('PATCH', this.buildPath(path), { ...options, body });
    return res.body;
  }

  /**
   * PUTs JSON at `/api{path}`.
   */
  async put<T = unknown>(path: string, body?: unknown, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.json<T>('PUT', this.buildPath(path), { ...options, body });
    return res.body;
  }

  /**
   * DELETEs `/api{path}`.
   */
  async del<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const res = await this.json<T>('DELETE', this.buildPath(path), options);
    return res.body;
  }

  private buildPath(path: string): string {
    if (path.startsWith('/api/') || path === '/api') return path;
    return `${REST_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
