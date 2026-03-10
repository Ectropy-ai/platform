/**
 * =============================================================================
 * ECTROPY DATABASE CLIENT INTERFACE
 * =============================================================================
 *
 * PURPOSE: Unified database interface for PostgreSQL with PostGIS spatial data
 * SCOPE: Core data layer for BIM elements, projects, users, and governance
 *
 * FEATURES:
 * - Connection pooling and health monitoring
 * - Transaction support for data consistency
 * - Spatial queries for BIM geometry data
 * - Migration and schema management
 * - Query optimization and caching
 *
 * SECURITY:
 * - Parameterized queries to prevent SQL injection
 * - Role-based access control integration
 * - Audit logging for all data operations
 *
 * USAGE:
 * import { DatabaseClient } from '@ectropy/database';
 * const db = new PostgresClient(config);
 * await db.connect();
 * =============================================================================
 */
/**
 * Mock Database Client Implementation
 * Used for development and testing when a real database is not available
 */
export class MockDatabaseClient {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.connected = false;
  }
  async connect() {
    this.connected = true;
    // console.log('Mock database connected');
  }
  async disconnect() {
    this.connected = false;
    // console.log('Mock database disconnected');
  }
  isConnected() {
    return this.connected;
  }
  async createUser(userData) {
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      email: userData.email,
      name: userData.name,
      roles: userData.roles ?? ['user'],
      hashedPassword: userData.hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
  async findUserByEmail(email) {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }
  async findUserById(id) {
    return this.users.get(id) ?? null;
  }
  async updateUser(id, userData) {
    const user = this.users.get(id);
    if (user === null) {
      throw new Error('User not found');
    }
    const updatedUser = {
      ...user,
      ...userData,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  async deleteUser(id) {
    return this.users.delete(id);
  }
  async createSession(_userId, sessionData) {
    const sessionId = Math.random().toString(36).substr(2, 16);
    this.sessions.set(sessionId, {
      _userId,
      ...sessionData,
      createdAt: new Date(),
    });
    return sessionId;
  }
  async getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
  async deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }
  async cleanupExpiredSessions() {
    // Mock implementation - in real DB this would check expiration
    return 0;
  }
  async query(_sql, _params) {
    // console.log('Mock query:', _sql, _params);
    return { rows: [], rowCount: 0 };
  }
  async transaction(callback) {
    // Mock transaction - just execute the callback
    return callback(this);
  }
}
// Export a default instance for development
export const mockDatabaseClient = new MockDatabaseClient();
export default mockDatabaseClient;
//# sourceMappingURL=client.js.map
