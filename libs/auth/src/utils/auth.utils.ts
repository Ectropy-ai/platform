import type { User } from '@ectropy/shared/types';

/**
 * Utility helpers for working with user roles
 */
export const hasRole = (user: Pick<User, 'roles'> | undefined, role: string): boolean => {
  return user?.roles?.includes(role) ?? false;
};

/**
 * Checks if the user has at least one of the provided roles
 */
export const hasAnyRole = (
  user: Pick<User, 'roles'> | undefined,
  roles: string[]
): boolean => {
  return roles.some((role) => hasRole(user, role));
};

/**
 * Checks if the user has all of the provided roles
 */
export const hasAllRoles = (
  user: Pick<User, 'roles'> | undefined,
  roles: string[]
): boolean => {
  return roles.every((role) => hasRole(user, role));
};

