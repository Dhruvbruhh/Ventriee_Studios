/**
 * Model routing now lives in `src/shared/routing.ts` so the renderer's Settings
 * panel can show the same capability profiles and routing decisions the main
 * process uses. This re-export keeps `import { routeModel } from './routing'`
 * working for the orchestrator and the existing tests.
 */
export * from '../shared/routing'
