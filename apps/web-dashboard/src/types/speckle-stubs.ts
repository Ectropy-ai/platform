/**
 * Type stubs for Speckle packages to resolve compilation errors
 * These will be replaced with actual Speckle packages when available
 */

// Speckle Viewer stub - matches @speckle/viewer v2.25.7 API
// Container is passed as first argument to constructor, not in params
export interface ViewerParams {
  controls?: boolean;
  showStats?: boolean;
  verbose?: boolean;
  environmentSrc?: string;
}

export interface IViewer {
  loadModel: (url: string) => Promise<void>;
  setViewMode: (mode: string) => void;
  dispose: () => void;
  init: () => Promise<void>;
  createExtension: (extensionClass: any) => any;
  getExtension: (name: any) => any;
  on: (event: string, callback: Function) => void;
  loadObject: (url: string, authToken?: string) => Promise<void>;
}

export class Viewer implements IViewer {
  constructor(_container?: HTMLElement, _params?: ViewerParams) {
  }
  loadModel(_url: string): Promise<void> {
    return Promise.resolve();
  }
  setViewMode(_mode: string): void {
    /* stub */
  }
  dispose(): void {
    /* stub */
  }
  init(): Promise<void> {
    return Promise.resolve();
  }
  createExtension(_extensionClass: any): any {
    return {};
  }
  getExtension(_name: any): any {
    return {};
  }
  on(_event: string, _callback: Function): void {
    /* stub */
  }
  loadObject(_url: string, _authToken?: string): Promise<void> {
    return Promise.resolve();
  }
}

export class CameraController {
  constructor(_viewer: IViewer) {
    /* stub */
  }
}

export class SelectionExtension {
  constructor(_viewer: IViewer) {
    /* stub */
  }
}

export enum ViewModes {
  DEFAULT = 'DEFAULT',
  GHOSTED = 'GHOSTED',
}

export interface SelectionEvent {
  hits: any[];
  event: Event;
}

export const ViewerEvent = {
  OBJECT_CLICKED: 'object-clicked',
  ObjectClicked: 'object-clicked',
};

// Speckle Object Loader stub
export interface ObjectLoader {
  load: (url: string) => Promise<any>;
}

export class ObjectLoaderConstructor implements ObjectLoader {
  constructor(_config?: any) {
  }
  load(_url: string): Promise<any> {
    return Promise.resolve({});
  }
  getAndConstructObject(_progressCallback?: Function): Promise<any> {
    return Promise.resolve({});
  }
}

// Export as module stubs
const speckleStubs = {
  Viewer,
  ObjectLoader: ObjectLoaderConstructor,
  ViewerEvent,
  CameraController,
  SelectionExtension,
  ViewModes,
};

export default speckleStubs;
