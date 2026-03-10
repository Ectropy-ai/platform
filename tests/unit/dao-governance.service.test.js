/**
 * ENTERPRISE: Unit tests for DAOTemplateGovernanceService
 * Uses Vitest for testing framework
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DAOTemplateGovernanceService } from '../../libs/shared/dao/template-governance.service.js';

describe('DAOTemplateGovernanceService', () => {
  const db = {
    query: vi.fn(),
  };
  const service = new DAOTemplateGovernanceService(db, {
    daoAddress: '0x0',
    providerUrl: '',
    votingContractAddress: '0x0',
  });

  beforeEach(() => {
    db.query.mockReset();
  });

  test('getProposals should map database rows', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          proposal_id: 'p1',
          template_data: '{"templateId":"t1"}',
          proposal_details: '{}',
          voting_status: '{}',
          created_at: '2020-01-01',
          voting_starts: '2020-01-01',
          voting_deadline: '2020-01-02',
          status: 'active',
        },
      ],
    });
    const proposals = await service.getProposals();
    expect(proposals.length).toBe(1);
    expect(proposals[0]).toHaveProperty('proposalId', 'p1');
  });

  test('getGovernanceTemplates should parse rows', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          template_data: '{"templateId":"t2"}',
          version: '1.0',
          activated_at: '2020-01-01',
          project_id: 'proj1',
        },
      ],
    });
    const templates = await service.getGovernanceTemplates();
    expect(templates.length).toBe(1);
    expect(templates[0]).toHaveProperty('templateId', 't2');
  });

  test('checkTemplateAccess grants access when rules allow', async () => {
    service.getActiveTemplate = vi.fn().mockResolvedValue({
      stakeholderAccess: {
        engineer: {
          dataCategories: ['project_data'],
          operations: ['read'],
        },
      },
    });
    service.evaluateAccessCondition = vi.fn().mockResolvedValue(true);
    service.checkTimeRestrictions = vi.fn().mockReturnValue(true);
    const allowed = await service.checkTemplateAccess(
      'p1',
      'u1',
      'engineer',
      'project_data',
      'read'
    );
    expect(allowed).toBe(true);
  });
});
