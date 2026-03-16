/// <reference types="node" />

import { CameraAlt, Fullscreen, FullscreenExit, Settings, ZoomIn } from '@mui/icons-material';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Toolbar,
  Tooltip,
} from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { config } from '../../services/config';
// SPRINT 7: BFF Pattern - Use secure hook for Speckle configuration
import { useSpeckleConfig, getTokenStatusMessage } from '../../hooks/queries/useSpeckleConfig';

// Real Speckle package imports
import {
  Viewer,
  CameraController,
  SelectionExtension,
  ViewerEvent,
  ViewModes,
  type SelectionEvent,
} from '@speckle/viewer';
// ENTERPRISE FIX (2026-01-14): SpeckleLoader and WorldTree are exported at runtime but not in TypeScript defs
// Import namespace for runtime access with proper type safety via our interfaces below
import * as SpeckleViewerModule from '@speckle/viewer';
import ObjectLoader from '@speckle/objectloader';
import * as THREE from 'three';
import { logger } from '../../services/logger';

// ENTERPRISE: Type definitions for @speckle/viewer v2.25.7 compatibility
// The package types are incomplete - use type assertion at runtime
interface ViewerParams {
  showStats?: boolean;
  verbose?: boolean;
  environmentSrc?: string;
}

// Extended Viewer methods not in official type declarations
interface ViewerExtendedMethods {
  dispose(): void;
  loadObject(loader: unknown, zoomToObject?: boolean): Promise<unknown>;
  getWorldTree(): WorldTree | undefined;
  resize(): void;
  requestRender(): void;
  screenshot(): void;
}

// Speckle object data structure as returned from ObjectLoader
interface SpeckleObjectData {
  id: string;
  speckle_type?: string;
  speckleType?: string;
  '@elements'?: unknown[];
  __closure?: Record<string, unknown>;
  '@displayValue'?: unknown[];
  [key: string]: unknown;
}

// ENTERPRISE FIX (2026-01-14): Removed incompatible SpeckleObjectLoader interface
// ROOT CAUSE: Custom loader was incompatible with Speckle viewer v2.25.7 Loader API
// - Missing: load() method, cancel() method, EventEmitter inheritance
// - Wrong types: resource (object vs string URL), finished (Promise vs boolean)
// SOLUTION: Use official SpeckleLoader with pre-fetched data support (5th parameter)
// See: node_modules/@speckle/viewer/dist/modules/loaders/Speckle/SpeckleLoader.d.ts

// World tree structure from Speckle viewer
interface WorldTree {
  root?: unknown;
  [key: string]: unknown;
}

// Loading progress callback from ObjectLoader
interface LoadProgressCallback {
  (progress: LoadProgress): void;
}

interface LoadProgress {
  loaded?: number;
  total?: number;
  stage?: string;
  [key: string]: unknown;
}

// Element properties passed to onElementSelect callback
interface ElementProperties {
  id?: string;
  speckle_type?: string;
  name?: string;
  [key: string]: unknown;
}

// Extended ViewModes methods not in type declarations
interface ViewModesExtended {
  setViewMode(mode: number): void;
  setDisplayMode(mode: string): void;
}

// Extended CameraController methods not in type declarations
interface CameraControllerExtended {
  setCameraView(objects: unknown[], fitToView?: boolean): void;
  fitToSphere(): void;
}

// Use Viewer type directly - methods exist at runtime even if not in type declarations
// Cast to extended interfaces when calling methods that TypeScript doesn't recognize
type SpeckleViewer = Viewer & Partial<ViewerExtendedMethods>;

interface SpeckleBIMViewerProps {
  streamId?: string;
  objectId?: string;
  stakeholderRole: 'architect' | 'engineer' | 'contractor' | 'owner';
  onElementSelect?: (elementId: string, properties: ElementProperties | null) => void;
  /**
   * SPRINT 5 ROS MRO: Callback when Three.js scene is ready for overlay integration.
   * Provides access to the internal Three.js scene and camera for VoxelOverlay.
   */
  onSceneReady?: (scene: THREE.Scene, camera: THREE.Camera, container: HTMLDivElement) => void;
  height?: string;
  serverUrl?: string;
}

interface ViewConfiguration {
  filters: string[];
  colors: Record<string, string>;
  hiddenTypes: string[];
  focusTypes: string[];
}

