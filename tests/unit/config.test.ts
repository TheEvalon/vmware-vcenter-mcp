import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTests } from '../../src/config.js';

const PRESERVED_KEYS = [
  'VCENTER_HOST',
  'VCENTER_PORT',
  'VCENTER_USER',
  'VCENTER_PASS',
  'VCENTER_INSECURE',
  'VCENTER_LOG_LEVEL',
  'VCENTER_TASK_TIMEOUT_MS',
  'VCENTER_TASK_POLL_MS',
  'VCENTER_READ_ONLY',
] as const;

const snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of PRESERVED_KEYS) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
  resetConfigForTests();
});

afterEach(() => {
  for (const key of PRESERVED_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
  resetConfigForTests();
});

describe('loadConfig', () => {
  it('returns parsed config when all required vars are set', () => {
    process.env['VCENTER_HOST'] = 'vcenter.example.com';
    process.env['VCENTER_USER'] = 'admin@vsphere.local';
    process.env['VCENTER_PASS'] = 'secret';
    process.env['VCENTER_INSECURE'] = 'true';

    const config = loadConfig();

    expect(config).toMatchObject({
      host: 'vcenter.example.com',
      port: 443,
      user: 'admin@vsphere.local',
      pass: 'secret',
      insecure: true,
      logLevel: 'info',
      taskTimeoutMs: 600_000,
      taskPollMs: 1_500,
      readOnly: false,
      baseUrl: 'https://vcenter.example.com',
    });
  });

  it('respects VCENTER_PORT and VCENTER_LOG_LEVEL overrides', () => {
    process.env['VCENTER_HOST'] = 'host';
    process.env['VCENTER_USER'] = 'u';
    process.env['VCENTER_PASS'] = 'p';
    process.env['VCENTER_PORT'] = '8443';
    process.env['VCENTER_LOG_LEVEL'] = 'debug';

    const config = loadConfig();

    expect(config.port).toBe(8443);
    expect(config.logLevel).toBe('debug');
    expect(config.baseUrl).toBe('https://host:8443');
  });

  it('throws a descriptive error when required vars are missing', () => {
    process.env['VCENTER_HOST'] = '';
    expect(() => loadConfig()).toThrow(/VCENTER_HOST/);
  });

  it('rejects non-positive port', () => {
    process.env['VCENTER_HOST'] = 'h';
    process.env['VCENTER_USER'] = 'u';
    process.env['VCENTER_PASS'] = 'p';
    process.env['VCENTER_PORT'] = '-1';
    expect(() => loadConfig()).toThrow();
  });

  it('parses VCENTER_INSECURE truthy variants', () => {
    for (const value of ['1', 'true', 'YES']) {
      process.env['VCENTER_HOST'] = 'h';
      process.env['VCENTER_USER'] = 'u';
      process.env['VCENTER_PASS'] = 'p';
      process.env['VCENTER_INSECURE'] = value;
      resetConfigForTests();
      expect(loadConfig().insecure).toBe(true);
    }
  });
});
