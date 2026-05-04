import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDatastoreTools } from '../../src/tools/datastore/index.js';
import { RestClient } from '../../src/client/rest-client.js';
import { SessionManager } from '../../src/client/session-manager.js';
import { VimJsonClient } from '../../src/client/vimjson-client.js';
import { TaskTracker } from '../../src/client/task-tracker.js';
import type { Clients } from '../../src/client/index.js';
import { TEST_CONFIG, installMockAgent, interceptOrigin } from './test-helpers.js';

let agent: MockAgent;
let teardown: () => Promise<void>;

const buildClients = (): Clients => {
  const session = new SessionManager(TEST_CONFIG);
  const rest = new RestClient(TEST_CONFIG, session);
  const vimjson = new VimJsonClient(TEST_CONFIG, session);
  return {
    config: TEST_CONFIG,
    session,
    rest,
    vimjson,
    tasks: new TaskTracker(TEST_CONFIG, vimjson),
    async getSoap() {
      throw new Error('not used in datastore search test');
    },
  };
};

const VERSIONS_XML =
  '<?xml version="1.0" encoding="UTF-8" ?>' +
  '<namespaces version="1.0">' +
  '<namespace><name>urn:vim25</name><version>8.0.3.0</version>' +
  '<priorVersions><version>8.0.2.0</version></priorVersions>' +
  '</namespace></namespaces>';

const seedCommonInterceptors = (): void => {
  interceptOrigin(agent).intercept({ path: '/api/session', method: 'POST' }).reply(200, '"sess-1"');
  interceptOrigin(agent).intercept({ path: '/sdk/vimServiceVersions.xml', method: 'GET' }).reply(200, VERSIONS_XML);
};

const seedTaskCycle = (taskMo: string, result: unknown): void => {
  interceptOrigin(agent)
    .intercept({ path: `/sdk/vim25/8.0.3.0/Task/${taskMo}/info`, method: 'GET' })
    .reply(200, { state: 'success', result });
};

const getHandler = (server: McpServer, name: string): ((args: unknown) => Promise<unknown>) => {
  const internal = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
    }
  )._registeredTools;
  const handler = internal[name]?.handler;
  if (!handler) throw new Error(`Tool ${name} not registered`);
  return handler;
};

beforeEach(() => {
  ({ agent, teardown } = installMockAgent());
});

afterEach(async () => {
  await teardown();
});

