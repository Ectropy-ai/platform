/**
 * Enterprise-Grade Unit Tests for Safe Array Utilities
 *
 * TARGET COVERAGE: 90%+ (per QA Framework Architecture)
 * TESTING STRATEGY: Test all edge cases (null, undefined, empty, normal)
 * VALIDATION: Prevents regression of "Cannot read properties of undefined" errors
 *
 * @see libs/shared/utils/src/array-utils.ts
 * @see evidence/QA_FRAMEWORK_ARCHITECTURE_2025-12-10.md
 */

import {
  getLength,
  safeMap,
  safeFilter,
  safeFind,
  safeReduce,
  isEmpty,
  hasElements,
  safeFirst,
  safeLast,
  safeAt,
  safeConcat,
  safeSlice,
  safeIncludes,
  safeSort,
  safeReverse,
  safeUnique,
  safeFlatten,
} from './array-utils';

describe('array-utils', () => {
  // Test data
  const numbers = [1, 2, 3, 4, 5];
  const projects = [
    { id: '1', name: 'Project A', budget: 100 },
    { id: '2', name: 'Project B', budget: 200 },
    { id: '3', name: 'Project C', budget: 300 },
  ];

  describe('getLength', () => {
    it('should return 0 for undefined', () => {
      expect(getLength(undefined)).toBe(0);
    });

    it('should return 0 for null', () => {
      expect(getLength(null)).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(getLength([])).toBe(0);
    });

    it('should return correct length for array with elements', () => {
      expect(getLength(numbers)).toBe(5);
      expect(getLength(projects)).toBe(3);
    });
  });

  describe('safeMap', () => {
    it('should return empty array for undefined', () => {
      expect(safeMap(undefined, (x) => x * 2)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeMap(null, (x) => x * 2)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeMap([], (x) => x * 2)).toEqual([]);
    });

    it('should map array correctly', () => {
      expect(safeMap(numbers, (x) => x * 2)).toEqual([2, 4, 6, 8, 10]);
    });

    it('should provide index to mapping function', () => {
      const result = safeMap(numbers, (x, i) => x + i);
      expect(result).toEqual([1, 3, 5, 7, 9]);
    });

    it('should map objects correctly', () => {
      const names = safeMap(projects, (p) => p.name);
      expect(names).toEqual(['Project A', 'Project B', 'Project C']);
    });
  });

  describe('safeFilter', () => {
    it('should return empty array for undefined', () => {
      expect(safeFilter(undefined, (x) => x > 2)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeFilter(null, (x) => x > 2)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeFilter([], (x) => x > 2)).toEqual([]);
    });

    it('should filter array correctly', () => {
      expect(safeFilter(numbers, (x) => x > 2)).toEqual([3, 4, 5]);
    });

    it('should filter objects correctly', () => {
      const expensive = safeFilter(projects, (p) => p.budget > 150);
      expect(expensive).toHaveLength(2);
      expect(expensive[0]?.name).toBe('Project B');
    });

    it('should return empty if no elements match', () => {
      expect(safeFilter(numbers, (x) => x > 10)).toEqual([]);
    });
  });

  describe('safeFind', () => {
    it('should return undefined for undefined array', () => {
      expect(safeFind(undefined, (x) => x === 3)).toBeUndefined();
    });

    it('should return undefined for null array', () => {
      expect(safeFind(null, (x) => x === 3)).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(safeFind([], (x) => x === 3)).toBeUndefined();
    });

    it('should find element correctly', () => {
      expect(safeFind(numbers, (x) => x === 3)).toBe(3);
    });

    it('should find object correctly', () => {
      const project = safeFind(projects, (p) => p.id === '2');
      expect(project?.name).toBe('Project B');
    });

    it('should return undefined if not found', () => {
      expect(safeFind(numbers, (x) => x === 99)).toBeUndefined();
    });
  });

  describe('safeReduce', () => {
    it('should return initial value for undefined', () => {
      expect(safeReduce(undefined, (sum, x) => sum + x, 0)).toBe(0);
    });

    it('should return initial value for null', () => {
      expect(safeReduce(null, (sum, x) => sum + x, 0)).toBe(0);
    });

    it('should return initial value for empty array', () => {
      expect(safeReduce([], (sum, x) => sum + x, 0)).toBe(0);
    });

    it('should reduce correctly', () => {
      expect(safeReduce(numbers, (sum, x) => sum + x, 0)).toBe(15);
    });

    it('should sum object properties correctly', () => {
      const totalBudget = safeReduce(projects, (sum, p) => sum + p.budget, 0);
      expect(totalBudget).toBe(600);
    });

    it('should work with non-numeric reductions', () => {
      const names = safeReduce(projects, (acc, p) => [...acc, p.name], [] as string[]);
      expect(names).toEqual(['Project A', 'Project B', 'Project C']);
    });
  });

  describe('isEmpty', () => {
    it('should return true for undefined', () => {
      expect(isEmpty(undefined)).toBe(true);
    });

    it('should return true for null', () => {
      expect(isEmpty(null)).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(isEmpty([])).toBe(true);
    });

    it('should return false for array with elements', () => {
      expect(isEmpty(numbers)).toBe(false);
      expect(isEmpty(projects)).toBe(false);
    });
  });

  describe('hasElements', () => {
    it('should return false for undefined', () => {
      expect(hasElements(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(hasElements(null)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(hasElements([])).toBe(false);
    });

    it('should return true for array with elements', () => {
      expect(hasElements(numbers)).toBe(true);
      expect(hasElements(projects)).toBe(true);
    });
  });

  describe('safeFirst', () => {
    it('should return undefined for undefined', () => {
      expect(safeFirst(undefined)).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(safeFirst(null)).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(safeFirst([])).toBeUndefined();
    });

    it('should return first element', () => {
      expect(safeFirst(numbers)).toBe(1);
      expect(safeFirst(projects)?.name).toBe('Project A');
    });
  });

  describe('safeLast', () => {
    it('should return undefined for undefined', () => {
      expect(safeLast(undefined)).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(safeLast(null)).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(safeLast([])).toBeUndefined();
    });

    it('should return last element', () => {
      expect(safeLast(numbers)).toBe(5);
      expect(safeLast(projects)?.name).toBe('Project C');
    });
  });

  describe('safeAt', () => {
    it('should return undefined for undefined array', () => {
      expect(safeAt(undefined, 0)).toBeUndefined();
    });

    it('should return undefined for null array', () => {
      expect(safeAt(null, 0)).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(safeAt([], 0)).toBeUndefined();
    });

    it('should return undefined for negative index', () => {
      expect(safeAt(numbers, -1)).toBeUndefined();
    });

    it('should return undefined for out-of-bounds index', () => {
      expect(safeAt(numbers, 10)).toBeUndefined();
    });

    it('should return element at valid index', () => {
      expect(safeAt(numbers, 0)).toBe(1);
      expect(safeAt(numbers, 2)).toBe(3);
      expect(safeAt(numbers, 4)).toBe(5);
    });

    it('should return object at valid index', () => {
      expect(safeAt(projects, 1)?.name).toBe('Project B');
    });
  });

  describe('safeConcat', () => {
    it('should return empty array for no arguments', () => {
      expect(safeConcat()).toEqual([]);
    });

    it('should filter out undefined', () => {
      expect(safeConcat([1, 2], undefined, [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('should filter out null', () => {
      expect(safeConcat([1, 2], null, [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('should filter out empty arrays', () => {
      expect(safeConcat([1, 2], [], [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('should concatenate multiple arrays', () => {
      expect(safeConcat([1], [2, 3], [4, 5])).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle all null/undefined', () => {
      expect(safeConcat(null, undefined, null)).toEqual([]);
    });
  });

  describe('safeSlice', () => {
    it('should return empty array for undefined', () => {
      expect(safeSlice(undefined, 0, 2)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeSlice(null, 0, 2)).toEqual([]);
    });

    it('should slice correctly', () => {
      expect(safeSlice(numbers, 0, 2)).toEqual([1, 2]);
      expect(safeSlice(numbers, 2, 4)).toEqual([3, 4]);
    });

    it('should slice without end index', () => {
      expect(safeSlice(numbers, 2)).toEqual([3, 4, 5]);
    });

    it('should handle out-of-bounds indices gracefully', () => {
      expect(safeSlice(numbers, 0, 100)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('safeIncludes', () => {
    it('should return false for undefined', () => {
      expect(safeIncludes(undefined, 3)).toBe(false);
    });

    it('should return false for null', () => {
      expect(safeIncludes(null, 3)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(safeIncludes([], 3)).toBe(false);
    });

    it('should return true if element exists', () => {
      expect(safeIncludes(numbers, 3)).toBe(true);
    });

    it('should return false if element does not exist', () => {
      expect(safeIncludes(numbers, 99)).toBe(false);
    });

    it('should work with objects (reference equality)', () => {
      const project = projects[0];
      expect(safeIncludes(projects, project!)).toBe(true);
    });
  });

  describe('safeSort', () => {
    it('should return empty array for undefined', () => {
      expect(safeSort(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeSort(null)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeSort([])).toEqual([]);
    });

    it('should sort numbers in ascending order by default', () => {
      expect(safeSort([5, 2, 8, 1, 9])).toEqual([1, 2, 5, 8, 9]);
    });

    it('should sort with custom compare function', () => {
      const sorted = safeSort(numbers, (a, b) => b - a);
      expect(sorted).toEqual([5, 4, 3, 2, 1]);
    });

    it('should sort objects with compare function', () => {
      const sorted = safeSort(projects, (a, b) => a.name.localeCompare(b.name));
      expect(sorted[0]?.name).toBe('Project A');
      expect(sorted[2]?.name).toBe('Project C');
    });

    it('should not mutate original array', () => {
      const original = [3, 1, 2];
      const sorted = safeSort(original);
      expect(sorted).toEqual([1, 2, 3]);
      expect(original).toEqual([3, 1, 2]); // Original unchanged
    });
  });

  describe('safeReverse', () => {
    it('should return empty array for undefined', () => {
      expect(safeReverse(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeReverse(null)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeReverse([])).toEqual([]);
    });

    it('should reverse array', () => {
      expect(safeReverse(numbers)).toEqual([5, 4, 3, 2, 1]);
    });

    it('should not mutate original array', () => {
      const original = [1, 2, 3];
      const reversed = safeReverse(original);
      expect(reversed).toEqual([3, 2, 1]);
      expect(original).toEqual([1, 2, 3]); // Original unchanged
    });
  });

  describe('safeUnique', () => {
    it('should return empty array for undefined', () => {
      expect(safeUnique(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeUnique(null)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeUnique([])).toEqual([]);
    });

    it('should remove duplicates', () => {
      expect(safeUnique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should preserve order of first occurrence', () => {
      expect(safeUnique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
    });

    it('should work with strings', () => {
      expect(safeUnique(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('safeFlatten', () => {
    it('should return empty array for undefined', () => {
      expect(safeFlatten(undefined)).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(safeFlatten(null)).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(safeFlatten([])).toEqual([]);
    });

    it('should flatten nested arrays', () => {
      expect(safeFlatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5]);
    });

    it('should filter out null subarrays', () => {
      expect(safeFlatten([[1, 2], null, [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it('should filter out undefined subarrays', () => {
      expect(safeFlatten([[1, 2], undefined, [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it('should filter out empty subarrays', () => {
      expect(safeFlatten([[1, 2], [], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it('should handle all null/undefined subarrays', () => {
      expect(safeFlatten([null, undefined, null])).toEqual([]);
    });
  });

  // ENTERPRISE: Integration test for real-world dashboard scenario
  describe('Integration: Dashboard Data Fetching', () => {
    it('should handle undefined projects array without errors', () => {
      const projects = undefined;

      // These operations would have caused TypeError before
      const count = getLength(projects);
      const names = safeMap(projects, (p) => p.name);
      const isEmpty = getLength(projects) === 0;

      expect(count).toBe(0);
      expect(names).toEqual([]);
      expect(isEmpty).toBe(true);
    });

    it('should safely process valid projects array', () => {
      const validProjects = [
        { id: '1', name: 'Building A', status: 'completed', budget: 1000 },
        { id: '2', name: 'Building B', status: 'in_progress', budget: 2000 },
        { id: '3', name: 'Building C', status: 'planned', budget: 3000 },
      ];

      const count = getLength(validProjects);
      const completed = safeFilter(validProjects, (p) => p.status === 'completed');
      const totalBudget = safeReduce(validProjects, (sum, p) => sum + p.budget, 0);
      const hasProjects = hasElements(validProjects);
      const first = safeFirst(validProjects);

      expect(count).toBe(3);
      expect(completed).toHaveLength(1);
      expect(totalBudget).toBe(6000);
      expect(hasProjects).toBe(true);
      expect(first?.name).toBe('Building A');
    });
  });
});
