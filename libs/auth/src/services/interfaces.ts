export interface DatabaseClient {
  findUserByEmail?(email: string): Promise<any>;
  createUser?(userData: any): Promise<any>;
  updateUser?(id: string, userData: any): Promise<any>;
  deleteUser?(id: string): Promise<boolean>;
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

export interface CacheClient {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  del?(key: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
}
