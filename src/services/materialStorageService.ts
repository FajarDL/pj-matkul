import JSZip from 'jszip';
import type { CourseMaterial } from '../types';

const DB_NAME = 'SiRotasiMaterialDB_V1';
const STORE_NAME = 'materials_blobs';
const DB_VERSION = 1;

/**
 * Open or create IndexedDB instance for local offline material file storage
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung pada browser ini.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Gagal membuka database IndexedDB.'));
    };
  });
}

export const materialStorageService = {
  /**
   * Format byte size into human readable string (KB, MB, GB)
   */
  formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  },

  /**
   * Save a File or Blob to IndexedDB
   */
  async saveFileBlob(materialId: string, file: File | Blob): Promise<string> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(file, materialId);

      request.onsuccess = () => resolve(materialId);
      request.onerror = () => reject(request.error || new Error('Gagal menyimpan file ke IndexedDB.'));
    });
  },

  /**
   * Retrieve a Blob by materialId from IndexedDB
   */
  async getFileBlob(materialId: string): Promise<Blob | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(materialId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result instanceof Blob ? result : null);
      };
      request.onerror = () => reject(request.error || new Error('Gagal membaca file dari IndexedDB.'));
    });
  },

  /**
   * Delete a single Blob by materialId from IndexedDB
   */
  async deleteFileBlob(materialId: string): Promise<void> {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(materialId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('Gagal menghapus file dari IndexedDB.'));
      });
    } catch (err) {
      console.warn('Gagal menghapus file blob:', err);
    }
  },

  /**
   * Batch delete multiple Blobs
   */
  async deleteFilesByMaterialIds(materialIds: string[]): Promise<void> {
    if (materialIds.length === 0) return;
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        materialIds.forEach((id) => store.delete(id));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Gagal menghapus berkas.'));
      });
    } catch (err) {
      console.warn('Gagal menghapus batch blob:', err);
    }
  },

  /**
   * Download a single material file directly to the user's computer
   */
  async downloadMaterialFile(material: CourseMaterial): Promise<void> {
    if (material.type === 'link') {
      if (material.url) {
        window.open(material.url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const blob = await this.getFileBlob(material.id);
    if (!blob) {
      throw new Error(`Berkas untuk "${material.title}" tidak ditemukan di penyimpanan browser ini.`);
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = material.fileName || `${material.title}.${material.fileType || 'bin'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  },

  /**
   * Package multiple materials into a single ZIP file and trigger browser download
   */
  async downloadMaterialsAsZip(
    materials: CourseMaterial[],
    zipFileName: string = 'materi-kuliah.zip'
  ): Promise<{ successCount: number; linkCount: number }> {
    const zip = new JSZip();
    let successCount = 0;
    const linksList: string[] = [];

    for (const mat of materials) {
      if (mat.type === 'file') {
        try {
          const blob = await this.getFileBlob(mat.id);
          if (blob) {
            const fileName = mat.fileName || `${mat.title}.${mat.fileType || 'bin'}`;
            // Organize into session subfolder: Pertemuan [X]/[filename]
            const folderName = `Pertemuan ${mat.sessionNumber}`;
            zip.folder(folderName)?.file(fileName, blob);
            successCount++;
          }
        } catch (e) {
          console.warn(`Gagal menyertakan file ${mat.title} ke zip:`, e);
        }
      } else if (mat.type === 'link' && mat.url) {
        linksList.push(
          `[Pertemuan ${mat.sessionNumber}] ${mat.title} (${mat.category.toUpperCase()}):\n${mat.url}\nCatatan: ${mat.notes || '-'}\n`
        );
      }
    }

    // If there were link items, create a text file listing all cloud links
    if (linksList.length > 0) {
      const linksContent = `DAFTAR TAUTAN MATERI PERKULIAHAN\n================================\n\n${linksList.join('\n--------------------------------\n\n')}`;
      zip.file('DAFTAR_LINK_MATERI.txt', linksContent);
    }

    if (successCount === 0 && linksList.length === 0) {
      throw new Error('Tidak ada file atau tautan yang dapat dikemas ke dalam ZIP.');
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const objectUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);

    return { successCount, linkCount: linksList.length };
  },
};
