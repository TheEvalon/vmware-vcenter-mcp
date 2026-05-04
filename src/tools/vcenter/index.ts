import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { ok, safeReadOnly } from '../_safety.js';
import { SERVICE_INSTANCE_MOID } from '../../client/vimjson-client.js';

/**
 * Registers vCenter introspection tools (about and health).
 */
export const registerVcenterTools = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'vcenter_about',
    {
      title: 'vCenter About',
      description: 'Returns version / build / vendor info from the vCenter ServiceInstance.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        name: z.string().optional(),
        version: z.string().optional(),
        build: z.string().optional(),
        apiVersion: z.string().optional(),
        instanceUuid: z.string().optional(),
        productLineId: z.string().optional(),
        vendor: z.string().optional(),
        raw: z.unknown(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('vcenter_about', async () => {
      const content = await clients.vimjson.get<unknown>(`/${SERVICE_INSTANCE_MOID}/${SERVICE_INSTANCE_MOID}/content`);
      const about = (content as { about?: Record<string, unknown> })?.about ?? {};
      const summary = `${about['fullName'] ?? 'VMware vCenter'} (apiVersion ${about['apiVersion'] ?? 'unknown'})`;
      return ok(summary, {
        name: typeof about['fullName'] === 'string' ? (about['fullName'] as string) : undefined,
        version: typeof about['version'] === 'string' ? (about['version'] as string) : undefined,
        build: typeof about['build'] === 'string' ? (about['build'] as string) : undefined,
        apiVersion: typeof about['apiVersion'] === 'string' ? (about['apiVersion'] as string) : undefined,
        instanceUuid: typeof about['instanceUuid'] === 'string' ? (about['instanceUuid'] as string) : undefined,
        productLineId: typeof about['productLineId'] === 'string' ? (about['productLineId'] as string) : undefined,
        vendor: typeof about['vendor'] === 'string' ? (about['vendor'] as string) : undefined,
        raw: about,
      });
    }),
  );

  server.registerTool(
    'vcenter_health',
    {
      title: 'vCenter Health',
      description: 'Returns the overall vCenter health status from /api/appliance/health/system.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        system: z.string(),
        components: z.record(z.string(), z.string()).optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('vcenter_health', async () => {
      const components: Record<string, string> = {};
      const componentNames = ['system', 'database-storage', 'load', 'mem', 'storage', 'swap', 'applmgmt'];
      for (const name of componentNames) {
        try {
          const value = await clients.rest.get<string>(`/appliance/health/${name}`);
          components[name] = typeof value === 'string' ? value.replace(/^"+|"+$/g, '') : String(value);
        } catch {
          components[name] = 'unknown';
        }
      }
      const system = components['system'] ?? 'unknown';
      return ok(`vCenter health: ${system}`, { system, components });
    }),
  );
};
