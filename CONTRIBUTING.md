# Contributing to tab-bridge

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/serbi2012/tab-bridge.git
cd tab-bridge

# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Run the demo page
npm run demo
```

## Project Structure

```
src/
├── core/               # Core modules
│   ├── tab-sync.ts     # Main factory function (createTabSync)
│   ├── state-manager.ts
│   ├── leader-election.ts
│   ├── tab-registry.ts
│   ├── rpc.ts
│   └── middleware.ts
├── channels/           # Transport layer
│   ├── channel.ts      # Abstract interface
│   ├── broadcast.ts    # BroadcastChannel implementation
│   └── storage.ts      # localStorage fallback
├── react/              # React adapter
│   ├── provider.tsx
│   ├── use-tab-sync.ts
│   ├── use-tab-sync-value.ts
│   ├── use-selector.ts
│   └── use-leader.ts
├── utils/              # Shared utilities
├── types.ts            # Public type definitions
└── index.ts            # Main entry point
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking |
| `npm run build` | Build with tsup (ESM + CJS + DTS) |
| `npm run demo` | Build and serve the demo page |

## Making Changes

1. **Fork** the repository
2. **Create a branch** from `master`: `git checkout -b feat/my-feature`
3. **Make your changes** — follow the existing code style
4. **Add tests** for any new functionality
5. **Run checks**: `npm run typecheck && npm test && npm run build`
6. **Commit** with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `refactor:` for refactoring
   - `test:` for adding tests
7. **Open a Pull Request** against `master`

## Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary (document why)
- **Zero dependencies** — do not add external runtime dependencies
- **Browser APIs only** — all functionality must work in the browser without Node.js polyfills
- **SSR safe** — guard all browser-specific APIs with environment checks from `src/utils/env.ts`
- **Descriptive naming** — prefer clarity over brevity
- **JSDoc** — add JSDoc comments to all public APIs

## Testing

- Tests use **Vitest** with **jsdom** environment
- Place test files next to source files: `foo.ts` → `foo.test.ts`
- Test both happy paths and edge cases
- Mock `BroadcastChannel` and `localStorage` as needed

## Reporting Issues

- Use [GitHub Issues](https://github.com/serbi2012/tab-bridge/issues)
- Include: browser version, OS, minimal reproduction, expected vs actual behavior
- For feature requests, describe the use case and proposed API

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
