import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';

/**
 * Registers all snapshot tools (list, create, revert, remove, removeAll).
 *
 * Snapshot operations live in the vim25 surface only and are exposed via the
 * VI/JSON API (`/sdk/vim25/{release}/...`).
 */
export const registerSnapshotTools = (server: McpServer, clients: Clients): void => {
  registerSnapshotList(server, clients);
  registerSnapshotCreate(server, clients);
  registerSnapshotRevert(server, clients);
  registerSnapshotRemove(server, clients);
  registerSnapshotRemoveAll(server, clients);
};

const registerSnapshotList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'snapshot_list',
    {
      title: 'List Snapshots',
      description: 'Lists the snapshot tree for a VM via VI/JSON VirtualMachine.snapshot.',
      inputSchema: z.object({ vmId: moRefId }),
      outputSchema: z.object({
        currentSnapshot: z.string().optional(),
        rootSnapshotList: z.array(z.unknown()).optional(),
        raw: z.unknown(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('snapshot_list', async (input) => {
      const snapshot = await clients.vimjson.get<Record<string, unknown> | null>(
        `/VirtualMachine/${input.vmId}/snapshot`,
      );
      const current = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : {};
      const rootList = Array.isArray(current['rootSnapshotList']) ? (current['rootSnapshotList'] as unknown[]) : undefined;
      const currentSnapshotMo =
        current['currentSnapshot'] && typeof current['currentSnapshot'] === 'object'
          ? ((current['currentSnapshot'] as Record<string, unknown>)['value'] as string | undefined)
          : undefined;
      return ok(`Snapshots for ${input.vmId}: ${rootList?.length ?? 0} tree root(s)`, {
        currentSnapshot: currentSnapshotMo,
        rootSnapshotList: rootList,
        raw: snapshot ?? null,
      });
    }),
  );
};

const registerSnapshotCreate = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'snapshot_create',
    {
      title: 'Create Snapshot',
      description: 'Creates a snapshot of a VM via VI/JSON CreateSnapshotEx_Task.',
      inputSchema: z.object({
        vmId: moRefId,
        name: z.string().min(1),
        description: z.string().optional(),
        memory: z.boolean().default(false),
        quiesce: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string(), snapshotMoRef: z.string().optional() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'snapshot_create',
      (input) =>
        buildPreview(
          'snapshot_create',
          `Would create snapshot "${input.name}" on ${input.vmId} (memory=${input.memory}, quiesce=${input.quiesce})`,
          {
            method: 'POST',
            path: `/sdk/vim25/{release}/VirtualMachine/${input.vmId}/CreateSnapshotEx_Task`,
            body: { name: input.name, description: input.description, memory: input.memory, quiesceSpec: input.quiesce ? {} : undefined },
          },
        ),
      async (input) => {
        const body: Record<string, unknown> = {
          name: input.name,
          memory: input.memory,
        };
        if (input.description) body['description'] = input.description;
        if (input.quiesce) body['quiesceSpec'] = { _typeName: 'VirtualMachineGuestQuiesceSpec' };
        const task = await clients.vimjson.postTask(`/VirtualMachine/${input.vmId}/CreateSnapshotEx_Task`, body);
        const info = await clients.tasks.waitFor(task.value);
        const result = info.result as { value?: string } | undefined;
        return ok(`Snapshot ${input.name} created`, {
          taskId: task.value,
          snapshotMoRef: result?.value,
        });
      },
    ),
  );
};

const registerSnapshotRevert = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'snapshot_revert',
    {
      title: 'Revert to Snapshot',
      description: 'Reverts a VM to a snapshot via VI/JSON VirtualMachineSnapshot.RevertToSnapshot_Task.',
      inputSchema: z.object({
        snapshotId: moRefId.describe('Snapshot MoRef (e.g. snapshot-42).'),
        suppressPowerOn: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'snapshot_revert',
      (input) =>
        buildPreview('snapshot_revert', `Would revert to snapshot ${input.snapshotId}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/VirtualMachineSnapshot/${input.snapshotId}/RevertToSnapshot_Task`,
          body: { suppressPowerOn: input.suppressPowerOn },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(
          `/VirtualMachineSnapshot/${input.snapshotId}/RevertToSnapshot_Task`,
          { suppressPowerOn: input.suppressPowerOn },
        );
        await clients.tasks.waitFor(task.value);
        return ok(`Reverted to snapshot ${input.snapshotId}`, { taskId: task.value });
      },
    ),
  );
};

const registerSnapshotRemove = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'snapshot_remove',
    {
      title: 'Remove Snapshot',
      description:
        'Removes a single snapshot via VI/JSON VirtualMachineSnapshot.RemoveSnapshot_Task. Optionally consolidates child disks.',
      inputSchema: z.object({
        snapshotId: moRefId,
        removeChildren: z.boolean().default(false),
        consolidate: z.boolean().default(true),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'snapshot_remove',
      (input) =>
        buildPreview(
          'snapshot_remove',
          `Would REMOVE snapshot ${input.snapshotId} (children=${input.removeChildren}, consolidate=${input.consolidate})`,
          {
            method: 'POST',
            path: `/sdk/vim25/{release}/VirtualMachineSnapshot/${input.snapshotId}/RemoveSnapshot_Task`,
            body: { removeChildren: input.removeChildren, consolidate: input.consolidate },
          },
        ),
      async (input) => {
        const task = await clients.vimjson.postTask(
          `/VirtualMachineSnapshot/${input.snapshotId}/RemoveSnapshot_Task`,
          { removeChildren: input.removeChildren, consolidate: input.consolidate },
        );
        await clients.tasks.waitFor(task.value);
        return ok(`Removed snapshot ${input.snapshotId}`, { taskId: task.value });
      },
    ),
  );
};

const registerSnapshotRemoveAll = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'snapshot_removeAll',
    {
      title: 'Remove All Snapshots',
      description: 'Removes ALL snapshots from a VM via VI/JSON VirtualMachine.RemoveAllSnapshots_Task.',
      inputSchema: z.object({
        vmId: moRefId,
        consolidate: z.boolean().default(true),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'snapshot_removeAll',
      (input) =>
        buildPreview(
          'snapshot_removeAll',
          `Would REMOVE ALL snapshots from ${input.vmId} (consolidate=${input.consolidate})`,
          {
            method: 'POST',
            path: `/sdk/vim25/{release}/VirtualMachine/${input.vmId}/RemoveAllSnapshots_Task`,
            body: { consolidate: input.consolidate },
          },
        ),
      async (input) => {
        const task = await clients.vimjson.postTask(`/VirtualMachine/${input.vmId}/RemoveAllSnapshots_Task`, {
          consolidate: input.consolidate,
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Removed all snapshots from ${input.vmId}`, { taskId: task.value });
      },
    ),
  );
};
