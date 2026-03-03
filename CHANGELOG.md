# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-03-03

### Fixed

- README Mermaid diagrams now render as images on npm (npm does not support Mermaid natively)

### Changed

- Renamed npm package from `tab-sync` to `tab-bridge`
- Expanded `package.json` keywords for better npm discoverability

## [0.1.0] - 2026-02-26

### Added

- **State Synchronization** — real-time state sync across browser tabs with Last-Write-Wins conflict resolution
- **Leader Election** — modified Bully algorithm with heartbeat-based failure detection and automatic failover
- **Tab Registry** — tracks all open tabs with metadata (visibility, URL, leader status)
- **Cross-Tab RPC** — typed remote procedure calls between tabs with timeout and error propagation
- **React Adapter** — `TabSyncProvider`, `useTabSync`, `useTabSyncValue`, `useTabSyncSelector`, `useIsLeader` hooks built on `useSyncExternalStore`
- **Middleware Pipeline** — intercept, validate, and transform state changes before they're applied
- **State Persistence** — survive page reloads with localStorage (or custom storage), key whitelisting, and debounced writes
- **Custom Error System** — `TabSyncError` with structured `ErrorCode` values for precise error handling
- **Protocol Versioning** — safe rolling deployments with automatic message version filtering
- **SSR Safety** — environment detection guards for all browser-specific APIs
- **Typed Event Emitter** — minimal, fully typed emitter for internal and external event management
- **Discriminated Union Messages** — type-safe message routing with full payload inference
- **Dual Transport** — BroadcastChannel (primary) with automatic localStorage fallback
- **Debug Mode** — colored, structured console logging for development
- **Convenience APIs** — `once`, `select`, `waitForLeader` methods for improved DX
- **Dual Format Build** — ESM + CJS output with full TypeScript declarations (.d.ts + .d.cts)
- **Tree-Shakable** — code splitting enabled, `sideEffects: false`
- **CI Pipeline** — GitHub Actions with typecheck, test, build, and auto-publish on version change

[0.1.1]: https://github.com/serbi2012/tab-bridge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/serbi2012/tab-bridge/releases/tag/v0.1.0
