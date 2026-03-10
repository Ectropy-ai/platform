/**
 * Enterprise-Grade Safe Array Utilities
 *
 * PROBLEM SOLVED: Dashboard components crash with "Cannot read properties of undefined (reading 'length')"
 * ROOT CAUSE: Direct access to array.length without null/undefined checks
 * SOLUTION: Defensive programming with safe accessors and comprehensive error handling
 *
 * @module array-utils
 * @category Shared Utilities
 * @since 2025-12-10
 * @see evidence/FEATURE_IMPLEMENTATION_MATRIX_2025-12-10.md (Section 2.4: Dashboard Features)
 */

/**
 * Safely get the length of an array, returning 0 for null/undefined
 *
 * ENTERPRISE: Prevents "Cannot read properties of undefined (reading 'length')" errors
 *
 * @param arr - Array to get length from (can be null/undefined)
 * @returns Length of array, or 0 if null/undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const count = projects.length; // TypeError if projects is undefined
 *
 * // AFTER (SAFE):
 * const count = getLength(projects); // Returns 0 if undefined
 * ```
 */
export function getLength<T>(arr: T[] | undefined | null): number {
  return arr?.length ?? 0;
}

/**
 * Safely map over an array, returning empty array for null/undefined
 *
 * ENTERPRISE: Prevents runtime errors from mapping over undefined values
 *
 * @param arr - Array to map (can be null/undefined)
 * @param fn - Mapping function to apply to each element
 * @returns Mapped array, or empty array if input is null/undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const names = projects.map(p => p.name); // TypeError if projects is undefined
 *
 * // AFTER (SAFE):
 * const names = safeMap(projects, p => p.name); // Returns [] if undefined
 * ```
 */
export function safeMap<T, U>(
  arr: T[] | undefined | null,
  fn: (item: T, index: number, array: T[]) => U
): U[] {
  return arr?.map(fn) ?? [];
}

/**
 * Safely filter an array, returning empty array for null/undefined
 *
 * ENTERPRISE: Defensive filtering with null-safe behavior
 *
 * @param arr - Array to filter (can be null/undefined)
 * @param predicate - Filter function to test each element
 * @returns Filtered array, or empty array if input is null/undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const completed = projects.filter(p => p.status === 'completed'); // TypeError if undefined
 *
 * // AFTER (SAFE):
 * const completed = safeFilter(projects, p => p.status === 'completed'); // Returns [] if undefined
 * ```
 */
export function safeFilter<T>(
  arr: T[] | undefined | null,
  predicate: (item: T, index: number, array: T[]) => boolean
): T[] {
  return arr?.filter(predicate) ?? [];
}

/**
 * Safely find an element in an array, returning undefined for null/undefined arrays
 *
 * ENTERPRISE: Null-safe element lookup
 *
 * @param arr - Array to search (can be null/undefined)
 * @param predicate - Function to test each element
 * @returns Found element or undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const project = projects.find(p => p.id === '123'); // TypeError if undefined
 *
 * // AFTER (SAFE):
 * const project = safeFind(projects, p => p.id === '123'); // Returns undefined if array is undefined
 * ```
 */
export function safeFind<T>(
  arr: T[] | undefined | null,
  predicate: (item: T, index: number, array: T[]) => boolean
): T | undefined {
  return arr?.find(predicate);
}

/**
 * Safely reduce an array with initial value, handling null/undefined
 *
 * ENTERPRISE: Null-safe aggregation operations
 *
 * @param arr - Array to reduce (can be null/undefined)
 * @param fn - Reducer function
 * @param initialValue - Initial accumulator value
 * @returns Reduced value, or initialValue if array is null/undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const total = projects.reduce((sum, p) => sum + p.budget, 0); // TypeError if undefined
 *
 * // AFTER (SAFE):
 * const total = safeReduce(projects, (sum, p) => sum + p.budget, 0); // Returns 0 if undefined
 * ```
 */
export function safeReduce<T, U>(
  arr: T[] | undefined | null,
  fn: (accumulator: U, item: T, index: number, array: T[]) => U,
  initialValue: U
): U {
  return arr?.reduce(fn, initialValue) ?? initialValue;
}

/**
 * Safely check if array is empty (includes null/undefined check)
 *
 * ENTERPRISE: Comprehensive emptiness check
 *
 * @param arr - Array to check (can be null/undefined)
 * @returns true if array is null, undefined, or has length 0
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * if (projects.length === 0) { } // TypeError if undefined
 *
 * // AFTER (SAFE):
 * if (isEmpty(projects)) { } // Safely handles undefined
 * ```
 */
export function isEmpty<T>(arr: T[] | undefined | null): boolean {
  return !arr || arr.length === 0;
}

/**
 * Safely check if array has elements
 *
 * ENTERPRISE: Inverse of isEmpty for clearer intent
 *
 * @param arr - Array to check (can be null/undefined)
 * @returns true if array exists and has at least one element
 *
 * @example
 * ```typescript
 * if (hasElements(projects)) {
 *   // Safe to access projects[0]
 * }
 * ```
 */
export function hasElements<T>(arr: T[] | undefined | null): boolean {
  return !isEmpty(arr);
}

