import { HttpClient } from './http-client.js';
import type { HttpRequestOptions } from './http-client.js';
import { logger } from '../utils/logger.js';

export const SERVICE_INSTANCE_MOID = 'ServiceInstance';

/**
 * Wrapper around the VI/JSON API (`/sdk/vim25/{release}/...`) added in vSphere
 * 8.0 Update 1. The release segment is auto-detected from the
 * ServiceInstance's about info on first use and cached for the rest of the
 * process lifetime.
 *
 * VI/JSON exposes the full vim25 surface (tasks, snapshots, advanced VM ops,
 * performance manager, etc.) using JSON instead of SOAP/XML. It re-uses the
 * same session header as the Automation REST API, so no extra login is
 * required.
 */
export class VimJsonClient extends HttpClient {
  private releaseCache: string | undefined;
  private inflight: Promise<string> | undefined;

  /**
   * Returns the resolved release segment, e.g. `8.0.3.0`.
   * Falls back to `release` if the ServiceInstance probe does not return a
   * usable apiVersion.
   */
  async getRelease(): Promise<string> {
    if (this.releaseCache) return this.releaseCache;
    if (this.inflight) return this.inflight;
    this.inflight = this.detectRelease().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  /**
   * GETs a vim25 resource. Path is relative to the vim25/{release} prefix,
   * e.g. `/VirtualMachine/vm-101/config`.
   */
  async get<T = unknown>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const fullPath = await this.buildPath(path);
    const res = await this.json<T>('GET', fullPath, options);
    return res.body;
  }

  /**
   * POSTs to a vim25 method endpoint. Path is relative to the vim25/{release}
   * prefix, e.g. `/VirtualMachine/vm-101/PowerOnVM_Task`.
   */
  async post<T = unknown>(path: string, body?: unknown, options: HttpRequestOptions = {}): Promise<T> {
    const fullPath = await this.buildPath(path);
    const res = await this.json<T>('POST', fullPath, { ...options, body: body ?? {} });
    return res.body;
  }

  /**
   * Convenience for the very common pattern of POSTing a `*_Task` method and
   * receiving back a ManagedObjectReference to a Task.
   */
  async postTask(path: string, body: unknown = {}): Promise<{ type: string; value: string }> {
    const result = await this.post<unknown>(path, body);
    return parseManagedObjectReference(result);
  }

  /**
   * Calls a method on the singleton ServiceInstance.
   */
  async callServiceInstance<T = unknown>(method: string, body: unknown = {}): Promise<T> {
    return this.post<T>(`/${SERVICE_INSTANCE_MOID}/${SERVICE_INSTANCE_MOID}/${method}`, body);
  }

  private async buildPath(relativePath: string): Promise<string> {
    const release = await this.getRelease();
    const trimmed = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return `/sdk/vim25/${release}${trimmed}`;
  }

  private async detectRelease(): Promise<string> {
    const fallback = 'release';
    const fromVersionsXml = await this.tryServiceVersionsXml();
    if (fromVersionsXml) {
      this.releaseCache = fromVersionsXml;
      logger.debug('Detected VI/JSON release from vimServiceVersions.xml', { release: fromVersionsXml });
      return fromVersionsXml;
    }
    try {
      const probe = await this.json<unknown>('GET', '/sdk/vim25/release/ServiceInstance/ServiceInstance/content', {});
      const apiVersion = extractApiVersion(probe.body);
      if (apiVersion) {
        this.releaseCache = apiVersion;
        logger.debug('Detected VI/JSON release from "release" alias probe', { release: apiVersion });
        return apiVersion;
      }
    } catch (err) {
      logger.debug('Could not auto-detect VI/JSON release; using "release"', { error: (err as Error).message });
    }
    this.releaseCache = fallback;
    return fallback;
  }

