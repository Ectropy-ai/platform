/**
 * Edge Server - IoT Integration & Offline Sync Service
 * Ectropy Platform Edge Computing Node
 *
 * Runs on OnLogic Karbon 521 (Intel Core Ultra, 16+ cores, 16-96GB DDR5)
 * at construction jobsites with Starlink + Peplink 5G connectivity.
 *
 * Responsibilities:
 * - HTTP health/status API for nginx and monitoring
 * - MQTT broker client for IoT sensor data (temperature, vibration, noise)
 * - Connectivity monitoring (online/offline state)
 * - Offline data queue with sync-on-reconnect
 * - Edge-local sensor data processing and aggregation
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as mqtt from 'mqtt';

// Configure EventEmitter limits for sensor streams
if (EventEmitter.defaultMaxListeners < 50) {
  EventEmitter.defaultMaxListeners = 50;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface EdgeConfig {
  port: number;
  hostname: string;
  mqttBrokerUrl: string;
  mqttTopics: string[];
  cloudApiUrl: string;
  syncIntervalMs: number;
  healthCheckIntervalMs: number;
  siteId: string;
  siteName: string;
  offlineQueueMaxSize: number;
}

function loadConfig(): EdgeConfig {
  return {
    port: parseInt(process.env['EDGE_PORT'] || '3004', 10),
    hostname: process.env['EDGE_HOSTNAME'] || '0.0.0.0',
    mqttBrokerUrl: process.env['MQTT_BROKER_URL'] || 'mqtt://localhost:1883',
    mqttTopics: (
      process.env['MQTT_TOPICS'] || 'sensors/#,alerts/#,equipment/#'
    ).split(','),
    cloudApiUrl: process.env['CLOUD_API_URL'] || 'https://pilot.jsc.ai/api',
    syncIntervalMs: parseInt(process.env['SYNC_INTERVAL_MS'] || '30000', 10),
    healthCheckIntervalMs: parseInt(
      process.env['HEALTH_CHECK_INTERVAL_MS'] || '10000',
      10
    ),
    siteId: process.env['SITE_ID'] || 'pilot-canadian-plant',
    siteName: process.env['SITE_NAME'] || 'Canadian Plant Facility',
    offlineQueueMaxSize: parseInt(
      process.env['OFFLINE_QUEUE_MAX_SIZE'] || '10000',
      10
    ),
  };
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(
  level: LogLevel,
  context: string,
  message: string,
  data?: Record<string, unknown>
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(data ? { data } : {}),
  };
  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(`${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

// ---------------------------------------------------------------------------
// Connectivity Monitor
// ---------------------------------------------------------------------------

interface ConnectivityState {
  online: boolean;
  lastOnline: string | null;
  lastOffline: string | null;
  consecutiveFailures: number;
  latencyMs: number | null;
}

class ConnectivityMonitor {
  private state: ConnectivityState = {
    online: false,
    lastOnline: null,
    lastOffline: null,
    consecutiveFailures: 0,
    latencyMs: null,
  };
  private interval: ReturnType<typeof setInterval> | null = null;
  private emitter = new EventEmitter();
  private cloudApiUrl: string;
  private checkIntervalMs: number;

  constructor(cloudApiUrl: string, checkIntervalMs: number) {
    this.cloudApiUrl = cloudApiUrl;
    this.checkIntervalMs = checkIntervalMs;
  }

  start() {
    this.check();
    this.interval = setInterval(() => this.check(), this.checkIntervalMs);
    log('info', 'ConnectivityMonitor', 'Started', {
      interval: this.checkIntervalMs,
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  getState(): ConnectivityState {
    return { ...this.state };
  }

  on(event: 'online' | 'offline', listener: () => void) {
    this.emitter.on(event, listener);
  }

  private async check() {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.cloudApiUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const wasOffline = !this.state.online;
        this.state.online = true;
        this.state.lastOnline = new Date().toISOString();
        this.state.consecutiveFailures = 0;
        this.state.latencyMs = Date.now() - start;
        if (wasOffline) {
          log('info', 'ConnectivityMonitor', 'Connection restored', {
            latencyMs: this.state.latencyMs,
          });
          this.emitter.emit('online');
        }
      } else {
        this.handleFailure();
      }
    } catch {
      this.handleFailure();
    }
  }

  private handleFailure() {
    this.state.consecutiveFailures++;
    this.state.latencyMs = null;
    const wasOnline = this.state.online;
    // Go offline after 3 consecutive failures
    if (this.state.consecutiveFailures >= 3) {
      this.state.online = false;
      this.state.lastOffline = new Date().toISOString();
      if (wasOnline) {
        log('warn', 'ConnectivityMonitor', 'Connection lost', {
          failures: this.state.consecutiveFailures,
        });
        this.emitter.emit('offline');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Offline Data Queue
// ---------------------------------------------------------------------------

interface QueuedReading {
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

class OfflineQueue {
  private queue: QueuedReading[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  enqueue(reading: QueuedReading) {
    if (this.queue.length >= this.maxSize) {
      // Drop oldest readings when full (ring buffer behavior)
      this.queue.shift();
    }
    this.queue.push(reading);
  }

  drain(): QueuedReading[] {
    const items = this.queue.splice(0);
    return items;
  }

  get size(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// MQTT Sensor Client
// ---------------------------------------------------------------------------

interface SensorStats {
  messagesReceived: number;
  lastMessageAt: string | null;
  topicCounts: Record<string, number>;
}

class SensorClient {
  private client: mqtt.MqttClient | null = null;
  private stats: SensorStats = {
    messagesReceived: 0,
    lastMessageAt: null,
    topicCounts: {},
  };
  private emitter = new EventEmitter();
  private brokerUrl: string;
  private topics: string[];

  constructor(brokerUrl: string, topics: string[]) {
    this.brokerUrl = brokerUrl;
    this.topics = topics;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(this.brokerUrl, {
          clientId: `ectropy-edge-${Date.now()}`,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 10000,
        });

        this.client.on('connect', () => {
          log('info', 'SensorClient', 'Connected to MQTT broker', {
            broker: this.brokerUrl,
          });
          for (const topic of this.topics) {
            this.client!.subscribe(topic, (err: Error | null) => {
              if (err) {
                log(
                  'error',
                  'SensorClient',
                  `Failed to subscribe to ${topic}`,
                  { error: String(err) }
                );
              } else {
                log('info', 'SensorClient', `Subscribed to ${topic}`);
              }
            });
          }
          resolve();
        });

        this.client.on('message', (topic: string, payload: Buffer) => {
          this.stats.messagesReceived++;
          this.stats.lastMessageAt = new Date().toISOString();
          this.stats.topicCounts[topic] =
            (this.stats.topicCounts[topic] || 0) + 1;

          try {
            const data = JSON.parse(payload.toString()) as Record<
              string,
              unknown
            >;
            this.emitter.emit('reading', {
              topic,
              payload: data,
              timestamp: new Date().toISOString(),
            });
          } catch {
            log('warn', 'SensorClient', 'Non-JSON message received', {
              topic,
              size: payload.length,
            });
          }
        });

        this.client.on('error', (err: Error) => {
          log('error', 'SensorClient', 'MQTT error', { error: err.message });
        });

        this.client.on('offline', () => {
          log('warn', 'SensorClient', 'MQTT broker offline, will reconnect');
        });

        // If connect takes too long, resolve anyway (reconnect will handle it)
        setTimeout(() => resolve(), 10000);
      } catch (err) {
        log('error', 'SensorClient', 'Failed to create MQTT client', {
          error: String(err),
        });
        reject(err);
      }
    });
  }

  onReading(listener: (reading: QueuedReading) => void) {
    this.emitter.on('reading', listener);
  }

  getStats(): SensorStats {
    return { ...this.stats };
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Cloud Sync
// ---------------------------------------------------------------------------

class CloudSync {
  private syncing = false;
  private lastSyncAt: string | null = null;
  private syncCount = 0;
  private errorCount = 0;
  private cloudApiUrl: string;
  private siteId: string;

  constructor(cloudApiUrl: string, siteId: string) {
    this.cloudApiUrl = cloudApiUrl;
    this.siteId = siteId;
  }

  async syncReadings(readings: QueuedReading[]): Promise<boolean> {
    if (readings.length === 0 || this.syncing) {
      return true;
    }
    this.syncing = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${this.cloudApiUrl}/edge/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: this.siteId,
          readings,
          syncedAt: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        this.lastSyncAt = new Date().toISOString();
        this.syncCount++;
        log('info', 'CloudSync', `Synced ${readings.length} readings`, {
          syncCount: this.syncCount,
        });
        return true;
      } else {
        this.errorCount++;
        log('error', 'CloudSync', `Sync failed: ${response.status}`, {
          errorCount: this.errorCount,
        });
        return false;
      }
    } catch {
      this.errorCount++;
      log('error', 'CloudSync', 'Sync request failed', {
        errorCount: this.errorCount,
      });
      return false;
    } finally {
      this.syncing = false;
    }
  }

  getStatus() {
    return {
      lastSyncAt: this.lastSyncAt,
      syncCount: this.syncCount,
      errorCount: this.errorCount,
      syncing: this.syncing,
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP Health & Status Server
// ---------------------------------------------------------------------------

interface EdgeStatus {
  service: string;
  version: string;
  uptime: number;
  site: { id: string; name: string };
  connectivity: ConnectivityState;
  sensors: SensorStats;
  queue: { size: number; maxSize: number };
  sync: ReturnType<CloudSync['getStatus']>;
  hardware: { platform: string; arch: string; cpus: number; memoryMB: number };
}

function createHttpServer(
  config: EdgeConfig,
  connectivity: ConnectivityMonitor,
  sensorClient: SensorClient,
  offlineQueue: OfflineQueue,
  cloudSync: CloudSync,
  startTime: number
): http.Server {
  const os = require('os') as typeof import('os');

  return http.createServer((req, res) => {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`
    );

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    switch (url.pathname) {
      // Layer 1: LB/nginx health (ultra-lightweight)
      case '/lb-health': {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('healthy\n');
        break;
      }

      // Layer 2: Application health (comprehensive)
      case '/health': {
        const conn = connectivity.getState();
        const health = {
          status: 'healthy',
          service: 'edge-server',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          connectivity: conn.online ? 'online' : 'offline',
          queueSize: offlineQueue.size,
          timestamp: new Date().toISOString(),
        };
        res.writeHead(200);
        res.end(JSON.stringify(health));
        break;
      }

      // Full status endpoint for monitoring/dashboard
      case '/status': {
        const status: EdgeStatus = {
          service: 'ectropy-edge-server',
          version: '1.0.0',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          site: { id: config.siteId, name: config.siteName },
          connectivity: connectivity.getState(),
          sensors: sensorClient.getStats(),
          queue: {
            size: offlineQueue.size,
            maxSize: config.offlineQueueMaxSize,
          },
          sync: cloudSync.getStatus(),
          hardware: {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memoryMB: Math.round(os.totalmem() / 1024 / 1024),
          },
        };
        res.writeHead(200);
        res.end(JSON.stringify(status, null, 2));
        break;
      }

      default: {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function bootstrap(): Promise<void> {
  const startTime = Date.now();
  const config = loadConfig();

  log('info', 'EdgeServer', 'Starting Ectropy Edge Server', {
    siteId: config.siteId,
    siteName: config.siteName,
    port: config.port,
  });

  // Initialize components
  const connectivity = new ConnectivityMonitor(
    config.cloudApiUrl,
    config.healthCheckIntervalMs
  );
  const offlineQueue = new OfflineQueue(config.offlineQueueMaxSize);
  const sensorClient = new SensorClient(
    config.mqttBrokerUrl,
    config.mqttTopics
  );
  const cloudSync = new CloudSync(config.cloudApiUrl, config.siteId);

  // Wire up sensor readings → queue or sync
  sensorClient.onReading((reading) => {
    if (connectivity.getState().online) {
      // Online: try to sync immediately, queue on failure
      cloudSync.syncReadings([reading]).then((ok) => {
        if (!ok) {
          offlineQueue.enqueue(reading);
        }
      });
    } else {
      // Offline: queue for later sync
      offlineQueue.enqueue(reading);
    }
  });

  // When connectivity restores, flush the offline queue
  connectivity.on('online', () => {
    const queued = offlineQueue.drain();
    if (queued.length > 0) {
      log('info', 'EdgeServer', `Flushing ${queued.length} queued readings`);
      cloudSync.syncReadings(queued).then((ok) => {
        if (!ok) {
          // Re-queue on failure
          for (const reading of queued) {
            offlineQueue.enqueue(reading);
          }
        }
      });
    }
  });

  // Periodic sync for any accumulated queue items
  setInterval(() => {
    if (connectivity.getState().online && offlineQueue.size > 0) {
      const queued = offlineQueue.drain();
      cloudSync.syncReadings(queued).then((ok) => {
        if (!ok) {
          for (const reading of queued) {
            offlineQueue.enqueue(reading);
          }
        }
      });
    }
  }, config.syncIntervalMs);

  // Start connectivity monitoring
  connectivity.start();

  // Connect to MQTT broker (non-blocking — reconnects automatically)
  sensorClient.connect().catch((err) => {
    log(
      'warn',
      'EdgeServer',
      'MQTT broker not available at startup, will retry',
      { error: String(err) }
    );
  });

  // Start HTTP server
  const server = createHttpServer(
    config,
    connectivity,
    sensorClient,
    offlineQueue,
    cloudSync,
    startTime
  );

  server.listen(config.port, config.hostname, () => {
    log('info', 'EdgeServer', 'Edge Server ready', {
      port: config.port,
      hostname: config.hostname,
      siteId: config.siteId,
      endpoints: ['/lb-health', '/health', '/status'],
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log('info', 'EdgeServer', `Received ${signal}, shutting down gracefully`);
    connectivity.stop();
    await sensorClient.disconnect();
    server.close(() => {
      log('info', 'EdgeServer', 'Edge Server stopped');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the edge server if this file is run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  bootstrap().catch((error) => {
    log('error', 'EdgeServer', 'Failed to start', { error: String(error) });
    process.exit(1);
  });
}
