const AUTH_STORAGE_KEY = 'nova_auth';
const LAST_ROUTE_KEY = 'nova_last_route';

interface AuthState {
  isAuthenticated: boolean;
  userEmail: string;
  isAdmin: boolean;
  loginTimestamp: number;
}

export function saveAuthState(email: string, isAdmin: boolean): void {
  const state: AuthState = {
    isAuthenticated: true,
    userEmail: email.toLowerCase().trim(),
    isAdmin,
    loginTimestamp: Date.now()
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  sessionStorage.setItem("userEmail", state.userEmail);
  sessionStorage.setItem("isAdmin", isAdmin ? "true" : "false");
  sessionStorage.setItem("isAuthenticated", "true");
}

export function getAuthState(): AuthState | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    
    const state: AuthState = JSON.parse(stored);
    if (!state.isAuthenticated || !state.userEmail) return null;
    
    return state;
  } catch {
    return null;
  }
}

export function restoreSessionFromLocalStorage(): boolean {
  const state = getAuthState();
  if (!state) return false;
  
  sessionStorage.setItem("userEmail", state.userEmail);
  sessionStorage.setItem("isAdmin", state.isAdmin ? "true" : "false");
  sessionStorage.setItem("isAuthenticated", "true");
  return true;
}

export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem("userEmail");
  sessionStorage.removeItem("isAdmin");
  sessionStorage.removeItem("isAuthenticated");
}

export function isAuthenticated(): boolean {
  if (sessionStorage.getItem("isAuthenticated") === "true") {
    return true;
  }
  return restoreSessionFromLocalStorage();
}

export function saveLastRoute(route: string): void {
  if (route && route !== '/login' && route !== '/signup' && route !== '/forgot-password' && route !== '/reset-password') {
    localStorage.setItem(LAST_ROUTE_KEY, route);
  }
}

export function getLastRoute(): string | null {
  return localStorage.getItem(LAST_ROUTE_KEY);
}

export function clearLastRoute(): void {
  localStorage.removeItem(LAST_ROUTE_KEY);
}
