// Enterprise React DOM Client Type Declarations
// Centralized type definitions for react-dom/client following enterprise standards

declare module 'react-dom/client' {
  import { ReactNode } from 'react';

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
  export function hydrateRoot(
    container: Element,
    initialChildren: ReactNode
  ): Root;

  // Default export for compatibility
  const ReactDOM: {
    createRoot: typeof createRoot;
    hydrateRoot: typeof hydrateRoot;
  };

  export default ReactDOM;
}
