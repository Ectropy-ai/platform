/**
 * User Resolution Service
 *
 * Resolves phone numbers to user identities, projects, and authority levels.
 * Integrates with the multi-tenant participant system.
 *
 * @module phone-agent/user-resolver
 * @version 1.0.0
 */

import {
  formatToE164,
  isValidE164,
  type AuthorityLevel,
  type AuthorityMapping,
  type PhoneAgentConfig,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved user identity
 */
export interface ResolvedUser {
  userId: string;
  email?: string;
  displayName: string;
  phoneNumber: string;
  tenantId: string;
  projects: ResolvedProject[];
  primaryProject?: ResolvedProject;
  authorityLevel: AuthorityLevel;
  role: string;
}

/**
 * Resolved project association
 */
export interface ResolvedProject {
  projectId: string;
  projectName: string;
  tenantId: string;
  twilioNumber?: string;
  authorityLevel: AuthorityLevel;
  role: string;
}

/**
 * Resolution result
 */
export interface UserResolutionResult {
  success: boolean;
  user?: ResolvedUser;
  error?: string;
  suggestions?: string[];
}

// ============================================================================
// In-Memory Cache (for performance)
// ============================================================================

interface CacheEntry {
  user: ResolvedUser;
  expiresAt: number;
}

const userCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached user resolution
 */
function getCachedUser(phoneNumber: string): ResolvedUser | null {
  const entry = userCache.get(phoneNumber);
  if (!entry) {return null;}

  if (Date.now() > entry.expiresAt) {
    userCache.delete(phoneNumber);
    return null;
  }

  return entry.user;
}

/**
 * Cache user resolution
 */
function cacheUser(phoneNumber: string, user: ResolvedUser): void {
  userCache.set(phoneNumber, {
    user,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Clear user from cache
 */
export function clearUserCache(phoneNumber: string): void {
  userCache.delete(phoneNumber);
}

/**
 * Clear all cache
 */
export function clearAllUserCache(): void {
  userCache.clear();
}

// ============================================================================
// Database Integration Placeholder
// ============================================================================

// NOTE: These functions would integrate with Prisma in production
// For now, they simulate database lookups

/**
 * Find participant by phone number in database
 */
async function findParticipantByPhone(
  phoneNumber: string
): Promise<{
  id: string;
  userId: string;
  projectId: string;
  email?: string;
  name?: string;
  company?: string;
  role: string;
  authorityLevel: number;
  phone?: string;
  project: {
    id: string;
    name: string;
    tenantId: string;
  };
} | null> {
  // In production, this would be:
  // return prisma.participant.findFirst({
  //   where: { phone: phoneNumber },
  //   include: { project: true }
  // });

  // Simulated lookup for development
  console.log(`[User Resolver] Looking up participant for phone: ${phoneNumber}`);
  return null;
}

/**
 * Find all project associations for a user
 */
async function findUserProjects(
  userId: string
): Promise<Array<{
  projectId: string;
  projectName: string;
  tenantId: string;
  role: string;
  authorityLevel: number;
}>> {
  // In production, this would query the database
  console.log(`[User Resolver] Looking up projects for user: ${userId}`);
  return [];
}

/**
 * Get phone agent config for a project
 */
async function getPhoneAgentConfigForTwilioNumber(
  twilioNumber: string
): Promise<PhoneAgentConfig | null> {
  // In production, query the database
  console.log(`[User Resolver] Looking up config for Twilio number: ${twilioNumber}`);
  return null;
}

// ============================================================================
// User Resolution
// ============================================================================

/**
 * Resolve user from phone number
 */
export async function resolveUserFromPhone(
  phoneNumber: string,
  twilioNumber?: string
): Promise<UserResolutionResult> {
  // Normalize phone number
  let normalizedPhone: string;
  try {
    normalizedPhone = isValidE164(phoneNumber)
      ? phoneNumber
      : formatToE164(phoneNumber);
  } catch {
    return {
      success: false,
      error: 'Invalid phone number format',
      suggestions: ['Ensure phone number is in E.164 format (e.g., +14155551234)'],
    };
  }

  // Check cache first
  const cached = getCachedUser(normalizedPhone);
  if (cached) {
    return { success: true, user: cached };
  }

  // Look up in database
  const participant = await findParticipantByPhone(normalizedPhone);

  if (!participant) {
    return {
      success: false,
      error: 'Phone number not registered in system',
      suggestions: [
        'Contact your project manager to register your phone number',
        'Text from the phone number registered in the system',
      ],
    };
  }

  // Get all projects for this user
  const projects = await findUserProjects(participant.userId);

  const resolvedProjects: ResolvedProject[] = [
    // Include the participant's direct project
    {
      projectId: participant.projectId,
      projectName: participant.project.name,
      tenantId: participant.project.tenantId,
      authorityLevel: participant.authorityLevel as AuthorityLevel,
      role: participant.role,
    },
    // Add other projects
    ...projects
      .filter((p) => p.projectId !== participant.projectId)
      .map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        tenantId: p.tenantId,
        authorityLevel: p.authorityLevel as AuthorityLevel,
        role: p.role,
      })),
  ];

  // Determine primary project (based on Twilio number or most recent)
  let primaryProject = resolvedProjects[0];

  if (twilioNumber) {
    const configForNumber = await getPhoneAgentConfigForTwilioNumber(twilioNumber);
    if (configForNumber) {
      const matchingProject = resolvedProjects.find(
        (p) => p.projectId === configForNumber.projectId
      );
      if (matchingProject) {
        primaryProject = matchingProject;
      }
    }
  }

  const resolvedUser: ResolvedUser = {
    userId: participant.userId,
    email: participant.email,
    displayName: participant.name || 'Unknown User',
    phoneNumber: normalizedPhone,
    tenantId: participant.project.tenantId,
    projects: resolvedProjects,
    primaryProject,
    authorityLevel: participant.authorityLevel as AuthorityLevel,
    role: participant.role,
  };

  // Cache the result
  cacheUser(normalizedPhone, resolvedUser);

  return { success: true, user: resolvedUser };
}

/**
 * Resolve user for a specific project
 */
export async function resolveUserForProject(
  phoneNumber: string,
  projectId: string
): Promise<UserResolutionResult> {
  const result = await resolveUserFromPhone(phoneNumber);

  if (!result.success || !result.user) {
    return result;
  }

  const projectAssociation = result.user.projects.find(
    (p) => p.projectId === projectId
  );

  if (!projectAssociation) {
    return {
      success: false,
      error: 'User not associated with this project',
      suggestions: ['Contact project manager to add you to this project'],
    };
  }

  // Update primary project and authority level for this context
  return {
    success: true,
    user: {
      ...result.user,
      primaryProject: projectAssociation,
      authorityLevel: projectAssociation.authorityLevel,
      role: projectAssociation.role,
    },
  };
}

// ============================================================================
// Authority Resolution
// ============================================================================

/**
 * Get authority level for phone number on a project
 */
export async function getAuthorityLevel(
  phoneNumber: string,
  projectId: string
): Promise<AuthorityLevel | null> {
  const result = await resolveUserForProject(phoneNumber, projectId);

  if (!result.success || !result.user) {
    return null;
  }

  return result.user.authorityLevel;
}

/**
 * Check if user has minimum authority level
 */
export async function hasMinimumAuthority(
  phoneNumber: string,
  projectId: string,
  minimumLevel: AuthorityLevel
): Promise<boolean> {
  const level = await getAuthorityLevel(phoneNumber, projectId);
  if (level === null) {return false;}
  return level >= minimumLevel;
}

/**
 * Get users to notify for escalation
 */
export async function getEscalationTargets(
  projectId: string,
  currentLevel: AuthorityLevel,
  _tenantId?: string
): Promise<Array<{
  userId: string;
  displayName: string;
  phoneNumber?: string;
  email?: string;
  authorityLevel: AuthorityLevel;
  role: string;
}>> {
  // In production, query database for users with higher authority
  console.log(`[User Resolver] Getting escalation targets for project ${projectId}, current level ${currentLevel}`);

  // Would return users with authority > currentLevel
  return [];
}

// ============================================================================
// Phone Number Lookup
// ============================================================================

/**
 * Look up project for a Twilio number
 */
export async function lookupProjectByTwilioNumber(
  twilioNumber: string
): Promise<{
  projectId: string;
  projectName: string;
  tenantId: string;
} | null> {
  const config = await getPhoneAgentConfigForTwilioNumber(twilioNumber);

  if (!config) {
    return null;
  }

  // In production, get project details from database
  return null;
}

/**
 * Validate Twilio number belongs to project
 */
export async function validateTwilioNumberForProject(
  twilioNumber: string,
  projectId: string
): Promise<boolean> {
  const config = await getPhoneAgentConfigForTwilioNumber(twilioNumber);
  return config?.projectId === projectId;
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a phone number for a user/project
 */
export async function registerPhoneNumber(
  phoneNumber: string,
  userId: string,
  projectId: string,
  role: string,
  authorityLevel: AuthorityLevel
): Promise<{ success: boolean; error?: string }> {
  // Normalize phone number
  let normalizedPhone: string;
  try {
    normalizedPhone = isValidE164(phoneNumber)
      ? phoneNumber
      : formatToE164(phoneNumber);
  } catch {
    return { success: false, error: 'Invalid phone number format' };
  }

  // In production, update participant record in database
  console.log(`[User Resolver] Registering phone ${normalizedPhone} for user ${userId} on project ${projectId}`);

  // Clear any cached resolution
  clearUserCache(normalizedPhone);

  return { success: true };
}

/**
 * Unregister a phone number
 */
export async function unregisterPhoneNumber(
  phoneNumber: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  let normalizedPhone: string;
  try {
    normalizedPhone = isValidE164(phoneNumber)
      ? phoneNumber
      : formatToE164(phoneNumber);
  } catch {
    return { success: false, error: 'Invalid phone number format' };
  }

  // In production, clear phone from participant record
  console.log(`[User Resolver] Unregistering phone ${normalizedPhone} from project ${projectId}`);

  clearUserCache(normalizedPhone);

  return { success: true };
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Import authority mappings from configuration
 */
export async function importAuthorityMappings(
  projectId: string,
  mappings: AuthorityMapping[]
): Promise<{
  success: boolean;
  imported: number;
  errors: string[];
}> {
  let imported = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    const result = await registerPhoneNumber(
      mapping.phoneNumber,
      mapping.userId,
      projectId,
      mapping.role,
      mapping.authorityLevel
    );

    if (result.success) {
      imported++;
    } else {
      errors.push(`Failed to register ${mapping.phoneNumber}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    imported,
    errors,
  };
}

/**
 * Export authority mappings for a project
 */
export async function exportAuthorityMappings(
  _projectId: string
): Promise<AuthorityMapping[]> {
  // In production, query all participants with phones for this project
  return [];
}
