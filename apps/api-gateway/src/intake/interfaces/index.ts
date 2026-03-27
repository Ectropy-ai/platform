/**
 * Barrel export for all intake interface types.
 * Import from this file, not from individual interface files.
 */
export * from './bundle.types';
export * from './bundle-loader.interface';
export * from './ifc-extraction.interface';
export * from './intake-stage.interface';

// Implementations (re-exported for test injection)
export type { SpacesClientConfig } from '../spaces-client';
export { SpacesClient, SpacesClientError, SpacesKeyNotFoundError, spacesConfigFromEnv } from '../spaces-client';
export { SpacesBundleLoader } from '../spaces-bundle-loader';
export { IFCExtractionClient, IFCExtractionClientError, ifcExtractionConfigFromEnv } from '../ifc-extraction-client';
export { ConsoleIntakeLogger, MockIntakeLogger } from '../intake-logger';
export type { LogEntry } from '../intake-logger';
