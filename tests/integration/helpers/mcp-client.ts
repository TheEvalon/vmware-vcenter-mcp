import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Result shape returned by tools/call after MCP SDK validation. The MCP server
 * always returns the canonical content-array shape; we narrow that here for
 * convenient access in tests.
 */
export interface CallToolResult {
  readonly content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Bundle of an active MCP connection: the typed client, the underlying
 * transport (used to surface child PID + stderr), and a graceful-close helper.
 */
export interface McpFixture {
  readonly client: Client;
  readonly transport: StdioClientTransport;
  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

/**
 * Resolves the entry point used to spawn the MCP server. Prefers the compiled
 * `dist/index.js` (faster, deterministic) and falls back to `tsx src/index.ts`
 * when the build artifact is missing so the suite is still usable in dev.
 */
const resolveServerSpawn = (): { command: string; args: string[] } => {
  const cwd = process.cwd();
  const distEntry = resolve(cwd, 'dist', 'index.js');
  if (existsSync(distEntry)) {
    return { command: process.execPath, args: [distEntry] };
  }
  const tsxBin = resolve(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (existsSync(tsxBin)) {
    return { command: process.execPath, args: [tsxBin, resolve(cwd, 'src', 'index.ts')] };
  }
  throw new Error(
    'Cannot locate VMware MCP server entry point. Run `npm run build` first or install tsx.',
  );
};

/**
 * Filters the parent process environment down to what the MCP server actually
 * needs (vCenter creds + Node basics) and overlays caller-supplied overrides.
 *
 * MCP stdio child processes inherit a strict whitelist via getDefaultEnvironment,
 * so we pass our own env explicitly to make sure VCENTER_* variables propagate.
 */
const buildChildEnv = (overrides: Record<string, string>): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  Object.assign(env, overrides);
  return env;
};

/**
 * Spawns the VMware MCP server as a child process, connects an MCP SDK client
 * over stdio, and waits for the initialize handshake to complete. Caller is
 * responsible for invoking `fixture.close()` when done; otherwise the child
 * lingers until the parent exits.
 */
export const startMcpServer = async (
  envOverrides: Record<string, string>,
): Promise<McpFixture> => {
  const { command, args } = resolveServerSpawn();
  const transport = new StdioClientTransport({
    command,
    args,
    cwd: process.cwd(),
    env: buildChildEnv(envOverrides),
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'vmware-mcp-integration-tests', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  return {
    client,
    transport,
    async callTool(name, params) {
      const result = await client.callTool({ name, arguments: params ?? {} });
      return result as CallToolResult;
    },
    async close() {
      try {
        await client.close();
      } catch {
        // ignore
      }
      try {
        await transport.close();
      } catch {
        // ignore
      }
      // Give Node a tick to finish reaping the child before we resolve.
      await delay(20);
    },
  };
};

/**
 * Spawns an MCP server with the kill-switch on. Read-only tools work normally
 * here; every destructive tool returns the read-only blocked error regardless
 * of `confirm`.
 */
export const startReadOnlyServer = (): Promise<McpFixture> =>
  startMcpServer({ VCENTER_READ_ONLY: 'true', VCENTER_LOG_LEVEL: 'warn' });

/**
 * Spawns an MCP server with the kill-switch off so destructive tools can
 * produce dry-run previews. Tests must never pass `confirm:true` to this
 * fixture - the safety wrapper would actually call vCenter.
 */
export const startWritableServer = (): Promise<McpFixture> =>
  startMcpServer({ VCENTER_READ_ONLY: 'false', VCENTER_LOG_LEVEL: 'warn' });
