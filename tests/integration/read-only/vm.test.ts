import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { firstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: virtual machines', () => {
  it('vm_list returns an array of VM summaries with stable shape', async () => {
    const result = await readOnly.callTool('vm_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; vms: Array<{ vm: string; name: string }> }>(result);
    expect(sc.count).toBe(sc.vms.length);
    if (sc.count > 0) {
      const sample = sc.vms[0]!;
      expect(typeof sample.vm).toBe('string');
      expect(typeof sample.name).toBe('string');
    }
  });

  it('vm_list with a power-state filter parses', async () => {
    const result = await readOnly.callTool('vm_list', { powerStates: ['POWERED_ON'] });
    expectOk(result);
  });

  it('vm_get returns full configuration for the first VM', async () => {
    const first = firstOf(inventory.vms);
    if (!first) {
      console.warn('Skipping vm_get: no VMs in lab');
      return;
    }
    const result = await readOnly.callTool('vm_get', { vmId: first.vm });
    expectOk(result);
    const sc = requireStructured<{ vm: unknown }>(result);
    expect(sc.vm).toBeDefined();
  });

  it('vm_powerState returns a state string', async () => {
    const first = firstOf(inventory.vms);
    if (!first) {
      console.warn('Skipping vm_powerState: no VMs in lab');
      return;
    }
    const result = await readOnly.callTool('vm_powerState', { vmId: first.vm });
    expectOk(result);
    const sc = requireStructured<{ vmId: string; state: string }>(result);
    expect(sc.vmId).toBe(first.vm);
    expect(typeof sc.state).toBe('string');
    expect(sc.state.length).toBeGreaterThan(0);
  });

  // vm_consoleTicket performs an MKS ticket acquisition, which requires the VM
  // to be powered on AND the calling user to have the VirtualMachine.Interact
  // .ConsoleInteract privilege. We tolerate either success or a clean error
  // result; what we don't tolerate is a server crash.
  it('vm_consoleTicket either succeeds or returns a clean isError result', async () => {
    const poweredOn = inventory.vms.find((v) => v.power_state === 'POWERED_ON');
    if (!poweredOn) {
      console.warn('Skipping vm_consoleTicket: no powered-on VM in lab');
      return;
    }
    const result = await readOnly.callTool('vm_consoleTicket', { vmId: poweredOn.vm });
    expect(result.content.length).toBeGreaterThan(0);
    if (!result.isError) {
      const sc = requireStructured<{ ticket: string }>(result);
      expect(typeof sc.ticket).toBe('string');
    }
  });
});
