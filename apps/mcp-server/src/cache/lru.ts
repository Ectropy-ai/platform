import { Buffer } from 'node:buffer';

/**
 * Simple in-memory LRU cache capped by total memory usage.
 * The default limit is 512 MB which matches the requirement
 * for the MCP server's ephemeral cache layer.
 */
export class LRUCache<K, V> {
  private readonly maxBytes: number;
  private currentBytes = 0;
  private readonly store = new Map<K, { value: V; size: number }>();

  constructor(maxBytes = 512 * 1024 * 1024) {
    this.maxBytes = maxBytes;
  }

  private calcSize(value: V): number {
    try {
      const json = JSON.stringify(value);
      return Buffer.byteLength(json, 'utf8');
    } catch {
      // Fallback for non-serialisable values – roughly estimate to 0
      return 0;
    }
  }

  get(key: K): V | undefined {
    const item = this.store.get(key);
    if (!item) {
      return undefined;
    }
    // refresh recently used order
    this.store.delete(key);
    this.store.set(key, item);
    return item.value;
  }

  set(key: K, value: V): void {
    const size = this.calcSize(value);
    if (size > this.maxBytes) {
      return; // cannot cache items larger than capacity
    }

    // if key already exists adjust size
    const existing = this.store.get(key);
    if (existing) {
      this.currentBytes -= existing.size;
      this.store.delete(key);
    }

    // evict least recently used items until enough space
    while (this.currentBytes + size > this.maxBytes) {
      const firstKey = this.store.keys().next().value;
      if (firstKey === undefined) {
        break;
      }
      const first = this.store.get(firstKey);
      this.store.delete(firstKey);
      if (first) {
        this.currentBytes -= first.size;
      }
    }

    this.store.set(key, { value, size });
    this.currentBytes += size;
  }

  delete(key: K): boolean {
    const item = this.store.get(key);
    if (!item) {
      return false;
    }
    this.currentBytes -= item.size;
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.currentBytes = 0;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }
}

// Export a default singleton cache instance
export const lruCache = new LRUCache<string, unknown>();
