export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  name?: string;
  surname?: string | null;
  gender?: string | null;
  age?: number | null;
  phone?: string | null;
  role: string;
  ownerRequestStatus?: string | null;
  profileImageUrl?: string | null;
}

export const AUTH_STATE_CHANGE_EVENT = 'parkd-auth-changed';

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

export function hasStoredAuth(): boolean {
  return Boolean(readStoredToken() && readStoredAuthUser());
}

export function notifyAuthStateChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_STATE_CHANGE_EVENT));
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  notifyAuthStateChanged();
}
