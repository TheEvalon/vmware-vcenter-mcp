# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-04

Initial public release of the VMware vCenter 8.0 Model Context Protocol server.

### Added

- **Tool catalog** spanning the full vCenter management surface:
  - vCenter (`vcenter_about`, `vcenter_health`).
  - VM lifecycle (`vm_list`, `vm_get`, `vm_create`, `vm_clone`, `vm_delete`,
    `vm_powerOn`/`Off`/`reset`/`suspend`, `vm_shutdown`/`reboot`,
    `vm_reconfigure`, `vm_migrate`, `vm_relocate`, `vm_consoleTicket`,
    `vm_attachNetwork`).
  - Snapshots (`snapshot_list`/`create`/`revert`/`remove`/`removeAll`).
  - Hosts (`host_list`/`get`/`enterMaintenance`/`exitMaintenance`/
    `reboot`/`shutdown`/`disconnect`/`reconnect`/`addToCluster`).
  - Clusters & DRS/HA (`cluster_list`/`get`/`create`/`delete`,
    `cluster_setDrs`/`setHa`, `drs_recommendations`/`apply`).
  - Datacenters & folders, datastores (with recursive glob search),
    networks (incl. DV switches/portgroups), resource pools,
    templates & content libraries, tags, alarms/events,
    performance stats, ISO/media, customization specs, identity/RBAC,
    vSphere Lifecycle Manager (vLCM), tasks.
  - SOAP escape hatch (`soap_runCommand`) that lazily loads
    `@vates/node-vsphere-soap` for vim25 methods not exposed by the
    Automation REST or VI/JSON APIs.
- **Three-surface client** sharing one cached `vmware-api-session-id`:
  Automation REST (`/api/...`), VI/JSON (`/sdk/vim25/{release}/...`,
  vCenter 8.0 U1+), and SOAP via `@vates/node-vsphere-soap`. Transparent
  re-authentication on `401` responses.
- **Safety model**:
  - Per-tool `confirm: true` guard on every destructive operation; without
    `confirm`, tools return a structured dry-run preview instead of touching
    vCenter.
  - Global `VCENTER_READ_ONLY=true` kill switch that refuses every
    destructive tool regardless of `confirm`.
- **Comprehensive integration suite** (`npm run test:integration:readonly`)
  that boots the MCP twice over stdio, exercises every read-only tool,
  dry-runs every destructive tool, verifies the read-only kill switch, and
  asserts JSON-RPC stream cleanliness.
- **stdout discipline**: logs only ever go to stderr; stdout is reserved
  for JSON-RPC envelopes.

[1.0.0]: https://github.com/TheEvalon/vmware-vcenter-mcp/releases/tag/v1.0.0
