/**
 * Contract Template Seeds - CCDC & AIA Standard Templates
 *
 * Pre-configured templates for common construction contract families.
 * These templates enable zero-training contract extraction by providing:
 * - Document structure expectations (articles, exhibits)
 * - Extraction rules for automated data extraction
 * - Authority role mappings to 7-tier cascade
 * - IPD governance configurations
 *
 * Supported Templates:
 * - CCDC 2 (Stipulated Price)
 * - CCDC 5A (Construction Management - GMP)
 * - CCDC 14 (Design-Build)
 * - CCDC 30 (IPD Multi-Party)
 * - AIA A101 (Owner-Contractor Agreement)
 * - AIA A201 (General Conditions)
 * - AIA C191 (Multi-Party IPD)
 * - AIA B101 (Owner-Architect Agreement)
 *
 * @see .roadmap/features/contract-onboarding/FEATURE.json
 * @version 1.0.0
 */

import {
  ContractFamily,
  ContractType,
  DeliveryMethod,
  ContractPartyRole,
  type ContractTemplate,
  type ContractTemplateURN,
  type ExtractionRule,
  type AuthorityRoleMapping,
} from '../types/contract.types.js';

import { AuthorityLevel } from '../types/pm.types.js';
import {
  registerTemplate,
  buildTemplateURN,
} from './contract-template.service.js';

// ============================================================================
// CCDC Templates (Canadian Construction Documents Committee)
// ============================================================================

/**
 * CCDC 2 - Stipulated Price Contract
 *
 * Standard form for lump-sum construction contracts in Canada.
 * Most commonly used contract in Canadian construction.
 */
