/*
 * =============================================================================
 * DAO TEMPLATE GOVERNANCE SERVICE - DECENTRALIZED DATA SHARING CONTROL
 * =============================================================================
 *
 * PURPOSE:
 * Manages decentralized governance of data sharing templates through DAO
 * voting mechanisms. Enables stakeholder-driven evolution of access control
 * policies while maintaining security and compliance.
 * Includes methods for retrieving proposals and approved governance templates:
 * - getProposals(): Promise<TemplateProposal[]>
 * - getGovernanceTemplates(): Promise<DataSharingTemplate[]>
 *
 *
 * 📋 IMPLEMENTATION GUIDE:
 * See SENIOR_DEVELOPER_HANDOFF.md for complete method implementations
 * with proper error handling and database queries.
 *
 * 🗄️  DATABASE DEPENDENCIES:
 * Ensure these tables exist before implementing methods:
 * - dao_template_proposals
 * - dao_active_templates
 * - dao_template_votes
 *
 * 🧪 TESTING:
 * After adding methods, test with:
 * - npx nx run api-gateway:type-check
 * - curl http://localhost:4000/api/v1/dao/proposals
 * - curl http://localhost:4000/api/v1/dao/templates
 *
 * CAPABILITIES:
 * - Template creation and proposal management
 * - DAO voting integration with blockchain
 * - Template versioning and rollback
 * - Emergency access coordination
 * - Compliance validation
 * =============================================================================
 */
