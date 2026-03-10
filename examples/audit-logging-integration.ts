/**
 * Example: Integrating Immutable Audit Logging
 * 
 * This example shows how to integrate the PostgreSQL audit logger
 * into your application to track security-critical events.
 */

import { PostgresAuditLogger } from '@ectropy/shared/audit';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';

// Initialize Prisma client and audit logger
const prisma = new PrismaClient();
const auditLogger = new PostgresAuditLogger(prisma, {
  enableVerification: true,
  retentionDays: 2555, // 7 years for SOX compliance
  complianceFrameworks: ['SOX', 'CMMC', 'GDPR'],
  redactSensitiveFields: true
});

// ============================================================================
// Example 1: Log User Authentication Events
// ============================================================================

export async function logUserLogin(req: Request, userId: string, success: boolean) {
  await auditLogger.log({
    eventHash: '', // Computed automatically by the logger
    eventType: 'authentication',
    resourceId: userId,
    resourceType: 'user',
    actorId: userId,
    eventData: {
      action: 'login',
      success,
      authMethod: 'oauth',
      provider: 'google'
    },
    timestamp: new Date(),
    metadata: {
      sourceIp: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      sessionId: (req as any).session?.id
    }
  });
}

// Usage in OAuth callback:
// await logUserLogin(req, user.id, true);

// ============================================================================
// Example 2: Log Data Access Events
// ============================================================================

export async function logDataAccess(
  req: Request,
  userId: string,
  resourceType: string,
  resourceId: string,
  action: string
) {
  await auditLogger.log({
    eventHash: '',
    eventType: 'data_access',
    resourceId,
    resourceType,
    actorId: userId,
    eventData: {
      action,
      endpoint: req.path,
      method: req.method
    },
    timestamp: new Date(),
    metadata: {
      sourceIp: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      requestId: (req as any).id
    }
  });
}

// Usage in API routes:
// router.get('/projects/:id', async (req, res) => {
//   const project = await getProject(req.params.id);
//   await logDataAccess(req, req.user.id, 'project', req.params.id, 'view');
//   res.json(project);
// });

// ============================================================================
// Example 3: Log Permission Changes (Critical Events)
// ============================================================================

export async function logPermissionChange(
  req: Request,
  adminId: string,
  targetUserId: string,
  changes: { from: string; to: string }
) {
  await auditLogger.log({
    eventHash: '',
    eventType: 'admin_action',
    resourceId: targetUserId,
    resourceType: 'user_permissions',
    actorId: adminId,
    eventData: {
      action: 'permission_change',
      changes,
      reason: 'Manual admin action'
    },
    timestamp: new Date(),
    metadata: {
      sourceIp: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      sessionId: (req as any).session?.id
    }
  });
}

// Usage in admin routes:
// router.post('/admin/users/:id/role', async (req, res) => {
//   const { newRole } = req.body;
//   const user = await updateUserRole(req.params.id, newRole);
//   
//   await logPermissionChange(
//     req,
//     req.user.id,
//     req.params.id,
//     { from: user.oldRole, to: newRole }
//   );
//   
//   res.json(user);
// });

// ============================================================================
// Example 4: Log Secret Access Events
// ============================================================================

export async function logSecretAccess(
  userId: string,
  secretName: string,
  action: 'retrieve' | 'update' | 'delete' | 'create' | 'rotate',
  success: boolean,
  source: 'infisical' | 'aws' | 'vault'
) {
  await auditLogger.log({
    eventHash: '',
    eventType: 'secrets_access',
    resourceId: secretName,
    resourceType: 'secret',
    actorId: userId,
    eventData: {
      action,
      success,
      source,
      // secretValue is NOT logged (security best practice)
    },
    timestamp: new Date(),
    metadata: {
      sourceIp: 'internal',
      requestId: `secret-${Date.now()}`
    }
  });
}

// Usage in secret management:
// const secret = await secretProvider.getSecret('DATABASE_PASSWORD');
// await logSecretAccess(
//   'system',
//   'DATABASE_PASSWORD',
//   'retrieve',
//   true,
//   'aws'
// );

// ============================================================================
// Example 5: Verify Audit Chain Integrity
// ============================================================================

export async function verifyUserAuditTrail(userId: string): Promise<boolean> {
  console.log(`Verifying audit trail for user: ${userId}`);
  
  // Get complete audit chain for this user
  const chain = await auditLogger.getChain(userId);
  console.log(`Found ${chain.length} audit events`);
  
  // Verify chain integrity
  const isValid = await auditLogger.verifyChain(userId);
  
  if (!isValid) {
    console.error('⚠️  AUDIT CHAIN INTEGRITY VIOLATION DETECTED!');
    console.error(`User ${userId} audit trail has been tampered with`);
    
    // Get detailed verification report
    const details = await (auditLogger as any).verifyChainDetailed(userId);
    console.error('Invalid events:', details.invalidEvents);
    
    // Trigger security alert
    await triggerSecurityAlert({
      type: 'audit_chain_violation',
      userId,
      details
    });
    
    return false;
  }
  
  console.log('✅ Audit chain integrity verified');
  return true;
}

// Usage in compliance reports:
// router.get('/admin/compliance/verify/:userId', async (req, res) => {
//   const isValid = await verifyUserAuditTrail(req.params.userId);
//   res.json({ valid: isValid });
// });