export const CCDC_2_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.CCDC, '2-2020'),
  family: ContractFamily.CCDC,
  contractNumber: '2-2020',
  contractType: ContractType.STIPULATED_SUM,
  deliveryMethod: DeliveryMethod.DBB,
  displayName: 'CCDC 2 - Stipulated Price Contract (2020)',
  description:
    'Standard stipulated price contract between Owner and Contractor for construction work where the basis of payment is a stipulated price.',
  version: '2020',

  documentStructure: {
    articles: [
      { number: 'A-1', title: 'The Work', required: true },
      { number: 'A-2', title: 'Agreements and Amendments', required: true },
      { number: 'A-3', title: 'Contract Documents', required: true },
      { number: 'A-4', title: 'Contract Price', required: true },
      { number: 'A-5', title: 'Payment', required: true },
      {
        number: 'A-6',
        title: 'Receipt of and Addresses for Notices',
        required: true,
      },
      { number: 'A-7', title: 'Language of the Contract', required: false },
      { number: 'A-8', title: 'Succession', required: false },
    ],
    exhibits: [
      {
        id: 'schedule-a',
        title: 'Schedule A - List of Contract Documents',
        required: true,
      },
      { id: 'schedule-b', title: 'Schedule B - Allowances', required: false },
    ],
  },

  extractionRules: [
    // Owner extraction
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER|Client)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited|Corporation)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    {
      fieldPath: 'parties.owner.address',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER)[^]*?(?:Address|address)[:\s]+([^\n]+(?:\n[^\n]+)?)/i,
      dataType: 'string',
      required: false,
      confidenceThreshold: 0.6,
    },
    // Contractor extraction
    {
      fieldPath: 'parties.contractor.name',
      method: 'regex',
      pattern:
        /(?:Contractor|CONTRACTOR|General Contractor)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited|Corporation)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Contract Price
    {
      fieldPath: 'financialTerms.contractPrice',
      method: 'regex',
      pattern:
        /(?:Contract Price|Stipulated Price|Contract Sum)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // Currency
    {
      fieldPath: 'financialTerms.currency',
      method: 'regex',
      pattern:
        /(?:payable in|currency)[:\s]*(Canadian dollars|CAD|USD|US dollars)/i,
      dataType: 'string',
      required: false,
      confidenceThreshold: 0.7,
      defaultValue: 'CAD',
    },
    // Project Name
    {
      fieldPath: 'projectInfo.name',
      method: 'regex',
      pattern:
        /(?:Project|PROJECT|for the)[:\s]+([A-Z][A-Za-z0-9\s\-,]+?)(?:\n|located|at)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.6,
    },
    // Commencement Date
    {
      fieldPath: 'dates.commencement',
      method: 'date',
      pattern:
        /(?:Commencement Date|commence|start)[:\s]*(?:on|by)?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i,
      dataType: 'date',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Substantial Completion Date
    {
      fieldPath: 'dates.substantialCompletion',
      method: 'date',
      pattern:
        /(?:Substantial Completion|Substantial Performance)[:\s]*(?:on|by)?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i,
      dataType: 'date',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Holdback/Retainage
    {
      fieldPath: 'financialTerms.holdbackPercentage',
      method: 'regex',
      pattern: /(?:holdback|retainage)[:\s]*(\d+(?:\.\d+)?)\s*%/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.8,
      defaultValue: 10,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Consultant',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Engineer',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Subcontractor',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],
};

/**
 * CCDC 5A - Construction Management Contract for Services (GMP)
 *
 * Used when Owner engages a Construction Manager with GMP arrangement.
 */
export const CCDC_5A_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.CCDC, '5A-2010'),
  family: ContractFamily.CCDC,
  contractNumber: '5A-2010',
  contractType: ContractType.GMP,
  deliveryMethod: DeliveryMethod.CMAR,
  displayName: 'CCDC 5A - Construction Management Contract (GMP)',
  description:
    'Construction management contract with guaranteed maximum price for services.',
  version: '2010',

  documentStructure: {
    articles: [
      { number: 'A-1', title: 'The Services', required: true },
      { number: 'A-2', title: 'Agreements and Amendments', required: true },
      { number: 'A-3', title: 'Contract Documents', required: true },
      { number: 'A-4', title: 'Guaranteed Maximum Price', required: true },
      { number: 'A-5', title: 'Payment', required: true },
      { number: 'A-6', title: 'Cost Savings', required: true },
    ],
    exhibits: [
      { id: 'schedule-a', title: 'Schedule A - Services', required: true },
      { id: 'schedule-b', title: 'Schedule B - GMP Breakdown', required: true },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER|Client)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Construction Manager
    {
      fieldPath: 'parties.constructionManager.name',
      method: 'regex',
      pattern:
        /(?:Construction Manager|CM|Manager)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // GMP
    {
      fieldPath: 'financialTerms.guaranteedMaximumPrice',
      method: 'regex',
      pattern:
        /(?:Guaranteed Maximum Price|GMP)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // CM Fee
    {
      fieldPath: 'financialTerms.cmFeePercentage',
      method: 'regex',
      pattern: /(?:CM Fee|Management Fee|Fee)[:\s]*(\d+(?:\.\d+)?)\s*%/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Shared Savings
    {
      fieldPath: 'financialTerms.sharedSavings.ownerShare',
      method: 'regex',
      pattern:
        /(?:Owner|Owner's share)[:\s]*(\d+)\s*%\s*(?:of savings|savings)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
    {
      fieldPath: 'financialTerms.sharedSavings.cmShare',
      method: 'regex',
      pattern:
        /(?:CM|Construction Manager|Manager)[:\s]*(\d+)\s*%\s*(?:of savings|savings)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Construction Manager',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'CM',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Consultant',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Trade Contractor',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],
};

/**
 * CCDC 14 - Design-Build Stipulated Price Contract
 *
 * Used for design-build projects with single-point responsibility.
 */
export const CCDC_14_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.CCDC, '14-2013'),
  family: ContractFamily.CCDC,
  contractNumber: '14-2013',
  contractType: ContractType.DESIGN_BUILD,
  deliveryMethod: DeliveryMethod.DB,
  displayName: 'CCDC 14 - Design-Build Stipulated Price Contract',
  description:
    'Design-build contract where the Design-Builder provides both design and construction services.',
  version: '2013',

  documentStructure: {
    articles: [
      { number: 'A-1', title: 'The Work', required: true },
      { number: 'A-2', title: 'Design Services', required: true },
      { number: 'A-3', title: 'Contract Documents', required: true },
      { number: 'A-4', title: 'Contract Price', required: true },
      { number: 'A-5', title: 'Payment', required: true },
      { number: 'A-6', title: 'Performance Specifications', required: true },
    ],
    exhibits: [
      {
        id: 'schedule-a',
        title: 'Schedule A - Performance Specifications',
        required: true,
      },
      {
        id: 'schedule-b',
        title: 'Schedule B - Design Deliverables',
        required: true,
      },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER|Client)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Design-Builder
    {
      fieldPath: 'parties.designBuilder.name',
      method: 'regex',
      pattern:
        /(?:Design-Builder|Design Builder|DB)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Contract Price
    {
      fieldPath: 'financialTerms.contractPrice',
      method: 'regex',
      pattern:
        /(?:Contract Price|Design-Build Price)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // Design Fee
    {
      fieldPath: 'financialTerms.designFee',
      method: 'regex',
      pattern:
        /(?:Design Fee|Design Services Fee)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Design-Builder',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Design Builder',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'DB',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Architect of Record',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Subcontractor',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],
};

/**
 * CCDC 30 - Integrated Project Delivery Contract
 *
 * Multi-party IPD contract with shared risk/reward.
 */
export const CCDC_30_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.CCDC, '30-2018'),
  family: ContractFamily.CCDC,
  contractNumber: '30-2018',
  contractType: ContractType.IPD_MULTI_PARTY,
  deliveryMethod: DeliveryMethod.IPD,
  displayName: 'CCDC 30 - Integrated Project Delivery Contract',
  description:
    'Multi-party integrated project delivery contract with shared risk/reward and collaborative governance.',
  version: '2018',

  documentStructure: {
    articles: [
      { number: 'A-1', title: 'Parties and Project', required: true },
      { number: 'A-2', title: 'IPD Principles', required: true },
      { number: 'A-3', title: 'Governance Structure', required: true },
      { number: 'A-4', title: 'Target Cost', required: true },
      { number: 'A-5', title: 'Risk/Reward Sharing', required: true },
      { number: 'A-6', title: 'Decision Making', required: true },
      { number: 'A-7', title: 'Dispute Resolution', required: true },
    ],
    exhibits: [
      {
        id: 'exhibit-a',
        title: 'Exhibit A - Target Cost Breakdown',
        required: true,
      },
      {
        id: 'exhibit-b',
        title: 'Exhibit B - Risk/Reward Allocation',
        required: true,
      },
      {
        id: 'exhibit-c',
        title: 'Exhibit C - Governance Charter',
        required: true,
      },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Architect
    {
      fieldPath: 'parties.architect.name',
      method: 'regex',
      pattern:
        /(?:Architect|ARCHITECT|Design Consultant)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Constructor
    {
      fieldPath: 'parties.constructor.name',
      method: 'regex',
      pattern:
        /(?:Constructor|CONSTRUCTOR|General Contractor|Contractor)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Target Cost
    {
      fieldPath: 'financialTerms.targetCost',
      method: 'regex',
      pattern: /(?:Target Cost|Target Price)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // Risk Pool
    {
      fieldPath: 'financialTerms.riskPool',
      method: 'regex',
      pattern:
        /(?:Risk Pool|At-Risk Amount|Contingency)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
    // PMT Voting Threshold
    {
      fieldPath: 'governance.pmtVotingThreshold',
      method: 'regex',
      pattern:
        /(?:PMT|Project Management Team)[^]*?(?:decisions? (?:above|exceeding|over))[:\s]*\$?\s*([\d,]+)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.5,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Constructor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Key Participant',
      authorityLevel: AuthorityLevel.SUPERINTENDENT,
      canApprove: true,
      budgetLimit: 10000,
    },
    {
      contractRole: 'Trade Partner',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],

  ipdGovernance: {
    hasPMT: true,
    pmtName: 'Project Management Team',
    pmtVotingRule: 'majority',
    pmtVotingThreshold: 100000,
    pmtVotingWindow: 72,
    hasPET: true,
    petName: 'Project Executive Team',
    petVotingRule: 'unanimous',
    petEscalationThreshold: 500000,
    riskRewardSharing: {
      owner: 40,
      architect: 30,
      constructor: 30,
    },
  },
};

// ============================================================================
// AIA Templates (American Institute of Architects)
// ============================================================================

/**
 * AIA A101 - Standard Form of Agreement Between Owner and Contractor
 *
 * Standard stipulated sum contract for US projects.
 */
export const AIA_A101_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.AIA, 'A101-2017'),
  family: ContractFamily.AIA,
  contractNumber: 'A101-2017',
  contractType: ContractType.STIPULATED_SUM,
  deliveryMethod: DeliveryMethod.DBB,
  displayName: 'AIA A101 - Owner-Contractor Agreement (Stipulated Sum)',
  description:
    'Standard form of agreement between owner and contractor where the basis of payment is a stipulated sum.',
  version: '2017',

  documentStructure: {
    articles: [
      { number: '1', title: 'The Contract Documents', required: true },
      { number: '2', title: 'The Work of This Contract', required: true },
      {
        number: '3',
        title: 'Date of Commencement and Substantial Completion',
        required: true,
      },
      { number: '4', title: 'Contract Sum', required: true },
      { number: '5', title: 'Payments', required: true },
      { number: '6', title: 'Dispute Resolution', required: true },
      { number: '7', title: 'Termination or Suspension', required: true },
      { number: '8', title: 'Miscellaneous Provisions', required: false },
      {
        number: '9',
        title: 'Enumeration of Contract Documents',
        required: true,
      },
    ],
    exhibits: [
      {
        id: 'exhibit-a',
        title: 'Exhibit A - Insurance and Bonds',
        required: true,
      },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited|LP)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Contractor
    {
      fieldPath: 'parties.contractor.name',
      method: 'regex',
      pattern:
        /(?:Contractor|CONTRACTOR)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited|LP)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Architect
    {
      fieldPath: 'parties.architect.name',
      method: 'regex',
      pattern:
        /(?:Architect|ARCHITECT)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited|LP)?)/i,
      dataType: 'string',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Contract Sum
    {
      fieldPath: 'financialTerms.contractSum',
      method: 'regex',
      pattern:
        /(?:Contract Sum|Contract Price)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // Retainage
    {
      fieldPath: 'financialTerms.retainagePercentage',
      method: 'regex',
      pattern: /(?:retainage|retention)[:\s]*(\d+(?:\.\d+)?)\s*%/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.8,
      defaultValue: 10,
    },
    // Commencement Date
    {
      fieldPath: 'dates.commencement',
      method: 'date',
      pattern:
        /(?:Date of Commencement|commencement date|commence)[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
      dataType: 'date',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Substantial Completion
    {
      fieldPath: 'dates.substantialCompletion',
      method: 'date',
      pattern:
        /(?:Substantial Completion|substantial completion date)[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
      dataType: 'date',
      required: false,
      confidenceThreshold: 0.7,
    },
    // Liquidated Damages
    {
      fieldPath: 'financialTerms.liquidatedDamages',
      method: 'regex',
      pattern:
        /(?:liquidated damages)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:per day|\/day)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Subcontractor',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],
};

/**
 * AIA A201 - General Conditions of the Contract for Construction
 *
 * Standard general conditions that define roles and responsibilities.
 */
export const AIA_A201_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.AIA, 'A201-2017'),
  family: ContractFamily.AIA,
  contractNumber: 'A201-2017',
  contractType: ContractType.STIPULATED_SUM,
  deliveryMethod: DeliveryMethod.DBB,
  displayName: 'AIA A201 - General Conditions of the Contract',
  description:
    'General conditions of the contract for construction, defining rights, responsibilities, and relationships.',
  version: '2017',

  documentStructure: {
    articles: [
      { number: '1', title: 'General Provisions', required: true },
      { number: '2', title: 'Owner', required: true },
      { number: '3', title: 'Contractor', required: true },
      { number: '4', title: 'Architect', required: true },
      { number: '5', title: 'Subcontractors', required: true },
      {
        number: '6',
        title: 'Construction by Owner or by Separate Contractors',
        required: false,
      },
      { number: '7', title: 'Changes in the Work', required: true },
      { number: '8', title: 'Time', required: true },
      { number: '9', title: 'Payments and Completion', required: true },
      {
        number: '10',
        title: 'Protection of Persons and Property',
        required: true,
      },
      { number: '11', title: 'Insurance and Bonds', required: true },
      {
        number: '12',
        title: 'Uncovering and Correction of Work',
        required: true,
      },
      { number: '13', title: 'Miscellaneous Provisions', required: false },
      {
        number: '14',
        title: 'Termination or Suspension of the Contract',
        required: true,
      },
      { number: '15', title: 'Claims and Disputes', required: true },
    ],
    exhibits: [],
  },

  extractionRules: [
    // Changes in Work threshold
    {
      fieldPath: 'governance.changeOrderThreshold',
      method: 'regex',
      pattern:
        /(?:change order|changes in the work)[^]*?(?:threshold|limit|up to)[:\s]*\$?\s*([\d,]+)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.5,
    },
    // Notice period for claims
    {
      fieldPath: 'governance.claimNoticePeriod',
      method: 'regex',
      pattern:
        /(?:notice|notify)[^]*?(?:within|no later than)\s*(\d+)\s*(?:days|calendar days)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.5,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Subcontractor',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],
};

/**
 * AIA C191 - Standard Form Multi-Party Agreement for Integrated Project Delivery
 *
 * Multi-party IPD contract with Target Cost and shared risk/reward.
 */
export const AIA_C191_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.AIA, 'C191-2009'),
  family: ContractFamily.AIA,
  contractNumber: 'C191-2009',
  contractType: ContractType.IPD_MULTI_PARTY,
  deliveryMethod: DeliveryMethod.IPD,
  displayName: 'AIA C191 - Multi-Party Agreement for IPD',
  description:
    'Standard form multi-party agreement for integrated project delivery with shared risk and reward.',
  version: '2009',

  documentStructure: {
    articles: [
      { number: '1', title: 'Initial Information', required: true },
      { number: '2', title: 'Relationship of Parties', required: true },
      { number: '3', title: 'Management Structure', required: true },
      { number: '4', title: 'Target Cost', required: true },
      { number: '5', title: 'Compensation', required: true },
      { number: '6', title: 'Cost of the Work', required: true },
      { number: '7', title: 'Incentive Compensation', required: true },
      { number: '8', title: 'Risk/Reward', required: true },
      { number: '9', title: 'Work of the Parties', required: true },
      { number: '10', title: 'Claims and Disputes', required: true },
      { number: '11', title: 'Insurance', required: true },
      { number: '12', title: 'Termination', required: true },
    ],
    exhibits: [
      { id: 'exhibit-a', title: 'Exhibit A - Target Cost', required: true },
      {
        id: 'exhibit-b',
        title: 'Exhibit B - Risk/Reward Allocation',
        required: true,
      },
      {
        id: 'exhibit-c',
        title: 'Exhibit C - Management Structure',
        required: true,
      },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Architect
    {
      fieldPath: 'parties.architect.name',
      method: 'regex',
      pattern:
        /(?:Architect|ARCHITECT)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Contractor/Constructor
    {
      fieldPath: 'parties.contractor.name',
      method: 'regex',
      pattern:
        /(?:Contractor|CONTRACTOR|Constructor)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Non-Owner Parties
    {
      fieldPath: 'parties.nonOwnerParties',
      method: 'llm',
      llmPrompt:
        'Extract all party names that are NOT the Owner from this IPD contract. Return as JSON array of {name, role}.',
      dataType: 'array',
      required: false,
      confidenceThreshold: 0.6,
    },
    // Target Cost
    {
      fieldPath: 'financialTerms.targetCost',
      method: 'regex',
      pattern:
        /(?:Target Cost|Estimated Maximum Price)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: true,
      confidenceThreshold: 0.8,
    },
    // Profit at Risk
    {
      fieldPath: 'financialTerms.profitAtRisk',
      method: 'regex',
      pattern:
        /(?:profit at risk|at-risk profit)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
    // Shared Savings Split
    {
      fieldPath: 'financialTerms.sharedSavings.ownerShare',
      method: 'regex',
      pattern: /(?:Owner|Owner's)[^]*?(\d+)\s*%\s*(?:of|savings)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.5,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
    {
      contractRole: 'Contractor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Constructor',
      authorityLevel: AuthorityLevel.PM,
      canApprove: true,
      budgetLimit: 50000,
    },
    {
      contractRole: 'Non-Owner Party',
      authorityLevel: AuthorityLevel.SUPERINTENDENT,
      canApprove: true,
      budgetLimit: 10000,
    },
    {
      contractRole: 'Trade Partner',
      authorityLevel: AuthorityLevel.FOREMAN,
      canApprove: false,
      budgetLimit: 2500,
    },
  ],

  ipdGovernance: {
    hasPMT: true,
    pmtName: 'Project Management Team',
    pmtVotingRule: 'majority',
    pmtVotingThreshold: 100000,
    pmtVotingWindow: 72,
    hasPET: true,
    petName: 'Senior Management Team',
    petVotingRule: 'unanimous',
    petEscalationThreshold: 500000,
    riskRewardSharing: {
      owner: 50,
      architect: 25,
      constructor: 25,
    },
  },
};

/**
 * AIA B101 - Standard Form of Agreement Between Owner and Architect
 *
 * Standard owner-architect agreement for basic services.
 */
export const AIA_B101_TEMPLATE: ContractTemplate = {
  urn: buildTemplateURN(ContractFamily.AIA, 'B101-2017'),
  family: ContractFamily.AIA,
  contractNumber: 'B101-2017',
  contractType: ContractType.STIPULATED_SUM,
  deliveryMethod: DeliveryMethod.DBB,
  displayName: 'AIA B101 - Owner-Architect Agreement',
  description:
    'Standard form of agreement between owner and architect for basic services.',
  version: '2017',

  documentStructure: {
    articles: [
      { number: '1', title: 'Initial Information', required: true },
      { number: '2', title: "Architect's Responsibilities", required: true },
      {
        number: '3',
        title: "Scope of Architect's Basic Services",
        required: true,
      },
      {
        number: '4',
        title: 'Supplemental and Additional Services',
        required: false,
      },
      { number: '5', title: "Owner's Responsibilities", required: true },
      { number: '6', title: 'Cost of the Work', required: true },
      { number: '7', title: 'Copyrights and Licenses', required: false },
      { number: '8', title: 'Claims and Disputes', required: true },
      { number: '9', title: 'Termination or Suspension', required: true },
      { number: '10', title: 'Miscellaneous Provisions', required: false },
      { number: '11', title: 'Compensation', required: true },
    ],
    exhibits: [
      { id: 'exhibit-a', title: 'Exhibit A - Project Budget', required: false },
    ],
  },

  extractionRules: [
    // Owner
    {
      fieldPath: 'parties.owner.name',
      method: 'regex',
      pattern:
        /(?:Owner|OWNER)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Architect
    {
      fieldPath: 'parties.architect.name',
      method: 'regex',
      pattern:
        /(?:Architect|ARCHITECT)[:\s]+([A-Z][A-Za-z\s&.,]+(?:LLC|Inc|Corp|Limited)?)/i,
      dataType: 'string',
      required: true,
      confidenceThreshold: 0.7,
    },
    // Compensation (percentage)
    {
      fieldPath: 'financialTerms.architectFeePercentage',
      method: 'regex',
      pattern:
        /(?:percentage|fee)[:\s]*(\d+(?:\.\d+)?)\s*%\s*(?:of|construction cost)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
    // Compensation (fixed)
    {
      fieldPath: 'financialTerms.architectFeeFixed',
      method: 'regex',
      pattern:
        /(?:stipulated sum|fixed fee|compensation)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
    // Project Budget
    {
      fieldPath: 'projectInfo.budget',
      method: 'regex',
      pattern:
        /(?:project budget|construction budget|budget)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
      dataType: 'number',
      required: false,
      confidenceThreshold: 0.6,
    },
  ],

  authorityMappings: [
    {
      contractRole: 'Owner',
      authorityLevel: AuthorityLevel.OWNER,
      canApprove: true,
      budgetLimit: 'project',
    },
    {
      contractRole: 'Architect',
      authorityLevel: AuthorityLevel.ARCHITECT,
      canApprove: true,
      budgetLimit: 'design',
    },
  ],
};

// ============================================================================
// Template Registration
// ============================================================================

/**
 * All available templates
 */
export const ALL_TEMPLATES: ContractTemplate[] = [
  // CCDC Templates
  CCDC_2_TEMPLATE,
  CCDC_5A_TEMPLATE,
  CCDC_14_TEMPLATE,
  CCDC_30_TEMPLATE,
  // AIA Templates
  AIA_A101_TEMPLATE,
  AIA_A201_TEMPLATE,
  AIA_C191_TEMPLATE,
  AIA_B101_TEMPLATE,
];

/**
 * Template URN to template map for quick lookup
 */
export const TEMPLATE_MAP: Map<ContractTemplateURN, ContractTemplate> = new Map(
  ALL_TEMPLATES.map((t) => [t.urn, t])
);

/**
 * Register all seed templates with the template service
 *
 * Call this at application startup to load all standard templates.
 *
 * @returns Registration results for each template
 */
export function registerAllSeedTemplates(): Array<{
  urn: ContractTemplateURN;
  success: boolean;
  errors: string[];
}> {
  const results: Array<{
    urn: ContractTemplateURN;
    success: boolean;
    errors: string[];
  }> = [];

  for (const template of ALL_TEMPLATES) {
    const result = registerTemplate(template);
    results.push({
      urn: template.urn,
      success: result.success,
      errors: result.errors,
    });
  }

  return results;
}

/**
 * Get template by contract family and number
 *
 * @param family - Contract family (CCDC, AIA, etc.)
 * @param contractNumber - Contract number (e.g., "2-2020", "A101-2017")
 * @returns Template or undefined
 */
export function getTemplateByFamilyAndNumber(
  family: ContractFamily,
  contractNumber: string
): ContractTemplate | undefined {
  const urn = buildTemplateURN(family, contractNumber);
  return TEMPLATE_MAP.get(urn);
}

/**
 * Get all templates for a family
 *
 * @param family - Contract family
 * @returns Array of templates
 */
export function getTemplatesForFamily(
  family: ContractFamily
): ContractTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.family === family);
}

/**
 * Get IPD templates
 *
 * @returns Array of IPD templates
 */
export function getIPDTemplates(): ContractTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.ipdGovernance !== undefined);
}

// ============================================================================
// Export
// ============================================================================

export default {
  ALL_TEMPLATES,
  TEMPLATE_MAP,
  registerAllSeedTemplates,
  getTemplateByFamilyAndNumber,
  getTemplatesForFamily,
  getIPDTemplates,
  // Individual templates
  CCDC_2_TEMPLATE,
  CCDC_5A_TEMPLATE,
  CCDC_14_TEMPLATE,
  CCDC_30_TEMPLATE,
  AIA_A101_TEMPLATE,
  AIA_A201_TEMPLATE,
  AIA_C191_TEMPLATE,
  AIA_B101_TEMPLATE,
};
