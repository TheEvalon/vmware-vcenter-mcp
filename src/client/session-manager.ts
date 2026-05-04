import { request } from 'undici';
import type { VCenterConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { AuthenticationError, mapHttpError } from './errors.js';
import { getHttpAgent } from './http-agent.js';

const SESSION_HEADER = 'vmware-api-session-id';
const LOGIN_PATH = '/api/session';

/**
 * Owns the lifecycle of the `vmware-api-session-id` token used by both the
 * Automation REST API and the VI/JSON API. The same session ID is shared by
 * both clients; SOAP keeps its own cookie state in @vates/node-vsphere-soap.
 */
export class SessionManager {
  private readonly config: VCenterConfig;
  private sessionId: string | undefined;
  private inflight: Promise<string> | undefined;

  constructor(config: VCenterConfig) {
    this.config = config;
  }

  /**
   * Returns a valid session ID, performing a fresh login if needed.
   * Concurrent callers share the same in-flight promise so we never run two
   * login round-trips in parallel.
   */
  async getSessionId(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    if (this.inflight) return this.inflight;
    this.inflight = this.login().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  /**
   * Discards the cached session and forces the next call to re-authenticate.
   * Called on 401 responses by the higher-level clients.
   */
  invalidate(): void {
    if (this.sessionId) {
      logger.debug('Invalidated cached vCenter session');
    }
    this.sessionId = undefined;
  }

  /**
   * Logs out of vCenter and discards the cached session. Best-effort.
   */
  async logout(): Promise<void> {
    const id = this.sessionId;
    if (!id) return;
    this.sessionId = undefined;
    try {
      await request(`${this.config.baseUrl}${LOGIN_PATH}`, {
        method: 'DELETE',
        headers: { [SESSION_HEADER]: id },
        dispatcher: getHttpAgent(this.config),
      });
    } catch (err) {
      logger.debug('Logout request failed (ignored)', { error: (err as Error).message });
    }
  }

  private async login(): Promise<string> {
    const url = `${this.config.baseUrl}${LOGIN_PATH}`;
    const credentials = Buffer.from(`${this.config.user}:${this.config.pass}`, 'utf8').toString('base64');
    logger.debug('Authenticating to vCenter', { url, user: this.config.user });
    let res: Awaited<ReturnType<typeof request>>;
    try {
      res = await request(url, {
        method: 'POST',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/json',
        },
        dispatcher: getHttpAgent(this.config),
      });
    } catch (err) {
      throw new AuthenticationError(`Failed to reach vCenter at ${url}: ${(err as Error).message}`, err);
    }

    const status = res.statusCode;
    let parsed: unknown;
    const raw = await res.body.text();
    if (raw.length > 0) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }

    if (status < 200 || status >= 300) {
      throw mapHttpError(status, parsed, `Login failed (${status})`);
    }

    const id = extractSessionId(parsed);
    if (!id) {
      throw new AuthenticationError('vCenter returned a 2xx response without a session id', { body: parsed });
    }
    this.sessionId = id;
    logger.info('vCenter session established');
    return id;
  }
}

const extractSessionId = (body: unknown): string | undefined => {
  if (typeof body === 'string' && body.length > 0) return body.replace(/^"+|"+$/g, '');
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['value'] === 'string') return b['value'] as string;
    if (typeof b['session_id'] === 'string') return b['session_id'] as string;
  }
  return undefined;
};

export const SESSION_HEADER_NAME = SESSION_HEADER;
