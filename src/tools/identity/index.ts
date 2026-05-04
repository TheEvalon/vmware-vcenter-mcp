import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { moRef, unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers identity / RBAC tools.
 *
 * vCenter exposes role and permission management through VI/JSON
 * `AuthorizationManager`; SSO user enumeration is via the Automation REST
 * `/api/vcenter/identity/providers` and SSO API endpoints (which require
 * Identity service privileges).
 */
export const registerIdentityTools = (server: McpServer, clients: Clients): void => {
  registerRoleList(server, clients);
  registerPermissionList(server, clients);
  registerPermissionAssign(server, clients);
  registerIdentityProviderList(server, clients);
};

const getAuthorizationManager = async (clients: Clients): Promise<string> => {
  const content = (await clients.vimjson.get<Record<string, unknown>>('/ServiceInstance/ServiceInstance/content')) ?? {};
  const ref = content['authorizationManager'] as { value?: string } | undefined;
  if (!ref?.value) throw new Error('AuthorizationManager not exposed by vCenter');
  return ref.value;
};

const registerRoleList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'role_list',
    {
      title: 'List Roles',
      description: 'Lists vCenter roles via VI/JSON AuthorizationManager.roleList.',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number().int(), roles: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('role_list', async () => {
      const am = await getAuthorizationManager(clients);
      const roles = await clients.vimjson.get<unknown>(`/AuthorizationManager/${am}/roleList`);
      const list = unwrapVimArray(roles);
      return ok(`Found ${list.length} role(s)`, { count: list.length, roles: list });
    }),
  );
};

const registerPermissionList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'permission_list',
    {
      title: 'List Permissions on Entity',
      description:
        'Lists permissions defined on a vSphere entity via VI/JSON AuthorizationManager.RetrieveEntityPermissions.',
      inputSchema: z.object({
        entityType: z.string().default('Folder'),
        entityId: moRefId,
        inherited: z.boolean().default(false),
      }),
      outputSchema: z.object({ count: z.number().int(), permissions: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('permission_list', async (input) => {
      const am = await getAuthorizationManager(clients);
      const result = await clients.vimjson.post<unknown>(`/AuthorizationManager/${am}/RetrieveEntityPermissions`, {
        entity: moRef(input.entityType, input.entityId),
        inherited: input.inherited,
      });
      const list = unwrapVimArray(result);
      return ok(`Found ${list.length} permission(s)`, { count: list.length, permissions: list });
    }),
  );
};

const registerPermissionAssign = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'permission_assign',
    {
      title: 'Assign Permission',
      description:
        'Sets / overrides a permission on an entity via VI/JSON AuthorizationManager.SetEntityPermissions.',
      inputSchema: z.object({
        entityType: z.string().default('Folder'),
        entityId: moRefId,
        principal: z.string().min(1).describe('Domain\\user or vsphere.local\\group.'),
        roleId: z.number().int(),
        propagate: z.boolean().default(true),
        group: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ assigned: z.boolean() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'permission_assign',
      (input) =>
        buildPreview('permission_assign', `Would assign role ${input.roleId} to ${input.principal} on ${input.entityType}:${input.entityId}`, input),
      async (input) => {
        const am = await getAuthorizationManager(clients);
        await clients.vimjson.post(`/AuthorizationManager/${am}/SetEntityPermissions`, {
          entity: moRef(input.entityType, input.entityId),
          permission: [
            {
              _typeName: 'Permission',
              entity: moRef(input.entityType, input.entityId),
              principal: input.principal,
              group: input.group,
              roleId: input.roleId,
              propagate: input.propagate,
            },
          ],
        });
        return ok(`Assigned role ${input.roleId} to ${input.principal}`, { assigned: true });
      },
    ),
  );
};

const registerIdentityProviderList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'identityProvider_list',
    {
      title: 'List Identity Providers',
      description: 'Lists configured identity providers via /api/vcenter/identity/providers.',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number().int(), providers: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('identityProvider_list', async () => {
      const providers = await clients.rest.get<unknown[]>('/vcenter/identity/providers').catch(() => []);
      const list = Array.isArray(providers) ? providers : [];
      return ok(`Found ${list.length} identity provider(s)`, { count: list.length, providers: list });
    }),
  );
};
