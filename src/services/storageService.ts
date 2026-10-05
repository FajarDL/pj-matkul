import type { AppState } from '../types';

const STORAGE_KEY = 'ROTASI_PJ_ACADEMIC_DATA_V2';

export const storageService = {
  loadData(): AppState {
    try {
      // Clear legacy sample data key if present
      localStorage.removeItem('ROTASI_PJ_MATKUL_DATA_V1');

      const serialized = localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        return this.getDefaultData();
      }
      const parsed = JSON.parse(serialized);
      if (!parsed.courses || !parsed.students || !parsed.sessions) {
        return this.getDefaultData();
      }
      return {
        ...parsed,
        materials: Array.isArray(parsed.materials) ? parsed.materials : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      };
    } catch (error) {
      console.error('Failed to load data from localStorage:', error);
      return this.getDefaultData();
    }
  },

  saveData(data: AppState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save data to localStorage:', error);
    }
  },

  getDefaultData(): AppState {
    return {
      courses: [],
      students: [],
      sessions: [],
      materials: [],
      transactions: [],
      activeCourseId: null,
    };
  },

  clearAllData(): AppState {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('ROTASI_PJ_MATKUL_DATA_V1');
    return this.getDefaultData();
  },

  exportBackup(data: AppState): void {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute('download', `backup-si-rotasi-${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  importBackup(file: File): Promise<AppState> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.courses) && Array.isArray(parsed.students)) {
            parsed.materials = Array.isArray(parsed.materials) ? parsed.materials : [];
            parsed.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
            resolve(parsed as AppState);
          } else {
            reject(new Error('Format file cadangan data tidak valid.'));
          }
        } catch (err) {
          reject(new Error('Gagal membaca file JSON: ' + (err as Error).message));
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsText(file);
    });
  },
};
