// Stakeholder types for the Ectropy platform
// ENTERPRISE PATTERN: Types aligned with Prisma StakeholderRole enum
// @see prisma/schema.prisma - StakeholderRole enum

export type StakeholderRole =
  | 'owner'
  | 'architect'
  | 'contractor'
  | 'engineer'
  | 'consultant'
  | 'inspector'
  | 'site_manager'
  | 'admin';
export interface User {
  id: string;
  name: string;
  email: string;
  role: StakeholderRole;
  avatar?: string;
  organization?: string;
  permissions?: string[];
}
export interface Project {
  description: string;
  status: 'planning' | 'design' | 'construction' | 'completed';
  startDate: string;
  endDate?: string;
  budget: number;
  stakeholders: User[];
  location?: string;
  bimFileUrl?: string;
}

export interface Proposal {
  id: string; // Add missing id property
  title: string;
  description: string; // Add missing description property
  proposer: User;
  status: 'draft' | 'active' | 'passed' | 'rejected';
  votes: Vote[];
  createdAt: string;
  deadline: string;
  requiredVotes: number;
  proposalType:
    | 'design_change'
    | 'budget_allocation'
    | 'timeline_adjustment'
    | 'contractor_selection'
    | 'material_change';
  attachments?: Attachment[];
}

export interface Vote {
  id: string; // Add missing id property
  voter: User;
  decision: 'approve' | 'reject' | 'abstain';
  comment?: string;
  timestamp: string;
  weight?: number; // voting power based on stake
}

export interface Attachment {
  url: string;
  type: 'document' | 'image' | 'model' | 'drawing';
  size: number;
  uploadedBy: User;
  uploadedAt: string;
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  activeProposals: number;
  upcomingDeadlines: number;
}

export interface BIMViewerProps {
  modelUrl?: string;
  onElementSelect?: (elementId: string) => void;
  onViewChange?: (camera: any) => void;
  annotations?: BIMAnnotation[];
}

export interface BIMAnnotation {
  position: [number, number, number];
  text: string;
  author: User;
  resolved?: boolean;
}

export interface Template {
  id: string; // Add missing id property
  name: string; // Add missing name property
  description: string; // Add missing description property
  category: 'design' | 'budget' | 'timeline' | 'governance' | 'safety';
  fields: TemplateField[];
  createdBy: User;
  usageCount: number;
}

export interface TemplateField {
  id: string; // Add missing id property
  name: string; // Add missing name property
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'file';
  required: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface ContractorBid {
  contractor: User;
  amount: number;
  timeline: number; // days
  attachments: Attachment[];
  submittedAt: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected';
}

export interface Task {
  assignee: User;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate: string;
  project: string; // project ID
  dependencies?: string[]; // task IDs
  estimatedHours?: number;
  actualHours?: number;
}

export interface ActivityLog {
  user: User;
  action: string;
  target: string; // what was acted upon
  details?: Record<string, any>;
  projectId?: string;
  timestamp: string;
}
