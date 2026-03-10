declare module '@speckle/viewer' {
  export class Viewer {
    constructor(...args: any[]);
    init(...args: any[]): Promise<any>;
    createExtension(...args: any[]): any;
    on(...args: any[]): any;
    getExtension(...args: any[]): any;
  }
  export class CameraController {}
  export class SelectionExtension {}
  export const ViewerEvent: any;
  export const ViewModes: any;
  export type SelectionEvent = any;
  export interface IViewer {}
  export default Viewer;
}
