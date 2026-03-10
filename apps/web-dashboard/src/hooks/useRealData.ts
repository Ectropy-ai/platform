import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';

// Demo construction elements - can be replaced with real API when available
const getDemoConstructionElements = async () => {
  return [
    {
      id: 'wall-001',
      name: 'Exterior Wall East',
      type: 'Wall',
      projectId: 'demo-project-1',
      position: { x: 5, y: 0, z: 0 },
      dimensions: { width: 0.3, height: 3, depth: 10 },
      material: 'Concrete',
      status: 'completed',
      assignedTo: 'contractor',
      properties: { fireRating: 'A1', thermalResistance: 2.5 },
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-07-05T14:30:00Z',
    },
    {
      id: 'wall-002',
      name: 'Exterior Wall West',
      type: 'Wall',
      projectId: 'demo-project-1',
      position: { x: -5, y: 0, z: 0 },
      dimensions: { width: 0.3, height: 3, depth: 10 },
      material: 'Concrete',
      status: 'in_progress',
      assignedTo: 'contractor',
      properties: { fireRating: 'A1', thermalResistance: 2.5 },
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-07-07T12:00:00Z',
    },
    {
      id: 'wall-003',
      name: 'Exterior Wall North',
      type: 'Wall',
      projectId: 'demo-project-1',
      position: { x: 0, y: 0, z: 5 },
      dimensions: { width: 10, height: 3, depth: 0.3 },
      material: 'Concrete',
      status: 'in_progress',
      assignedTo: 'contractor',
      properties: { fireRating: 'A1', thermalResistance: 2.5 },
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-07-08T09:15:00Z',
    },
    {
      id: 'wall-004',
      name: 'Exterior Wall South',
      type: 'Wall',
      projectId: 'demo-project-1',
      position: { x: 0, y: 0, z: -5 },
      dimensions: { width: 10, height: 3, depth: 0.3 },
      material: 'Concrete',
      status: 'design',
      assignedTo: 'architect',
      properties: { fireRating: 'A1', thermalResistance: 2.5 },
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-07-09T11:20:00Z',
    },
    {
      id: 'window-001',
      name: 'Window East-01',
      type: 'Window',
      projectId: 'demo-project-1',
      position: { x: 4.8, y: 1, z: 0 },
      dimensions: { width: 0.1, height: 1.5, depth: 2 },
      material: 'Glass',
      status: 'approved',
      assignedTo: 'architect',
      properties: { uValue: 1.2, glazingType: 'double' },
      createdAt: '2024-01-17T10:00:00Z',
      updatedAt: '2024-07-07T13:45:00Z',
    },
    {
      id: 'door-001',
      name: 'Main Entrance',
      type: 'Door',
      projectId: 'demo-project-1',
      position: { x: 0, y: 0, z: -4.8 },
      dimensions: { width: 1, height: 2.5, depth: 0.1 },
      material: 'Steel',
      status: 'completed',
      assignedTo: 'contractor',
      properties: { fireRating: 'A2', securityLevel: 'high' },
      createdAt: '2024-01-17T10:00:00Z',
      updatedAt: '2024-07-06T15:30:00Z',
    },
    {
      id: 'column-001',
      name: 'Support Column A1',
      type: 'Column',
      projectId: 'demo-project-1',
      position: { x: 3, y: 0, z: 3 },
      dimensions: { width: 0.4, height: 3, depth: 0.4 },
      material: 'Steel',
      status: 'completed',
      assignedTo: 'engineer',
      properties: { loadCapacity: 500, grade: 'S355' },
      createdAt: '2024-01-18T10:00:00Z',
      updatedAt: '2024-07-04T12:15:00Z',
    },
    {
      id: 'slab-001',
      name: 'Ground Floor Slab',
      type: 'Slab',
      projectId: 'demo-project-1',
      position: { x: 0, y: -0.1, z: 0 },
      dimensions: { width: 10, height: 0.2, depth: 10 },
      material: 'Concrete',
      status: 'completed',
      assignedTo: 'contractor',
      properties: { compressiveStrength: 30, reinforcement: 'mesh' },
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-07-03T16:00:00Z',
    },
  ];
};

export interface UseRealDataOptions {
  refetchInterval?: number;
  enabled?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}
