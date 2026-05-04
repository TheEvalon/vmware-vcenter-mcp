declare module '@vates/node-vsphere-soap' {
  import { EventEmitter } from 'node:events';

  export class Client extends EventEmitter {
    constructor(host: string, user: string, password: string, sslVerify?: boolean, autoLogin?: boolean);
    runCommand(command: string, args: unknown): EventEmitter;
    close(): Promise<void>;
    readonly ready: boolean;
  }
}
