import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../client/index.js';
import { registerVcenterTools } from './vcenter/index.js';
import { registerVmTools } from './vm/index.js';
import { registerSnapshotTools } from './snapshot/index.js';
import { registerHostTools } from './host/index.js';
import { registerTaskTools } from './task/index.js';
import { registerClusterTools } from './cluster/index.js';
import { registerDatacenterTools } from './datacenter/index.js';
import { registerDatastoreTools } from './datastore/index.js';
import { registerNetworkTools } from './network/index.js';
import { registerResourcePoolTools } from './resourcepool/index.js';
import { registerTemplateTools } from './template/index.js';
import { registerTagTools } from './tag/index.js';
import { registerAlarmEventTools } from './alarm-event/index.js';
import { registerStatsTools } from './stats/index.js';
import { registerIsoTools } from './iso/index.js';
import { registerCustomizationTools } from './customization/index.js';
import { registerIdentityTools } from './identity/index.js';
import { registerLifecycleTools } from './lifecycle/index.js';
import { registerSoapTools } from './soap/index.js';

/**
 * Registers every tool module on the supplied McpServer.
 * Order is purely cosmetic; tools/list is alphabetically sorted by Cursor.
 */
export const registerAllTools = (server: McpServer, clients: Clients): void => {
  registerVcenterTools(server, clients);
  registerVmTools(server, clients);
  registerSnapshotTools(server, clients);
  registerHostTools(server, clients);
  registerTaskTools(server, clients);
  registerClusterTools(server, clients);
  registerDatacenterTools(server, clients);
  registerDatastoreTools(server, clients);
  registerNetworkTools(server, clients);
  registerResourcePoolTools(server, clients);
  registerTemplateTools(server, clients);
  registerTagTools(server, clients);
  registerAlarmEventTools(server, clients);
  registerStatsTools(server, clients);
  registerIsoTools(server, clients);
  registerCustomizationTools(server, clients);
  registerIdentityTools(server, clients);
  registerLifecycleTools(server, clients);
  registerSoapTools(server, clients);
};
