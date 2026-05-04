import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clients } from '../../client/index.js';
import { buildPreview, dryRunCompatibleOutput, ok, safeReadOnly, withConfirm } from '../_safety.js';
import { confirmFlag, moRefId } from '../../schemas/common.js';
import { moRef, unwrapVimArray } from '../../client/vimjson-client.js';

/**
 * Registers datastore inventory + file management tools.
 *
 * Most file operations route through VI/JSON FileManager (move/delete) and
 * the datastore HTTP file service (`/folder/{path}?dcPath=...`); upload and
 * download tools open the latter on demand.
 */
export const registerDatastoreTools = (server: McpServer, clients: Clients): void => {
  registerDatastoreList(server, clients);
  registerDatastoreGet(server, clients);
  registerDatastoreBrowse(server, clients);
  registerDatastoreSearchRecursive(server, clients);
  registerDatastoreDeleteFile(server, clients);
  registerDatastoreMoveFile(server, clients);
};

/**
 * vSphere FileQuery subclasses surfaced by HostDatastoreBrowser. Selecting
 * one or more lets vCenter skip unrelated files at the source, which is
 * dramatically faster than glob-only filtering on large datastores.
 */
const FileTypeQuery = z.enum([
  'VmDiskFileQuery',
  'IsoImageFileQuery',
  'FloppyImageFileQuery',
  'FolderFileQuery',
  'VmConfigFileQuery',
  'VmTemplateFileQuery',
  'VmLogFileQuery',
  'VmNvramFileQuery',
  'VmSnapshotFileQuery',
]);

const registerDatastoreList = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_list',
    {
      title: 'List Datastores',
      description: 'Lists datastores via /api/vcenter/datastore.',
      inputSchema: z.object({
        names: z.array(z.string()).optional(),
        types: z.array(z.string()).optional(),
        datacenters: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ count: z.number().int(), datastores: z.array(z.unknown()) }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('datastore_list', async (input) => {
      const query: Record<string, string | undefined> = {};
      if (input.names?.length) query['names'] = input.names.join(',');
      if (input.types?.length) query['types'] = input.types.join(',');
      if (input.datacenters?.length) query['datacenters'] = input.datacenters.join(',');
      const datastores = await clients.rest.get<unknown[]>('/vcenter/datastore', { query });
      return ok(`Found ${datastores.length} datastore(s)`, { count: datastores.length, datastores });
    }),
  );
};