import { EventEmitter } from 'events';
import { DateTime } from 'luxon';
export class DAOTemplateGovernanceService extends EventEmitter {
  constructor(db, blockchainConfig) {
    super();
    this.db = db;
    this.blockchainConfig = blockchainConfig;
  }
  /**
   * Create a new data sharing template proposal
   */
  async proposeTemplate(template, proposer, proposerRole) {
    try {
      // Validate template structure and compliance
      const validation = await this.validateTemplate(template);
      if (!validation.isValid) {
        throw new Error(
          `Template validation failed: ${validation.errors.join(', ')}`
        );
      }
      // Check proposer permissions
      await this.validateProposerPermissions(proposer, proposerRole);
      // Create proposal in database
      const proposalQuery = `
        INSERT INTO dao_template_proposals (
          template_id,
          template_data,
          proposer_id,
          proposer_role,
          status,
          validation_result,
          created_at
        ) VALUES ($1, $2, $3, $4, 'draft', $5, NOW())
        RETURNING proposal_id
      `;
      const proposalResult = await this.db.query(proposalQuery, [
        template.templateId,
        JSON.stringify(template),
        proposer,
        proposerRole,
        JSON.stringify(validation),
      ]);
      const proposalId = proposalResult.rows[0].proposal_id;
      // Initialize voting period
      await this.initializeVotingPeriod(
        proposalId,
        template.daoGovernance.votingPeriod
      );
      this.emit('template:proposed', {
        proposalId,
        templateId: template.templateId,
        proposer,
        proposerRole,
      });
      return proposalId;
    } catch (error) {
      this.emit('error', { operation: 'proposeTemplate', error });
      throw error;
    }
  }
  /**
   * Submit a vote on a template proposal
   */
  async submitVote(proposalId, voter, voterRole, decision, comment) {
    try {
      // Validate voting eligibility
      await this.validateVoterEligibility(proposalId, voter, voterRole);
      // Calculate voting power based on role and stake
      const votingPower = await this.calculateVotingPower(
        voter,
        voterRole,
        proposalId
      );
      // Record vote
      const voteQuery = `
        INSERT INTO dao_template_votes (
          proposal_id,
          voter_id,
          voter_role,
          decision,
          voting_power,
          comment,
          voted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `;
      await this.db.query(voteQuery, [
        proposalId,
        voter,
        voterRole,
        decision,
        votingPower,
        comment,
      ]);
      // Update proposal vote tally
      await this.updateVoteTally(proposalId);
      // Check if voting period is complete
      const proposal = await this.getProposal(proposalId);
      if (await this.isVotingComplete(proposal)) {
        await this.finalizeVoting(proposalId);
      }
      this.emit('vote:submitted', {
        proposalId,
        voter,
        voterRole,
        decision,
        votingPower,
      });
    } catch (error) {
      this.emit('error', { operation: 'submitVote', error });
      throw error;
    }
  }
  /**
   * Get the active template for a construction project
   */
  async getActiveTemplate(projectId) {
    try {
      const query = `
        SELECT t.template_data, t.version, t.activated_at
        FROM dao_active_templates t
        WHERE t.project_id = $1 
        AND t.status = 'active'
        ORDER BY t.activated_at DESC
        LIMIT 1
      `;
      const result = await this.db.query(query, [projectId]);
      if (result.rows.length === 0) {
        // Return default template if none is active
        return await this.getDefaultTemplate();
      }
      return JSON.parse(result.rows[0].template_data);
    } catch (error) {
      this.emit('error', { operation: 'getActiveTemplate', error });
      throw error;
    }
  }
  /**
   * Check if a user has access to specific data under current template
   */
  async checkTemplateAccess(
    projectId,
    _userId,
    userRole,
    dataCategory,
    operation
  ) {
    try {
      const template = await this.getActiveTemplate(projectId);
      if (template === null) {
        return false;
      }
      const roleAccess = template.stakeholderAccess[userRole];
      if (!roleAccess) {
        return false;
      }
      // Check data category access
      if (!roleAccess.dataCategories.includes(dataCategory)) {
        return false;
      }
      // Check operation permission
      if (!roleAccess.operations.includes(operation)) {
        return false;
      }
      // Check additional conditions
      if (roleAccess.conditions !== null) {
        for (const condition of roleAccess.conditions) {
          const conditionMet = await this.evaluateAccessCondition(
            condition,
            projectId,
            userId
          );
          if (!conditionMet) {
            return false;
          }
        }
      }
      // Check time restrictions
      if (roleAccess.timeRestrictions !== null) {
        const timeAllowed = this.checkTimeRestrictions(
          roleAccess.timeRestrictions
        );
        if (!timeAllowed) {
          return false;
        }
      }
      return true;
    } catch (error) {
      this.emit('error', { operation: 'checkTemplateAccess', error });
      return false;
    }
  }
  /**
   * Activate emergency access for a project
   */
  async activateEmergencyAccess(
    projectId,
    requesterId,
    requesterRole,
    justification
  ) {
    try {
      const template = await this.getActiveTemplate(projectId);
      if (template === null) {
        throw new Error('No active template found for project');
      }
      // Validate emergency access permissions
      if (!template.emergencyAccess.authorizedRoles.includes(requesterRole)) {
        throw new Error('User role not authorized for emergency access');
      }
      // Create emergency access record
      const emergencyQuery = `
        INSERT INTO dao_emergency_access (
          project_id,
          requester_id,
          requester_role,
          justification,
          activated_at,
          expires_at,
          status
        ) VALUES ($1, $2, $3, $4, NOW(), 
          NOW() + INTERVAL '${template.emergencyAccess.timeLimit || 24} hours',
          'active'
        )
        RETURNING emergency_access_id
      `;
      const result = await this.db.query(emergencyQuery, [
        projectId,
        requesterId,
        requesterRole,
        justification,
      ]);
      const emergencyAccessId = result.rows[0].emergency_access_id;
      this.emit('emergency:activated', {
        projectId,
        emergencyAccessId,
        requesterId,
        requesterRole,
        justification,
      });
      return emergencyAccessId;
    } catch (error) {
      this.emit('error', { operation: 'activateEmergencyAccess', error });
      throw error;
    }
  }
  /**
   * Get all active proposals for DAO voting
   * Called by API Gateway to display current proposals to stakeholders
   */
  async getProposals() {
    try {
      const query = `
        SELECT 
          proposal_id,
          template_data,
          proposal_details,
          voting_status,
          created_at,
          voting_starts,
          voting_deadline,
          status
        FROM dao_template_proposals
        WHERE status IN ('active', 'voting', 'pending')
        ORDER BY created_at DESC
      `;
      const result = await this.db.query(query);
      return result.rows.map((row) => ({
        proposalId: row.proposal_id,
        template: JSON.parse(row.template_data),
        proposalDetails: JSON.parse(row.proposal_details || '{}'),
        votingStatus: JSON.parse(
          row.voting_status ||
            '{"votesFor":0,"votesAgainst":0,"abstentions":0,"totalVotingPower":0,"currentQuorum":0}'
        ),
        timeline: {
          submitted: new Date(row.created_at),
          votingStarts: new Date(row.voting_starts || row.created_at),
          votingEnds: new Date(row.voting_deadline),
        },
        status: row.status,
        metadata: {
          createdBy: 'dao-system',
          lastModified: new Date(row.created_at),
        },
      }));
    } catch (error) {
      this.emit('error', { operation: 'getProposals', error });
      throw error;
    }
  }
  /**
   * Get all available governance templates
   * Returns templates that have been approved and are currently active
   */
  async getGovernanceTemplates() {
    try {
      const query = `
        SELECT 
          template_data,
          version,
          activated_at,
          project_id
        FROM dao_active_templates
        WHERE status = 'active'
        ORDER BY activated_at DESC
      `;
      const result = await this.db.query(query);
      return result.rows.map((row) => JSON.parse(row.template_data));
    } catch (error) {
      this.emit('error', { operation: 'getGovernanceTemplates', error });
      throw error;
    }
  }
  // Private helper methods
  async validateTemplate(template) {
    const errors = [];
    const warnings = [];
    // Basic structure validation
    if (!template.templateId || !template.templateName) {
      errors.push('Template must have valid ID and name');
    }
    // Stakeholder access validation
    const requiredRoles = ['owner', 'architect', 'engineer', 'contractor'];
    for (const role of requiredRoles) {
      if (!template.stakeholderAccess[role]) {
        errors.push(`Missing access definition for required role: ${role}`);
      }
    }
    // DAO governance validation
    if (!template.daoGovernance.daoAddress) {
      errors.push('DAO address is required');
    }
    // Compliance checks
    const complianceChecks = {
      gdprCompliant: this.checkGDPRCompliance(template),
      industryStandardsCompliant: this.checkIndustryStandards(template),
      securityRequirementsMet: this.checkSecurityRequirements(template),
    };
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      complianceChecks,
    };
  }
  async validateProposerPermissions(proposer, role) {
    // Check if user has permission to propose templates
    const query = `
      SELECT can_propose_templates 
      FROM user_dao_permissions 
      WHERE user_id = $1 AND role = $2
    `;
    const result = await this.db.query(query, [proposer, role]);
    if (result.rows.length === 0 || !result.rows[0].can_propose_templates) {
      throw new Error('User does not have permission to propose templates');
    }
  }
  async initializeVotingPeriod(proposalId, votingPeriod) {
    const query = `
      UPDATE dao_template_proposals 
      SET 
        voting_starts = $2,
        voting_ends = $3,
        minimum_quorum = $4,
        passing_threshold = $5,
        status = 'voting'
      WHERE proposal_id = $1
    `;
    await this.db.query(query, [
      proposalId,
      votingPeriod.start,
      votingPeriod.end,
      votingPeriod.minimumQuorum,
      votingPeriod.passingThreshold,
    ]);
  }
  async validateVoterEligibility(proposalId, voter, voterRole) {
    // Check if user has already voted
    const existingVoteQuery = `
      SELECT vote_id FROM dao_template_votes 
      WHERE proposal_id = $1 AND voter_id = $2
    `;
    const existingVote = await this.db.query(existingVoteQuery, [
      proposalId,
      voter,
    ]);
    if (existingVote.rows.length > 0) {
      throw new Error('User has already voted on this proposal');
    }
    // Check voting eligibility
    const eligibilityQuery = `
      SELECT can_vote FROM user_dao_permissions 
      WHERE user_id = $1 AND role = $2
    `;
    const eligibility = await this.db.query(eligibilityQuery, [
      voter,
      voterRole,
    ]);
    if (eligibility.rows.length === 0 || !eligibility.rows[0].can_vote) {
      throw new Error('User is not eligible to vote');
    }
  }
  async calculateVotingPower(voter, voterRole, _proposalId) {
    // Base voting power by role
    const roleWeights = {
      owner: 3,
      architect: 2,
      engineer: 2,
      contractor: 2,
      supplier: 1,
      inspector: 1,
      regulator: 2,
    };
    // Additional weight based on stake in platform
    const stakeQuery = `
      SELECT stake_weight FROM user_dao_stakes 
      WHERE user_id = $1
    `;
    const stakeResult = await this.db.query(stakeQuery, [voter]);
    const stakeWeight = stakeResult.rows[0]?.stake_weight || 1;
    return roleWeights[voterRole] * stakeWeight;
  }
  async updateVoteTally(proposalId) {
    const tallyQuery = `
      UPDATE dao_template_proposals 
      SET 
        votes_for = (
          SELECT COALESCE(SUM(voting_power), 0) 
          FROM dao_template_votes 
          WHERE proposal_id = $1 AND decision = 'for'
        ),
        votes_against = (
          SELECT COALESCE(SUM(voting_power), 0) 
          FROM dao_template_votes 
          WHERE proposal_id = $1 AND decision = 'against'
        ),
        abstentions = (
          SELECT COALESCE(SUM(voting_power), 0) 
          FROM dao_template_votes 
          WHERE proposal_id = $1 AND decision = 'abstain'
        )
      WHERE proposal_id = $1
    `;
    await this.db.query(tallyQuery, [proposalId]);
  }
  async getProposal(proposalId) {
    const query = `
      SELECT * FROM dao_template_proposals 
      WHERE proposal_id = $1
    `;
    const result = await this.db.query(query, [proposalId]);
    return result.rows[0];
  }
  async isVotingComplete(proposal) {
    const now = new Date();
    const votingEnds = new Date(proposal.voting_ends);
    // Check if voting period has ended
    if (now >= votingEnds) {
      return true;
    }
    // Check if quorum is met and decision is clear
    const totalVotes =
      proposal.votes_for + proposal.votes_against + proposal.abstentions;
    const quorumMet = totalVotes >= proposal.minimum_quorum;
    if (quorumMet) {
      const passingVotes = proposal.votes_for / totalVotes;
      const rejectingVotes = proposal.votes_against / totalVotes;
      // Early decision if threshold is clearly met or cannot be met
      if (
        passingVotes >= proposal.passing_threshold ||
        rejectingVotes > 1 - proposal.passing_threshold
      ) {
        return true;
      }
    }
    return false;
  }
  async finalizeVoting(proposalId) {
    const proposal = await this.getProposal(proposalId);
    const totalVotes =
      proposal.votingStatus.votesFor +
      proposal.votingStatus.votesAgainst +
      proposal.votingStatus.abstentions;
    const passingVotes = proposal.votingStatus.votesFor / totalVotes;
    const passed =
      totalVotes >=
        (proposal.template.daoGovernance.votingPeriod?.minimumQuorum || 0) &&
      passingVotes >=
        (proposal.template.daoGovernance.votingPeriod?.passingThreshold || 0.5);
    if (passed) {
      await this.activateTemplate(proposalId);
      this.emit('template:approved', { proposalId });
    } else {
      await this.rejectTemplate(proposalId);
      this.emit('template:rejected', { proposalId });
    }
  }
  async activateTemplate(proposalId) {
    // Implementation for template activation
    const query = `
      UPDATE dao_template_proposals 
      SET status = 'approved', finalized_at = NOW()
      WHERE proposal_id = $1
    `;
    await this.db.query(query, [proposalId]);
  }
  async rejectTemplate(proposalId) {
    const query = `
      UPDATE dao_template_proposals 
      SET status = 'rejected', finalized_at = NOW()
      WHERE proposal_id = $1
    `;
    await this.db.query(query, [proposalId]);
  }
  async getDefaultTemplate() {
    // Return a conservative default template
    return {
      templateId: 'default-v1',
      templateName: 'Default Construction Data Sharing',
      version: '1.0.0',
      governanceStatus: 'active',
      daoGovernance: {
        daoAddress: this.blockchainConfig.daoAddress,
        votingWeights: {
          owner: 3,
          architect: 2,
          engineer: 2,
          contractor: 2,
          supplier: 1,
          inspector: 1,
          regulator: 2,
        },
      },
      stakeholderAccess: {
        owner: {
          dataCategories: [
            'specifications',
            'performance',
            'pricing',
            'compliance',
          ],
          operations: ['read', 'write', 'admin', 'export'],
        },
        architect: {
          dataCategories: [
            'specifications',
            'performance',
            'geometric',
            'material_properties',
          ],
          operations: ['read', 'write', 'export'],
        },
        engineer: {
          dataCategories: [
            'specifications',
            'performance',
            'structural_data',
            'compliance',
          ],
          operations: ['read', 'write', 'export'],
        },
        contractor: {
          dataCategories: [
            'specifications',
            'installation',
            'procurement_data',
          ],
          operations: ['read', 'export'],
        },
        supplier: {
          dataCategories: ['specifications', 'availability'],
          operations: ['read'],
        },
        inspector: {
          dataCategories: [
            'specifications',
            'compliance',
            'quality_certifications',
          ],
          operations: ['read', 'audit'],
        },
        regulator: {
          dataCategories: ['compliance', 'quality_certifications'],
          operations: ['read', 'audit'],
        },
      },
      manufacturerDataTiers: {
        public: ['specifications'],
        technical: ['performance', 'material_properties'],
        commercial: ['pricing', 'availability'],
        restricted: ['cost_analysis', 'supplier_information'],
      },
      emergencyAccess: {
        authorizedRoles: ['owner', 'regulator'],
        triggerConditions: ['safety_incident', 'compliance_violation'],
        auditRequirements: ['justification_required', 'time_limited'],
        timeLimit: 24,
      },
      metadata: {
        createdBy: 'system',
        createdAt: new Date(),
        lastModified: new Date(),
        description:
          'Conservative default template for construction data sharing',
        applicableRegions: ['global'],
        complianceStandards: ['ISO19650', 'buildingSMART'],
      },
    };
  }
  async evaluateAccessCondition(condition, projectId, _userId) {
    switch (condition.type) {
      case 'project_phase': {
        const allowed = condition.parameters?.allowedPhases || [];
        const query = `SELECT status FROM projects WHERE id = $1`;
        const result = await this.db.query(query, [projectId]);
        const phase = result.rows[0]?.status;
        return allowed.includes(phase);
      }
      case 'certification': {
        const required = condition.parameters?.certification;
        if (!required) {
          return false;
        }
        const query = `SELECT certification FROM user_certifications WHERE user_id = $1`;
        const result = await this.db.query(query, [userId]);
        const certs = result.rows.map((r) => r.certification);
        return certs.includes(required);
      }
      case 'approval_status': {
        const required = condition.parameters?.requiredStatus;
        const query = `SELECT status FROM project_approvals WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`;
        const result = await this.db.query(query, [projectId, userId]);
        const status = result.rows[0]?.status;
        return status === required;
      }
      case 'time_based': {
        const restrictions = condition.parameters?.restrictions || [];
        return this.checkTimeRestrictions(restrictions);
      }
      default:
        return false;
    }
  }
  checkTimeRestrictions(restrictions) {
    if (!restrictions || restrictions.length === 0) {
      return true;
    }
    const nowUtc = DateTime.utc();
    return restrictions.some((r) => {
      const zone = r.timezone || 'UTC';
      const now = nowUtc.setZone(zone);
      if (Array.isArray(r.allowedDays)) {
        const day = now.weekday % 7;
        if (!r.allowedDays.includes(day)) {
          return false;
        }
      }
      if (r.allowedHours) {
        const parse = (t) => {
          const [h, m] = t.split(':').map((n) => parseInt(n, 10));
          return h * 60 + m;
        };
        const start = parse(r.allowedHours.start);
        const end = parse(r.allowedHours.end);
        const current = now.hour * 60 + now.minute;
        const within =
          end >= start
            ? current >= start && current <= end
            : current >= start || current <= end;
        if (!within) {
          return false;
        }
      }
      return true;
    });
  }
  checkGDPRCompliance(template) {
    // Basic GDPR compliance checks
    return template.emergencyAccess.auditRequirements.includes(
      'justification_required'
    );
  }
  checkIndustryStandards(template) {
    // Check against industry standards
    return template.metadata.complianceStandards.length > 0;
  }
  checkSecurityRequirements(template) {
    // Basic security requirement checks
    return Object.values(template.stakeholderAccess).every(
      (access) =>
        access.operations.length > 0 && access.dataCategories.length > 0
    );
  }
}
//# sourceMappingURL=template-governance.service.js.map
