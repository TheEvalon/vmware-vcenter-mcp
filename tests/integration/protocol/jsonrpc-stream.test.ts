import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bypasses the MCP SDK transport so the test can inspect raw stdout chunks
 * straight off the wire. The MCP server is required to write JSON-RPC frames
 * (newline-delimited JSON) to stdout and EVERYTHING ELSE to stderr; a stray
 * `console.log` corrupts the JSON-RPC stream and bricks any client. This is
 * exactly the failure mode called out in the README troubleshooting section.
 */

const resolveServerSpawn = (): { command: string; args: string[] } => {
  const cwd = process.cwd();
  const distEntry = resolve(cwd, 'dist', 'index.js');
  if (existsSync(distEntry)) {
    return { command: process.execPath, args: [distEntry] };
  }
  const tsxBin = resolve(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return { command: process.execPath, args: [tsxBin, resolve(cwd, 'src', 'index.ts')] };
};

const buildEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v;
  }
  env['VCENTER_READ_ONLY'] = 'true';
  env['VCENTER_LOG_LEVEL'] = 'warn';
  return env;
};

let proc: ChildProcessWithoutNullStreams | undefined;
const stdoutChunks: string[] = [];

beforeAll(async () => {
  const { command, args } = resolveServerSpawn();
  proc = spawn(command, args, {
    cwd: process.cwd(),
    env: buildEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => stdoutChunks.push(chunk));
  // Drain stderr to keep the OS pipe buffer from filling up.
  proc.stderr.on('data', () => undefined);

  // Drive the JSON-RPC handshake by hand so we can also exercise tools/call.
  send(proc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'jsonrpc-stream-test', version: '0.0.0' },
    },
  });
  await waitForId(1);
  send(proc, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  send(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  await waitForId(2);
  send(proc, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'vcenter_about', arguments: {} },
  });
  await waitForId(3);
});

afterAll(() => {
  if (proc && !proc.killed) {
    proc.kill();
  }
});

const send = (p: ChildProcessWithoutNullStreams, msg: unknown): void => {
  p.stdin.write(`${JSON.stringify(msg)}\n`);
};

const waitForId = async (id: number, timeoutMs = 30_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const joined = stdoutChunks.join('');
    for (const line of joined.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { id?: unknown };
        if (parsed.id === id) return;
      } catch {
        // partial frame; keep waiting
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for JSON-RPC response id=${id}`);
};

describe('protocol: stdout never carries non-JSON-RPC frames', () => {
  it('every newline-delimited stdout line parses as a JSON-RPC envelope', () => {
    const joined = stdoutChunks.join('');
    const lines = joined.split('\n').filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        throw new Error(
          `Found non-JSON line on stdout (would corrupt JSON-RPC stream):\n${line.slice(0, 200)}\nParse error: ${(err as Error).message}`,
        );
      }
      expect(parsed, `JSON-RPC frame: ${line.slice(0, 200)}`).toBeTypeOf('object');
      const env = parsed as Record<string, unknown>;
      expect(env['jsonrpc']).toBe('2.0');
    }
  });
});
