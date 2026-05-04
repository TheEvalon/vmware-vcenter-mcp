import type { VCenterConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { TaskFailedError } from './errors.js';
import type { VimJsonClient } from './vimjson-client.js';

export interface TaskInfo {
  state: 'queued' | 'running' | 'success' | 'error' | string;
  result?: unknown;
  error?: unknown;
  progress?: number;
  descriptionId?: string;
  raw: unknown;
}

export interface TaskTrackerOptions {
  /** Override the global timeout in milliseconds. */
  timeoutMs?: number;
  /** Override the global polling interval in milliseconds. */
  pollMs?: number;
}

const TERMINAL: ReadonlySet<string> = new Set(['success', 'error']);

/**
 * Polls the VI/JSON `Task` managed object until it reaches a terminal state
 * or the configured timeout elapses.
 */
export class TaskTracker {
  private readonly config: VCenterConfig;
  private readonly vimjson: VimJsonClient;

  constructor(config: VCenterConfig, vimjson: VimJsonClient) {
    this.config = config;
    this.vimjson = vimjson;
  }

  /**
   * Waits for the supplied vim25 task MoRef to reach a terminal state.
   * Returns the parsed TaskInfo on success, throws TaskFailedError on error
   * or timeout.
   */
  async waitFor(taskMoRef: string, options: TaskTrackerOptions = {}): Promise<TaskInfo> {
    const timeoutMs = options.timeoutMs ?? this.config.taskTimeoutMs;
    const pollMs = options.pollMs ?? this.config.taskPollMs;
    const deadline = Date.now() + timeoutMs;
    let lastInfo: TaskInfo | undefined;
    while (Date.now() < deadline) {
      const info = await this.fetch(taskMoRef);
      lastInfo = info;
      if (TERMINAL.has(info.state)) {
        if (info.state === 'error') {
          throw new TaskFailedError(extractTaskErrorMessage(info), { taskId: taskMoRef, details: info.error });
        }
        return info;
      }
      await sleep(pollMs);
    }
    throw new TaskFailedError(`Task ${taskMoRef} did not complete within ${timeoutMs}ms`, {
      taskId: taskMoRef,
      details: lastInfo?.raw,
    });
  }

  /**
   * Fetches the current TaskInfo for a vim25 task without polling.
   */
  async fetch(taskMoRef: string): Promise<TaskInfo> {
    const raw = await this.vimjson.get<unknown>(`/Task/${taskMoRef}/info`);
    return parseTaskInfo(raw);
  }
}

const parseTaskInfo = (raw: unknown): TaskInfo => {
  if (!raw || typeof raw !== 'object') {
    return { state: 'unknown', raw };
  }
  const r = raw as Record<string, unknown>;
  const state = typeof r['state'] === 'string' ? (r['state'] as string) : 'unknown';
  const out: TaskInfo = { state, raw };
  if (r['result'] !== undefined) out.result = r['result'];
  if (r['error'] !== undefined) out.error = r['error'];
  if (typeof r['progress'] === 'number') out.progress = r['progress'] as number;
  if (typeof r['descriptionId'] === 'string') out.descriptionId = r['descriptionId'] as string;
  return out;
};

const extractTaskErrorMessage = (info: TaskInfo): string => {
  if (!info.error) return 'Task failed';
  if (typeof info.error === 'object') {
    const e = info.error as Record<string, unknown>;
    if (typeof e['localizedMessage'] === 'string') return e['localizedMessage'] as string;
    if (typeof e['message'] === 'string') return e['message'] as string;
  }
  return 'Task failed';
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  logger.trace('Task tracker sleep', { ms });
});
