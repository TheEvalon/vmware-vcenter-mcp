import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// `quiet: true` suppresses the dotenv@17 stdout banner, which otherwise
// corrupts the JSON-RPC frames the MCP server emits on stdout.
loadDotenv({ quiet: true });

const truthy = ['1', 'true', 'TRUE', 'True', 'yes', 'YES'] as const;

const stringBool = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? false : (truthy as readonly string[]).includes(value)));

const intish = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return defaultValue;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        ctx.addIssue({ code: 'custom', message: 'must be a positive integer' });
        return z.NEVER;
      }
      return Math.floor(parsed);
    });

const logLevels = ['trace', 'debug', 'info', 'warn', 'error'] as const;

const envSchema = z.object({
  VCENTER_HOST: z.string().min(1, 'VCENTER_HOST is required'),
  VCENTER_PORT: intish(443),
  VCENTER_USER: z.string().min(1, 'VCENTER_USER is required'),
  VCENTER_PASS: z.string().min(1, 'VCENTER_PASS is required'),
  VCENTER_INSECURE: stringBool,
  VCENTER_LOG_LEVEL: z.enum(logLevels).optional().default('info'),
  VCENTER_TASK_TIMEOUT_MS: intish(600_000),
  VCENTER_TASK_POLL_MS: intish(1_500),
  VCENTER_READ_ONLY: stringBool,
});

export type LogLevel = (typeof logLevels)[number];

export interface VCenterConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly insecure: boolean;
  readonly logLevel: LogLevel;
  readonly taskTimeoutMs: number;
  readonly taskPollMs: number;
  readonly readOnly: boolean;
  readonly baseUrl: string;
}

let cached: VCenterConfig | undefined;

/**
 * Loads, validates and caches the runtime configuration from environment variables.
 * Throws a descriptive Error if any required variable is missing or malformed.
 */
export const loadConfig = (): VCenterConfig => {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const lines = Object.entries(flat).map(([key, errs]) => `  - ${key}: ${(errs ?? []).join(', ')}`);
    throw new Error(`Invalid VMware MCP configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const baseUrl = e.VCENTER_PORT === 443 ? `https://${e.VCENTER_HOST}` : `https://${e.VCENTER_HOST}:${e.VCENTER_PORT}`;
  cached = {
    host: e.VCENTER_HOST,
    port: e.VCENTER_PORT,
    user: e.VCENTER_USER,
    pass: e.VCENTER_PASS,
    insecure: e.VCENTER_INSECURE,
    logLevel: e.VCENTER_LOG_LEVEL,
    taskTimeoutMs: e.VCENTER_TASK_TIMEOUT_MS,
    taskPollMs: e.VCENTER_TASK_POLL_MS,
    readOnly: e.VCENTER_READ_ONLY,
    baseUrl,
  };
  return cached;
};

/**
 * Resets the cached config; intended for unit tests only.
 */
export const resetConfigForTests = (): void => {
  cached = undefined;
};
