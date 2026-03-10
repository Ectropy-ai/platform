// Mock for ioredis - Enterprise Redis client mock
// Provides reliable Redis interface for testing without actual Redis

class MockRedis {
  constructor(options = {}) {
    this.connected = false;
    this.data = new Map();
    this.options = options;
  }

  async connect() {
    this.connected = true;
    return Promise.resolve('OK');
  }

  async disconnect() {
    this.connected = false;
    return Promise.resolve('OK');
  }

  async quit() {
    this.connected = false;
    return Promise.resolve('OK');
  }

  async get(key) {
    return Promise.resolve(this.data.get(key) || null);
  }

  async set(key, value, ...options) {
    this.data.set(key, value);
    return Promise.resolve('OK');
  }

  async del(key) {
    const existed = this.data.has(key);
    this.data.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  async exists(key) {
    return Promise.resolve(this.data.has(key) ? 1 : 0);
  }

  async expire(key, seconds) {
    // Mock expiration - in real implementation would set timeout
    return Promise.resolve(this.data.has(key) ? 1 : 0);
  }

  async hget(key, field) {
    const hash = this.data.get(key);
    if (hash && typeof hash === 'object') {
      return Promise.resolve(hash[field] || null);
    }
    return Promise.resolve(null);
  }

  async hset(key, field, value) {
    let hash = this.data.get(key);
    if (!hash || typeof hash !== 'object') {
      hash = {};
    }
    hash[field] = value;
    this.data.set(key, hash);
    return Promise.resolve(1);
  }

  async sadd(key, ...members) {
    let set = this.data.get(key);
    if (!set || !Array.isArray(set)) {
      set = [];
    }
    const added = members.filter(member => !set.includes(member));
    set.push(...added);
    this.data.set(key, set);
    return Promise.resolve(added.length);
  }

  async smembers(key) {
    const set = this.data.get(key);
    return Promise.resolve(Array.isArray(set) ? [...set] : []);
  }

  async ping() {
    return Promise.resolve('PONG');
  }

  async flushall() {
    this.data.clear();
    return Promise.resolve('OK');
  }

  on(event, callback) {
    // Mock event handling
    setTimeout(() => {
      if (event === 'ready' || event === 'connect') {
        callback();
      }
    }, 10);
    return this;
  }

  once(event, callback) {
    return this.on(event, callback);
  }

  off(event, callback) {
    return this;
  }

  emit(event, ...args) {
    return this;
  }
}

export default MockRedis;
export { MockRedis, MockRedis as Redis };