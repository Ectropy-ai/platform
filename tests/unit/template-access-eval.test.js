import { DAOTemplateGovernanceService } from '../../libs/shared/dao/template-governance.service';
import { DateTime } from 'luxon';

const db = { query: jest.fn() };
const service = new DAOTemplateGovernanceService(db, {
  daoAddress: '',
  providerUrl: '',
  votingContractAddress: '',
});

describe('Access condition evaluation', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  test('project_phase condition checks project status', async () => {
    db.query.mockResolvedValue({ rows: [{ status: 'active' }] });
    const condition = {
      type: 'project_phase',
      parameters: { allowedPhases: ['active'] },
    };
    const result = await service.evaluateAccessCondition(condition, 'p1', 'u1');
    expect(db.query).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  test('certification condition verifies user certificates', async () => {
    db.query.mockResolvedValue({ rows: [{ certification: 'LEED' }] });
    const condition = {
      type: 'certification',
      parameters: { certification: 'LEED' },
    };
    const result = await service.evaluateAccessCondition(condition, 'p1', 'u1');
    expect(result).toBe(true);
  });

  test('time restrictions allow if within period', () => {
    const day = DateTime.utc().weekday % 7;
    const restrictions = [
      {
        allowedDays: [day],
        allowedHours: { start: '00:00', end: '23:59' },
        timezone: 'UTC',
      },
    ];
    const allowed = service.checkTimeRestrictions(restrictions);
    expect(allowed).toBe(true);
  });
});
