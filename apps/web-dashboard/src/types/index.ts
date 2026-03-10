/**
 * @fileoverview TypeScript type definitions for the Ectropy Construction Platform
 * @version 1.0.0
 * @author Ectropy Development Team
 */

import * as THREE from 'three';
// Three.js interface declarations - use type aliases instead of interfaces
export type ThreeScene = THREE.Scene;
export type ThreePerspectiveCamera = THREE.PerspectiveCamera;
export type ThreeWebGLRenderer = THREE.WebGLRenderer;
export type ThreeRaycaster = THREE.Raycaster;
export type ThreeVector2 = THREE.Vector2;
export type ThreeVector3 = THREE.Vector3;
// Core construction element interface based on database schema
export interface ConstructionElement {
  id: string;
  project_id: string;
  element_type: string;
  element_name?: string;
  ifc_id?: string;
  geometric_data: GeometricData;
  properties: ElementProperties;
  access_control: AccessControl;
  status: 'planned' | 'in_progress' | 'completed' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  // Additional properties for component compatibility
  name?: string; // Alias for element_name for compatibility
  type?: string; // Alias for element_type for compatibility
  material?: string; // Material property for BIM viewer
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    depth?: number;
  };
  position?: {
    x: number;
    y: number;
    z: number;
  };
}
// Geometric data structure for 3D rendering
export interface GeometricData {
  position?: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  scale?: {
    x: number;
    y: number;
    z: number;
  };
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  vertices?: number[];
  faces?: number[];
  color?: string;
  material?: string;
}

// Element properties from BIM data
export interface ElementProperties {
  name?: string;
  description?: string;
  cost?: number;
  weight?: number;
  manufacturer?: string;
  model?: string;
  specifications?: Record<string, any>;
  [key: string]: any;
}

// Access control structure
export interface AccessControl {
  read_roles: string[];
  write_roles: string[];
}

// BIM Viewer component props
export interface BIMViewerProps {
  elements: ConstructionElement[];
  onElementSelect?: (element: ConstructionElement) => void;
  onElementHover?: (element: ConstructionElement | null) => void;
  height?: string;
  width?: string;
  className?: string;
  backgroundColor?: string;
  showControls?: boolean;
  enableInteraction?: boolean;
}

// Three.js scene management
export interface SceneManager {
  scene: ThreeScene;
  camera: ThreePerspectiveCamera;
  renderer: ThreeWebGLRenderer;
  controls?: any;
  raycaster?: ThreeRaycaster;
  mouse?: ThreeVector2;
}
// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp?: string;
}

export interface ElementsResponse {
  elements: ConstructionElement[];
  total?: number;
  page?: number;
  limit?: number;
}

// Error types
export interface BIMViewerError {
  type: 'initialization' | 'rendering' | 'interaction' | 'data';
  message: string;
  details?: any;
  timestamp: string;
}

// Event types
export interface ElementInteractionEvent {
  element: ConstructionElement;
  event: MouseEvent | TouchEvent;
  intersectionPoint: ThreeVector3;
  normal?: ThreeVector3;
}