describe('datastore_searchRecursive tool', () => {
  it('flattens recursive search results across subfolders', async () => {
    seedCommonInterceptors();
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Datastore/datastore-1/browser', method: 'GET' })
      .reply(200, { _typeName: 'ManagedObjectReference', type: 'HostDatastoreBrowser', value: 'dsbrowser-1' });
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/HostDatastoreBrowser/dsbrowser-1/SearchDatastoreSubFolders_Task',
        method: 'POST',
      })
      .reply(200, { _typeName: 'ManagedObjectReference', type: 'Task', value: 'task-9' });
    seedTaskCycle('task-9', {
      _typeName: 'ArrayOfHostDatastoreBrowserSearchResults',
      _value: [
        {
          _typeName: 'HostDatastoreBrowserSearchResults',
          folderPath: '[DRFS-01] vmA/',
          file: {
            _typeName: 'ArrayOfFileInfo',
            _value: [
              { _typeName: 'VmDiskFileInfo', path: 'vmA.vmdk', fileSize: 5_000_000_000, modification: '2026-04-01T10:00:00Z' },
              { _typeName: 'VmDiskFileInfo', path: 'vmA-flat.vmdk', fileSize: 50_000_000_000, modification: '2026-04-01T10:00:00Z' },
            ],
          },
        },
        {
          _typeName: 'HostDatastoreBrowserSearchResults',
          folderPath: '[DRFS-01] vmB/',
          file: [
            { _typeName: 'VmDiskFileInfo', path: 'vmB.vmdk', fileSize: 1_000_000_000, modification: '2026-03-15T08:30:00Z' },
          ],
        },
      ],
    });

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerDatastoreTools(server, buildClients());
    const handler = getHandler(server, 'datastore_searchRecursive');

    const result = (await handler({
      datastoreId: 'datastore-1',
      matchPattern: ['*.vmdk'],
      path: '[DRFS-01] /',
    })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: {
        count: number;
        folderCount: number;
        path: string;
        files: Array<{ path: string; name: string; type: string | null; size: number | null; modification: string | null }>;
      };
    };

    expect(result.content[0]?.text).toMatch(/found 3 file\(s\) across 2 folder\(s\)/);
    expect(result.structuredContent.count).toBe(3);
    expect(result.structuredContent.folderCount).toBe(2);
    expect(result.structuredContent.path).toBe('[DRFS-01] /');
    expect(result.structuredContent.files).toEqual([
      {
        path: '[DRFS-01] vmA/vmA.vmdk',
        name: 'vmA.vmdk',
        type: 'VmDiskFileInfo',
        size: 5_000_000_000,
        modification: '2026-04-01T10:00:00Z',
      },
      {
        path: '[DRFS-01] vmA/vmA-flat.vmdk',
        name: 'vmA-flat.vmdk',
        type: 'VmDiskFileInfo',
        size: 50_000_000_000,
        modification: '2026-04-01T10:00:00Z',
      },
      {
        path: '[DRFS-01] vmB/vmB.vmdk',
        name: 'vmB.vmdk',
        type: 'VmDiskFileInfo',
        size: 1_000_000_000,
        modification: '2026-03-15T08:30:00Z',
      },
    ]);
  });

  it('auto-resolves the datastore root path when none is provided', async () => {
    seedCommonInterceptors();
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/datastore/datastore-1', method: 'GET' })
      .reply(200, { datastore: 'datastore-1', name: 'DRFS-01', type: 'VMFS' });
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Datastore/datastore-1/browser', method: 'GET' })
      .reply(200, { value: 'dsbrowser-1' });
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/HostDatastoreBrowser/dsbrowser-1/SearchDatastoreSubFolders_Task',
        method: 'POST',
      })
      .reply(200, { type: 'Task', value: 'task-10' });
    seedTaskCycle('task-10', []);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerDatastoreTools(server, buildClients());
    const handler = getHandler(server, 'datastore_searchRecursive');

    const result = (await handler({
      datastoreId: 'datastore-1',
      matchPattern: ['*.iso'],
    })) as { structuredContent: { path: string; count: number; folderCount: number } };

    expect(result.structuredContent.path).toBe('[DRFS-01] /');
    expect(result.structuredContent.count).toBe(0);
    expect(result.structuredContent.folderCount).toBe(0);
  });

  it('sends VI/JSON polymorphic _typeName discriminators on searchSpec and FileQueryFlags', async () => {
    seedCommonInterceptors();
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Datastore/datastore-1/browser', method: 'GET' })
      .reply(200, { value: 'dsbrowser-1' });
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/HostDatastoreBrowser/dsbrowser-1/SearchDatastoreSubFolders_Task',
        method: 'POST',
        body: (body) =>
          typeof body === 'string' &&
          body.includes('"_typeName":"HostDatastoreBrowserSearchSpec"') &&
          body.includes('"_typeName":"FileQueryFlags"') &&
          body.includes('"_typeName":"VmDiskFileQuery"'),
      })
      .reply(200, { type: 'Task', value: 'task-11' });
    seedTaskCycle('task-11', []);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerDatastoreTools(server, buildClients());
    const handler = getHandler(server, 'datastore_searchRecursive');

    const result = (await handler({
      datastoreId: 'datastore-1',
      matchPattern: ['*.vmdk'],
      path: '[DRFS-01] /',
      fileTypes: ['VmDiskFileQuery'],
    })) as { structuredContent: { count: number } };

    expect(result.structuredContent.count).toBe(0);
  });
});