export interface UseRealDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useRealData = <T = any>(
  endpoint: string,
  options: UseRealDataOptions = {},
): UseRealDataResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refetchInterval, enabled = true, onSuccess, onError } = options;
  const fetchData = useCallback(async () => {
    if (!enabled) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let result: T;
      switch (endpoint) {
        case 'projects':
          const projectsResponse = await apiClient.getProjects({});
          if (projectsResponse.success) {
            result = projectsResponse.data as T;
          } else {
            // Return empty array if API fails
            result = [] as T;
          }
          break;
        case 'elements':
          try {
            const elementsResponse = await apiClient.getConstructionElements('demo-project-1');
            if (elementsResponse.success) {
              result = elementsResponse.data as T;
            } else {
              throw new Error('API call failed');
            }
          } catch (_error) {
            // Fallback to demo construction elements
            result = (await getDemoConstructionElements()) as T;
          }
          break;

        case 'products':
          try {
            const productsResponse = await apiClient.getManufacturerProducts({});
            if (productsResponse.success) {
              result = productsResponse.data as T;
            } else {
              throw new Error('API call failed');
            }
          } catch (_error) {
            // Return empty array if API fails
            result = [] as T;
          }
          break;
        case 'dao':
          try {
            const daoResponse = await apiClient.getDAOTemplates();
            if (daoResponse.success) {
              result = daoResponse.data as T;
            } else {
              throw new Error('API call failed');
            }
          } catch (_error) {
            // Return empty array if API fails
            result = [] as T;
          }
          break;

        case 'auth-status':
          try {
            const userResponse = await apiClient.getCurrentUser();
            if (userResponse.success) {
              result = userResponse.data as T;
            } else {
              throw new Error('API call failed');
            }
          } catch (_error) {
            // Return null if auth check fails
            result = null as T;
          }
          break;
        default:
          // Handle dynamic endpoints like specific project or element
          if (endpoint.startsWith('project/')) {
            const projectId = endpoint.split('/')[1];
            if (!projectId) {
              throw new Error('Invalid project endpoint format');
            }
            try {
              const projectResponse = await apiClient.getProject(projectId);
              if (projectResponse.success) {
                result = projectResponse.data as T;
              } else {
                throw new Error('API call failed');
              }
            } catch (_error) {
              // Return null if API fails
              result = null as T;
            }
            break;
          } else if (endpoint.startsWith('elements/')) {
            const projectId = endpoint.split('/')[1] || 'demo-project-1';
            try {
              const elementsResponse = await apiClient.getConstructionElements(projectId);
              if (elementsResponse.success) {
                result = elementsResponse.data as T;
              } else {
                throw new Error('API call failed');
              }
            } catch (_error) {
              // Fallback to demo construction elements
              result = (await getDemoConstructionElements()) as T;
            }
            break;
          } else {
            throw new Error(`Unknown endpoint: ${endpoint}`);
          }
      }
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, [enabled, endpoint, onSuccess, onError]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refetch interval
  useEffect(() => {
    if (!refetchInterval || !enabled) {
      return;
    }
    const interval = setInterval(fetchData, refetchInterval);
    return () => clearInterval(interval);
  }, [fetchData, refetchInterval, enabled]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
};

// Specialized hooks for common use cases
export const useProjects = (options?: UseRealDataOptions) => {
  return useRealData('projects', options);
};

export const useConstructionElements = (
  projectId: string = 'demo-project-1',
  options?: UseRealDataOptions,
) => {
  return useRealData(`elements/${projectId}`, options);
};

export const useManufacturerProducts = (options?: UseRealDataOptions) => {
  return useRealData('products', options);
};

export const useDAOTemplates = (options?: UseRealDataOptions) => {
  return useRealData('dao', options);
};

export const useAuthStatus = (options?: UseRealDataOptions) => {
  return useRealData('auth-status', options);
};

// Hook for mutations (create, update, delete)
export const useApiMutation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (mutationFn: () => Promise<any>) => {
    try {
      setLoading(true);
      setError(null);
      const result = await mutationFn();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
};

// Demo data functions for fallback when API is unavailable
const getDemoProjects = () => {
  return [
    {
      id: 'demo-project-1',
      name: 'Downtown Office Complex',
      description: 'Modern 12-story office building with sustainable design',
      status: 'in-progress',
      progress: 65,
      location: 'Downtown District',
      budget: 15000000,
      currency: 'USD',
      startDate: '2024-01-15',
      expectedCompletion: '2024-12-30',
      elementCount: 8,
      userRole: 'architect',
      permissions: ['read:projects', 'write:projects', 'read:elements'],
      votingPower: 25,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-07-09T12:00:00Z',
    },
    {
      id: 'demo-project-2',
      name: 'Residential Complex Phase 1',
      description: 'Eco-friendly residential development',
      status: 'planning',
      progress: 25,
      location: 'Green Valley',
      budget: 8500000,
      startDate: '2024-03-01',
      expectedCompletion: '2025-08-15',
      elementCount: 12,
      userRole: 'owner',
      permissions: ['read:projects', 'write:projects', 'read:elements', 'write:dao'],
      votingPower: 40,
      created_at: '2024-02-01T09:00:00Z',
      updated_at: '2024-07-08T14:30:00Z',
    },
  ];
};

export default useRealData;
