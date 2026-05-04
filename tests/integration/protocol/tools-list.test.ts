import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { DESTRUCTIVE_TOOL_CASES } from '../helpers/destructive-tools.js';
import type { McpFixture } from '../helpers/mcp-client.js';

/**
 * Tool names every consumer of this MCP server has come to depend on. Cross-
 * checked against the README "Tool catalog". A regression here means a
 * publish would silently break clients.
 */
const EXPECTED_TOOL_NAMES: readonly string[] = [
  // vCenter
  'vcenter_about',
  'vcenter_health',
  // VM lifecycle
  'vm_list',
  'vm_get',
  'vm_powerState',
  'vm_create',
  'vm_clone',
  'vm_delete',
  'vm_powerOn',
  'vm_powerOff',
  'vm_reset',
  'vm_suspend',
  'vm_shutdown',
  'vm_reboot',
  'vm_reconfigure',
  'vm_migrate',
  'vm_relocate',
  'vm_consoleTicket',
  'vm_attachNetwork',
  // Snapshots
  'snapshot_list',
  'snapshot_create',
  'snapshot_revert',
  'snapshot_remove',
  'snapshot_removeAll',
  // Hosts
  'host_list',
  'host_get',
  'host_enterMaintenance',
  'host_exitMaintenance',
  'host_reboot',
  'host_shutdown',
  'host_disconnect',
  'host_reconnect',
  'host_addToCluster',
  // Clusters / DRS / HA
  'cluster_list',
  'cluster_get',
  'cluster_create',
  'cluster_delete',
  'cluster_setDrs',
  'cluster_setHa',
  'drs_recommendations',
  'drs_apply',
  // Datacenters / folders
  'datacenter_list',
  'datacenter_create',
  'datacenter_delete',
  'folder_list',
  'folder_create',
  'folder_delete',
  // Datastores
  'datastore_list',
  'datastore_get',
  'datastore_browse',
  'datastore_searchRecursive',
  'datastore_deleteFile',
  'datastore_moveFile',
  // Networks
  'network_list',
  'dvswitch_list',
  'dvportgroup_list',
  'portgroup_create',
  'portgroup_delete',
  // Resource pools
  'resourcepool_list',
  'resourcepool_create',
  'resourcepool_delete',
  'resourcepool_reconfigure',
  // Templates / content library
  'template_list',
  'template_deploy',
  'contentLibrary_list',
  'contentLibraryItem_list',
  'contentLibraryItem_deploy',
  'contentLibrary_publish',
  // Tags
  'category_list',
  'tag_list',
  'tag_create',
  'tag_attach',
  'tag_detach',
  // Alarms / events
  'alarm_list',
  'alarm_acknowledge',
  'event_list',
  // Performance / stats
  'stats_listCounters',
  'stats_query',
  'stats_summary',
  // ISO / media
  'iso_listFromDatastore',
  'iso_mount',
  'iso_unmount',
  // Customization
  'customization_list',
  'customization_get',
  'customization_apply',
  // Identity / RBAC
  'role_list',
  'permission_list',
  'permission_assign',
  'identityProvider_list',
  // vSphere Lifecycle Manager
  'lifecycle_listClusterImage',
  'lifecycle_checkCompliance',
  'lifecycle_remediate',
  // Tasks
  'task_list',
  'task_get',
  // SOAP
  'soap_runCommand',
];

let readOnly: McpFixture;

beforeAll(async () => {
  ({ readOnly } = await getFixtures());
});

describe('protocol: tools/list contract', () => {
  it('reports every expected tool exactly once', async () => {
    const tools = await readOnly.client.listTools();
    const actualNames = tools.tools.map((t) => t.name);
    const dedup = new Set(actualNames);
    expect(dedup.size).toBe(actualNames.length);

    const missing = EXPECTED_TOOL_NAMES.filter((name) => !dedup.has(name));
    if (missing.length > 0) {
      throw new Error(
        `MCP server is missing tools that the README catalog promises: ${missing.join(', ')}`,
      );
    }
    const unexpected = actualNames.filter((name) => !EXPECTED_TOOL_NAMES.includes(name));
    if (unexpected.length > 0) {
      throw new Error(
        `MCP server registered new tools not yet documented in README catalog: ${unexpected.join(
          ', ',
        )}. Update both the README and EXPECTED_TOOL_NAMES.`,
      );
    }
  });

  it('every tool has both input and output JSON schemas', async () => {
    const tools = await readOnly.client.listTools();
    for (const tool of tools.tools) {
      expect(tool.inputSchema, `${tool.name}.inputSchema`).toBeDefined();
      expect(tool.inputSchema.type, `${tool.name}.inputSchema.type`).toBe('object');
      // outputSchema is optional in MCP, but we set one on every tool in this server.
      expect(tool.outputSchema, `${tool.name}.outputSchema`).toBeDefined();
      expect(tool.outputSchema?.type, `${tool.name}.outputSchema.type`).toBe('object');
    }
  });

  it('every destructive tool exposes a confirm boolean in its input schema', async () => {
    const tools = await readOnly.client.listTools();
    const destructiveNames = new Set(DESTRUCTIVE_TOOL_CASES.map((tc) => tc.name));
    const offenders: string[] = [];
    for (const tool of tools.tools) {
      if (!destructiveNames.has(tool.name)) continue;
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { type?: unknown }>;
      const confirm = props['confirm'];
      if (!confirm || confirm.type !== 'boolean') {
        offenders.push(tool.name);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Destructive tools missing a boolean \`confirm\` field in their input schema: ${offenders.join(
          ', ',
        )}. They will bypass withConfirm() if a client validates the schema.`,
      );
    }
  });

  it('every read-only tool is annotated readOnlyHint or has no destructiveHint:true', async () => {
    const tools = await readOnly.client.listTools();
    const destructiveNames = new Set(DESTRUCTIVE_TOOL_CASES.map((tc) => tc.name));
    for (const tool of tools.tools) {
      if (destructiveNames.has(tool.name)) continue;
      expect(
        tool.annotations?.destructiveHint,
        `${tool.name} is in the read-only set but annotated destructiveHint:true`,
      ).not.toBe(true);
    }
  });
});
