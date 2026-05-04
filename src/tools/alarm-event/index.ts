import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { moRef, unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers tools that surface alarms and historical events.
 *
 * vCenter 8.0 exposes alarm CRUD via VI/JSON `AlarmManager` and events via
 * VI/JSON `EventManager.QueryEvents`. There is no Automation REST surface for
 * either as of 8.0 U3, so these tools always go through VI/JSON.
 */
export const registerAlarmEventTools = (server: McpServer, clients: Clients): void => {
  registerAlarmList(server, clients);
  registerAlarmAck(server, clients);
  registerEventList(server, clients);
};

const registerAlarmList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'alarm_list',
    {
      title: 'List Alarms',
      description:
        'Lists alarms defined on an entity (default: ServiceInstance content rootFolder) via VI/JSON AlarmManager.GetAlarm.',
      inputSchema: z.object({ entityId: moRefId.optional(), entityType: z.string().default('Folder') }),
      outputSchema: z.object({ count: z.number().int(), alarms: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('alarm_list', async (input) => {
      const args: Record<string, unknown> = {};
      if (input.entityId) args['entity'] = moRef(input.entityType, input.entityId);
      const alarmManager = await getAlarmManager(clients);
      const result = await clients.vimjson.post<unknown>(`/AlarmManager/${alarmManager}/GetAlarm`, args);
      const list = unwrapVimArray(result);
      return ok(`Found ${list.length} alarm(s)`, { count: list.length, alarms: list });
    }),
  );
};

const registerAlarmAck = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'alarm_acknowledge',
    {
      title: 'Acknowledge Alarm',
      description: 'Acknowledges an alarm on an entity via VI/JSON AlarmManager.AcknowledgeAlarm.',
      inputSchema: z.object({
        alarmId: moRefId,
        entityId: moRefId,
        entityType: z.string().default('VirtualMachine'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ alarmId: z.string() })),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    withConfirm(
      'alarm_acknowledge',
      (input) => buildPreview('alarm_acknowledge', `Would acknowledge alarm ${input.alarmId} on ${input.entityId}`, input),
      async (input) => {
        const alarmManager = await getAlarmManager(clients);
        await clients.vimjson.post(`/AlarmManager/${alarmManager}/AcknowledgeAlarm`, {
          alarm: moRef('Alarm', input.alarmId),
          entity: moRef(input.entityType, input.entityId),
        });
        return ok(`Acknowledged alarm ${input.alarmId}`, { alarmId: input.alarmId });
      },
    ),
  );
};

const registerEventList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'event_list',
    {
      title: 'List Events',
      description:
        'Queries vCenter event history via VI/JSON EventManager.QueryEvents. Supports time and entity filters.',
      inputSchema: z.object({
        entityId: z.string().optional(),
        entityType: z.string().default('VirtualMachine'),
        recursion: z.enum(['self', 'children', 'all']).default('all'),
        eventTypeIds: z.array(z.string()).optional(),
        beginTime: z.string().optional().describe('ISO timestamp.'),
        endTime: z.string().optional().describe('ISO timestamp.'),
        limit: z.number().int().positive().max(1000).default(100),
      }),
      outputSchema: z.object({ count: z.number().int(), events: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('event_list', async (input) => {
      const eventManager = await getEventManager(clients);
      const filter: Record<string, unknown> = {
        _typeName: 'EventFilterSpec',
        maxCount: input.limit,
      };
      if (input.entityId) {
        filter['entity'] = {
          _typeName: 'EventFilterSpecByEntity',
          entity: moRef(input.entityType, input.entityId),
          recursion: input.recursion,
        };
      }
      if (input.eventTypeIds?.length) filter['eventTypeId'] = input.eventTypeIds;
      if (input.beginTime || input.endTime) {
        filter['time'] = {
          _typeName: 'EventFilterSpecByTime',
          beginTime: input.beginTime,
          endTime: input.endTime,
        };
      }
      const events = await clients.vimjson.post<unknown>(`/EventManager/${eventManager}/QueryEvents`, { filter });
      const list = unwrapVimArray(events);
      return ok(`Found ${list.length} event(s)`, { count: list.length, events: list });
    }),
  );
};

const getAlarmManager = async (clients: Clients): Promise<string> => {
  const content = (await clients.vimjson.get<Record<string, unknown>>('/ServiceInstance/ServiceInstance/content')) ?? {};
  const ref = content['alarmManager'] as { value?: string } | undefined;
  if (!ref?.value) throw new Error('AlarmManager not exposed by vCenter');
  return ref.value;
};

const getEventManager = async (clients: Clients): Promise<string> => {
  const content = (await clients.vimjson.get<Record<string, unknown>>('/ServiceInstance/ServiceInstance/content')) ?? {};
  const ref = content['eventManager'] as { value?: string } | undefined;
  if (!ref?.value) throw new Error('EventManager not exposed by vCenter');
  return ref.value;
};
