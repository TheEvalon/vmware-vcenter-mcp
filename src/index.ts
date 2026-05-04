#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { setLogLevel, logger } from './utils/logger.js';
import { buildClients, shutdownClients } from './client/index.js';
import { registerAllTools } from './tools/_register.js';

const SERVER_NAME = 'vmware-vcenter-mcp';
const SERVER_VERSION = '1.0.0';

const main = async (): Promise<void> => {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}`, {
    host: config.host,
    port: config.port,
    insecure: config.insecure,
    readOnly: config.readOnly,
  });

  const clients = buildClients(config);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerAllTools(server, clients);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    try {
      await server.close();
    } catch (err) {
      logger.debug('Error closing MCP server', { error: (err as Error).message });
    }
    await shutdownClients(clients);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server connected on stdio');
};

main().catch((err) => {
  process.stderr.write(`Fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
