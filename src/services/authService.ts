import type { AuthSession } from '../types';

const ACCESS_KEY_STORAGE = 'ROTASI_PJ_ACCESS_KEY';
const UNLOCKED_SESSION_KEY = 'ROTASI_PJ_SESSION_UNLOCKED';
const REMEMBER_KEY = 'ROTASI_PJ_REMEMBER_UNLOCKED';

export const authService = {
  // Check if an access key has been configured in localStorage
  isConfigured(): boolean {
    return !!this.getAccessKey();
  },

  // Get current access key from localStorage
  getAccessKey(): string | null {
    try {
      return localStorage.getItem(ACCESS_KEY_STORAGE);
    } catch {
      return null;
    }
  },

  // Save or update the access key in localStorage
  setAccessKey(key: string): { success: boolean; message: string } {
    if (!key || key.trim().length === 0) {
      return { success: false, message: 'Kunci akses tidak boleh kosong.' };
    }
    const cleanKey = key.trim();
    localStorage.setItem(ACCESS_KEY_STORAGE, cleanKey);
    // Automatically mark as unlocked upon setting key
    this.setUnlocked(true, true);
    return { success: true, message: 'Kunci akses berhasil disimpan!' };
  },

  // Check if current session/device is unlocked
  isUnlocked(): boolean {
    try {
      // 1. Check if remember token is active in localStorage
      if (localStorage.getItem(REMEMBER_KEY) === 'true') {
        return true;
      }
      // 2. Check current tab session
      return sessionStorage.getItem(UNLOCKED_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  },

  // For compatibility with existing components
  isInitialized(): boolean {
    return this.isConfigured();
  },

  // Unlock with input key
  unlock(
    inputKey: string,
    remember: boolean = false
  ): { success: boolean; message: string; session?: AuthSession } {
    const cleanInput = inputKey.trim();
    const storedKey = this.getAccessKey();
    const envMasterKey = import.meta.env.VITE_MASTER_KEY;

    if (!storedKey) {
      // If no key configured yet, set this input as the new access key!
      this.setAccessKey(cleanInput);
      return {
        success: true,
        message: 'Kunci akses baru berhasil dibuat!',
        session: this.getSession(),
      };
    }

    const isValid =
      cleanInput === storedKey ||
      (envMasterKey && cleanInput === envMasterKey);

    if (!isValid) {
      return { success: false, message: 'Kunci akses salah. Silakan coba lagi.' };
    }

    this.setUnlocked(true, remember);
    return {
      success: true,
      message: 'Kunci akses cocok! Membuka halaman utama...',
      session: this.getSession(),
    };
  },

  unlockAsGuest(): { success: boolean; session: AuthSession } {
    return {
      success: true,
      session: {
        isAuthenticated: true,
        isUnlocked: false,
        role: 'student',
        username: 'guest',
        name: 'Mahasiswa (Mode Baca)',
      },
    };
  },

  setUnlocked(unlocked: boolean, remember: boolean = false): void {
    if (unlocked) {
      sessionStorage.setItem(UNLOCKED_SESSION_KEY, 'true');
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, 'true');
      }
    } else {
      sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    }
  },

  // Lock the application (returns to key gate)
  lock(): void {
    this.setUnlocked(false);
  },

  logout(): void {
    this.lock();
  },

  // Reset the access key and unlocked state completely
  resetKey(): void {
    localStorage.removeItem(ACCESS_KEY_STORAGE);
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
    // Also remove old legacy keys to prevent lingering state
    localStorage.removeItem('ROTASI_PJ_USERS_DATA_V2');
    localStorage.removeItem('ROTASI_PJ_SECURITY_CONFIG_V2');
    localStorage.removeItem('ROTASI_PJ_AUTH_SESSION_V2');
  },

  resetAllAuthAndSecurity(): void {
    this.resetKey();
  },

  // Return standard session object
  getSession(): AuthSession {
    const unlocked = this.isUnlocked();
    return {
      isAuthenticated: unlocked,
      isUnlocked: unlocked,
      role: 'owner', // Once unlocked with passkey, full owner/admin access
      username: 'admin',
      name: 'Pengelola Kelas',
    };
  },

  getCurrentSession(): AuthSession {
    return this.getSession();
  },

  // Stub for compatibility with existing UI if referenced
  getPendingCount(): number {
    return 0;
  },
};