/**
 * Safely get first element of array
 *
 * ENTERPRISE: Null-safe array access
 *
 * @param arr - Array to access (can be null/undefined)
 * @returns First element or undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const first = projects[0]; // undefined if empty, TypeError if null
 *
 * // AFTER (SAFE):
 * const first = safeFirst(projects); // Always returns T | undefined
 * ```
 */
export function safeFirst<T>(arr: T[] | undefined | null): T | undefined {
  return arr?.[0];
}

/**
 * Safely get last element of array
 *
 * ENTERPRISE: Null-safe last element access
 *
 * @param arr - Array to access (can be null/undefined)
 * @returns Last element or undefined
 *
 * @example
 * ```typescript
 * const last = safeLast(projects);
 * ```
 */
export function safeLast<T>(arr: T[] | undefined | null): T | undefined {
  if (!arr || arr.length === 0) {
    return undefined;
  }
  return arr[arr.length - 1];
}

/**
 * Safely get element at index
 *
 * ENTERPRISE: Bounds-checked array access
 *
 * @param arr - Array to access (can be null/undefined)
 * @param index - Index to access
 * @returns Element at index or undefined
 *
 * @example
 * ```typescript
 * // BEFORE (UNSAFE):
 * const item = projects[5]; // undefined if out of bounds, TypeError if null
 *
 * // AFTER (SAFE):
 * const item = safeAt(projects, 5); // Always returns T | undefined
 * ```
 */
export function safeAt<T>(arr: T[] | undefined | null, index: number): T | undefined {
  if (!arr || index < 0 || index >= arr.length) {
    return undefined;
  }
  return arr[index];
}

/**
 * Safely concatenate arrays, filtering out null/undefined
 *
 * ENTERPRISE: Null-safe array concatenation
 *
 * @param arrays - Variable number of arrays to concatenate (can include null/undefined)
 * @returns Concatenated array with nulls filtered out
 *
 * @example
 * ```typescript
 * const all = safeConcat(projects1, undefined, projects2, null);
 * // Returns concatenation of only non-null arrays
 * ```
 */
export function safeConcat<T>(...arrays: (T[] | undefined | null)[]): T[] {
  return arrays.reduce<T[]>((acc, arr) => {
    if (arr && arr.length > 0) {
      return acc.concat(arr);
    }
    return acc;
  }, []);
}

/**
 * Safely slice an array
 *
 * ENTERPRISE: Null-safe slicing
 *
 * @param arr - Array to slice (can be null/undefined)
 * @param start - Start index
 * @param end - Optional end index
 * @returns Sliced array or empty array
 *
 * @example
 * ```typescript
 * const firstFive = safeSlice(projects, 0, 5);
 * ```
 */
export function safeSlice<T>(
  arr: T[] | undefined | null,
  start: number,
  end?: number
): T[] {
  return arr?.slice(start, end) ?? [];
}

/**
 * Safely check if array includes an element
 *
 * ENTERPRISE: Null-safe inclusion check
 *
 * @param arr - Array to check (can be null/undefined)
 * @param searchElement - Element to search for
 * @returns true if element found, false otherwise
 *
 * @example
 * ```typescript
 * if (safeIncludes(statuses, 'completed')) {
 *   // ...
 * }
 * ```
 */
export function safeIncludes<T>(
  arr: T[] | undefined | null,
  searchElement: T
): boolean {
  return arr?.includes(searchElement) ?? false;
}

/**
 * Safely sort an array (creates new array)
 *
 * ENTERPRISE: Null-safe sorting with immutability
 *
 * @param arr - Array to sort (can be null/undefined)
 * @param compareFn - Optional comparison function
 * @returns Sorted copy of array or empty array
 *
 * @example
 * ```typescript
 * const sorted = safeSort(projects, (a, b) => a.name.localeCompare(b.name));
 * ```
 */
export function safeSort<T>(
  arr: T[] | undefined | null,
  compareFn?: (a: T, b: T) => number
): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }
  return [...arr].sort(compareFn);
}

/**
 * Safely reverse an array (creates new array)
 *
 * ENTERPRISE: Null-safe reversal with immutability
 *
 * @param arr - Array to reverse (can be null/undefined)
 * @returns Reversed copy of array or empty array
 *
 * @example
 * ```typescript
 * const reversed = safeReverse(projects);
 * ```
 */
export function safeReverse<T>(arr: T[] | undefined | null): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }
  return [...arr].reverse();
}

/**
 * Safely get unique elements from array
 *
 * ENTERPRISE: Null-safe deduplication
 *
 * @param arr - Array to deduplicate (can be null/undefined)
 * @returns Array with unique elements or empty array
 *
 * @example
 * ```typescript
 * const uniqueStatuses = safeUnique(projects.map(p => p.status));
 * ```
 */
export function safeUnique<T>(arr: T[] | undefined | null): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }
  return Array.from(new Set(arr));
}

/**
 * Safely flatten nested arrays
 *
 * ENTERPRISE: Null-safe flattening
 *
 * @param arr - Nested array to flatten (can be null/undefined)
 * @returns Flattened array or empty array
 *
 * @example
 * ```typescript
 * const allElements = safeFlatten(projects.map(p => p.elements));
 * ```
 */
export function safeFlatten<T>(arr: (T[] | undefined | null)[] | undefined | null): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }
  return arr.reduce<T[]>((acc, subArr) => {
    if (subArr && subArr.length > 0) {
      return acc.concat(subArr);
    }
    return acc;
  }, []);
}
