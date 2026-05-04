/**
 * Single source of truth for every tool wrapped with `withConfirm()`.
 *
 * Each entry pairs the tool name with a minimal, *schema-valid* argument
 * payload that uses fake-but-syntactically-correct MoRefs (e.g. `vm-9999`).
 *
 * - In dry-run mode (writable server, `confirm` omitted) the safety wrapper
 *   returns a preview without ever calling vCenter, so the fake IDs are safe.
 * - In read-only-blocked mode (kill-switch on, `confirm:true`) the safety
 *   wrapper short-circuits before the handler runs, so the fake IDs are safe.
 *
 * Keep this list in sync with every `withConfirm(...)` call in `src/tools/`.
 */
export interface DestructiveToolCase {
  /** Tool name registered with the MCP server. */
  readonly name: string;
  /** Minimal arg payload that satisfies the tool's input Zod schema. */
  readonly args: Record<string, unknown>;
  /** Human-readable label for the README "Pre-publish testing" section. */
  readonly note?: string;
}

export const DESTRUCTIVE_TOOL_CASES: readonly DestructiveToolCase[] = [
  // VM lifecycle
  {
    name: 'vm_create',
    args: {
      name: 'preview-vm',
      guestOS: 'OTHER_64',
      placement: { cluster: 'domain-c9999' },
    },
  },
  {
    name: 'vm_clone',
    args: { sourceVmId: 'vm-9999', name: 'preview-clone' },
  },
  { name: 'vm_delete', args: { vmId: 'vm-9999' } },
  { name: 'vm_powerOn', args: { vmId: 'vm-9999' } },
  { name: 'vm_powerOff', args: { vmId: 'vm-9999' } },
  { name: 'vm_reset', args: { vmId: 'vm-9999' } },
  { name: 'vm_suspend', args: { vmId: 'vm-9999' } },
  { name: 'vm_shutdown', args: { vmId: 'vm-9999' } },
  { name: 'vm_reboot', args: { vmId: 'vm-9999' } },
  { name: 'vm_reconfigure', args: { vmId: 'vm-9999', cpuCount: 2 } },
  { name: 'vm_migrate', args: { vmId: 'vm-9999', targetHost: 'host-9999' } },
  { name: 'vm_relocate', args: { vmId: 'vm-9999', datastore: 'datastore-9999' } },
  {
    name: 'vm_attachNetwork',
    args: { vmId: 'vm-9999', network: 'network-9999' },
  },

  // Snapshots
  { name: 'snapshot_create', args: { vmId: 'vm-9999', name: 'preview-snap' } },
  { name: 'snapshot_revert', args: { snapshotId: 'snapshot-9999' } },
  { name: 'snapshot_remove', args: { snapshotId: 'snapshot-9999' } },
  { name: 'snapshot_removeAll', args: { vmId: 'vm-9999' } },

  // Hosts
  { name: 'host_enterMaintenance', args: { hostId: 'host-9999' } },
  { name: 'host_exitMaintenance', args: { hostId: 'host-9999' } },
  { name: 'host_reboot', args: { hostId: 'host-9999' } },
  { name: 'host_shutdown', args: { hostId: 'host-9999' } },
  { name: 'host_disconnect', args: { hostId: 'host-9999' } },
  { name: 'host_reconnect', args: { hostId: 'host-9999' } },
  {
    name: 'host_addToCluster',
    args: {
      clusterId: 'domain-c9999',
      hostname: 'esxi-fake.lab.local',
      userName: 'root',
      password: 'preview',
    },
  },

  // Clusters / DRS / HA
  {
    name: 'cluster_create',
    args: { name: 'preview-cluster', parentFolder: 'group-h9999' },
  },
  { name: 'cluster_delete', args: { clusterId: 'domain-c9999' } },
  { name: 'cluster_setDrs', args: { clusterId: 'domain-c9999', enabled: true } },
  { name: 'cluster_setHa', args: { clusterId: 'domain-c9999', enabled: true } },
  {
    name: 'drs_apply',
    args: { clusterId: 'domain-c9999', key: 'preview-recommendation' },
  },

  // Datacenters / folders
  { name: 'datacenter_create', args: { name: 'preview-dc' } },
  { name: 'datacenter_delete', args: { datacenterId: 'datacenter-9999' } },
  { name: 'folder_create', args: { parentFolderId: 'group-v9999', name: 'preview-folder' } },
  { name: 'folder_delete', args: { folderId: 'group-v9999' } },

  // Datastores
  {
    name: 'datastore_deleteFile',
    args: { datacenterId: 'datacenter-9999', path: '[ds] preview/file.iso' },
  },
  {
    name: 'datastore_moveFile',
    args: {
      sourceDatacenterId: 'datacenter-9999',
      sourcePath: '[ds] preview/old.iso',
      destinationDatacenterId: 'datacenter-9999',
      destinationPath: '[ds] preview/new.iso',
    },
  },

  // Networks
  {
    name: 'portgroup_create',
    args: { dvswitchId: 'dvs-9999', name: 'preview-pg' },
  },
  { name: 'portgroup_delete', args: { portgroupId: 'dvportgroup-9999' } },

  // Resource pools
  {
    name: 'resourcepool_create',
    args: { name: 'preview-rp', parent: 'resgroup-9999' },
  },
  { name: 'resourcepool_delete', args: { resourcePoolId: 'resgroup-9999' } },
  {
    name: 'resourcepool_reconfigure',
    args: { resourcePoolId: 'resgroup-9999', name: 'preview-rp-renamed' },
  },

  // Templates / content library
  {
    name: 'template_deploy',
    args: { templateLibraryItemId: 'item-9999', name: 'preview-from-template' },
  },
  {
    name: 'contentLibraryItem_deploy',
    args: { libraryItemId: 'item-9999', name: 'preview-from-ovf' },
  },
  { name: 'contentLibrary_publish', args: { libraryId: 'lib-9999' } },

  // Tags
  { name: 'tag_create', args: { categoryId: 'cat-9999', name: 'preview-tag' } },
  {
    name: 'tag_attach',
    args: { tagId: 'tag-9999', objectType: 'VirtualMachine', objectId: 'vm-9999' },
  },
  {
    name: 'tag_detach',
    args: { tagId: 'tag-9999', objectType: 'VirtualMachine', objectId: 'vm-9999' },
  },

  // Alarms
  {
    name: 'alarm_acknowledge',
    args: { alarmId: 'alarm-9999', entityId: 'vm-9999' },
  },

  // ISO
  {
    name: 'iso_mount',
    args: { vmId: 'vm-9999', isoPath: '[ds] iso/preview.iso' },
  },
  { name: 'iso_unmount', args: { vmId: 'vm-9999', cdromId: '5000' } },

  // Customization
  {
    name: 'customization_apply',
    args: { vmId: 'vm-9999', specName: 'preview-spec' },
  },

  // Identity / RBAC
  {
    name: 'permission_assign',
    args: {
      entityId: 'group-v9999',
      principal: 'VSPHERE.LOCAL\\preview-user',
      roleId: -1,
    },
  },

  // Lifecycle
  { name: 'lifecycle_remediate', args: { clusterId: 'domain-c9999' } },

  // SOAP escape hatch
  {
    name: 'soap_runCommand',
    args: { command: 'RetrieveServiceContent', args: {} },
  },
];

/**
 * Adds an explicit `confirm:true` to each case so the read-only-blocked test
 * can verify the kill switch even when callers do try to commit. Returns a
 * shallow-cloned array so we never mutate the canonical list.
 */
export const withConfirmTrue = (): readonly DestructiveToolCase[] =>
  DESTRUCTIVE_TOOL_CASES.map((tc) => ({ ...tc, args: { ...tc.args, confirm: true } }));
