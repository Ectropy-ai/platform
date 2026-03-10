/**
 * Role Context for Dashboard Role Display
 *
 * ENTERPRISE PATTERN: Role types aligned with Prisma schema (StakeholderRole enum)
 * Source of Truth: prisma/schema.prisma
 *
 * PHASE 1 REFACTOR (2026-02-09): Simplified to read-only role display
 * - Removed role switching functionality
 * - Role determined by user's primary role or project-specific role
 * - Frontend aligned with backend project_roles table pattern
 *
 * Available roles:
 * - owner: Project ownership and oversight
 * - architect: Design and spatial planning
 * - contractor: Construction and execution
 * - engineer: Structural analysis and systems
 * - consultant: External advisory
 * - inspector: Quality assurance and compliance
 * - site_manager: On-site operations
 * - admin: System administration
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * UserRole type - aligned with Prisma StakeholderRole enum
 * @see prisma/schema.prisma - StakeholderRole enum
 */
export type UserRole =
  | 'owner'
  | 'architect'
  | 'contractor'
  | 'engineer'
  | 'consultant'
  | 'inspector'
  | 'site_manager'
  | 'admin';

interface RoleContextType {
  currentRole: UserRole;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const DEFAULT_ROLE: UserRole = 'contractor';

interface RoleProviderProps {
  children: ReactNode;
  /**
   * User's primary role - used for dashboard display
   * In Phase 2, this will be fetched from project context
   */
  userRole?: UserRole;
}

export const RoleProvider: React.FC<RoleProviderProps> = ({ children, userRole }) => {
  // Use provided role or default to contractor
  const [currentRole] = useState<UserRole>(userRole || DEFAULT_ROLE);

  return (
    <RoleContext.Provider value={{ currentRole }}>
      {children}
    </RoleContext.Provider>
  );
};

/**
 * Hook to access current role (read-only)
 * Must be used within a RoleProvider
 */
export const useRole = (): RoleContextType => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