// ============================================================================
// Example 6: Generate Compliance Report
// ============================================================================

export async function generateComplianceReport(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  // Get all events in date range
  const allEvents = await auditLogger.getChain(userId);
  const filteredEvents = allEvents.filter(event => 
    event.timestamp >= startDate && event.timestamp <= endDate
  );
  
  // Group by event type
  const eventsByType = filteredEvents.reduce((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Verify integrity
  const isValid = await auditLogger.verifyChain(userId);
  
  return {
    userId,
    period: { start: startDate, end: endDate },
    totalEvents: filteredEvents.length,
    eventsByType,
    chainIntegrity: isValid ? 'VERIFIED' : 'COMPROMISED',
    complianceFrameworks: ['SOX', 'CMMC', 'GDPR'],
    generatedAt: new Date()
  };
}

// Usage in compliance endpoints:
// router.get('/admin/compliance/report/:userId', async (req, res) => {
//   const { startDate, endDate } = req.query;
//   const report = await generateComplianceReport(
//     req.params.userId,
//     new Date(startDate),
//     new Date(endDate)
//   );
//   res.json(report);
// });

// ============================================================================
// Example 7: Express Middleware for Automatic Audit Logging
// ============================================================================

export function auditMiddleware(eventType: string) {
  return async (req: Request, res: any, next: any) => {
    const user = (req as any).user;
    if (!user) {
      return next();
    }
    
    // Log after response is sent
    res.on('finish', async () => {
      try {
        await auditLogger.log({
          eventHash: '',
          eventType,
          resourceId: req.params.id || 'unknown',
          resourceType: extractResourceType(req.path),
          actorId: user.id,
          eventData: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            success: res.statusCode < 400
          },
          timestamp: new Date(),
          metadata: {
            sourceIp: req.ip || 'unknown',
            userAgent: req.get('user-agent'),
            sessionId: (req as any).session?.id
          }
        });
      } catch (error) {
        console.error('Failed to log audit event:', error);
      }
    });
    
    next();
  };
}

function extractResourceType(path: string): string {
  const match = path.match(/\/api\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

// Usage:
// router.use('/api/projects/*', auditMiddleware('data_access'));
// router.use('/admin/*', auditMiddleware('admin_action'));

// ============================================================================
// Example 8: Periodic Chain Verification (Background Job)
// ============================================================================

export async function runPeriodicChainVerification() {
  console.log('Starting periodic audit chain verification...');
  
  // Get all unique resource IDs (in production, do this in batches)
  const resources = await prisma.auditLog.findMany({
    select: { resource_id: true },
    distinct: ['resource_id']
  });
  
  const results = {
    total: resources.length,
    verified: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  for (const { resource_id } of resources) {
    try {
      const isValid = await auditLogger.verifyChain(resource_id);
      if (isValid) {
        results.verified++;
      } else {
        results.failed++;
        results.errors.push(resource_id);
      }
    } catch (error) {
      console.error(`Error verifying chain for ${resource_id}:`, error);
      results.errors.push(resource_id);
    }
  }
  
  console.log('Verification complete:', results);
  
  // Alert if any chains are invalid
  if (results.failed > 0) {
    await triggerSecurityAlert({
      type: 'audit_chain_verification_failed',
      results
    });
  }
  
  return results;
}

// Schedule with cron:
// import cron from 'node-cron';
// 
// // Run daily at 2 AM
// cron.schedule('0 2 * * *', async () => {
//   await runPeriodicChainVerification();
// });

// ============================================================================
// Helper Functions
// ============================================================================

async function triggerSecurityAlert(alert: any) {
  console.error('🚨 SECURITY ALERT:', alert);
  
  // In production:
  // - Send to monitoring system (Datadog, Sentry)
  // - Email security team
  // - Create incident ticket
  // - Log to separate security event log
}

// ============================================================================
// Testing & Validation
// ============================================================================

export async function testAuditLogging() {
  console.log('Testing audit logging system...');
  
  // 1. Log test events
  const testUserId = 'test-user-123';
  
  await auditLogger.log({
    eventHash: '',
    eventType: 'test_event',
    resourceId: testUserId,
    resourceType: 'test',
    actorId: 'system',
    eventData: { test: true, sequence: 1 },
    timestamp: new Date()
  });
  
  await auditLogger.log({
    eventHash: '',
    eventType: 'test_event',
    resourceId: testUserId,
    resourceType: 'test',
    actorId: 'system',
    eventData: { test: true, sequence: 2 },
    timestamp: new Date()
  });
  
  // 2. Verify chain
  const isValid = await auditLogger.verifyChain(testUserId);
  console.log('Chain valid:', isValid ? '✅' : '❌');
  
  // 3. Get chain
  const chain = await auditLogger.getChain(testUserId);
  console.log('Chain length:', chain.length);
  console.log('First event hash:', chain[0].eventHash);
  console.log('Second event previous hash:', chain[1].previousHash);
  
  // 4. Cleanup test data
  await prisma.auditLog.deleteMany({
    where: { resource_id: testUserId }
  });
  
  console.log('Test complete ✅');
}

// Run tests:
// await testAuditLogging();

// ============================================================================
// Export for use in application
// ============================================================================

export {
  auditLogger,
  prisma
};
