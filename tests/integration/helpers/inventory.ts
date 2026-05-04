import type { McpFixture } from './mcp-client.js';

interface Counted<T> {
  readonly count: number;
  readonly items: T[];
}

/**
 * Snapshot of the discoverable lab inventory used to drive read-only tests.
 * Anything that can't be enumerated (e.g. customization specs on a fresh
 * lab) lands as an empty array, never undefined; callers branch on length.
 */
export interface Inventory {
  readonly datacenters: ReadonlyArray<{ datacenter: string; name?: string }>;
  readonly clusters: ReadonlyArray<{ cluster: string; name?: string }>;
  readonly hosts: ReadonlyArray<{ host: string; name?: string }>;
  readonly datastores: ReadonlyArray<{ datastore: string; name?: string }>;
  readonly vms: ReadonlyArray<{ vm: string; name?: string; power_state?: string }>;
  readonly networks: ReadonlyArray<{ network: string; name?: string; type?: string }>;
  readonly resourcePools: ReadonlyArray<{ resource_pool: string; name?: string }>;
  readonly folders: ReadonlyArray<{ folder: string; name?: string; type?: string }>;
  readonly tagCategories: ReadonlyArray<unknown>;
  readonly tags: ReadonlyArray<unknown>;
  readonly contentLibraries: ReadonlyArray<unknown>;
  readonly customizationSpecs: ReadonlyArray<{ name?: string }>;
}

const callStructured = async <T>(
  fixture: McpFixture,
  name: string,
  args: Record<string, unknown> = {},
  arrayKey?: string,
): Promise<T[]> => {
  const result = await fixture.callTool(name, args);
  if (result.isError) {
    return [];
  }
  const sc = result.structuredContent as Record<string, unknown> | undefined;
  if (!sc) return [];
  if (arrayKey) {
    const arr = sc[arrayKey];
    return Array.isArray(arr) ? (arr as T[]) : [];
  }
  for (const value of Object.values(sc)) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
};

/**
 * Discovers a baseline inventory by calling every read-only `*_list` tool
 * once. Results are returned as plain arrays so individual test files can
 * pick the first MoRef of each kind.
 */
export const discoverInventory = async (fixture: McpFixture): Promise<Inventory> => {
  const datacenters = await callStructured<{ datacenter: string; name?: string }>(
    fixture,
    'datacenter_list',
    {},
    'datacenters',
  );
  const clusters = await callStructured<{ cluster: string; name?: string }>(
    fixture,
    'cluster_list',
    {},
    'clusters',
  );
  const hosts = await callStructured<{ host: string; name?: string }>(
    fixture,
    'host_list',
    {},
    'hosts',
  );
  const datastores = await callStructured<{ datastore: string; name?: string }>(
    fixture,
    'datastore_list',
    {},
    'datastores',
  );
  const vms = await callStructured<{ vm: string; name?: string; power_state?: string }>(
    fixture,
    'vm_list',
    {},
    'vms',
  );
  const networks = await callStructured<{ network: string; name?: string; type?: string }>(
    fixture,
    'network_list',
    {},
    'networks',
  );
  const resourcePools = await callStructured<{ resource_pool: string; name?: string }>(
    fixture,
    'resourcepool_list',
    {},
    'resourcePools',
  );
  const folders = await callStructured<{ folder: string; name?: string; type?: string }>(
    fixture,
    'folder_list',
    {},
    'folders',
  );
  const tagCategories = await callStructured<unknown>(fixture, 'category_list', { expand: false }, 'categories');
  const tags = await callStructured<unknown>(fixture, 'tag_list', { expand: false }, 'tags');
  const contentLibraries = await callStructured<unknown>(fixture, 'contentLibrary_list', {}, 'libraries');
  const customizationSpecs = await callStructured<{ name?: string }>(
    fixture,
    'customization_list',
    {},
    'specs',
  );

  return {
    datacenters,
    clusters,
    hosts,
    datastores,
    vms,
    networks,
    resourcePools,
    folders,
    tagCategories,
    tags,
    contentLibraries,
    customizationSpecs,
  };
};

/**
 * Compact summary used by `globalSetup` to log what was discovered so test
 * failures are easier to triage.
 */
export const summarizeInventory = (inventory: Inventory): Record<string, number> => ({
  datacenters: inventory.datacenters.length,
  clusters: inventory.clusters.length,
  hosts: inventory.hosts.length,
  datastores: inventory.datastores.length,
  vms: inventory.vms.length,
  networks: inventory.networks.length,
  resourcePools: inventory.resourcePools.length,
  folders: inventory.folders.length,
  tagCategories: inventory.tagCategories.length,
  tags: inventory.tags.length,
  contentLibraries: inventory.contentLibraries.length,
  customizationSpecs: inventory.customizationSpecs.length,
});

/**
 * Convenience: pick the first inventory entry, or undefined if the list is
 * empty. Tests use this to skip-with-warn on minimal labs.
 */
export const firstOf = <T>(list: ReadonlyArray<T>): T | undefined => list[0];

/**
 * Variant that throws a descriptive error when the inventory is empty - used
 * by always-on tools (datacenters, clusters, hosts, ...) where a missing
 * entity indicates a real environment problem, not a benign skip case.
 */
export const requireFirstOf = <T>(list: ReadonlyArray<T>, label: string): T => {
  const first = list[0];
  if (!first) {
    throw new Error(
      `Live vCenter has no ${label}. Cannot run this read-only test against an empty inventory.`,
    );
  }
  return first;
};

export type { Counted };
