/**
 * Decision Surface Service Tests
 *
 * Comprehensive tests for the V3 schema-compliant decision surface system.
 * Tests decision attachment, tolerance overrides, pre-approvals, alerts,
 * and worker acknowledgments.
 *
 * @see .roadmap/schemas/voxel/voxel-v3.schema.json
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DecisionSurfaceService,
  createDecisionSurfaceService,
  AttachDecisionInput,
  CreateToleranceOverrideInput,
  CreatePreApprovalInput,
  CreateAlertInput,
  RecordAcknowledgmentInput,
} from '../../services/decision-surface.service.js';
import {
  DecisionAuthorityCascadeService,
  createDecisionAuthorityCascadeService,
  DecisionImpact,
} from '../../services/decision-authority-cascade.service.js';
import { VoxelSystem, VoxelStatus } from '../../types/voxel-decomposition.types.js';
import { AuthorityLevel } from '../../types/pm.types.js';

describe('DecisionSurfaceService', () => {
  let service: DecisionSurfaceService;
  let cascadeService: DecisionAuthorityCascadeService;

  beforeEach(() => {
    cascadeService = createDecisionAuthorityCascadeService();
    service = createDecisionSurfaceService(cascadeService);
  });

  // ===========================================================================
  // Decision Surface Creation & Management Tests
  // ===========================================================================

  describe('Decision Surface Management', () => {
    it('should create empty decision surface for new voxel', () => {
      const surface = service.getDecisionSurface('voxel-001');
      expect(surface).toBeDefined();
      expect(surface.decisions).toHaveLength(0);
      expect(surface.attachedDecisions).toHaveLength(0);
      expect(surface.toleranceOverrides).toHaveLength(0);
      expect(surface.preApprovals).toHaveLength(0);
      expect(surface.activeAlerts).toHaveLength(0);
      expect(surface.acknowledgments).toHaveLength(0);
      expect(surface.decisionCount).toBe(0);
      expect(surface.unacknowledgedCount).toBe(0);
    });

    it('should return same surface for same voxel', () => {
      const surface1 = service.getDecisionSurface('voxel-001');
      const surface2 = service.getDecisionSurface('voxel-001');
      expect(surface1).toBe(surface2);
    });

    it('should return different surfaces for different voxels', () => {
      const surface1 = service.getDecisionSurface('voxel-001');
      const surface2 = service.getDecisionSurface('voxel-002');
      expect(surface1).not.toBe(surface2);
    });

    it('should clear decision surface', () => {
      service.getDecisionSurface('voxel-001');
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });

      service.clearDecisionSurface('voxel-001');

      // Should create new empty surface
      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.decisionCount).toBe(0);
    });

    it('should list all voxels with decision surfaces', () => {
      service.getDecisionSurface('voxel-001');
      service.getDecisionSurface('voxel-002');
      service.getDecisionSurface('voxel-003');

      const voxelIds = service.getAllVoxelIdsWithSurfaces();
      expect(voxelIds).toContain('voxel-001');
      expect(voxelIds).toContain('voxel-002');
      expect(voxelIds).toContain('voxel-003');
    });
  });

  // ===========================================================================
  // V3 Schema Compliance Tests
  // ===========================================================================

  describe('V3 Schema Compliance', () => {
    it('should apply decision surface to voxel with V3 schema', () => {
      const voxel: any = {
        id: 'voxel-001',
        projectId: 'project-001',
        system: VoxelSystem.ELECTRICAL,
        status: VoxelStatus.NOT_STARTED,
      };

      const v3Voxel = service.applyDecisionSurfaceToVoxel(voxel);

      expect(v3Voxel.$schema).toBe('https://luhtech.dev/schemas/pm/voxel.schema.json');
      expect(v3Voxel.schemaVersion).toBe('3.0.0');
      expect(v3Voxel.decisionSurface).toBeDefined();
      expect(v3Voxel.graphMetadata).toBeDefined();
      expect(v3Voxel.graphMetadata.inEdges).toBeDefined();
      expect(v3Voxel.graphMetadata.outEdges).toBeDefined();
    });

    it('should preserve existing graph metadata', () => {
      const voxel: any = {
        id: 'voxel-001',
        graphMetadata: {
          inEdges: ['edge-001'],
          outEdges: ['edge-002'],
        },
      };

      const v3Voxel = service.applyDecisionSurfaceToVoxel(voxel);
      expect(v3Voxel.graphMetadata.inEdges).toContain('edge-001');
      expect(v3Voxel.graphMetadata.outEdges).toContain('edge-002');
    });
  });

  // ===========================================================================
  // Decision Attachment Tests
  // ===========================================================================

  describe('Decision Attachment', () => {
    it('should attach decision to voxel', () => {
      const attachment = service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        summary: 'Test decision',
      });

      expect(attachment.decisionRef).toBe('urn:luhtech:pm:decision:DEC-001');
      expect(attachment.attachmentType).toBe('PRIMARY');
      expect(attachment.attachedBy).toBe('SYSTEM');
      expect(attachment.summary).toBe('Test decision');
      expect(attachment.attachedAt).toBeInstanceOf(Date);
    });

    it('should increment decision count', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });

      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.decisionCount).toBe(1);
    });

    it('should track affected trades', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        affectedTrades: ['ELECTRICAL', 'PLUMBING'],
      });

      const decisions = service.getAttachedDecisions('voxel-001');
      expect(decisions[0].affectedTrades).toContain('ELECTRICAL');
      expect(decisions[0].affectedTrades).toContain('PLUMBING');
    });

    it('should track acknowledgment requirement', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });

      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.unacknowledgedCount).toBe(1);
    });

    it('should not duplicate decision refs in list', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'AFFECTED',
        attachedBy: 'USER',
      });

      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.decisions).toHaveLength(1);
      expect(surface.attachedDecisions).toHaveLength(2);
    });

    it('should filter decisions by trade', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        affectedTrades: ['ELECTRICAL'],
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        affectedTrades: ['PLUMBING'],
      });

      const electrical = service.getAttachedDecisions('voxel-001', {
        filterByTrade: 'ELECTRICAL',
      });
      expect(electrical).toHaveLength(1);
      expect(electrical[0].decisionRef).toBe('urn:luhtech:pm:decision:DEC-001');
    });

    it('should filter unacknowledged decisions', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: false,
      });

      const unacked = service.getAttachedDecisions('voxel-001', {
        onlyUnacknowledged: true,
      });
      expect(unacked).toHaveLength(1);
    });

    it('should detach decision', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });

      const result = service.detachDecision(
        'voxel-001',
        'urn:luhtech:pm:decision:DEC-001'
      );
      expect(result).toBe(true);

      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.decisionCount).toBe(0);
      expect(surface.unacknowledgedCount).toBe(0);
    });

    it('should return false when detaching non-existent decision', () => {
      const result = service.detachDecision(
        'voxel-001',
        'urn:luhtech:pm:decision:NON-EXISTENT'
      );
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Tolerance Override Tests
  // ===========================================================================

  describe('Tolerance Overrides', () => {
    it('should create tolerance override', () => {
      const override = service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Non-visible area behind cabinet',
        applicableTrades: ['DRYWALL'],
      });

      expect(override.id).toBeDefined();
      expect(override.toleranceType).toBe('WALL_FLATNESS');
      expect(override.approvedValue.value).toBe(12.7);
      expect(override.rationale).toBe('Non-visible area behind cabinet');
    });

    it('should track tolerance overrides per voxel', () => {
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['DRYWALL'],
      });

      const overrides = service.getToleranceOverrides('voxel-001');
      expect(overrides).toHaveLength(1);
    });

    it('should filter tolerance overrides by type', () => {
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['DRYWALL'],
      });
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'CEILING_HEIGHT',
        standardValue: { value: 12.7, unit: 'mm', direction: '-' },
        approvedValue: { value: 25.4, unit: 'mm', direction: '-' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-002',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['FRAMING'],
      });

      const flatness = service.getToleranceOverrides('voxel-001', {
        toleranceType: 'WALL_FLATNESS',
      });
      expect(flatness).toHaveLength(1);
      expect(flatness[0].toleranceType).toBe('WALL_FLATNESS');
    });

    it('should filter tolerance overrides by trade', () => {
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['DRYWALL', 'PAINTING'],
      });

      const drywallOverrides = service.getToleranceOverrides('voxel-001', {
        trade: 'DRYWALL',
      });
      expect(drywallOverrides).toHaveLength(1);

      const plumbingOverrides = service.getToleranceOverrides('voxel-001', {
        trade: 'PLUMBING',
      });
      expect(plumbingOverrides).toHaveLength(0);
    });

    it('should check if variance is within approved tolerance (plus direction)', () => {
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'PROTRUSION',
        standardValue: { value: 3, unit: 'mm', direction: '+' },
        approvedValue: { value: 10, unit: 'mm', direction: '+' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['ALL'],
      });

      const within = service.isWithinApprovedTolerance(
        'voxel-001',
        'PROTRUSION',
        8
      );
      expect(within.withinTolerance).toBe(true);
      expect(within.override).toBeDefined();

      const outside = service.isWithinApprovedTolerance(
        'voxel-001',
        'PROTRUSION',
        12
      );
      expect(outside.withinTolerance).toBe(false);
    });

    it('should check if variance is within approved tolerance (plus-minus direction)', () => {
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'ALIGNMENT',
        standardValue: { value: 3, unit: 'mm', direction: '±' },
        approvedValue: { value: 10, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['ALL'],
      });

      expect(
        service.isWithinApprovedTolerance('voxel-001', 'ALIGNMENT', 8).withinTolerance
      ).toBe(true);
      expect(
        service.isWithinApprovedTolerance('voxel-001', 'ALIGNMENT', -8).withinTolerance
      ).toBe(true);
      expect(
        service.isWithinApprovedTolerance('voxel-001', 'ALIGNMENT', 12).withinTolerance
      ).toBe(false);
    });

    it('should exclude expired overrides', () => {
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['DRYWALL'],
        expiresAt: expiredDate,
      });

      const overrides = service.getToleranceOverrides('voxel-001');
      expect(overrides).toHaveLength(0);
    });

    it('should revoke tolerance override', () => {
      const override = service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6.35, unit: 'mm', direction: '±' },
        approvedValue: { value: 12.7, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:architect-001',
        rationale: 'Test',
        applicableTrades: ['DRYWALL'],
      });

      const result = service.revokeToleranceOverride('voxel-001', override.id);
      expect(result).toBe(true);

      const overrides = service.getToleranceOverrides('voxel-001');
      expect(overrides).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Pre-Approval Tests
  // ===========================================================================

  describe('Pre-Approvals', () => {
    it('should create pre-approval', () => {
      const preApproval = service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'minor color adjustments',
        conditions: ['Must match approved palette', 'No metallic finishes'],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'ARCHITECT',
        applicableTrades: ['PAINTING'],
      });

      expect(preApproval.id).toBeDefined();
      expect(preApproval.scope).toBe('minor color adjustments');
      expect(preApproval.conditions).toHaveLength(2);
      expect(preApproval.usageCount).toBe(0);
    });

    it('should track pre-approvals per voxel', () => {
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Test scope',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['ALL'],
      });

      const preApprovals = service.getPreApprovals('voxel-001');
      expect(preApprovals).toHaveLength(1);
    });

    it('should filter pre-approvals by trade', () => {
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Electrical scope',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['ELECTRICAL'],
      });
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Plumbing scope',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-002',
        authorityLevel: 'PM',
        applicableTrades: ['PLUMBING'],
      });

      const electrical = service.getPreApprovals('voxel-001', {
        trade: 'ELECTRICAL',
      });
      expect(electrical).toHaveLength(1);
      expect(electrical[0].scope).toBe('Electrical scope');
    });

    it('should exclude expired pre-approvals', () => {
      const expiredDate = new Date(Date.now() - 86400000);
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Expired scope',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['ALL'],
        validUntil: expiredDate,
      });

      const preApprovals = service.getPreApprovals('voxel-001');
      expect(preApprovals).toHaveLength(0);
    });

    it('should exclude pre-approvals not yet valid', () => {
      const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days from now
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Future scope',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['ALL'],
        validFrom: futureDate,
      });

      const preApprovals = service.getPreApprovals('voxel-001');
      expect(preApprovals).toHaveLength(0);
    });

    it('should check pre-approval coverage', () => {
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'minor adjustments',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['PAINTING'],
      });

      // PM-level scope for minor adjustments should be covered
      const covered = service.checkPreApproval(
        'voxel-001',
        'minor',
        'PAINTING',
        'FOREMAN'  // Lower than PM
      );
      expect(covered.covered).toBe(true);
      expect(covered.preApproval).toBeDefined();
      expect(covered.preApproval?.usageCount).toBe(1);
    });

    it('should not cover when required level exceeds pre-approval', () => {
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'minor adjustments',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'SUPERINTENDENT',
        applicableTrades: ['PAINTING'],
      });

      // Requires PM but pre-approval is only SUPERINTENDENT
      const covered = service.checkPreApproval(
        'voxel-001',
        'minor',
        'PAINTING',
        'PM'
      );
      expect(covered.covered).toBe(false);
    });
  });

  // ===========================================================================
  // Alert Tests
  // ===========================================================================

  describe('Alerts', () => {
    it('should create alert', () => {
      const alert = service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'Coordination Required',
        message: 'MEP conflict detected in this area',
        targetTrades: ['ELECTRICAL', 'PLUMBING'],
      });

      expect(alert.id).toBeDefined();
      expect(alert.priority).toBe('WARNING');
      expect(alert.title).toBe('Coordination Required');
      expect(alert.acknowledgedBy).toHaveLength(0);
    });

    it('should get active alerts', () => {
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'INFO',
        title: 'Test Alert',
        message: 'Test message',
      });

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts).toHaveLength(1);
    });

    it('should filter alerts by priority', () => {
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'INFO',
        title: 'Info Alert',
        message: 'Info message',
      });
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'CRITICAL',
        title: 'Critical Alert',
        message: 'Critical message',
      });

      const critical = service.getActiveAlerts('voxel-001', {
        filterByPriority: 'CRITICAL',
      });
      expect(critical).toHaveLength(1);
      expect(critical[0].title).toBe('Critical Alert');
    });

    it('should filter alerts by trade', () => {
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'Electrical Alert',
        message: 'Test',
        targetTrades: ['ELECTRICAL'],
      });
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'All Trades Alert',
        message: 'Test',
      });

      const electrical = service.getActiveAlerts('voxel-001', {
        filterByTrade: 'ELECTRICAL',
      });
      expect(electrical).toHaveLength(2);  // Electrical + all trades

      const plumbing = service.getActiveAlerts('voxel-001', {
        filterByTrade: 'PLUMBING',
      });
      expect(plumbing).toHaveLength(1);  // Only all trades alert
    });

    it('should exclude expired alerts', () => {
      const expiredDate = new Date(Date.now() - 86400000);
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'INFO',
        title: 'Expired Alert',
        message: 'Test',
        expiresAt: expiredDate,
      });

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts).toHaveLength(0);
    });

    it('should include expired alerts when requested', () => {
      const expiredDate = new Date(Date.now() - 86400000);
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'INFO',
        title: 'Expired Alert',
        message: 'Test',
        expiresAt: expiredDate,
      });

      const alerts = service.getActiveAlerts('voxel-001', {
        includeExpired: true,
      });
      expect(alerts).toHaveLength(1);
    });

    it('should acknowledge alert', () => {
      const alert = service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'Test Alert',
        message: 'Test',
        requiresAcknowledgment: true,
      });

      const result = service.acknowledgeAlert(
        'voxel-001',
        alert.id,
        'urn:luhtech:pm:worker:worker-001'
      );
      expect(result).toBe(true);

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts[0].acknowledgedBy).toContain(
        'urn:luhtech:pm:worker:worker-001'
      );
    });

    it('should not duplicate acknowledgments', () => {
      const alert = service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'Test Alert',
        message: 'Test',
      });

      service.acknowledgeAlert(
        'voxel-001',
        alert.id,
        'urn:luhtech:pm:worker:worker-001'
      );
      service.acknowledgeAlert(
        'voxel-001',
        alert.id,
        'urn:luhtech:pm:worker:worker-001'
      );

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts[0].acknowledgedBy).toHaveLength(1);
    });

    it('should dismiss alert', () => {
      const alert = service.createAlert({
        voxelId: 'voxel-001',
        priority: 'INFO',
        title: 'Test Alert',
        message: 'Test',
      });

      const result = service.dismissAlert('voxel-001', alert.id);
      expect(result).toBe(true);

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Worker Acknowledgment Tests
  // ===========================================================================

  describe('Worker Acknowledgments', () => {
    it('should record acknowledgment', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });

      const ack = service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'QR_SCAN',
        location: {
          gps: { lat: 49.2827, lng: -123.1207, accuracy: 5 },
        },
      });

      expect(ack.id).toBeDefined();
      expect(ack.workerName).toBe('John Smith');
      expect(ack.method).toBe('QR_SCAN');
      expect(ack.location?.gps).toBeDefined();
    });

    it('should mark decision as acknowledged', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });

      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'APP_BUTTON',
      });

      const surface = service.getDecisionSurface('voxel-001');
      expect(surface.unacknowledgedCount).toBe(0);
      expect(surface.attachedDecisions[0].acknowledged).toBe(true);
    });

    it('should get acknowledgments for voxel', () => {
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'APP_BUTTON',
      });
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-002',
        workerName: 'Jane Doe',
        workerTrade: 'PLUMBING',
        method: 'QR_SCAN',
      });

      const acks = service.getAcknowledgments('voxel-001');
      expect(acks).toHaveLength(2);
    });

    it('should filter acknowledgments by decision', () => {
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'APP_BUTTON',
      });
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-002',
        workerName: 'Jane Doe',
        workerTrade: 'PLUMBING',
        method: 'QR_SCAN',
      });

      const acks = service.getAcknowledgments(
        'voxel-001',
        'urn:luhtech:pm:decision:DEC-001'
      );
      expect(acks).toHaveLength(1);
      expect(acks[0].workerName).toBe('John Smith');
    });

    it('should check if worker acknowledged decision', () => {
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'APP_BUTTON',
      });

      expect(
        service.hasWorkerAcknowledged(
          'voxel-001',
          'urn:luhtech:pm:decision:DEC-001',
          'urn:luhtech:pm:worker:worker-001'
        )
      ).toBe(true);

      expect(
        service.hasWorkerAcknowledged(
          'voxel-001',
          'urn:luhtech:pm:decision:DEC-001',
          'urn:luhtech:pm:worker:worker-002'
        )
      ).toBe(false);
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('Statistics', () => {
    it('should calculate correct stats for voxel', () => {
      // Add decisions
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });

      // Add alerts
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'CRITICAL',
        title: 'Critical',
        message: 'Test',
      });
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'WARNING',
        title: 'Warning',
        message: 'Test',
      });

      // Add tolerance override
      service.createToleranceOverride({
        voxelId: 'voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 6, unit: 'mm', direction: '±' },
        approvedValue: { value: 12, unit: 'mm', direction: '±' },
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        approvedBy: 'urn:luhtech:pm:user:user-001',
        rationale: 'Test',
        applicableTrades: ['ALL'],
      });

      // Add pre-approval
      service.createPreApproval({
        voxelId: 'voxel-001',
        scope: 'Test',
        conditions: [],
        sourceDecisionRef: 'urn:luhtech:pm:decision:DEC-001',
        authorityLevel: 'PM',
        applicableTrades: ['ALL'],
      });

      const stats = service.getStats('voxel-001');
      expect(stats.totalDecisions).toBe(2);
      expect(stats.unacknowledgedCount).toBe(1);
      expect(stats.activeAlerts).toBe(2);
      expect(stats.criticalAlerts).toBe(1);
      expect(stats.toleranceOverrides).toBe(1);
      expect(stats.preApprovals).toBe(1);
      expect(stats.acknowledgmentRate).toBe(0);  // 0 of 1 acknowledged
    });

    it('should calculate acknowledgment rate correctly', () => {
      // Add 2 decisions requiring acknowledgment
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });

      // Acknowledge 1 decision
      service.recordAcknowledgment({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        workerRef: 'urn:luhtech:pm:worker:worker-001',
        workerName: 'John Smith',
        workerTrade: 'ELECTRICAL',
        method: 'APP_BUTTON',
      });

      const stats = service.getStats('voxel-001');
      expect(stats.acknowledgmentRate).toBe(0.5);  // 1 of 2
    });
  });

  // ===========================================================================
  // Find Methods Tests
  // ===========================================================================

  describe('Find Methods', () => {
    it('should find voxels with unacknowledged decisions', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: true,
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-002',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
        requiresAcknowledgment: false,
      });

      const unacked = service.findVoxelsWithUnacknowledgedDecisions();
      expect(unacked).toContain('voxel-001');
      expect(unacked).not.toContain('voxel-002');
    });

    it('should find voxels with critical alerts', () => {
      service.createAlert({
        voxelId: 'voxel-001',
        priority: 'CRITICAL',
        title: 'Critical',
        message: 'Test',
      });
      service.createAlert({
        voxelId: 'voxel-002',
        priority: 'WARNING',
        title: 'Warning',
        message: 'Test',
      });

      const critical = service.findVoxelsWithCriticalAlerts();
      expect(critical).toContain('voxel-001');
      expect(critical).not.toContain('voxel-002');
    });

    it('should get decision density map', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-002',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-003',
        voxelId: 'voxel-002',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });

      const density = service.getDecisionDensityMap();
      expect(density.get('voxel-001')).toBe(2);
      expect(density.get('voxel-002')).toBe(1);
    });
  });

  // ===========================================================================
  // Authority Integration Tests
  // ===========================================================================

  describe('Authority Integration', () => {
    it('should route and attach decision with authority', () => {
      const impact: DecisionImpact = {
        budgetImpact: 25000,
        scheduleImpactDays: 3,
        varianceAmountMM: 10,
        isSafetyRelated: false,
      };

      const result = service.routeAndAttachDecision(
        'urn:luhtech:pm:decision:DEC-001',
        'voxel-001',
        impact,
        'USER',
        'MEP coordination decision'
      );

      expect(result.attachment).toBeDefined();
      expect(result.routing).toBeDefined();
      expect(result.routing.requiredLevel).toBeDefined();
      expect(result.routing.requiredTitle).toBeDefined();
    });

    it('should create alert for high-authority decisions', () => {
      const impact: DecisionImpact = {
        budgetImpact: 75000,
        scheduleImpactDays: 10,
        varianceAmountMM: 20,
        isSafetyRelated: false,
      };

      service.routeAndAttachDecision(
        'urn:luhtech:pm:decision:DEC-001',
        'voxel-001',
        impact,
        'SYSTEM'
      );

      const alerts = service.getActiveAlerts('voxel-001');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it('should set requiresAcknowledgment for superintendent+ decisions', () => {
      const impact: DecisionImpact = {
        budgetImpact: 10000,
        scheduleImpactDays: 2,
        varianceAmountMM: 0,
        isSafetyRelated: false,
      };

      service.routeAndAttachDecision(
        'urn:luhtech:pm:decision:DEC-001',
        'voxel-001',
        impact,
        'SYSTEM'
      );

      const decisions = service.getAttachedDecisions('voxel-001');
      expect(decisions[0].requiresAcknowledgment).toBeDefined();
    });
  });

  // ===========================================================================
  // Persistence Helpers Tests
  // ===========================================================================

  describe('Persistence Helpers', () => {
    it('should export decision surface', () => {
      service.attachDecision({
        decisionRef: 'urn:luhtech:pm:decision:DEC-001',
        voxelId: 'voxel-001',
        attachmentType: 'PRIMARY',
        attachedBy: 'SYSTEM',
      });

      const exported = service.exportDecisionSurface('voxel-001');
      expect(exported.decisionCount).toBe(1);
      expect(exported.attachedDecisions).toHaveLength(1);
    });

    it('should import decision surface', () => {
      const surface = {
        decisions: ['urn:luhtech:pm:decision:DEC-001'],
        attachedDecisions: [
          {
            decisionRef: 'urn:luhtech:pm:decision:DEC-001',
            attachmentType: 'PRIMARY' as const,
            attachedAt: new Date().toISOString(),
            attachedBy: 'SYSTEM' as const,
            requiresAcknowledgment: false,
            acknowledged: false,
          },
        ],
        toleranceOverrides: [],
        preApprovals: [],
        activeAlerts: [],
        acknowledgments: [],
        decisionCount: 1,
        unacknowledgedCount: 0,
        lastUpdated: new Date().toISOString(),
      };

      service.importDecisionSurface('voxel-002', surface as any);

      const imported = service.getDecisionSurface('voxel-002');
      expect(imported.decisionCount).toBe(1);
      expect(imported.lastUpdated).toBeInstanceOf(Date);
    });
  });
});
