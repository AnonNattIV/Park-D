export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  role: string;
  ownerRequestStatus?: string | null;
}

export function readStoredAuthUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('auth_user');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch (error) {
    console.error('Invalid stored auth_user payload:', error);
    return null;
  }
}

export function readStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem('auth_token');
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}