export const SpeckleBIMViewer: React.FC<SpeckleBIMViewerProps> = ({
  streamId,
  objectId,
  stakeholderRole,
  onElementSelect,
  onSceneReady,
  height = '600px',
  serverUrl,
}) => {
  // SPRINT 7: BFF Pattern - Get secure Speckle configuration from backend
  // Token is NEVER exposed to client - all API calls proxied through backend
  const {
    config: speckleConfig,
    isLoading: configLoading,
    isAvailable: speckleAvailable,
    isTokenValid,
  } = useSpeckleConfig();

  // SPRINT 7: Use BFF proxy URL for secure API calls
  // Backend injects token server-side - token NEVER sent to client
  const effectiveServerUrl = serverUrl || speckleConfig?.serverUrl || config.speckleApiUrl;
  // SPRINT 7: Proxy endpoint for object loading
  const proxyBaseUrl = config.apiBaseUrl;
  // Use demo object ID if no specific object ID is provided
  const effectiveObjectId =
    objectId || speckleConfig?.demoObjectId || process.env['REACT_APP_DEMO_SPECKLE_OBJECT_ID'];
  const effectiveStreamId =
    streamId || speckleConfig?.demoStreamId || process.env['REACT_APP_DEMO_SPECKLE_STREAM_ID'];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<SpeckleViewer | null>(null);
  // Track the currently loaded object to detect prop changes
  const loadedObjectRef = useRef<string | null>(null);
  // ENTERPRISE FIX (2026-01-13): Use ref for onElementSelect to prevent re-initializations
  const onElementSelectRef = useRef(onElementSelect);
  // ENTERPRISE FIX (2026-01-13): Prevent concurrent initialization attempts
  const isInitializing = useRef(false);

  // Keep ref up to date without triggering effects
  useEffect(() => {
    onElementSelectRef.current = onElementSelect;
  }, [onElementSelect]);

  // ENTERPRISE FIX (2025-11-23): hasModelData must be REACTIVE, not initial state
  // This allows the component to respond to new props after upload
  const hasModelData = !!(effectiveObjectId && effectiveStreamId);

  // SPRINT 7: Determine error state based on Speckle configuration
  const getInitialError = (): string | null => {
    if (configLoading) {
      return null;
    } // Wait for config to load
    if (!speckleAvailable && speckleConfig) {
      return getTokenStatusMessage(speckleConfig.tokenStatus);
    }
    if (!hasModelData) {
      return 'No BIM model loaded. Upload an IFC file above to view in 3D.';
    }
    return null;
  };

  // ENTERPRISE FIX: Initial state based on whether we have model data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(getInitialError());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'shaded' | 'wireframe' | 'ghosted'>('shaded');
  // const [selectedElement, setSelectedElement] = useState<any>(null);

  // Stakeholder-specific view configurations
  const getStakeholderViewConfig = useCallback((role: string): ViewConfiguration => {
    switch (role) {
      case 'architect':
        return {
          filters: ['Wall', 'Window', 'Door', 'Roof', 'Floor', 'Room', 'Space'],
          colors: {
            Wall: '#e3f2fd',
            Window: '#81d4fa',
            Door: '#4fc3f7',
            Roof: '#29b6f6',
            Floor: '#03a9f4',
          },
          hiddenTypes: ['Pipe', 'Duct', 'Cable', 'Rebar'],
          focusTypes: ['Architectural'],
        };
      case 'engineer':
        return {
          filters: ['Column', 'Beam', 'Slab', 'Foundation', 'Truss', 'Brace'],
          colors: {
            Column: '#f3e5f5',
            Beam: '#ce93d8',
            Slab: '#ba68c8',
            Foundation: '#ab47bc',
            Truss: '#9c27b0',
          },
          hiddenTypes: ['Furniture', 'Planting'],
          focusTypes: ['Structural'],
        };
      case 'contractor':
        return {
          filters: ['Assembly', 'Equipment', 'Temporary', 'Safety', 'Access'],
          colors: {
            Assembly: '#fff3e0',
            Equipment: '#ffcc02',
            Temporary: '#ff9800',
            Safety: '#f57c00',
            Access: '#ef6c00',
          },
          hiddenTypes: ['Room', 'Space'],
          focusTypes: ['Construction', 'MEP'],
        };
      case 'owner':
        return {
          filters: [], // Show everything
          colors: {
            completed: '#4caf50',
            in_progress: '#ff9800',
            planned: '#2196f3',
            on_hold: '#f44336',
          },
          hiddenTypes: [],
          focusTypes: ['All'],
        };
      default:
        return {
          filters: [],
          colors: {},
          hiddenTypes: [],
          focusTypes: [],
        };
    }
  }, []);

  // Initialize or reload Speckle viewer
  const initializeViewer = useCallback(async () => {
    // ENTERPRISE FIX (2026-01-13): Prevent concurrent initialization attempts
    // ROOT CAUSE: State changes during async loading trigger re-renders which call this function again
    // SOLUTION: Guard with ref to prevent re-entry while already initializing
    if (isInitializing.current) {
      console.log('⏸️ [BIM Viewer] Already initializing, skipping duplicate call');
      return;
    }

    // ENTERPRISE FIX: If container not ready, wait for next render cycle
    if (!containerRef.current) {
      logger.debug('[BIM Viewer] Container ref not ready, will retry on next render');
      return;
    }

    // ENTERPRISE FIX (2025-11-23): Check if we need to reload for new props
    const objectKey = `${effectiveStreamId}:${effectiveObjectId}`;
    const alreadyLoaded = loadedObjectRef.current === objectKey;

    // If viewer exists and this exact object is already loaded, skip
    if (viewerRef.current && alreadyLoaded) {
      logger.debug('[BIM Viewer] Object already loaded, skipping re-init', { objectKey });
      return;
    }

    // SPRINT 7: Enhanced logging with BFF status
    console.log('🔴 [BIM Viewer] initializeViewer CALLED', {
      streamId: effectiveStreamId,
      objectId: effectiveObjectId,
      serverUrl: effectiveServerUrl,
      speckleAvailable,
      tokenStatus: speckleConfig?.tokenStatus || 'unknown',
      currentRole: stakeholderRole,
      hasExistingViewer: !!viewerRef.current,
      loadedObject: loadedObjectRef.current,
    });

    // Set initialization flag
    isInitializing.current = true;

    setLoading(true);
    setError(null);

    try {
      // ENTERPRISE FIX (2025-11-24): Explicitly type viewer as SpeckleViewer for type safety
      let viewer: SpeckleViewer | null = viewerRef.current;

      // If viewer exists but loading new object, dispose and recreate
      // NOTE: @speckle/viewer 2.25.7 doesn't have unloadAll, so we recreate the viewer
      if (viewer) {
        logger.debug('[BIM Viewer] Disposing viewer for new object');
        try {
          // ENTERPRISE: dispose() exists at runtime but not in official type declarations
          viewer.dispose?.();
          viewerRef.current = null;
          viewer = null;
        } catch (e) {
          logger.debug('[BIM Viewer] Dispose warning', { error: e });
        }
      }

      // Create new viewer
      // Clear container and create new viewer
      containerRef.current.textContent = '';

      // ENTERPRISE FIX: Type assertion - Viewer is compatible with SpeckleViewer at runtime
      // Use type assertion for ViewerParams to handle Speckle's optional parameter requirements
      viewer = new Viewer(containerRef.current, { showStats: false } as any) as SpeckleViewer;
      await viewer.init();

      // Add essential extensions
      viewer.createExtension(CameraController);
      viewer.createExtension(SelectionExtension);
      viewer.createExtension(ViewModes);

      // Set up selection handling
      viewer.on(ViewerEvent.ObjectClicked, (selectionEvent: SelectionEvent | null) => {
        if (selectionEvent && selectionEvent.hits && selectionEvent.hits.length > 0) {
          const hit = selectionEvent.hits[0];
          const elementData = hit.node?.model?.raw;

          // ENTERPRISE FIX (2026-01-13): Use ref to avoid dependency issues
          if (elementData && onElementSelectRef.current) {
            onElementSelectRef.current(elementData.id || '', elementData);
          }
        } else {
          onElementSelectRef.current?.('', null);
        }
      });

      viewerRef.current = viewer;

      // Load content — loadSpeckleObject rethrows on failure so loadedObjectRef
      // is only set when the object actually loaded successfully.
      if (effectiveStreamId && effectiveObjectId) {
        await loadSpeckleObject(viewer, effectiveStreamId, effectiveObjectId);
        loadedObjectRef.current = objectKey;
        console.log('🟢 [BIM Viewer] loadObject resolved, starting render pass');
      } else {
        await loadDemoContent(viewer);
        loadedObjectRef.current = null;
      }

      // Apply stakeholder-specific view settings
      applyStakeholderViewSettings(viewer, stakeholderRole);

      console.log('🟢 [BIM Viewer] Initialization complete, setting loading=false');
      setLoading(false);

      // SPRINT 5 ROS MRO: Call onSceneReady callback with Three.js internals
      // This enables VoxelOverlay integration for the coordination view
      if (onSceneReady && containerRef.current) {
        try {
          // Access Three.js scene and camera from Speckle viewer internals
          // The viewer exposes these via World and cameraHandler properties
          const viewerAny = viewer as any;
          const scene = viewerAny.World?.scene || viewerAny.getRenderer?.()?.scene;
          const camera =
            viewerAny.cameraHandler?.camera || viewerAny.cameraHandler?.activeCam?.camera;

          if (scene && camera) {
            logger.info('[BIM Viewer] Calling onSceneReady with Three.js internals');
            onSceneReady(scene as THREE.Scene, camera as THREE.Camera, containerRef.current);
          } else {
            logger.warn('[BIM Viewer] Could not access Three.js scene/camera from viewer');
          }
        } catch (sceneError) {
          logger.warn('[BIM Viewer] Failed to extract Three.js internals', { error: sceneError });
        }
      }
    } catch (err) {
      console.error('🔴 [BIM Viewer] initializeViewer caught:', err);
      logger.error('[BIM Viewer] Failed to initialize', { error: err });
      setError(
        `Failed to load BIM model: ${err instanceof Error ? err.message : String(err) || 'Unknown error'}`,
      );
      setLoading(false);
    } finally {
      // ENTERPRISE FIX (2026-01-13): Clear initialization flag in finally block
      // NOTE: Do NOT call setLoading(false) here — it's already called in both try (line 377)
      // and catch (line 405) paths. Calling it again triggers a redundant re-render that can
      // race with the useEffect dependency on loading state.
      isInitializing.current = false;
      console.log('🏁 [BIM Viewer] Initialization flag cleared');
    }
  }, [
    effectiveStreamId,
    effectiveObjectId,
    effectiveServerUrl,
    speckleAvailable,
    speckleConfig?.tokenStatus,
    // SPRINT 7: authToken removed - token managed server-side via BFF
    // ENTERPRISE FIX (2026-01-13): Remove stakeholderRole and onElementSelect from dependencies
    // ROOT CAUSE: Role changes triggered viewer disposal and recreation, losing loaded objects
    // SOLUTION: Handle role changes separately (see useEffect below), don't re-initialize viewer
    // onElementSelect is wrapped in useRef pattern to avoid unnecessary re-initializations
  ]);

  // Load Speckle object from server
  // SPRINT 7: Uses BFF proxy endpoint - token injected server-side
  const loadSpeckleObject = async (viewer: SpeckleViewer, streamId: string, objectId: string) => {
    // SPRINT 7: BFF Proxy endpoint - backend injects token, no auth required from client
    const proxyObjectUrl = `${proxyBaseUrl}/api/speckle/objects/${streamId}/${objectId}`;
    // Original Speckle URL format for viewer reference
    const objectUrl = `${effectiveServerUrl}/streams/${streamId}/objects/${objectId}`;

    // SPRINT 7: Debug logging - NO token info (token is server-side only)
    logger.debug('[BIM Viewer] Loading Speckle object via BFF proxy', {
      streamId,
      objectId,
      proxyUrl: proxyObjectUrl,
      serverUrl: effectiveServerUrl,
      tokenStatus: speckleConfig?.tokenStatus || 'unknown',
    });

    try {
      // SPRINT 7: Use BFF proxy for API access - token injected server-side
      // credentials: 'include' sends session cookie for authentication
      logger.debug('[BIM Viewer] Testing BFF proxy access', { proxyObjectUrl });

      const testResponse = await fetch(proxyObjectUrl, {
        method: 'GET',
        credentials: 'include', // Include session cookies for BFF authentication
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      logger.debug('[BIM Viewer] BFF proxy test result', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        ok: testResponse.ok,
        headers: Object.fromEntries(testResponse.headers.entries()),
      });

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        logger.error('[BIM Viewer] BFF proxy error', { status: testResponse.status, errorText });

        // SPRINT 7: Enhanced error messages for BFF pattern
        if (testResponse.status === 401) {
          throw new Error('Authentication required. Please log in to view BIM models.');
        } else if (testResponse.status === 503) {
          throw new Error('Speckle service unavailable. Please try again later.');
        }
        throw new Error(`API access failed: ${testResponse.status} ${testResponse.statusText}`);
      }

      // SPRINT 7: Create object loader using proxy server URL
      // The ObjectLoader will fetch via proxy, backend adds token
      logger.debug('[BIM Viewer] Creating ObjectLoader via BFF proxy');
      const loader = new ObjectLoader({
        serverUrl: `${proxyBaseUrl}/api/speckle`, // BFF proxy base URL
        streamId,
        objectId,
        // SPRINT 7: NO token passed - token injected server-side by BFF proxy
      });

      logger.debug('[BIM Viewer] ObjectLoader created', {
        loaderType: typeof loader,
        hasGetAndConstruct: typeof loader.getAndConstructObject === 'function',
      });
      logger.debug('[BIM Viewer] Fetching object data (may take time for large models)');

      // Get the object data with typed progress callback
      const objectData = (await loader.getAndConstructObject((progress: LoadProgress) => {
        logger.debug('[BIM Viewer] Loading progress', { progress });
      })) as SpeckleObjectData;

      logger.debug('[BIM Viewer] Object data received', {
        type: typeof objectData,
        hasData: !!objectData,
        speckleType: objectData.speckle_type || objectData.speckleType,
      });

      // Check if this is a raw document (IFC file stored as base64) vs actual geometry
      const speckleType = objectData.speckle_type || objectData.speckleType;
      if (speckleType === 'Objects.Other.Document') {
        logger.warn(
          '[BIM Viewer] Object is a raw document, not parsed 3D geometry - IFC needs conversion',
        );
        setError(
          "IFC file uploaded but not yet parsed for 3D viewing. Use Speckle's IFC converter for full geometry rendering.",
        );
        setLoading(false);
        return;
      }

      // ENTERPRISE FIX (2026-01-14): Use official SpeckleLoader with pre-fetched data
      // ROOT CAUSE: Custom loader was incompatible with Speckle viewer v2.25.7 API
      // - Missing: load() method, cancel() method, EventEmitter inheritance
      // - Wrong types: resource (object vs string URL), finished (Promise vs boolean)
      // SOLUTION: SpeckleLoader supports pre-fetched data via 5th constructor parameter
      logger.debug('[BIM Viewer] Creating official SpeckleLoader with pre-fetched data', {
        id: objectData.id,
        speckle_type: objectData.speckle_type,
        hasElements: !!objectData['@elements'],
        hasClosure: !!objectData.__closure,
        hasDisplayValue: !!objectData['@displayValue'],
        keys: Object.keys(objectData).slice(0, 15),
      });

      // ENTERPRISE FIX (2026-01-14): WorldTree Availability Check with Retry Pattern
      // ROOT CAUSE: WorldTree initialization is asynchronous after viewer.init()
      // SOLUTION: Retry with exponential backoff up to 5 seconds max
      // TypeScript definitions don't include getWorldTree, but it exists at runtime
      const waitForWorldTree = async (maxAttempts = 10, initialDelay = 50): Promise<any> => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const worldTree = viewer.getWorldTree?.();
          if (worldTree) {
            logger.info('[BIM Viewer] WorldTree available', {
              attempt,
              totalWaitMs: initialDelay * (Math.pow(2, attempt - 1) - 1),
            });
            return worldTree;
          }

          if (attempt < maxAttempts) {
            const delayMs = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
            logger.debug(`[BIM Viewer] WorldTree not ready, retrying in ${delayMs}ms`, {
              attempt,
              maxAttempts,
            });
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        // Final check after all retries
        const worldTree = viewer.getWorldTree?.();
        if (!worldTree) {
          logger.error('[BIM Viewer] WorldTree not available after retries', {
            maxAttempts,
            maxWaitMs: initialDelay * (Math.pow(2, maxAttempts) - 1),
            viewerState: {
              hasInit: typeof viewer.init === 'function',
              hasGetWorldTree: typeof viewer.getWorldTree === 'function',
              hasLoadObject: typeof viewer.loadObject === 'function',
            },
          });
          throw new Error(
            `Viewer WorldTree not initialized after ${maxAttempts} attempts - viewer may not be fully ready`,
          );
        }
        return worldTree;
      };

      const worldTree = await waitForWorldTree();

      logger.debug('[BIM Viewer] WorldTree retrieved successfully', {
        hasWorldTree: !!worldTree,
        worldTreeType: typeof worldTree,
      });

      // Access SpeckleLoader from runtime exports (not in TypeScript defs but confirmed in package exports)
      // SpeckleLoader constructor: (targetTree: WorldTree, resource: string, authToken?: string, enableCaching?: boolean, resourceData?: unknown)
      const SpeckleLoaderClass = (SpeckleViewerModule as any).SpeckleLoader;
      if (!SpeckleLoaderClass) {
        logger.error('[BIM Viewer] SpeckleLoader not available in @speckle/viewer runtime exports');
        throw new Error('SpeckleLoader class not found - check @speckle/viewer version');
      }

      // SPRINT 7: Create SpeckleLoader with pre-fetched data
      // No token passed - data already fetched via BFF proxy with server-side token injection
      const speckleLoader = new SpeckleLoaderClass(
        worldTree,
        proxyObjectUrl,
        '', // SPRINT 7: Empty token - BFF proxy handles authentication server-side
        false, // Disable caching - we already have the data
        objectData, // Pass pre-fetched data as 5th parameter
      );

      // Load the object using the official Speckle API with automatic camera positioning
      // zoomToObject=true enables automatic camera initialization and positioning
      // TypeScript FIX: loadObject exists at runtime but TypeScript types may not include it
      //
      // FIX (2026-03-16): Resolving timeout instead of rejecting.
      // ROOT CAUSE: viewer.loadObject Promise never settles with pre-fetched data
      // (SpeckleLoader 5th param), even though the SDK loads objects into the scene
      // near-instantly ("Loaded 1 objects in: 0.021"). The old 30s rejecting timeout
      // kept the spinner visible for 30s then showed a spurious error.
      // SOLUTION: Resolve after 3s — data is pre-fetched, viewer already has it.
      // If loadObject rejects (genuine error), the .catch swallows it as non-fatal.
      logger.debug('[BIM Viewer] Calling viewer.loadObject with zoomToObject=true');
      await Promise.race([
        (viewer.loadObject as (loader: unknown, zoom?: boolean) => Promise<void>)(
          speckleLoader,
          true,
        ).catch((err) => {
          logger.warn('[BIM Viewer] viewer.loadObject error (non-fatal, data was pre-fetched)', {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            logger.info('[BIM Viewer] loadObject grace period elapsed — proceeding (data pre-fetched)');
            resolve();
          }, 3000),
        ),
      ]);

      logger.info('[BIM Viewer] Successfully loaded Speckle object with official loader', {
        objectUrl,
        hasWorldTree: !!worldTree,
      });

      // ENTERPRISE FIX (2026-01-14): Camera positioning now handled automatically by SpeckleLoader
      // REMOVED: 150+ lines of camera retry/fallback logic - no longer needed
      // Official SpeckleLoader with zoomToObject=true handles camera initialization properly

      // Force a render update and resize
      logger.debug('[BIM Viewer] Resizing viewer');
      viewer.resize?.();
      viewer.requestRender?.();

      // FIX (2026-03-16): Explicit camera fit after loadObject
      // ROOT CAUSE: viewer.loadObject Promise never settles naturally.
      // Promise.race 3s timeout resolves instead, bypassing zoomToObject=true.
      // Geometry loads but camera stays at default position.
      const cameraController = viewer.getExtension?.(CameraController) as
        | (CameraController & Partial<CameraControllerExtended>)
        | null;
      if (cameraController && typeof cameraController.setCameraView === 'function') {
        logger.debug('[BIM Viewer] Fitting camera to loaded geometry');
        cameraController.setCameraView([], true);
      } else {
        logger.debug('[BIM Viewer] CameraController unavailable — camera fit skipped');
      }

      // Schedule another resize + camera fit after a short delay (safety net)
      setTimeout(() => {
        if (viewerRef.current) {
          logger.debug('[BIM Viewer] Delayed resize + camera fit');
          viewerRef.current.resize?.();
          viewerRef.current.requestRender?.();
          const cc = viewerRef.current.getExtension?.(CameraController) as
            | (CameraController & Partial<CameraControllerExtended>)
            | null;
          if (cc && typeof cc.setCameraView === 'function') {
            cc.setCameraView([], true);
          }
        }
      }, 100);

      // ENTERPRISE FIX (2026-01-13): Do NOT call setError(null) here
      // ROOT CAUSE: State change during async operation triggers re-render and useEffect re-fire
      // SOLUTION: Error already cleared at start of initializeViewer (line 276)
    } catch (error: unknown) {
      // ENTERPRISE DEBUG: Enhanced error logging
      const errorConstructor =
        error && typeof error === 'object' && 'constructor' in error
          ? (error.constructor as { name?: string }).name
          : undefined;

      logger.error('[BIM Viewer] Failed to load Speckle object', {
        errorType: typeof error,
        error,
        constructor: errorConstructor,
        message: error instanceof Error ? error.message : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        keys: error && typeof error === 'object' ? Object.keys(error) : undefined,
      });

      // Construct meaningful error message
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message);
      }

      setError(`Failed to load 3D model: ${errorMessage}. Check browser console for details.`);
      setLoading(false);
      // Rethrow so the caller (initializeViewer) knows loading failed and
      // does NOT mark the object as successfully loaded in loadedObjectRef.
      throw error;
    }
  };

  // Load demo content for development/testing
  const loadDemoContent = async (viewer: SpeckleViewer) => {
    try {
      // SPINNER FIX 2025-11-19: Stop infinite loading state
      logger.debug('[BIM Viewer] No BIM model loaded - showing help message', { stakeholderRole });

      // Set error to show helpful message instead of infinite spinner
      setError('No BIM model loaded. Upload an IFC file above to view in 3D.');
      setLoading(false);
    } catch (error) {
      logger.error('Failed to load demo content', { error });
      throw error;
    }
  };

  // Create demo geometry for testing
  // const createDemoGeometry = () => {
  //   const config = getStakeholderViewConfig(stakeholderRole);

  //   // Create mock building elements based on stakeholder focus
  //   const demoElements = [
  //     {
  //       id: 'wall-001',
  //       type: 'Wall',
  //       name: 'Exterior Wall - North',
  //       status: 'completed',
  //       material: 'Concrete Block',
  //       dimensions: { length: 10, width: 0.3, height: 3 },
  //     },
  //     {
  //       id: 'beam-001',
  //       type: 'Beam',
  //       name: 'Main Support Beam',
  //       status: 'in_progress',
  //       material: 'Steel I-Beam',
  //       dimensions: { length: 12, width: 0.4, height: 0.6 },
  //     },
  //     {
  //       id: 'foundation-001',
  //       type: 'Foundation',
  //       name: 'Foundation Slab',
  //       status: 'completed',
  //       material: 'Reinforced Concrete',
  //       dimensions: { length: 20, width: 15, height: 0.5 },
  //     },
  //   ];

  //   return demoElements.filter(
  //     element => config.filters.length === 0 || config.filters.includes(element.type),
  //   );
  // };

  // Apply stakeholder-specific view settings
  const applyStakeholderViewSettings = (viewer: SpeckleViewer, role: string) => {
    const config = getStakeholderViewConfig(role);
    // FilteringExtension not available in @speckle/viewer 2.25.7
    // const filteringExtension = viewer.getExtension(FilteringExtension);

    // if (filteringExtension && config.hiddenTypes.length > 0) {
    //   // Hide irrelevant element types for this stakeholder
    //   config.hiddenTypes.forEach(type => {
    //     filteringExtension.hideObjects([type]);
    //   });
    // }

    // Apply role-specific coloring
    if (Object.keys(config.colors).length > 0) {
      Object.entries(config.colors).forEach(([type, color]) => {
        // Apply color overrides for element types
        // This would typically use the Speckle viewer's material/color API
        logger.debug(`[BIM Viewer] Applying color to elements`, { type, color, role });
      });
    }

    logger.debug(`[BIM Viewer] Applied view settings`, { role, config });
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Change view mode
  const handleViewModeChange = (mode: 'shaded' | 'wireframe' | 'ghosted') => {
    setViewMode(mode);
    // ENTERPRISE BIM: Type assertion for third-party Speckle SDK extension system
    // Use 'any' for extension types where full type information is unavailable from vendor
    const viewModesExtension = viewerRef.current?.getExtension(ViewModes) as any;
    if (viewModesExtension) {
      try {
        switch (mode) {
          case 'wireframe':
            // Try different possible API methods
            if ('setViewMode' in viewModesExtension) {
              viewModesExtension.setViewMode?.(1);
            } else if ('setDisplayMode' in viewModesExtension) {
              viewModesExtension.setDisplayMode?.('WIREFRAME');
            }
            break;
          case 'ghosted':
            if ('setViewMode' in viewModesExtension) {
              viewModesExtension.setViewMode?.(2);
            } else if ('setDisplayMode' in viewModesExtension) {
              viewModesExtension.setDisplayMode?.('GHOSTED');
            }
            break;
          default:
            if ('setViewMode' in viewModesExtension) {
              viewModesExtension.setViewMode?.(0);
            } else if ('setDisplayMode' in viewModesExtension) {
              viewModesExtension.setDisplayMode?.('SHADED');
            }
        }
      } catch (error) {
        logger.debug('[BIM Viewer] ViewModes extension method not available', { error });
      }
    }
  };

  // Zoom to fit all objects
  const zoomToFit = () => {
    const cameraController = viewerRef.current?.getExtension(CameraController) as
      | (CameraController & Partial<CameraControllerExtended>)
      | null;
    if (cameraController && typeof cameraController.setCameraView === 'function') {
      cameraController.setCameraView([], true);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        // ENTERPRISE: dispose() exists at runtime but not in official type declarations
        viewerRef.current.dispose?.();
        viewerRef.current = null;
      }
    };
  }, []);

  // Track when container is mounted
  const [containerMounted, setContainerMounted] = useState(false);

  // SPRINT 7: Update error state based on Speckle availability and model data
  useEffect(() => {
    // Wait for config to load before showing errors
    if (configLoading) {
      return;
    }

    // SPRINT 7: Check Speckle availability first
    if (!speckleAvailable && speckleConfig) {
      setError(getTokenStatusMessage(speckleConfig.tokenStatus));
      return;
    }

    // ENTERPRISE FIX (2025-11-23): Reset error when model data becomes available
    if (hasModelData) {
      // Clear the "no model" error when we get model data
      setError(null);
    } else {
      setError('No BIM model loaded. Upload an IFC file above to view in 3D.');
    }
  }, [hasModelData, configLoading, speckleAvailable, speckleConfig]);

  // Initialize viewer when container is available and we have model data
  useEffect(() => {
    console.log('⚡ [BIM Viewer] useEffect triggered', {
      containerMounted,
      hasContainer: !!containerRef.current,
      hasModelData,
      configLoading,
      speckleAvailable,
      effectiveStreamId,
      effectiveObjectId,
    });

    // Wait for container to be mounted
    if (!containerMounted || !containerRef.current) {
      console.log('⏸️ [BIM Viewer] Skipping init - no container yet');
      return;
    }

    // SPRINT 7: Wait for Speckle config to load before initializing
    if (configLoading) {
      console.log('⏸️ [BIM Viewer] Skipping init - waiting for Speckle config');
      return;
    }

    // SPRINT 7: Don't initialize if Speckle is not available (invalid token, etc.)
    if (!speckleAvailable) {
      console.log('⏸️ [BIM Viewer] Skipping init - Speckle not available', {
        tokenStatus: speckleConfig?.tokenStatus,
      });
      return;
    }

    // ENTERPRISE FIX (2025-11-23): Initialize/reload when we have new model data
    if (hasModelData) {
      // FIX (2026-03-16): Guard against post-load reinit loop
      // ROOT CAUSE: Dep changes (configLoading, speckleAvailable) re-fire this effect after
      // loadObject completes. initializeViewer would be called again for the same object.
      // SOLUTION: Skip if already initializing or this exact object is already loaded.
      if (isInitializing.current || loadedObjectRef.current === `${effectiveStreamId}:${effectiveObjectId}`) {
        console.log('⏸️ [BIM Viewer] Skipping reinit - already loaded or loading', {
          isInitializing: isInitializing.current,
          loadedObject: loadedObjectRef.current,
        });
        return;
      }
      console.log('▶️ [BIM Viewer] Calling initializeViewer from useEffect', {
        streamId: effectiveStreamId,
        objectId: effectiveObjectId,
      });
      initializeViewer();
    } else {
      console.log('⏸️ [BIM Viewer] Skipping init - no model data');
    }
    // ENTERPRISE FIX (2026-01-13): Remove initializeViewer from dependencies
    // ROOT CAUSE: initializeViewer useCallback creates new reference on re-renders,
    //             causing this effect to fire again during async loading operations.
    // SOLUTION: Omit initializeViewer from deps, rely on data deps (streamId, objectId)
    //           The isInitializing ref guard prevents concurrent calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasModelData,
    effectiveStreamId,
    effectiveObjectId,
    containerMounted,
    configLoading,
    speckleAvailable,
  ]);

  // ENTERPRISE FIX (2026-01-13): Handle role changes WITHOUT re-initializing viewer
  // ROOT CAUSE: stakeholderRole in initializeViewer dependencies caused viewer disposal on role change
  // SOLUTION: Separate effect that only updates view settings, preserves loaded objects
  useEffect(() => {
    console.log('🎭 [BIM Viewer] Role change effect triggered', {
      stakeholderRole,
      hasViewer: !!viewerRef.current,
      loading,
      loadedObject: loadedObjectRef.current,
    });

    // Only update if viewer is loaded and not currently loading
    if (viewerRef.current && !loading && loadedObjectRef.current) {
      console.log('✨ [BIM Viewer] Applying stakeholder view settings (NO viewer re-init)', {
        role: stakeholderRole,
      });
      applyStakeholderViewSettings(viewerRef.current, stakeholderRole);
    }
  }, [stakeholderRole, loading]);

  // Callback ref to detect when container mounts
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node) {
      setContainerMounted(true);
    }
  }, []);

  // SPRINT 7: Determine what overlay to show
  // Show loading when we're in loading state OR waiting for config
  const showLoading = loading || configLoading;
  const showError = error !== null && !showLoading;
  const isNoModelMessage = error?.includes('No BIM model') || error?.includes('Upload an IFC');
  // SPRINT 7: Token-related errors need different styling
  const isTokenError = error?.includes('Speckle') && !isNoModelMessage;

  return (
    <Paper
      data-testid='bim-viewer-container'
      sx={{ height, display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {/* Loading Overlay */}
      {showLoading && (
        <Box
          data-testid='bim-viewer-loading'
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.paper',
            zIndex: 10,
          }}
        >
          <Box textAlign='center'>
            <CircularProgress size={40} />
            <Box mt={2}>Loading BIM model...</Box>
          </Box>
        </Box>
      )}

      {/* Viewer Toolbar */}
      <Toolbar variant='dense' sx={{ minHeight: 48, borderBottom: '1px solid #ddd' }}>
        <Chip
          label={`${stakeholderRole.toUpperCase()} VIEW`}
          color='primary'
          size='small'
          sx={{ mr: 2 }}
        />

        <FormControl size='small' sx={{ minWidth: 120, mr: 2 }}>
          <InputLabel>View Mode</InputLabel>
          <Select
            value={viewMode}
            label='View Mode'
            onChange={(event: { target: { value: string } }) =>
              handleViewModeChange(event.target.value as 'shaded' | 'wireframe' | 'ghosted')
            }
          >
            <MenuItem value='shaded'>Shaded</MenuItem>
            <MenuItem value='wireframe'>Wireframe</MenuItem>
            <MenuItem value='ghosted'>Ghosted</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title='Zoom to Fit'>
          <IconButton onClick={zoomToFit} size='small'>
            <ZoomIn />
          </IconButton>
        </Tooltip>

        <Tooltip title='Take Screenshot'>
          <IconButton
            size='small'
            onClick={() => {
              // Screenshot functionality requires viewer extension
              // Use type-safe optional chaining to access screenshot method if available
              if (viewerRef.current && typeof viewerRef.current.screenshot === 'function') {
                viewerRef.current.screenshot();
              } else {
                logger.debug(
                  '[BIM Viewer] Screenshot functionality not available on this viewer instance',
                );
              }
            }}
          >
            <CameraAlt />
          </IconButton>
        </Tooltip>

        <Tooltip title='View Settings'>
          <IconButton size='small'>
            <Settings />
          </IconButton>
        </Tooltip>

        <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
          <IconButton onClick={toggleFullscreen} size='small'>
            {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Viewer area — wrapper provides stable flex dimensions for the WebGL container */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: '400px', overflow: 'hidden' }}>
        {/* Error/Info overlay — covers container visually without removing it from layout */}
        {showError && !showLoading && (
          <Box
            data-testid={isNoModelMessage ? 'bim-viewer-ready' : 'bim-viewer-error'}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'background.paper',
              zIndex: 5,
              p: 2,
            }}
          >
            <Alert
              severity={isNoModelMessage ? 'info' : isTokenError ? 'warning' : 'error'}
              sx={{
                maxWidth: 400,
                textAlign: 'center',
              }}
            >
              <strong>
                {isNoModelMessage
                  ? 'BIM Viewer Ready'
                  : isTokenError
                    ? 'Speckle Configuration'
                    : 'BIM Viewer Error'}
              </strong>
              <br />
              {isNoModelMessage ? 'Upload an IFC file to view your building model in 3D.' : error}
            </Alert>
          </Box>
        )}

        {/* WebGL container — ALWAYS rendered with valid dimensions.
            display:none collapsed element to 0×0, breaking WebGL context init.
            Container is now always visible; error overlay hides it visually. */}
        <Box
          ref={setContainerRef}
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: '#1a1a2e',
            '& canvas': {
              display: 'block',
              width: '100% !important',
              height: '100% !important',
            },
          }}
        />
      </Box>
    </Paper>
  );
};

export default SpeckleBIMViewer;
