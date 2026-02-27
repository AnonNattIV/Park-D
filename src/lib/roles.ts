export type OwnerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | null;
export type AppRole = 'admin' | 'owner' | 'user';

interface RoleInput {
  roles?: string | null;
  hasOwnerProfile: number;
  ownerRequestStatus: OwnerRequestStatus;
}

function hasRole(roles: string | null | undefined, targetRole: 'RENTER' | 'OWNER' | 'ADMIN'): boolean {
  if (!roles) {
    return false;
  }

  return roles
    .split(',')
    .map((role) => role.trim().toUpperCase())
    .includes(targetRole);
}

export function resolveAppRole({
  roles,
  hasOwnerProfile,
  ownerRequestStatus,
}: RoleInput): AppRole {
  if (hasRole(roles, 'ADMIN')) {
    return 'admin';
  }

  if (hasRole(roles, 'OWNER') && hasOwnerProfile === 1 && ownerRequestStatus === 'APPROVED') {
    return 'owner';
  }

  return hasOwnerProfile === 1 && ownerRequestStatus === 'APPROVED' ? 'owner' : 'user';
}
