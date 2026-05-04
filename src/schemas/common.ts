import { z } from 'zod';

/**
 * vSphere managed object identifier (e.g. `vm-101`, `host-9`, `domain-c12`).
 * Always a non-empty string in vCenter responses.
 */
export const moRefId = z.string().min(1).describe('vSphere managed object identifier (e.g. vm-101)');

/**
 * Full ManagedObjectReference returned by the VI/JSON API.
 */
export const managedObjectReference = z.object({
  type: z.string(),
  value: z.string(),
});

export type ManagedObjectReference = z.infer<typeof managedObjectReference>;

export const taskReference = z.object({
  taskId: z.string().describe('vim25 Task MoRef value'),
});

export const powerState = z.enum(['POWERED_ON', 'POWERED_OFF', 'SUSPENDED']);

export const confirmFlag = z
  .boolean()
  .default(false)
  .describe('Set true to actually execute the action; otherwise the tool returns a dry-run preview.');
