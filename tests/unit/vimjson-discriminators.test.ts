import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStatsTools } from '../../src/tools/stats/index.js';
import { registerAlarmEventTools } from '../../src/tools/alarm-event/index.js';
import { registerIdentityTools } from '../../src/tools/identity/index.js';
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
      throw new Error('not used');
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

const stubServiceContent = (manager: 'eventManager' | 'alarmManager' | 'authorizationManager' | 'perfManager', moRef: string): void => {
  interceptOrigin(agent)
    .intercept({ path: '/sdk/vim25/8.0.3.0/ServiceInstance/ServiceInstance/content', method: 'GET' })
    .reply(200, { [manager]: { _typeName: 'ManagedObjectReference', type: managerType(manager), value: moRef } });
};

const managerType = (manager: string): string => {
  switch (manager) {
    case 'eventManager':
      return 'EventManager';
    case 'alarmManager':
      return 'AlarmManager';
    case 'authorizationManager':
      return 'AuthorizationManager';
    case 'perfManager':
      return 'PerformanceManager';
    default:
      throw new Error(`Unknown manager ${manager}`);
  }
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

describe('VI/JSON polymorphic _typeName discriminators on read-only tools', () => {
  it('event_list emits EventFilterSpec / EventFilterSpecByEntity / EventFilterSpecByTime discriminators and a MoRef-tagged entity', async () => {
    seedCommonInterceptors();
    stubServiceContent('eventManager', 'EventManager');
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/EventManager/EventManager/QueryEvents',
        method: 'POST',
        body: (body) =>
          typeof body === 'string' &&
          body.includes('"_typeName":"EventFilterSpec"') &&
          body.includes('"_typeName":"EventFilterSpecByEntity"') &&
          body.includes('"_typeName":"EventFilterSpecByTime"') &&
          body.includes('"_typeName":"ManagedObjectReference"') &&
          body.includes('"type":"VirtualMachine"'),
      })
      .reply(200, {
        _typeName: 'ArrayOfEvent',
        _value: [
          { _typeName: 'VmPoweredOnEvent', key: 1, fullFormattedMessage: 'fake event' },
        ],
      });

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerAlarmEventTools(server, buildClients());
    const result = (await getHandler(server, 'event_list')({
      entityId: 'vm-1',
      entityType: 'VirtualMachine',
      beginTime: '2026-01-01T00:00:00Z',
      endTime: '2026-02-01T00:00:00Z',
      limit: 10,
    })) as { structuredContent: { count: number } };
    expect(result.structuredContent.count).toBe(1);
  });

  it('stats_query emits PerfQuerySpec / PerfMetricId discriminators and MoRef-tagged entity', async () => {
    seedCommonInterceptors();
    stubServiceContent('perfManager', 'PerfMgr');
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/PerformanceManager/PerfMgr/QueryPerf',
        method: 'POST',
        body: (body) =>
          typeof body === 'string' &&
          body.includes('"_typeName":"PerfQuerySpec"') &&
          body.includes('"_typeName":"PerfMetricId"') &&
          body.includes('"_typeName":"ManagedObjectReference"') &&
          body.includes('"type":"HostSystem"'),
      })
      .reply(200, []);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerStatsTools(server, buildClients());
    const result = (await getHandler(server, 'stats_query')({
      entityType: 'HostSystem',
      entityId: 'host-1',
      counterIds: [1, 2, 3],
      instance: '',
      intervalSeconds: 20,
      maxSamples: 5,
      format: 'normal',
    })) as { structuredContent: { result: unknown } };
    expect(result.structuredContent.result).toEqual([]);
  });

  it('permission_list emits a MoRef-tagged entity', async () => {
    seedCommonInterceptors();
    stubServiceContent('authorizationManager', 'AuthMgr');
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/AuthorizationManager/AuthMgr/RetrieveEntityPermissions',
        method: 'POST',
        body: (body) =>
          typeof body === 'string' &&
          body.includes('"_typeName":"ManagedObjectReference"') &&
          body.includes('"type":"Folder"') &&
          body.includes('"value":"group-d1"'),
      })
      .reply(200, []);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerIdentityTools(server, buildClients());
    const result = (await getHandler(server, 'permission_list')({
      entityType: 'Folder',
      entityId: 'group-d1',
      inherited: false,
    })) as { structuredContent: { count: number } };
    expect(result.structuredContent.count).toBe(0);
  });

  it('alarm_list emits a MoRef-tagged entity when one is supplied', async () => {
    seedCommonInterceptors();
    stubServiceContent('alarmManager', 'AlarmMgr');
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/AlarmManager/AlarmMgr/GetAlarm',
        method: 'POST',
        body: (body) =>
          typeof body === 'string' &&
          body.includes('"_typeName":"ManagedObjectReference"') &&
          body.includes('"type":"VirtualMachine"') &&
          body.includes('"value":"vm-7"'),
      })
      .reply(200, []);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerAlarmEventTools(server, buildClients());
    const result = (await getHandler(server, 'alarm_list')({
      entityId: 'vm-7',
      entityType: 'VirtualMachine',
    })) as { structuredContent: { count: number } };
    expect(result.structuredContent.count).toBe(0);
  });
});
