import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, withConfirm } from '../_safety.js';
import { confirmFlag } from '../../schemas/common.js';

const placement = z.object({
  folder: z.string().optional(),
  resourcePool: z.string().optional(),
  cluster: z.string().optional(),
  host: z.string().optional(),
  datastore: z.string().optional(),
});

const networkAdapter = z.object({
  type: z.enum(['VMXNET3', 'E1000', 'E1000E', 'PCNET32', 'SRIOV']).default('VMXNET3'),
  network: z.string().describe('Network MoRef'),
  startConnected: z.boolean().default(true),
});

const disk = z.object({
  newVmdk: z
    .object({
      capacityGB: z.number().int().positive(),
      name: z.string().optional(),
      storagePolicy: z.string().optional(),
    })
    .optional(),
});

/**
 * Registers vm_create which creates a new VM via POST /api/vcenter/vm.
 */
export const registerVmCreate = (server: McpServer, clients: Clients): void => {
  const inputSchema = z.object({
    name: z.string().min(1),
    guestOS: z.string().describe('Guest OS identifier, e.g. RHEL_9_64, WINDOWS_SERVER_2022'),
    placement,
    cpuCount: z.number().int().positive().default(2),
    memoryMiB: z.number().int().positive().default(4096),
    nics: z.array(networkAdapter).optional(),
    disks: z.array(disk).optional(),
    bootOrder: z.array(z.enum(['DISK', 'CDROM', 'ETHERNET', 'FLOPPY'])).optional(),
    confirm: confirmFlag,
  });

  server.registerTool(
    'vm_create',
    {
      title: 'Create VM',
      description:
        'Creates a new VM via POST /api/vcenter/vm. Returns a dry-run preview unless confirm:true is supplied.',
      inputSchema,
      outputSchema: dryRunCompatibleOutput(z.object({ vmId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    withConfirm(
      'vm_create',
      (input) =>
        buildPreview(
          'vm_create',
          `Would create VM ${input.name} (${input.cpuCount} vCPU / ${input.memoryMiB} MiB) on ${describePlacement(input.placement)}`,
          { method: 'POST', path: '/api/vcenter/vm', body: buildVmCreateBody(input) },
        ),
      async (input) => {
        const body = buildVmCreateBody(input);
        const result = await clients.rest.post<string | { value: string }>('/vcenter/vm', body);
        const vmId = typeof result === 'string' ? result : (result?.value ?? '');
        return ok(`Created VM ${input.name} (${vmId})`, { vmId });
      },
    ),
  );
};

const describePlacement = (p: z.infer<typeof placement>): string => {
  return [p.cluster && `cluster=${p.cluster}`, p.host && `host=${p.host}`, p.datastore && `datastore=${p.datastore}`]
    .filter(Boolean)
    .join(', ');
};

const buildVmCreateBody = (input: {
  name: string;
  guestOS: string;
  placement: z.infer<typeof placement>;
  cpuCount: number;
  memoryMiB: number;
  nics?: Array<z.infer<typeof networkAdapter>>;
  disks?: Array<z.infer<typeof disk>>;
  bootOrder?: Array<'DISK' | 'CDROM' | 'ETHERNET' | 'FLOPPY'>;
}): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    name: input.name,
    guest_OS: input.guestOS,
    placement: stripUndefined({
      folder: input.placement.folder,
      resource_pool: input.placement.resourcePool,
      cluster: input.placement.cluster,
      host: input.placement.host,
      datastore: input.placement.datastore,
    }),
    cpu: { count: input.cpuCount },
    memory: { size_MiB: input.memoryMiB },
  };
  if (input.nics?.length) {
    body['nics'] = input.nics.map((n) => ({
      type: n.type,
      backing: { type: 'STANDARD_PORTGROUP', network: n.network },
      start_connected: n.startConnected,
    }));
  }
  if (input.disks?.length) {
    body['disks'] = input.disks.map((d) =>
      d.newVmdk
        ? {
            new_vmdk: stripUndefined({
              capacity: d.newVmdk.capacityGB * 1024 * 1024 * 1024,
              name: d.newVmdk.name,
              storage_policy: d.newVmdk.storagePolicy ? { policy: d.newVmdk.storagePolicy } : undefined,
            }),
          }
        : {},
    );
  }
  if (input.bootOrder?.length) {
    body['boot_devices'] = input.bootOrder.map((type) => ({ type }));
  }
  return body;
};

const stripUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
};
