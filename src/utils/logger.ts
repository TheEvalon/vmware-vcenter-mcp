import type { LogLevel } from '../config.js';

const ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

let currentLevel: LogLevel = 'info';

/**
 * Configures the active log level. Call once at startup from loaded config.
 */
export const setLogLevel = (level: LogLevel): void => {
  currentLevel = level;
};

/**
 * Returns the active log level.
 */
export const getLogLevel = (): LogLevel => currentLevel;

const shouldLog = (level: LogLevel): boolean => ORDER[level] >= ORDER[currentLevel];

const write = (level: LogLevel, message: string, meta?: unknown): void => {
  if (!shouldLog(level)) return;
  const stamp = new Date().toISOString();
  const base = `[${stamp}] ${level.toUpperCase()} ${message}`;
  if (meta !== undefined) {
    process.stderr.write(`${base} ${safeStringify(meta)}\n`);
    return;
  }
  process.stderr.write(`${base}\n`);
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, redact);
  } catch {
    return String(value);
  }
};

const SECRET_KEYS = new Set(['password', 'pass', 'authorization', 'cookie', 'set-cookie', 'vmware-api-session-id']);

const redact = (key: string, value: unknown): unknown => {
  if (SECRET_KEYS.has(key.toLowerCase())) return '[REDACTED]';
  return value;
};

export const logger = {
  trace: (msg: string, meta?: unknown) => write('trace', msg, meta),
  debug: (msg: string, meta?: unknown) => write('debug', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
};
