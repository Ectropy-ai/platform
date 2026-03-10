// Export all types and classes from the IFC processing service
export {
  IFCProcessingService,
  type IFCElement,
  type IFCProject,
  type IFCProcessingResult
} from './ifc.service.js';

// Also provide default export for backwards compatibility
export { default } from './ifc.service.js';