const registerDatastoreGet = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_get',
    {
      title: 'Get Datastore',
      description: 'Returns detailed datastore info via /api/vcenter/datastore/{id}.',
      inputSchema: z.object({ datastoreId: moRefId }),
      outputSchema: z.object({ datastore: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('datastore_get', async (input) => {
      const datastore = await clients.rest.get<unknown>(`/vcenter/datastore/${input.datastoreId}`);
      return ok(`Datastore ${input.datastoreId}`, { datastore });
    }),
  );
};

const registerDatastoreBrowse = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_browse',
    {
      title: 'Browse Datastore',
      description:
        'Browses a datastore directory via VI/JSON HostDatastoreBrowser.SearchDatastore_Task. Returns a list of files and folders.',
      inputSchema: z.object({
        datastoreId: moRefId,
        path: z.string().describe('Datastore-relative path, e.g. "[datastore1] folder/"').default('[ds] /'),
        matchPattern: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('datastore_browse', async (input) => {
      const browser = (await clients.vimjson.get<Record<string, unknown>>(`/Datastore/${input.datastoreId}/browser`)) ?? {};
      const browserMo = (browser['value'] as string) ?? (browser as { value?: string })?.value;
      if (!browserMo) {
        throw new Error(`Could not resolve datastore browser for ${input.datastoreId}`);
      }
      const searchSpec: Record<string, unknown> = {
        _typeName: 'HostDatastoreBrowserSearchSpec',
        details: {
          _typeName: 'FileQueryFlags',
          fileType: true,
          fileSize: true,
          fileOwner: false,
          modification: true,
        },
      };
      if (input.matchPattern?.length) searchSpec['matchPattern'] = input.matchPattern;
      const task = await clients.vimjson.postTask(`/HostDatastoreBrowser/${browserMo}/SearchDatastore_Task`, {
        datastorePath: input.path,
        searchSpec,
      });
      const info = await clients.tasks.waitFor(task.value);
      return ok(`Browsed ${input.path}`, { result: info.result ?? null });
    }),
  );
};

const registerDatastoreSearchRecursive = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_searchRecursive',
    {
      title: 'Search Datastore Recursively',
      description:
        'Recursively searches a datastore for files matching one or more glob patterns via ' +
        'VI/JSON HostDatastoreBrowser.SearchDatastoreSubFolders_Task. Use this to find files ' +
        'by extension (e.g. ["*.vmdk"], ["*.iso", "*.img"]) or by filename (e.g. ["myvm.vmx"]) ' +
        'anywhere on a datastore. When `path` is omitted the datastore root is searched. ' +
        'Optionally restrict to vSphere file-type queries (VmDiskFileQuery, IsoImageFileQuery, ' +
        'etc.) for faster scans.',
      inputSchema: z.object({
        datastoreId: moRefId,
        matchPattern: z
          .array(z.string().min(1))
          .min(1)
          .describe('Glob patterns, e.g. ["*.vmdk"], ["*.iso", "*.img"], ["myvm-*.vmx"].'),
        path: z
          .string()
          .optional()
          .describe('Datastore-relative starting path, e.g. "[DRFS-01] folder/". Defaults to the datastore root.'),
        fileTypes: z
          .array(FileTypeQuery)
          .optional()
          .describe('Restrict to vSphere file-type queries to skip unrelated files at the source.'),
        caseInsensitive: z
          .boolean()
          .default(true)
          .describe('Match patterns case-insensitively (defaults true; vSphere native default is false).'),
      }),
      outputSchema: z.object({
        count: z.number().int(),
        folderCount: z.number().int(),
        path: z.string(),
        files: z.array(
          z.object({
            path: z.string(),
            name: z.string(),
            type: z.string().nullable(),
            size: z.number().int().nullable(),
            modification: z.string().nullable(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    safeReadOnly('datastore_searchRecursive', async (input) => {
      const startPath = input.path ?? (await resolveDatastoreRootPath(clients, input.datastoreId));
      const browser = await clients.vimjson.get<Record<string, unknown>>(`/Datastore/${input.datastoreId}/browser`);
      const browserMo = (browser?.['value'] as string) ?? '';
      if (!browserMo) {
        throw new Error(`Could not resolve datastore browser for ${input.datastoreId}`);
      }
      const searchSpec: Record<string, unknown> = {
        _typeName: 'HostDatastoreBrowserSearchSpec',
        matchPattern: input.matchPattern,
        searchCaseInsensitive: input.caseInsensitive,
        details: {
          _typeName: 'FileQueryFlags',
          fileType: true,
          fileSize: true,
          modification: true,
          fileOwner: false,
        },
      };
      if (input.fileTypes?.length) {
        searchSpec['query'] = input.fileTypes.map((t) => ({ _typeName: t }));
      }
      const task = await clients.vimjson.postTask(
        `/HostDatastoreBrowser/${browserMo}/SearchDatastoreSubFolders_Task`,
        { datastorePath: startPath, searchSpec },
      );
      const info = await clients.tasks.waitFor(task.value);
      const files = flattenSearchResults(info.result);
      const folderCount = countSearchedFolders(info.result);
      const summary =
        `Searched ${startPath} for ${input.matchPattern.join(', ')} - ` +
        `found ${files.length} file(s) across ${folderCount} folder(s)`;
      return ok(summary, { count: files.length, folderCount, path: startPath, files });
    }),
  );
};

/**
 * Resolves the default datastore root path "[<name>] /" for a datastore MoRef.
 * Spares callers from having to construct the bracket-prefixed path by hand,
 * which is the most common pitfall when calling HostDatastoreBrowser.
 */
const resolveDatastoreRootPath = async (clients: Clients, datastoreId: string): Promise<string> => {
  const ds = await clients.rest.get<{ name?: string }>(`/vcenter/datastore/${datastoreId}`);
  const name = ds?.name;
  if (!name) {
    throw new Error(`Could not resolve datastore name for ${datastoreId}; pass an explicit path instead.`);
  }
  return `[${name}] /`;
};

interface FlatDatastoreFile {
  path: string;
  name: string;
  type: string | null;
  size: number | null;
  modification: string | null;
}

/**
 * Flattens the array of HostDatastoreBrowserSearchResults returned by
 * SearchDatastoreSubFolders_Task into a single, fully-qualified list of
 * files. Each FileInfo entry's `path` field is the file name; the parent
 * folderPath already ends with `/`, so concatenation yields the canonical
 * datastore path "[datastore] subdir/file.ext".
 *
 * vCenter wraps the array as `{ _typeName: 'ArrayOfHostDatastoreBrowserSearchResults', _value: [...] }`
 * for polymorphic task results; `unwrapVimArray` normalizes both wire shapes.
 */
const flattenSearchResults = (result: unknown): FlatDatastoreFile[] => {
  const folders = unwrapVimArray<Record<string, unknown>>(result);
  const out: FlatDatastoreFile[] = [];
  for (const f of folders) {
    if (!f || typeof f !== 'object') continue;
    const folderPath = typeof f['folderPath'] === 'string' ? (f['folderPath'] as string) : '';
    const files = unwrapVimArray<Record<string, unknown>>(f['file']);
    for (const x of files) {
      if (!x || typeof x !== 'object') continue;
      const name = typeof x['path'] === 'string' ? (x['path'] as string) : '';
      const size = typeof x['fileSize'] === 'number' ? (x['fileSize'] as number) : null;
      const modification = typeof x['modification'] === 'string' ? (x['modification'] as string) : null;
      const type = typeof x['_typeName'] === 'string' ? (x['_typeName'] as string) : null;
      out.push({ path: joinDatastorePath(folderPath, name), name, type, size, modification });
    }
  }
  return out;
};

const countSearchedFolders = (result: unknown): number =>
  unwrapVimArray(result).filter((f) => f && typeof f === 'object').length;

const joinDatastorePath = (folderPath: string, name: string): string => {
  if (!folderPath) return name;
  if (folderPath.endsWith('/')) return `${folderPath}${name}`;
  return `${folderPath}/${name}`;
};

const registerDatastoreDeleteFile = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_deleteFile',
    {
      title: 'Delete Datastore File',
      description: 'Deletes a file/folder on a datastore via VI/JSON FileManager.DeleteDatastoreFile_Task.',
      inputSchema: z.object({
        datacenterId: moRefId,
        path: z.string().describe('Datastore path, e.g. "[datastore1] folder/file.iso"'),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withConfirm(
      'datastore_deleteFile',
      (input) =>
        buildPreview('datastore_deleteFile', `Would DELETE datastore file ${input.path}`, {
          method: 'POST',
          path: `/sdk/vim25/{release}/FileManager/FileManager/DeleteDatastoreFile_Task`,
          body: { name: input.path, datacenter: moRef('Datacenter', input.datacenterId) },
        }),
      async (input) => {
        const task = await clients.vimjson.postTask(`/FileManager/FileManager/DeleteDatastoreFile_Task`, {
          name: input.path,
          datacenter: moRef('Datacenter', input.datacenterId),
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Deleted ${input.path}`, { taskId: task.value });
      },
    ),
  );
};

const registerDatastoreMoveFile = (server: McpServer, clients: Clients): void => {
  server.registerTool(
    'datastore_moveFile',
    {
      title: 'Move/Rename Datastore File',
      description:
        'Moves or renames a file/folder on a datastore via VI/JSON FileManager.MoveDatastoreFile_Task.',
      inputSchema: z.object({
        sourceDatacenterId: moRefId,
        sourcePath: z.string(),
        destinationDatacenterId: moRefId,
        destinationPath: z.string(),
        force: z.boolean().default(false),
        confirm: confirmFlag,
      }),
      outputSchema: dryRunCompatibleOutput(z.object({ taskId: z.string() })),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    withConfirm(
      'datastore_moveFile',
      (input) =>
        buildPreview('datastore_moveFile', `Would move ${input.sourcePath} -> ${input.destinationPath}`, input),
      async (input) => {
        const task = await clients.vimjson.postTask(`/FileManager/FileManager/MoveDatastoreFile_Task`, {
          sourceName: input.sourcePath,
          sourceDatacenter: moRef('Datacenter', input.sourceDatacenterId),
          destinationName: input.destinationPath,
          destinationDatacenter: moRef('Datacenter', input.destinationDatacenterId),
          force: input.force,
        });
        await clients.tasks.waitFor(task.value);
        return ok(`Moved ${input.sourcePath} -> ${input.destinationPath}`, { taskId: task.value });
      },
    ),
  );
};
