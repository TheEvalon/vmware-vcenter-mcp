import type { VCenterConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { VCenterError } from './errors.js';

/**
 * Lazy wrapper around @vates/node-vsphere-soap. Used only when an operation
 * cannot be expressed via the Automation REST or VI/JSON APIs (e.g. some
 * pre-8.0U1 deployments or niche vim25 features).
 *
 * The underlying library is loaded dynamically the first time `connect()` is
 * called so the SOAP dependency cost is paid only when actually needed.
 */
export class SoapClient {
  private readonly config: VCenterConfig;
  private rawClient: unknown;
  private connected = false;

  constructor(config: VCenterConfig) {
    this.config = config;
  }

  /**
   * Establishes a SOAP session to vCenter.
   * Throws a VCenterError if the dependency is missing or login fails.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    let lib: { Client: new (host: string, user: string, pass: string, sslVerify?: boolean, autoLogin?: boolean) => unknown };
    try {
      lib = (await import('@vates/node-vsphere-soap')) as typeof lib;
    } catch (err) {
      throw new VCenterError(
        '@vates/node-vsphere-soap is not installed; SOAP fallback unavailable. Run `npm install @vates/node-vsphere-soap` to enable.',
        { code: 'soap_unavailable', cause: err },
      );
    }
    const client = new lib.Client(this.config.host, this.config.user, this.config.pass, !this.config.insecure, true);
    this.rawClient = client;
    await waitForReady(client);
    this.connected = true;
    logger.info('SOAP session established with vCenter');
  }

  /**
   * Issues a `runCommand` against the SOAP client. The command name and
   * arguments mirror the vim25 method signature documented at
   * https://developer.broadcom.com/xapis/vsphere-web-services-api/8.0U3/.
   */
  async runCommand<T = unknown>(name: string, args: unknown): Promise<T> {
    if (!this.connected || !this.rawClient) {
      await this.connect();
    }
    return new Promise<T>((resolve, reject) => {
      const client = this.rawClient as {
        runCommand: (name: string, args: unknown) => { once(event: string, listener: (payload: unknown) => void): void };
      };
      const emitter = client.runCommand(name, args);
      emitter.once('result', (result) => resolve(result as T));
      emitter.once('error', (err) =>
        reject(
          new VCenterError(`SOAP ${name} failed: ${(err as Error)?.message ?? String(err)}`, {
            code: 'soap_command_failed',
            cause: err,
          }),
        ),
      );
    });
  }

  /**
   * Closes the SOAP session.
   */
  async close(): Promise<void> {
    if (!this.connected || !this.rawClient) return;
    try {
      const client = this.rawClient as { close?: () => Promise<void> };
      if (typeof client.close === 'function') await client.close();
    } catch (err) {
      logger.debug('SOAP close failed (ignored)', { error: (err as Error).message });
    } finally {
      this.connected = false;
    }
  }
}

const waitForReady = (client: unknown): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const c = client as { once?: (event: string, listener: (payload?: unknown) => void) => void; ready?: boolean };
    if (c.ready) {
      resolve();
      return;
    }
    if (typeof c.once !== 'function') {
      resolve();
      return;
    }
    c.once('ready', () => resolve());
    c.once('error', (err) =>
      reject(
        new VCenterError(`SOAP connect failed: ${(err as Error)?.message ?? String(err)}`, {
          code: 'soap_connect_failed',
          cause: err,
        }),
      ),
    );
  });
