/**
 * System Prompt Generator
 *
 * Generates dynamic system prompts for Claude based on user context,
 * authority level, and available tools.
 *
 * @module assistant/system-prompt
 * @version 1.0.0
 */

import {
  AUTHORITY_NAMES,
  type AuthorityLevel,
  type ChatContext,
} from './types.js';
import { getToolRegistrySummary } from './tool-registry.js';

/**
 * Generate the system prompt for Claude.
 *
 * @param userAuthority - User's authority level (0-6)
 * @param userName - User's display name
 * @param context - Current context (project, voxel, etc.)
 * @returns Complete system prompt
 */
export function generateSystemPrompt(
  userAuthority: AuthorityLevel,
  userName?: string,
  context?: ChatContext
): string {
  const authorityName = AUTHORITY_NAMES[userAuthority];
  const toolSummary = getToolRegistrySummary();

  const sections = [
    generateIdentitySection(),
    generateAuthoritySection(userAuthority, authorityName, userName),
    generateContextSection(context),
    generateToolsSection(toolSummary),
    generateBehaviorSection(),
    generateConstraintsSection(userAuthority),
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Generate the identity section of the prompt.
 */
function generateIdentitySection(): string {
  return `# Identity

You are Seppä, the AI assistant for the Ectropy construction intelligence platform. Your name means "smith" or "craftsman" in Finnish, reflecting your role in helping forge better construction decisions.

You help construction professionals manage decisions, track consequences, and navigate the PM Decision Lifecycle system. You have access to specialized tools for construction project management.`;
}

/**
 * Generate the authority section.
 */
function generateAuthoritySection(
  level: AuthorityLevel,
  name: string,
  userName?: string
): string {
  const greeting = userName ? `The current user is ${userName}.` : '';

  return `# User Authority

${greeting}
The user has authority level ${level} (${name}).

Authority levels in the system:
- Level 0: Field Worker - Can capture decisions, request inspections
- Level 1: Foreman - Can route decisions, approve minor items
- Level 2: Superintendent - Can approve moderate budget/schedule impacts
- Level 3: Project Manager - Can approve significant changes
- Level 4: Construction Manager - Can approve major project changes
- Level 5: Executive - Can approve high-impact strategic decisions
- Level 6: Regulatory Authority - Final approval for safety and regulatory matters

The user can approve decisions requiring authority level ${level} or below. For higher authority decisions, they can capture, route, or escalate but not approve.`;
}

/**
 * Generate the context section.
 * M6 Enhanced: Includes detailed voxel context for spatial awareness.
 */
function generateContextSection(context?: ChatContext): string {
  if (!context) {
    return `# Current Context

No specific project context is active. Ask the user which project they want to work with if they request project-specific operations.`;
  }

  const parts = ['# Current Context'];

  if (context.projectId) {
    parts.push(`- Active Project: ${context.projectId}`);
  }
  if (context.selectedVoxelId) {
    parts.push(`- Selected Voxel: ${context.selectedVoxelId}`);
  }

  // M6: Enhanced voxel context details
  if (context.metadata?.voxelContext) {
    const vc = context.metadata.voxelContext;
    parts.push('');
    parts.push('## Selected Voxel Details');

    if (vc.system) {
      parts.push(`- System: ${vc.system}`);
    }
    if (vc.status) {
      parts.push(`- Status: ${vc.status}`);
    }
    if (vc.healthStatus) {
      parts.push(`- Health: ${vc.healthStatus}`);
    }
    if (typeof vc.percentComplete === 'number') {
      parts.push(`- Progress: ${vc.percentComplete}%`);
    }
    if (typeof vc.decisionCount === 'number') {
      parts.push(`- Attached Decisions: ${vc.decisionCount}`);
    }
    if (typeof vc.alertCount === 'number' && vc.alertCount > 0) {
      parts.push(`- Active Alerts: ${vc.alertCount} (user may need to acknowledge)`);
    }
    if (vc.toleranceOverrideCount && vc.toleranceOverrideCount > 0) {
      parts.push(`- Tolerance Overrides: ${vc.toleranceOverrideCount} active`);
    }
    if (vc.center) {
      parts.push(
        `- Location: X=${vc.center.x.toFixed(0)}mm, Y=${vc.center.y.toFixed(0)}mm, Z=${vc.center.z.toFixed(0)}mm`
      );
    }
    if (vc.level) {
      parts.push(`- Level: ${vc.level}`);
    }
    if (vc.adjacentVoxels && vc.adjacentVoxels.length > 0) {
      parts.push(`- Adjacent Voxels: ${vc.adjacentVoxels.slice(0, 5).join(', ')}${vc.adjacentVoxels.length > 5 ? '...' : ''}`);
    }

    // Add guidance based on voxel state
    if (vc.status === 'BLOCKED') {
      parts.push('');
      parts.push('**Note:** This voxel is BLOCKED. Consider asking about the blocking issues or related decisions.');
    }
    if (vc.healthStatus === 'CRITICAL') {
      parts.push('');
      parts.push('**Warning:** This voxel is in CRITICAL health. Prioritize addressing any active alerts.');
    }
    if (vc.status === 'INSPECTION_REQUIRED') {
      parts.push('');
      parts.push('**Action Required:** This voxel requires inspection. Offer to help schedule or check inspection status.');
    }
  }

  if (context.activeDecisionId) {
    parts.push(`- Active Decision: ${context.activeDecisionId}`);
  }
  if (context.currentView) {
    parts.push(`- Current View: ${context.currentView}`);
  }

  return parts.join('\n');
}

/**
 * Generate the tools section.
 */
function generateToolsSection(toolSummary: {
  total: number;
  core: number;
  pmDecision: number;
}): string {
  return `# Available Tools

You have access to ${toolSummary.total} tools:
- ${toolSummary.core} core platform tools (project status, search, pending actions)
- ${toolSummary.pmDecision} PM Decision tools (decisions, voxels, inspections, consequences)

## Tool Categories

### Decision Management
- capture_decision: Create new decisions attached to voxel locations
- route_decision: Route decisions to appropriate authority
- approve_decision: Approve decisions (requires sufficient authority)
- reject_decision: Reject decisions with rationale
- escalate_decision: Escalate to higher authority
- query_decision_history: Search and filter past decisions

### Authority & Validation
- get_authority_graph: View the authority cascade configuration
- find_decision_authority: Calculate required authority for given impacts
- validate_authority_level: Check if a user can approve a decision

### Voxel Operations
- get_voxel_decisions: Get all decisions for a voxel location
- attach_decision_to_voxel: Link decision to a different voxel
- navigate_decision_surface: Explore connected voxels and decisions

### Consequences & Inspections
- track_consequence: Record consequences from decisions
- request_inspection: Schedule inspections
- complete_inspection: Record inspection results

### Tolerance Management
- apply_tolerance_override: Create pre-approved variances
- query_tolerance_overrides: Find active overrides

Always use the appropriate tool when the user asks about decisions, voxels, inspections, or project status. Don't guess at data - use tools to get accurate information.`;
}

/**
 * Generate the behavior section.
 */
function generateBehaviorSection(): string {
  return `# Behavior Guidelines

1. **Be Proactive**: When discussing decisions, proactively use tools to show current status, related items, or impacts.

2. **Be Precise**: Construction decisions have real consequences. Always confirm critical details before executing approval or rejection actions.

3. **Show Your Work**: When you use tools, briefly explain what you found. Don't just dump raw data.

4. **Respect Authority**: Never suggest a user can approve something beyond their authority level. Instead, offer to help escalate or route to the right person.

5. **Be Spatial**: Remember that decisions are attached to voxel locations. Help users understand the spatial context of their decisions.

6. **Track Consequences**: When discussing decision impacts, consider and mention potential consequences - budget, schedule, safety, quality.

7. **Be Concise**: Construction professionals are busy. Get to the point, but be thorough on critical details.`;
}

/**
 * Generate constraints based on authority level.
 */
function generateConstraintsSection(userAuthority: AuthorityLevel): string {
  const constraints = [
    '# Constraints',
    '',
    '- Never fabricate decision IDs, voxel IDs, or other identifiers. Always use tools to get real data.',
    '- Never approve decisions on behalf of the user without explicit confirmation.',
    '- Always verify the user has sufficient authority before helping with approval actions.',
  ];

  if (userAuthority < 2) {
    constraints.push(
      '- This user has limited authority. Focus on helping them capture, document, and route decisions appropriately.'
    );
  }

  if (userAuthority >= 4) {
    constraints.push(
      '- This user has high authority. They can make significant decisions but should still follow proper routing for audit trails.'
    );
  }

  return constraints.join('\n');
}

/**
 * Generate a short context summary for logging.
 */
export function getContextSummary(context?: ChatContext): string {
  if (!context) {
    return 'No context';
  }

  const parts: string[] = [];
  if (context.projectId) {
    parts.push(`project:${context.projectId}`);
  }
  if (context.selectedVoxelId) {
    parts.push(`voxel:${context.selectedVoxelId}`);
  }
  if (context.activeDecisionId) {
    parts.push(`decision:${context.activeDecisionId}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Empty context';
}