  /**
   * Probes the well-known `/sdk/vimServiceVersions.xml` endpoint, which is
   * version-independent and lists the supported vim25 namespace versions in
   * descending order (newest first). Used as the primary VI/JSON release
   * detection mechanism because the older `/sdk/vim25/release/...` alias is
   * not honored by every 8.0 patch level.
   */
  private async tryServiceVersionsXml(): Promise<string | undefined> {
    try {
      const probe = await this.json<unknown>('GET', '/sdk/vimServiceVersions.xml', {});
      const xml = typeof probe.body === 'string' ? probe.body : undefined;
      if (!xml) return undefined;
      return extractLatestVimVersion(xml);
    } catch (err) {
      logger.debug('vimServiceVersions.xml probe failed', { error: (err as Error).message });
      return undefined;
    }
  }
}

/**
 * Extracts the newest vim25 namespace version from the XML returned by
 * `/sdk/vimServiceVersions.xml`. The first `<version>` element directly
 * inside the urn:vim25 namespace block is the current release; subsequent
 * versions live in the `<priorVersions>` child element.
 */
const extractLatestVimVersion = (xml: string): string | undefined => {
  const namespaceBlock = /<namespace>([\s\S]*?)<\/namespace>/g;
  let match: RegExpExecArray | null;
  while ((match = namespaceBlock.exec(xml)) !== null) {
    const block = match[1] ?? '';
    if (!/<name>\s*urn:vim25\s*<\/name>/.test(block)) continue;
    const beforePrior = block.split(/<priorVersions\b/)[0] ?? block;
    const versionMatch = beforePrior.match(/<version>\s*([^<\s]+)\s*<\/version>/);
    if (versionMatch?.[1]) return versionMatch[1];
  }
  return undefined;
};

/**
 * Factory for a VI/JSON ManagedObjectReference payload. The vim25 surface
 * decodes any nested object that lacks a `_typeName` discriminator as a
 * default-MoRef, which surfaces as `Invalid MoRef field: ...` errors when
 * the payload was actually meant to be a config/spec/filter type. Always
 * use this helper to build MoRef references in request bodies.
 */
export const moRef = (
  type: string,
  value: string,
): { _typeName: 'ManagedObjectReference'; type: string; value: string } => ({
  _typeName: 'ManagedObjectReference',
  type,
  value,
});

/**
 * Normalizes a VI/JSON array response into a plain JS array.
 *
 * vSphere returns array-typed results in either of two shapes depending on
 * whether the field is polymorphic:
 *
 *   1. A bare JSON array, e.g. `[ ..items.. ]`.
 *   2. A polymorphic envelope, e.g.
 *      `{ "_typeName": "ArrayOfHostDatastoreBrowserSearchResults",
 *         "_value": [ ..items.. ] }`.
 *
 * Some responses also wrap their payload under `returnval`. This helper
 * collapses all three shapes to a plain array so callers can iterate
 * uniformly without branching on the wire format.
 */
export const unwrapVimArray = <T = unknown>(value: unknown): T[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v['_value'])) return v['_value'] as T[];
    if (Array.isArray(v['returnval'])) return v['returnval'] as T[];
    if (v['returnval'] !== undefined) return unwrapVimArray<T>(v['returnval']);
  }
  return [];
};

const parseManagedObjectReference = (value: unknown): { type: string; value: string } => {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v['_typeName'] === 'string' && typeof v['type'] === 'string' && typeof v['value'] === 'string') {
      return { type: v['type'] as string, value: v['value'] as string };
    }
    if (typeof v['type'] === 'string' && typeof v['value'] === 'string') {
      return { type: v['type'] as string, value: v['value'] as string };
    }
    if (typeof v['returnval'] === 'object' && v['returnval'] !== null) {
      return parseManagedObjectReference(v['returnval']);
    }
  }
  throw new Error(`Unexpected response shape from VI/JSON Task call: ${JSON.stringify(value)}`);
};

const extractApiVersion = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const about = b['about'] as Record<string, unknown> | undefined;
  if (about && typeof about['apiVersion'] === 'string') return about['apiVersion'] as string;
  return undefined;
};
