// Mock for @speckle/viewer to provide testing compatibility
export const DefaultViewerParams = {};

export class CameraController {}
export const UrlHelper = {
  getResourceUrl: () => 'mock-url',
};
export class Viewer {
  init = () => Promise.resolve();
  loadObject = () => Promise.resolve();
  setLightConfiguration = () => {};
  on = () => {};
  off = () => {};
  dispose = () => {};
  getContainer = () => null;
  setView = () => {};
  screenshot = () => Promise.resolve('');
  getRenderer = () => ({
    domElement: document.createElement('canvas'),
  });
  resize = () => {};
}
export default Viewer;
