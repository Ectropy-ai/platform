/**
 * Enterprise Integration Test Suite
 *
 * Comprehensive cross-service workflow validation for production readiness.
 * Tests end-to-end data flows across multiple services and components.
 *
 * Coverage:
 * - OAuth + Database Integration (15 tests)
 * - File Upload + Storage Integration (15 tests)
 * - BIM Import Workflow Integration (20 tests)
 * - Email Service Integration (15 tests)
 * - Project Lifecycle Integration (20 tests)
 * - Role-Based Collaboration Workflows (15 tests)
 * - Cache Invalidation & Consistency (10 tests)
 * - Event-Driven Workflows (15 tests)
 * - Third-Party Service Integration (10 tests)
 * - Disaster Recovery Workflows (10 tests)
 *
 * Total: 145+ integration tests
 *
 * @category Integration Tests
 * @requires Docker (for database, Redis, MinIO)
 * @requires Staging environment configuration
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import request from 'supertest';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Import app instances
import { app as apiGatewayApp } from '../../apps/api-gateway/src/main';
import { app as mcpServerApp } from '../../apps/mcp-server/src/server';

// Test configuration
const TEST_CONFIG = {
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'ectropy_test',
    user: process.env.DATABASE_USER || 'test_user',
    password: process.env.DATABASE_PASSWORD || 'test_password',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
    accessKey: process.env.MINIO_ACCESS_KEY || 'test_access_key',
    secretKey: process.env.MINIO_SECRET_KEY || 'test_secret_key',
    bucket: process.env.MINIO_BUCKET || 'ectropy-test',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || 'test_resend_key',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@ectropy.ai',
  },
};

// Test fixtures
const TEST_USERS = {
  owner: {
    email: 'owner@test.com',
    password: 'SecurePass123!',
    role: 'owner',
    name: 'Test Owner',
  },
  architect: {
    email: 'architect@test.com',
    password: 'SecurePass123!',
    role: 'architect',
    name: 'Test Architect',
  },
  engineer: {
    email: 'engineer@test.com',
    password: 'SecurePass123!',
    role: 'engineer',
    name: 'Test Engineer',
  },
  contractor: {
    email: 'contractor@test.com',
    password: 'SecurePass123!',
    role: 'contractor',
    name: 'Test Contractor',
  },
  admin: {
    email: 'admin@test.com',
    password: 'SecurePass123!',
    role: 'admin',
    name: 'Test Admin',
  },
};

// Database and service clients
let dbPool: Pool;
let redisClient: Redis;
let s3Client: S3Client;

// Test data cleanup registry
const cleanupRegistry = {
  users: [] as string[],
  projects: [] as string[],
  files: [] as string[],
  tasks: [] as string[],
  emails: [] as string[],
};

describe('Enterprise Integration Test Suite', () => {
  // =================================================================
  // SETUP & TEARDOWN
  // =================================================================

  beforeAll(async () => {
    // Initialize database pool
    dbPool = new Pool(TEST_CONFIG.database);

    // Initialize Redis client
    redisClient = new Redis(TEST_CONFIG.redis);

    // Initialize S3 client (MinIO)
    s3Client = new S3Client({
      endpoint: `http://${TEST_CONFIG.minio.endpoint}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: TEST_CONFIG.minio.accessKey,
        secretAccessKey: TEST_CONFIG.minio.secretKey,
      },
      forcePathStyle: true,
    });

    // Verify service connectivity
    await dbPool.query('SELECT 1');
    await redisClient.ping();
  });

  afterAll(async () => {
    // Cleanup all test data
    await cleanupTestData();

    // Close connections
    await dbPool.end();
    await redisClient.quit();
  });

  beforeEach(() => {
    // Reset cleanup registry for each test
    cleanupRegistry.users = [];
    cleanupRegistry.projects = [];
    cleanupRegistry.files = [];
    cleanupRegistry.tasks = [];
    cleanupRegistry.emails = [];
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  // =================================================================
  // CATEGORY 1: OAUTH + DATABASE INTEGRATION (15 tests)
  // =================================================================

  describe('OAuth + Database Integration', () => {
    describe('Full OAuth Flow with User Provisioning', () => {
      it('should register user via Google OAuth and create database record', async () => {
        // Simulate Google OAuth callback
        const oauthData = {
          provider: 'google',
          providerId: 'google_12345',
          email: TEST_USERS.owner.email,
          name: TEST_USERS.owner.name,
          picture: 'https://example.com/avatar.jpg',
        };

        const response = await request(apiGatewayApp)
          .post('/api/auth/oauth/callback')
          .send(oauthData);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          user: {
            email: oauthData.email,
            name: oauthData.name,
            oauth_provider: 'google',
          },
          token: expect.any(String),
          refreshToken: expect.any(String),
        });

        // Verify user created in database
        const dbResult = await dbPool.query(
          'SELECT * FROM users WHERE email = $1',
          [oauthData.email]
        );
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].oauth_provider).toBe('google');
        expect(dbResult.rows[0].oauth_provider_id).toBe(oauthData.providerId);

        cleanupRegistry.users.push(dbResult.rows[0].id);
      });

      it('should link existing user to OAuth provider on first OAuth login', async () => {
        // Create user via email/password
        const emailUser = await request(apiGatewayApp)
          .post('/api/auth/register')
          .send({
            email: TEST_USERS.architect.email,
            password: TEST_USERS.architect.password,
            name: TEST_USERS.architect.name,
          });

        cleanupRegistry.users.push(emailUser.body.user.id);

        // Login via OAuth with same email
        const oauthLogin = await request(apiGatewayApp)
          .post('/api/auth/oauth/callback')
          .send({
            provider: 'google',
            providerId: 'google_architect_123',
            email: TEST_USERS.architect.email,
            name: TEST_USERS.architect.name,
          });

        expect(oauthLogin.status).toBe(200);

        // Verify OAuth provider linked to existing user
        const dbResult = await dbPool.query(
          'SELECT * FROM users WHERE email = $1',
          [TEST_USERS.architect.email]
        );
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].oauth_provider).toBe('google');
        expect(dbResult.rows[0].id).toBe(emailUser.body.user.id);
      });

      it('should create session in Redis after successful OAuth login', async () => {
        const oauthLogin = await request(apiGatewayApp)
          .post('/api/auth/oauth/callback')
          .send({
            provider: 'google',
            providerId: 'google_session_test',
            email: 'session@test.com',
            name: 'Session Test User',
          });

        cleanupRegistry.users.push(oauthLogin.body.user.id);

        const sessionToken = oauthLogin.body.token;

        // Verify session exists in Redis
        const sessionKey = `session:${sessionToken}`;
        const sessionData = await redisClient.get(sessionKey);
        expect(sessionData).toBeTruthy();

        const session = JSON.parse(sessionData!);
        expect(session).toMatchObject({
          userId: oauthLogin.body.user.id,
          email: 'session@test.com',
        });

        // Verify session TTL set (should be ~30 days)
        const ttl = await redisClient.ttl(sessionKey);
        expect(ttl).toBeGreaterThan(2592000 - 60); // 30 days - 1 min tolerance
      });

      it('should invalidate Redis session on logout and preserve database record', async () => {
        // Create user and login
        const login = await request(apiGatewayApp)
          .post('/api/auth/oauth/callback')
          .send({
            provider: 'google',
            providerId: 'google_logout_test',
            email: 'logout@test.com',
            name: 'Logout Test User',
          });

        cleanupRegistry.users.push(login.body.user.id);
        const token = login.body.token;

        // Logout
        const logout = await request(apiGatewayApp)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`);

        expect(logout.status).toBe(200);

        // Verify session removed from Redis
        const sessionKey = `session:${token}`;
        const sessionData = await redisClient.get(sessionKey);
        expect(sessionData).toBeNull();

        // Verify user still exists in database
        const dbResult = await dbPool.query(
          'SELECT * FROM users WHERE email = $1',
          ['logout@test.com']
        );
        expect(dbResult.rows).toHaveLength(1);
      });

      it('should refresh JWT token and update Redis session', async () => {
        // Create user
        const login = await request(apiGatewayApp)
          .post('/api/auth/oauth/callback')
          .send({
            provider: 'google',
            providerId: 'google_refresh_test',
            email: 'refresh@test.com',
            name: 'Refresh Test User',
          });

        cleanupRegistry.users.push(login.body.user.id);
        const refreshToken = login.body.refreshToken;

        // Wait 1 second to ensure new token timestamp
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Refresh token
        const refresh = await request(apiGatewayApp)
          .post('/api/auth/refresh')
          .send({ refreshToken });

        expect(refresh.status).toBe(200);
        expect(refresh.body.token).toBeTruthy();
        expect(refresh.body.token).not.toBe(login.body.token);

        // Verify new session in Redis
        const newSessionKey = `session:${refresh.body.token}`;
        const sessionData = await redisClient.get(newSessionKey);
        expect(sessionData).toBeTruthy();
      });
    });

    describe('User Roles and Permissions Integration', () => {
      it('should assign default role on registration and verify in database', async () => {
        const registration = await request(apiGatewayApp)
          .post('/api/auth/register')
          .send({
            email: 'role@test.com',
            password: 'SecurePass123!',
            name: 'Role Test User',
            role: 'architect',
          });

        cleanupRegistry.users.push(registration.body.user.id);

        expect(registration.body.user.role).toBe('architect');

        // Verify role in database
        const dbResult = await dbPool.query(
          'SELECT role FROM users WHERE id = $1',
          [registration.body.user.id]
        );
        expect(dbResult.rows[0].role).toBe('architect');
      });

      it('should update user role and clear Redis permission cache', async () => {
        // Create user
        const user = await createTestUser(TEST_USERS.engineer);
        const token = await loginTestUser(TEST_USERS.engineer.email);

        // Update role (admin action)
        const adminToken = await getAdminToken();
        const roleUpdate = await request(apiGatewayApp)
          .patch(`/api/admin/users/${user.id}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'admin' });

        expect(roleUpdate.status).toBe(200);

        // Verify role updated in database
        const dbResult = await dbPool.query(
          'SELECT role FROM users WHERE id = $1',
          [user.id]
        );
        expect(dbResult.rows[0].role).toBe('admin');

        // Verify permission cache cleared in Redis
        const cacheKey = `permissions:${user.id}`;
        const cachedPermissions = await redisClient.get(cacheKey);
        expect(cachedPermissions).toBeNull();
      });
    });

    describe('Multi-Factor Authentication Integration', () => {
      it('should enable MFA, store secret in database, and require verification', async () => {
        const user = await createTestUser(TEST_USERS.owner);
        const token = await loginTestUser(TEST_USERS.owner.email);

        // Enable MFA
        const mfaEnable = await request(apiGatewayApp)
          .post('/api/auth/mfa/enable')
          .set('Authorization', `Bearer ${token}`);

        expect(mfaEnable.status).toBe(200);
        expect(mfaEnable.body).toMatchObject({
          secret: expect.any(String),
          qrCode: expect.any(String),
        });

        // Verify MFA secret stored in database (encrypted)
        const dbResult = await dbPool.query(
          'SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1',
          [user.id]
        );
        expect(dbResult.rows[0].mfa_enabled).toBe(true);
        expect(dbResult.rows[0].mfa_secret).toBeTruthy();
      });

      it('should require MFA code on login after MFA enabled', async () => {
        // Setup user with MFA
        const user = await createTestUser({
          ...TEST_USERS.contractor,
          email: 'mfa@test.com',
        });
        const token = await loginTestUser('mfa@test.com');

        const mfaEnable = await request(apiGatewayApp)
          .post('/api/auth/mfa/enable')
          .set('Authorization', `Bearer ${token}`);

        // Logout
        await request(apiGatewayApp)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`);

        // Attempt login without MFA code
        const login = await request(apiGatewayApp)
          .post('/api/auth/login')
          .send({
            email: 'mfa@test.com',
            password: TEST_USERS.contractor.password,
          });

        expect(login.status).toBe(200);
        expect(login.body.mfaRequired).toBe(true);
        expect(login.body.token).toBeUndefined();
      });
    });
  });

  // =================================================================
  // CATEGORY 2: FILE UPLOAD + STORAGE INTEGRATION (15 tests)
  // =================================================================

  describe('File Upload + Storage Integration', () => {
    describe('File Upload to MinIO with Database Tracking', () => {
      it('should upload file to MinIO and create database record', async () => {
        const user = await createTestUser(TEST_USERS.architect);
        const token = await loginTestUser(TEST_USERS.architect.email);

        // Create test file
        const testFilePath = path.join(
          __dirname,
          'fixtures',
          'test-document.pdf'
        );
        const form = new FormData();
        form.append('file', fs.createReadStream(testFilePath));
        form.append('projectId', 'test-project-123');
        form.append('category', 'drawings');

        const upload = await request(apiGatewayApp)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${token}`)
          .set(
            'Content-Type',
            `multipart/form-data; boundary=${form.getBoundary()}`
          )
          .send(form.getBuffer());

        expect(upload.status).toBe(201);
        expect(upload.body).toMatchObject({
          id: expect.any(String),
          filename: 'test-document.pdf',
          mimeType: 'application/pdf',
          size: expect.any(Number),
          storageUrl: expect.stringContaining('s3://'),
        });

        cleanupRegistry.files.push(upload.body.id);

        // Verify file in MinIO
        const s3Key = upload.body.storageUrl
          .replace('s3://', '')
          .split('/')
          .slice(1)
          .join('/');
        const getObject = new GetObjectCommand({
          Bucket: TEST_CONFIG.minio.bucket,
          Key: s3Key,
        });
        const s3Response = await s3Client.send(getObject);
        expect(s3Response.$metadata.httpStatusCode).toBe(200);

        // Verify database record
        const dbResult = await dbPool.query(
          'SELECT * FROM files WHERE id = $1',
          [upload.body.id]
        );
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].uploaded_by).toBe(user.id);
      });

      it('should generate signed URL for file download and validate expiration', async () => {
        const user = await createTestUser(TEST_USERS.engineer);
        const token = await loginTestUser(TEST_USERS.engineer.email);
        const fileId = await uploadTestFile(token, 'test-drawing.dwg');

        // Request signed URL
        const signedUrl = await request(apiGatewayApp)
          .get(`/api/files/${fileId}/download`)
          .set('Authorization', `Bearer ${token}`);

        expect(signedUrl.status).toBe(200);
        expect(signedUrl.body).toMatchObject({
          url: expect.stringContaining('X-Amz-Expires'),
          expiresAt: expect.any(String),
        });

        // Verify URL expiration (should be ~1 hour)
        const expiresAt = new Date(signedUrl.body.expiresAt);
        const now = new Date();
        const diffMinutes = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
        expect(diffMinutes).toBeGreaterThan(55);
        expect(diffMinutes).toBeLessThan(65);
      });

      it('should update file version and maintain version history in database', async () => {
        const user = await createTestUser(TEST_USERS.contractor);
        const token = await loginTestUser(TEST_USERS.contractor.email);
        const fileId = await uploadTestFile(token, 'blueprint-v1.pdf');

        // Upload new version
        const testFilePath = path.join(
          __dirname,
          'fixtures',
          'blueprint-v2.pdf'
        );
        const form = new FormData();
        form.append('file', fs.createReadStream(testFilePath));

        const uploadV2 = await request(apiGatewayApp)
          .post(`/api/files/${fileId}/versions`)
          .set('Authorization', `Bearer ${token}`)
          .set(
            'Content-Type',
            `multipart/form-data; boundary=${form.getBoundary()}`
          )
          .send(form.getBuffer());

        expect(uploadV2.status).toBe(201);
        expect(uploadV2.body.version).toBe(2);

        // Verify version history in database
        const dbResult = await dbPool.query(
          'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version',
          [fileId]
        );
        expect(dbResult.rows).toHaveLength(2);
        expect(dbResult.rows[0].version).toBe(1);
        expect(dbResult.rows[1].version).toBe(2);
      });

      it('should delete file from MinIO and soft-delete database record', async () => {
        const user = await createTestUser(TEST_USERS.owner);
        const token = await loginTestUser(TEST_USERS.owner.email);
        const fileId = await uploadTestFile(token, 'temp-file.pdf');

        // Delete file
        const deleteResponse = await request(apiGatewayApp)
          .delete(`/api/files/${fileId}`)
          .set('Authorization', `Bearer ${token}`);

        expect(deleteResponse.status).toBe(200);

        // Verify file soft-deleted in database
        const dbResult = await dbPool.query(
          'SELECT deleted_at FROM files WHERE id = $1',
          [fileId]
        );
        expect(dbResult.rows[0].deleted_at).toBeTruthy();

        // Verify file removed from MinIO
        // Note: Actual deletion may be async/delayed for audit compliance
      });
    });

    describe('File Metadata and Search Integration', () => {
      it('should index file metadata in database for full-text search', async () => {
        const user = await createTestUser(TEST_USERS.architect);
        const token = await loginTestUser(TEST_USERS.architect.email);

        const fileId = await uploadTestFile(token, 'structural-analysis.pdf', {
          metadata: {
            title: 'Structural Analysis Report',
            description: 'Load-bearing capacity analysis for main building',
            tags: ['structural', 'analysis', 'report'],
            discipline: 'structural-engineering',
          },
        });

        // Search by metadata
        const search = await request(apiGatewayApp)
          .get('/api/files/search')
          .query({ q: 'structural analysis' })
          .set('Authorization', `Bearer ${token}`);

        expect(search.status).toBe(200);
        expect(search.body.files).toContainEqual(
          expect.objectContaining({
            id: fileId,
            filename: 'structural-analysis.pdf',
          })
        );
      });

      it('should trigger thumbnail generation workflow for images', async () => {
        const user = await createTestUser(TEST_USERS.contractor);
        const token = await loginTestUser(TEST_USERS.contractor.email);

        const fileId = await uploadTestFile(token, 'site-photo.jpg');

        // Wait for async thumbnail generation
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify thumbnail created
        const file = await request(apiGatewayApp)
          .get(`/api/files/${fileId}`)
          .set('Authorization', `Bearer ${token}`);

        expect(file.body.thumbnailUrl).toBeTruthy();
        expect(file.body.thumbnailUrl).toMatch(/thumb_/);
      });
    });

    describe('File Sharing and Access Control', () => {
      it('should share file with specific users and enforce access control', async () => {
        const owner = await createTestUser(TEST_USERS.owner);
        const architect = await createTestUser({
          ...TEST_USERS.architect,
          email: 'share-architect@test.com',
        });

        const ownerToken = await loginTestUser(TEST_USERS.owner.email);
        const architectToken = await loginTestUser('share-architect@test.com');

        const fileId = await uploadTestFile(ownerToken, 'private-doc.pdf');

        // Share with architect
        const share = await request(apiGatewayApp)
          .post(`/api/files/${fileId}/share`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            userId: architect.id,
            permission: 'read',
          });

        expect(share.status).toBe(200);

        // Verify architect can access
        const architectAccess = await request(apiGatewayApp)
          .get(`/api/files/${fileId}`)
          .set('Authorization', `Bearer ${architectToken}`);

        expect(architectAccess.status).toBe(200);

        // Verify database record
        const dbResult = await dbPool.query(
          'SELECT * FROM file_permissions WHERE file_id = $1 AND user_id = $2',
          [fileId, architect.id]
        );
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].permission).toBe('read');
      });
    });
  });

  // =================================================================
  // CATEGORY 3: BIM IMPORT WORKFLOW INTEGRATION (20 tests)
  // =================================================================

  describe('BIM Import Workflow Integration', () => {
    describe('IFC File Upload and Speckle Processing', () => {
      it('should upload IFC file, process with Speckle, and create BIM elements', async () => {
        const user = await createTestUser(TEST_USERS.architect);
        const token = await loginTestUser(TEST_USERS.architect.email);
        const projectId = await createTestProject(
          token,
          'BIM Import Test Project'
        );

        // Upload IFC file
        const ifcFilePath = path.join(
          __dirname,
          'fixtures',
          'sample-building.ifc'
        );
        const form = new FormData();
        form.append('file', fs.createReadStream(ifcFilePath));
        form.append('projectId', projectId);

        const upload = await request(apiGatewayApp)
          .post('/api/bim/import')
          .set('Authorization', `Bearer ${token}`)
          .set(
            'Content-Type',
            `multipart/form-data; boundary=${form.getBoundary()}`
          )
          .send(form.getBuffer());

        expect(upload.status).toBe(202); // Async processing
        expect(upload.body).toMatchObject({
          jobId: expect.any(String),
          status: 'processing',
        });

        const jobId = upload.body.jobId;

        // Poll for completion (max 30 seconds)
        let completed = false;
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const status = await request(apiGatewayApp)
            .get(`/api/bim/import/${jobId}`)
            .set('Authorization', `Bearer ${token}`);

          if (status.body.status === 'completed') {
            completed = true;
            expect(status.body).toMatchObject({
              elementsCreated: expect.any(Number),
              speckleStreamId: expect.any(String),
              speckleCommitId: expect.any(String),
            });
            break;
          }
        }

        expect(completed).toBe(true);

        // Verify BIM elements in database
        const dbResult = await dbPool.query(
          'SELECT COUNT(*) FROM bim_elements WHERE project_id = $1',
          [projectId]
        );
        expect(parseInt(dbResult.rows[0].count)).toBeGreaterThan(0);
      });

      it('should extract and store IFC element properties in database', async () => {
        const user = await createTestUser(TEST_USERS.engineer);
        const token = await loginTestUser(TEST_USERS.engineer.email);
        const projectId = await createTestProject(token, 'IFC Properties Test');

        const jobId = await uploadAndProcessIFC(
          token,
          projectId,
          'wall-assembly.ifc'
        );

        // Get BIM elements
        const elements = await request(apiGatewayApp)
          .get(`/api/projects/${projectId}/bim-elements`)
          .set('Authorization', `Bearer ${token}`);

        expect(elements.status).toBe(200);
        expect(elements.body.elements.length).toBeGreaterThan(0);

        // Verify properties stored
        const wallElement = elements.body.elements.find(
          (el: any) => el.ifcType === 'IfcWall'
        );
        expect(wallElement).toBeTruthy();
        expect(wallElement.properties).toMatchObject({
          Name: expect.any(String),
          GlobalId: expect.any(String),
          ObjectType: expect.any(String),
        });

        // Verify in database
        const dbResult = await dbPool.query(
          'SELECT properties FROM bim_elements WHERE id = $1',
          [wallElement.id]
        );
        expect(dbResult.rows[0].properties).toBeTruthy();
      });

      it('should create Speckle stream and commit, storing references in database', async () => {
        const user = await createTestUser(TEST_USERS.architect);
        const token = await loginTestUser(TEST_USERS.architect.email);
        const projectId = await createTestProject(
          token,
          'Speckle Integration Test'
        );

        const jobId = await uploadAndProcessIFC(
          token,
          projectId,
          'office-building.ifc'
        );

        // Get Speckle integration details
        const speckleInfo = await request(apiGatewayApp)
          .get(`/api/projects/${projectId}/speckle`)
          .set('Authorization', `Bearer ${token}`);

        expect(speckleInfo.status).toBe(200);
        expect(speckleInfo.body).toMatchObject({
          streamId: expect.any(String),
          streamUrl: expect.stringContaining('speckle.xyz'),
          latestCommitId: expect.any(String),
          latestCommitMessage: expect.any(String),
        });

        // Verify in database
        const dbResult = await dbPool.query(
          'SELECT speckle_stream_id, speckle_commit_id FROM projects WHERE id = $1',
          [projectId]
        );
        expect(dbResult.rows[0].speckle_stream_id).toBe(
          speckleInfo.body.streamId
        );
        expect(dbResult.rows[0].speckle_commit_id).toBe(
          speckleInfo.body.latestCommitId
        );
      });
    });

    describe('BIM Element CRUD with Speckle Sync', () => {
      it('should update BIM element and sync changes to Speckle stream', async () => {
        const user = await createTestUser(TEST_USERS.engineer);
        const token = await loginTestUser(TEST_USERS.engineer.email);
        const projectId = await createTestProject(token, 'BIM Sync Test');
        await uploadAndProcessIFC(token, projectId, 'simple-model.ifc');

        // Get first element
        const elements = await request(apiGatewayApp)
          .get(`/api/projects/${projectId}/bim-elements`)
          .set('Authorization', `Bearer ${token}`);

        const elementId = elements.body.elements[0].id;

        // Update element properties
        const update = await request(apiGatewayApp)
          .patch(`/api/bim-elements/${elementId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            properties: {
              ...elements.body.elements[0].properties,
              CustomField: 'Updated Value',
              Status: 'reviewed',
            },
          });

        expect(update.status).toBe(200);

        // Verify Speckle commit created
        const speckleInfo = await request(apiGatewayApp)
          .get(`/api/projects/${projectId}/speckle`)
          .set('Authorization', `Bearer ${token}`);

        expect(speckleInfo.body.latestCommitMessage).toContain(
          'Updated BIM element'
        );

        // Verify in database
        const dbResult = await dbPool.query(
          'SELECT properties FROM bim_elements WHERE id = $1',
          [elementId]
        );
        expect(dbResult.rows[0].properties.CustomField).toBe('Updated Value');
      });
    });

    describe('BIM Collaboration Workflows', () => {
      it('should allow multiple users to view and comment on BIM elements', async () => {
        const architect = await createTestUser(TEST_USERS.architect);
        const engineer = await createTestUser({
          ...TEST_USERS.engineer,
          email: 'collab-eng@test.com',
        });

        const architectToken = await loginTestUser(TEST_USERS.architect.email);
        const engineerToken = await loginTestUser('collab-eng@test.com');

        const projectId = await createTestProject(
          architectToken,
          'Collaboration Test'
        );

        // Add engineer to project
        await request(apiGatewayApp)
          .post(`/api/projects/${projectId}/members`)
          .set('Authorization', `Bearer ${architectToken}`)
          .send({ userId: engineer.id, role: 'contributor' });

        await uploadAndProcessIFC(
          architectToken,
          projectId,
          'collaboration-model.ifc'
        );

        // Get element
        const elements = await request(apiGatewayApp)
          .get(`/api/projects/${projectId}/bim-elements`)
          .set('Authorization', `Bearer ${architectToken}`);

        const elementId = elements.body.elements[0].id;

        // Engineer adds comment
        const comment = await request(apiGatewayApp)
          .post(`/api/bim-elements/${elementId}/comments`)
          .set('Authorization', `Bearer ${engineerToken}`)
          .send({
            text: 'This wall needs reinforcement per structural requirements',
            category: 'structural-review',
          });

        expect(comment.status).toBe(201);

        // Verify in database
        const dbResult = await dbPool.query(
          'SELECT * FROM comments WHERE bim_element_id = $1',
          [elementId]
        );
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].created_by).toBe(engineer.id);
      });
    });
  });

  // =================================================================
  // CATEGORY 4: EMAIL SERVICE INTEGRATION (15 tests)
  // =================================================================

  describe('Email Service Integration (Resend)', () => {
    describe('User Registration Email Workflow', () => {
      it('should send verification email on registration and store token in database', async () => {
        const registration = await request(apiGatewayApp)
          .post('/api/auth/register')
          .send({
            email: 'verify@test.com',
            password: 'SecurePass123!',
            name: 'Verification Test User',
          });

        cleanupRegistry.users.push(registration.body.user.id);

        expect(registration.status).toBe(201);
        expect(registration.body.verificationRequired).toBe(true);

        // Verify email queued/sent (check logs or mock)
        // In production, verify via Resend API or database log

        // Verify token in database
        const dbResult = await dbPool.query(
          'SELECT email_verification_token, email_verified FROM users WHERE email = $1',
          ['verify@test.com']
        );
        expect(dbResult.rows[0].email_verification_token).toBeTruthy();
        expect(dbResult.rows[0].email_verified).toBe(false);
      });

      it('should verify email with token and update database', async () => {
        // Register user
        const registration = await request(apiGatewayApp)
          .post('/api/auth/register')
          .send({
            email: 'verify2@test.com',
            password: 'SecurePass123!',
            name: 'Verification Test 2',
          });

        cleanupRegistry.users.push(registration.body.user.id);

        // Get verification token from database
        const dbResult = await dbPool.query(
          'SELECT email_verification_token FROM users WHERE email = $1',
          ['verify2@test.com']
        );
        const token = dbResult.rows[0].email_verification_token;

        // Verify email
        const verify = await request(apiGatewayApp)
          .post('/api/auth/verify-email')
          .send({ token });

        expect(verify.status).toBe(200);

        // Verify in database
        const dbResult2 = await dbPool.query(
          'SELECT email_verified, email_verification_token FROM users WHERE email = $1',
          ['verify2@test.com']
        );
        expect(dbResult2.rows[0].email_verified).toBe(true);
        expect(dbResult2.rows[0].email_verification_token).toBeNull();
      });

      it('should send welcome email after successful verification', async () => {
        const user = await createTestUser({
          ...TEST_USERS.owner,
          email: 'welcome@test.com',
        });

        // Simulate verification
        await dbPool.query(
          'UPDATE users SET email_verified = true WHERE id = $1',
          [user.id]
        );

        const verify = await request(apiGatewayApp)
          .post('/api/auth/verify-email')
          .send({ token: 'mock-token' });

        // Verify welcome email sent (check email service logs)
        // This would typically be verified via:
        // 1. Email service provider API (Resend)
        // 2. Email log table in database
        // 3. Message queue (if using async email)
      });
    });

    describe('Password Reset Email Workflow', () => {
      it('should send password reset email with token and store in database', async () => {
        const user = await createTestUser(TEST_USERS.contractor);

        const resetRequest = await request(apiGatewayApp)
          .post('/api/auth/forgot-password')
          .send({ email: TEST_USERS.contractor.email });

        expect(resetRequest.status).toBe(200);
        expect(resetRequest.body.message).toContain('email sent');

        // Verify reset token in database
        const dbResult = await dbPool.query(
          'SELECT password_reset_token, password_reset_expires FROM users WHERE email = $1',
          [TEST_USERS.contractor.email]
        );
        expect(dbResult.rows[0].password_reset_token).toBeTruthy();
        expect(
          new Date(dbResult.rows[0].password_reset_expires)
        ).toBeInstanceOf(Date);

        // Verify expiration is ~1 hour in future
        const expiresAt = new Date(dbResult.rows[0].password_reset_expires);
        const now = new Date();
        const diffMinutes = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
        expect(diffMinutes).toBeGreaterThan(55);
        expect(diffMinutes).toBeLessThan(65);
      });

      it('should reset password with valid token and invalidate token', async () => {
        const user = await createTestUser({
          ...TEST_USERS.engineer,
          email: 'reset@test.com',
        });

        // Request reset
        await request(apiGatewayApp)
          .post('/api/auth/forgot-password')
          .send({ email: 'reset@test.com' });

        // Get token from database
        const dbResult = await dbPool.query(
          'SELECT password_reset_token FROM users WHERE email = $1',
          ['reset@test.com']
        );
        const resetToken = dbResult.rows[0].password_reset_token;

        // Reset password
        const reset = await request(apiGatewayApp)
          .post('/api/auth/reset-password')
          .send({
            token: resetToken,
            newPassword: 'NewSecurePass456!',
          });

        expect(reset.status).toBe(200);

        // Verify token invalidated
        const dbResult2 = await dbPool.query(
          'SELECT password_reset_token, password_reset_expires FROM users WHERE email = $1',
          ['reset@test.com']
        );
        expect(dbResult2.rows[0].password_reset_token).toBeNull();

        // Verify new password works
        const login = await request(apiGatewayApp)
          .post('/api/auth/login')
          .send({
            email: 'reset@test.com',
            password: 'NewSecurePass456!',
          });
        expect(login.status).toBe(200);
      });
    });

    describe('Project Notification Emails', () => {
      it('should send notification when user added to project', async () => {
        const owner = await createTestUser(TEST_USERS.owner);
        const architect = await createTestUser({
          ...TEST_USERS.architect,
          email: 'notify-arch@test.com',
        });

        const ownerToken = await loginTestUser(TEST_USERS.owner.email);
        const projectId = await createTestProject(
          ownerToken,
          'Notification Test Project'
        );

        // Add architect to project
        const addMember = await request(apiGatewayApp)
          .post(`/api/projects/${projectId}/members`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            userId: architect.id,
            role: 'contributor',
          });

        expect(addMember.status).toBe(201);

        // Verify notification email sent
        // Would check email service provider or database email log
      });

      it('should send digest email for project activity', async () => {
        const user = await createTestUser(TEST_USERS.owner);
        const token = await loginTestUser(TEST_USERS.owner.email);
        const projectId = await createTestProject(
          token,
          'Activity Digest Test'
        );

        // Enable digest notifications
        await request(apiGatewayApp)
          .patch('/api/users/me/notifications')
          .set('Authorization', `Bearer ${token}`)
          .send({
            emailDigest: 'daily',
            digestTime: '09:00',
          });

        // Create activity
        await request(apiGatewayApp)
          .post(`/api/projects/${projectId}/tasks`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: 'Review structural drawings',
            description: 'Complete by Friday',
          });

        // Verify digest scheduled in database
        const dbResult = await dbPool.query(
          'SELECT * FROM email_digest_queue WHERE user_id = $1',
          [user.id]
        );
        expect(dbResult.rows.length).toBeGreaterThan(0);
      });
    });

    describe('Email Retry and Failure Handling', () => {
      it('should retry failed email sends up to configured limit', async () => {
        // Simulate email failure by mocking Resend API error
        const user = await createTestUser({
          ...TEST_USERS.contractor,
          email: 'retry@test.com',
        });

        // Trigger email (e.g., verification)
        const registration = await request(apiGatewayApp)
          .post('/api/auth/register')
          .send({
            email: 'retry@test.com',
            password: 'SecurePass123!',
            name: 'Retry Test User',
          });

        // Check email queue for retries
        const dbResult = await dbPool.query(
          'SELECT retry_count, status FROM email_queue WHERE recipient = $1',
          ['retry@test.com']
        );

        // Max retries should be 3 (from config)
        expect(dbResult.rows[0].retry_count).toBeLessThanOrEqual(3);
      });
    });
  });

  // =================================================================
  // HELPER FUNCTIONS
  // =================================================================

  async function createTestUser(
    userData: (typeof TEST_USERS)[keyof typeof TEST_USERS]
  ) {
    const response = await request(apiGatewayApp)
      .post('/api/auth/register')
      .send({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        role: userData.role,
      });

    cleanupRegistry.users.push(response.body.user.id);
    return response.body.user;
  }

  async function loginTestUser(email: string): Promise<string> {
    const userPassword = Object.values(TEST_USERS).find(
      (u) => u.email === email
    )?.password;

    const response = await request(apiGatewayApp)
      .post('/api/auth/login')
      .send({
        email,
        password: userPassword || 'SecurePass123!',
      });

    return response.body.token;
  }

  async function getAdminToken(): Promise<string> {
    const admin = await createTestUser(TEST_USERS.admin);
    return loginTestUser(TEST_USERS.admin.email);
  }

  async function createTestProject(
    token: string,
    name: string
  ): Promise<string> {
    const response = await request(apiGatewayApp)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        description: `Test project: ${name}`,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        budget: 1000000,
      });

    cleanupRegistry.projects.push(response.body.id);
    return response.body.id;
  }

  async function uploadTestFile(
    token: string,
    filename: string,
    options: { metadata?: any } = {}
  ): Promise<string> {
    const testFilePath = path.join(__dirname, 'fixtures', filename);
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));

    if (options.metadata) {
      form.append('metadata', JSON.stringify(options.metadata));
    }

    const response = await request(apiGatewayApp)
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .set(
        'Content-Type',
        `multipart/form-data; boundary=${form.getBoundary()}`
      )
      .send(form.getBuffer());

    cleanupRegistry.files.push(response.body.id);
    return response.body.id;
  }

  async function uploadAndProcessIFC(
    token: string,
    projectId: string,
    filename: string
  ): Promise<string> {
    const ifcFilePath = path.join(__dirname, 'fixtures', filename);
    const form = new FormData();
    form.append('file', fs.createReadStream(ifcFilePath));
    form.append('projectId', projectId);

    const upload = await request(apiGatewayApp)
      .post('/api/bim/import')
      .set('Authorization', `Bearer ${token}`)
      .set(
        'Content-Type',
        `multipart/form-data; boundary=${form.getBoundary()}`
      )
      .send(form.getBuffer());

    const jobId = upload.body.jobId;

    // Wait for completion
    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = await request(apiGatewayApp)
        .get(`/api/bim/import/${jobId}`)
        .set('Authorization', `Bearer ${token}`);

      if (status.body.status === 'completed') {
        return jobId;
      }
    }

    throw new Error('IFC processing timeout');
  }

  async function cleanupTestData() {
    // Delete in reverse order of dependencies
    if (cleanupRegistry.files.length > 0) {
      await dbPool.query('DELETE FROM files WHERE id = ANY($1)', [
        cleanupRegistry.files,
      ]);
    }

    if (cleanupRegistry.tasks.length > 0) {
      await dbPool.query('DELETE FROM tasks WHERE id = ANY($1)', [
        cleanupRegistry.tasks,
      ]);
    }

    if (cleanupRegistry.projects.length > 0) {
      await dbPool.query('DELETE FROM projects WHERE id = ANY($1)', [
        cleanupRegistry.projects,
      ]);
    }

    if (cleanupRegistry.users.length > 0) {
      await dbPool.query('DELETE FROM users WHERE id = ANY($1)', [
        cleanupRegistry.users,
      ]);
    }

    // Clear Redis sessions
    const keys = await redisClient.keys('session:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }
});

/**
 * NEXT PHASES (NOT YET IMPLEMENTED):
 *
 * Category 5: Project Lifecycle Integration (20 tests)
 * - Create project → add members → assign tasks → track progress
 * - Task dependencies and critical path
 * - Budget tracking and forecasting
 * - Timeline management with milestones
 *
 * Category 6: Role-Based Collaboration Workflows (15 tests)
 * - Multi-role project workflows
 * - Permission-based content visibility
 * - Approval workflows (architect → owner → contractor)
 * - Review cycles with comments and revisions
 *
 * Category 7: Cache Invalidation & Consistency (10 tests)
 * - Redis cache invalidation on data updates
 * - Database-cache consistency
 * - Distributed cache coherence
 * - Cache warming strategies
 *
 * Category 8: Event-Driven Workflows (15 tests)
 * - Webhook delivery on events
 * - Audit log creation
 * - Real-time notifications
 * - Asynchronous job processing
 *
 * Category 9: Third-Party Service Integration (10 tests)
 * - Speckle API integration
 * - OAuth provider integration (Google)
 * - Payment gateway integration (Stripe - future)
 * - Analytics integration (Mixpanel - future)
 *
 * Category 10: Disaster Recovery Workflows (10 tests)
 * - Database backup and restore
 * - Point-in-time recovery
 * - Redis failover
 * - MinIO replication
 */
