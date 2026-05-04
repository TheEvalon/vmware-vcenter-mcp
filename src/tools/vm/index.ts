import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../../client/index.js';
import { registerVmList } from './list.js';
import { registerVmGet } from './get.js';
import { registerVmCreate } from './create.js';
import { registerVmClone } from './clone.js';
import { registerVmDelete } from './delete.js';
import { registerVmPower } from './power.js';
import { registerVmReconfigure } from './reconfigure.js';
import { registerVmMigrate } from './migrate.js';
import { registerVmRelocate } from './relocate.js';
import { registerVmConsoleTicket } from './console-ticket.js';

/**
 * Registers all VM lifecycle tools.
 */
export const registerVmTools = (server: McpServer, clients: Clients): void => {
  registerVmList(server, clients);
  registerVmGet(server, clients);
  registerVmCreate(server, clients);
  registerVmClone(server, clients);
  registerVmDelete(server, clients);
  registerVmPower(server, clients);
  registerVmReconfigure(server, clients);
  registerVmMigrate(server, clients);
  registerVmRelocate(server, clients);
  registerVmConsoleTicket(server, clients);
};
