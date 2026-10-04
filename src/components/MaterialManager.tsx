import React, { useState, useMemo, useRef } from 'react';
import type { Course, SessionSchedule, CourseMaterial, MaterialCategory, MaterialType } from '../types';
import { materialStorageService } from '../services/materialStorageService';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  ExternalLink, 
  Download, 
  Trash2, 
  Plus, 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Upload, 
  Link as LinkIcon, 
  X, 
  Layers, 
  File, 
  Video, 
  BookOpen, 
  Presentation, 
  Archive,
  CheckCircle2
} from 'lucide-react';

interface MaterialManagerProps {
  courses: Course[];
  sessions: SessionSchedule[];
  materials: CourseMaterial[];
  initialCourseId?: string | null;
  initialSessionNumber?: number | null;
  onAddMaterial: (material: CourseMaterial, file?: File) => Promise<void>;
  onDeleteMaterial: (materialId: string) => Promise<void>;
  onRequestToast?: (message: string) => void;
}

export const CATEGORY_LABELS: Record<MaterialCategory, { label: string; icon: string; bg: string; text: string; border: string }> = {
  slide: { label: 'Slide / Presentasi', icon: '📑', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  module: { label: 'Modul / Diktat', icon: '📘', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  assignment: { label: 'Tugas / Latihan', icon: '📝', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  recording: { label: 'Rekaman / Link', icon: '🎥', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  other: { label: 'Lainnya', icon: '📂', bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
};

export const MaterialManager: React.FC<MaterialManagerProps> = ({
  courses,
  sessions,
  materials,
  initialCourseId = null,
  initialSessionNumber = null,
  onAddMaterial,
  onDeleteMaterial,
  onRequestToast,
}) => {
  // Navigation State
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number | null>(initialSessionNumber);
  const [viewMode, setViewMode] = useState<'folder' | 'flat'>('folder');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MaterialCategory>('all');

  // Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modalTargetCourseId, setModalTargetCourseId] = useState<string>(initialCourseId || courses[0]?.id || '');
  const [modalTargetSessionNumber, setModalTargetSessionNumber] = useState<number>(initialSessionNumber || 1);
  const [uploadType, setUploadType] = useState<MaterialType>('file');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<MaterialCategory>('slide');
  const [formNotes, setFormNotes] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mappings
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const activeCourse = selectedCourseId ? courseMap.get(selectedCourseId) || null : null;

  // Group materials by courseId and sessionNumber
  const materialsByCourse = useMemo(() => {
    const map = new Map<string, CourseMaterial[]>();
    materials.forEach((m) => {
      const list = map.get(m.courseId) || [];
      list.push(m);
      map.set(m.courseId, list);
    });
    return map;
  }, [materials]);

  // Current course sessions
  const currentCourseSessions = useMemo(() => {
    if (!selectedCourseId) return [];
    const course = courseMap.get(selectedCourseId);
    const total = course?.totalSessions || 16;
    const courseSessions = sessions.filter((s) => s.courseId === selectedCourseId);

    // Build list of 1 to total sessions
    const result: Array<{ sessionNumber: number; topic: string; date?: string; sessionObj?: SessionSchedule }> = [];
    for (let i = 1; i <= total; i++) {
      const match = courseSessions.find((s) => s.sessionNumber === i);
      let defaultTopic = `Pertemuan ${i}`;
      if (i === 8) defaultTopic = 'Ujian Tengah Semester (UTS)';
      if (i === total) defaultTopic = 'Ujian Akhir Semester (UAS)';

      result.push({
        sessionNumber: i,
        topic: match?.topic || defaultTopic,
        date: match?.date,
        sessionObj: match,
      });
    }
    return result;
  }, [selectedCourseId, sessions, courseMap]);

  // Materials for active selection
  const activeMaterials = useMemo(() => {
    if (!selectedCourseId) return materials;
    const courseMats = materialsByCourse.get(selectedCourseId) || [];
    if (selectedSessionNumber !== null) {
      return courseMats.filter((m) => m.sessionNumber === selectedSessionNumber);
    }
    return courseMats;
  }, [selectedCourseId, selectedSessionNumber, materialsByCourse, materials]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return activeMaterials.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = m.title.toLowerCase().includes(q);
        const matchFileName = (m.fileName || '').toLowerCase().includes(q);
        const matchNotes = (m.notes || '').toLowerCase().includes(q);
        return matchTitle || matchFileName || matchNotes;
      }
      return true;
    });
  }, [activeMaterials, categoryFilter, searchQuery]);

  // Total stats for header
  const totalFilesCount = materials.filter((m) => m.type === 'file').length;
  const totalLinksCount = materials.filter((m) => m.type === 'link').length;
  const totalSizeBytes = materials.reduce((acc, m) => acc + (m.fileSize || 0), 0);

  // Open upload modal with prefilled course & session
  const openUploadModal = (courseId?: string, sessionNum?: number) => {
    setModalTargetCourseId(courseId || selectedCourseId || courses[0]?.id || '');
    setModalTargetSessionNumber(sessionNum || selectedSessionNumber || 1);
    setFormTitle('');
    setFormNotes('');
    setFormUrl('');
    setSelectedFile(null);
    setFormCategory('slide');
    setUploadType('file');
    setIsUploadModalOpen(true);
  };

  // Handle file input change
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!formTitle.trim()) {
        // Auto-fill title from file name without extension
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        setFormTitle(cleanName);
      }
    }
  };

  // Submit new material
  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Judul materi wajib diisi.');
      return;
    }

    if (uploadType === 'file' && !selectedFile) {
      alert('Pilih file yang ingin diunggah.');
      return;
    }

    if (uploadType === 'link' && !formUrl.trim()) {
      alert('Masukkan alamat tautan (URL) materi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const materialId = `mat-${modalTargetCourseId}-${modalTargetSessionNumber}-${Date.now()}`;
      const ext = selectedFile?.name.split('.').pop()?.toLowerCase();

      const newMaterial: CourseMaterial = {
        id: materialId,
        courseId: modalTargetCourseId,
        sessionNumber: Number(modalTargetSessionNumber),
        title: formTitle.trim(),
        type: uploadType,
        category: formCategory,
        fileName: selectedFile?.name,
        fileSize: selectedFile?.size,
        fileType: ext,
        fileBlobId: uploadType === 'file' ? materialId : undefined,
        url: uploadType === 'link' ? formUrl.trim() : undefined,
        notes: formNotes.trim() || undefined,
        uploadedAt: new Date().toISOString(),
      };

      await onAddMaterial(newMaterial, selectedFile || undefined);
      setIsUploadModalOpen(false);
      onRequestToast?.(`Materi "${newMaterial.title}" berhasil disimpan!`);
    } catch (err) {
      alert('Gagal menyimpan materi: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download single material
  const handleDownload = async (mat: CourseMaterial) => {
    try {
      await materialStorageService.downloadMaterialFile(mat);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Delete material
  const handleDelete = async (mat: CourseMaterial) => {
    if (confirm(`Hapus materi "${mat.title}"? Berkas ini akan dihapus dari penyimpanan.`)) {
      try {
        await onDeleteMaterial(mat.id);
        onRequestToast?.(`Materi "${mat.title}" berhasil dihapus.`);
      } catch (err) {
        alert('Gagal menghapus: ' + (err as Error).message);
      }
    }
  };

  // Download ZIP bundle
  const handleDownloadZip = async (mats: CourseMaterial[], zipTitle: string) => {
    if (mats.length === 0) {
      alert('Belum ada materi untuk diunduh.');
      return;
    }
    setIsZipping(true);
    try {
      const result = await materialStorageService.downloadMaterialsAsZip(mats, `${zipTitle}.zip`);
      onRequestToast?.(`ZIP berhasil diunduh (${result.successCount} file berkas, ${result.linkCount} tautan)!`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsZipping(false);
    }
  };

  // Helper to render file icon by type/extension
  const renderMaterialIcon = (mat: CourseMaterial) => {
    if (mat.type === 'link') {
      return <ExternalLink className="w-5 h-5 text-indigo-500" />;
    }
    const ft = (mat.fileType || '').toLowerCase();
    if (['ppt', 'pptx'].includes(ft)) return <Presentation className="w-5 h-5 text-amber-600" />;
    if (['pdf'].includes(ft)) return <FileText className="w-5 h-5 text-rose-600" />;
    if (['doc', 'docx'].includes(ft)) return <BookOpen className="w-5 h-5 text-blue-600" />;
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ft)) return <Video className="w-5 h-5 text-purple-600" />;
    if (['zip', 'rar', '7z'].includes(ft)) return <Archive className="w-5 h-5 text-amber-700" />;
    return <File className="w-5 h-5 text-slate-600" />;
  };

  // Render Materials List Component
  const renderMaterialsList = (mats: CourseMaterial[], showSessionBadge = false) => {
    if (mats.length === 0) {
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h5 className="text-sm font-bold text-slate-900">Belum Ada Materi</h5>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Belum ada file atau tautan materi yang ditambahkan. Klik tombol di bawah untuk mengunggah materi pertama.
          </p>
          <button
            onClick={() => openUploadModal(activeCourse?.id, selectedSessionNumber || 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Unggah Materi Sekarang</span>
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {mats.map((mat) => {
          const catInfo = CATEGORY_LABELS[mat.category] || CATEGORY_LABELS.other;

          return (
            <div
              key={mat.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition flex flex-col justify-between gap-3 shadow-2xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      {renderMaterialIcon(mat)}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1">
                        {mat.title}
                      </h5>
                      {mat.fileName && (
                        <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                          {mat.fileName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Icon: Delete */}
                  <button
                    onClick={() => handleDelete(mat)}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                    title="Hapus materi ini"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Metadata tags */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {showSessionBadge && (
                    <span className="font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md">
                      Pertemuan {mat.sessionNumber}
                    </span>
                  )}

                  <span className={`font-semibold px-2 py-0.5 rounded-md border ${catInfo.bg} ${catInfo.text} ${catInfo.border}`}>
                    {catInfo.icon} {catInfo.label}
                  </span>

                  {mat.fileSize && (
                    <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {materialStorageService.formatFileSize(mat.fileSize)}
                    </span>
                  )}

                  {mat.type === 'link' && (
                    <span className="font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                      Tautan Cloud
                    </span>
                  )}
                </div>

                {mat.notes && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 leading-relaxed">
                    {mat.notes}
                  </p>
                )}
              </div>

              {/* Bottom Action Button */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {new Date(mat.uploadedAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>

                {mat.type === 'file' ? (
                  <button
                    onClick={() => handleDownload(mat)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Berkas</span>
                  </button>
                ) : (
                  <a
                    href={mat.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Tautan</span>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Repository Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded border border-indigo-400/30">
                REPOSITORY AKADEMIK
              </span>
              <span className="text-xs text-slate-400">
                Penyimpanan Berkas & Modul Perkuliahan
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <FolderOpen className="w-7 h-7 text-indigo-400" />
              <span>Arsip & Folder Materi Perkuliahan</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Kumpulan materi perkuliahan (slide PPT, modul diktat, tugas, rekaman zoom) yang terorganisir rapi per pertemuan dan per mata kuliah. Disimpan offline di browser atau ditautkan ke cloud.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => openUploadModal()}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Unggah / Tambah Materi</span>
            </button>
            {materials.length > 0 && (
              <button
                disabled={isZipping}
                onClick={() => handleDownloadZip(materials, 'seluruh-materi-perkuliahan')}
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm border border-slate-700 transition cursor-pointer shadow-xs disabled:opacity-50"
                title="Unduh seluruh materi semua mata kuliah menjadi satu berkas ZIP"
              >
                <Archive className="w-4 h-4 text-amber-400" />
                <span>{isZipping ? 'Mengemas ZIP...' : 'Unduh Semua (ZIP)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Total Berkas Offline</span>
            <span className="text-base font-bold text-white mt-0.5 block">{totalFilesCount} File</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Tautan Cloud & Link</span>
            <span className="text-base font-bold text-indigo-300 mt-0.5 block">{totalLinksCount} Tautan</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Kapasitas Terpakai</span>
            <span className="text-base font-bold text-emerald-400 mt-0.5 block">
              {materialStorageService.formatFileSize(totalSizeBytes)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Mata Kuliah Terdaftar</span>
            <span className="text-base font-bold text-white mt-0.5 block">{courses.length} Matkul</span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 flex-wrap">
          <button
            onClick={() => {
              setSelectedCourseId(null);
              setSelectedSessionNumber(null);
            }}
            className={`hover:text-indigo-600 transition flex items-center gap-1.5 cursor-pointer ${
              !selectedCourseId ? 'text-indigo-600 font-bold' : ''
            }`}
          >
            <Folder className="w-4 h-4 text-indigo-500" />
            <span>Semua Mata Kuliah</span>
          </button>

          {activeCourse && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              <button
                onClick={() => setSelectedSessionNumber(null)}
                className={`hover:text-indigo-600 transition truncate max-w-xs cursor-pointer ${
                  selectedCourseId && selectedSessionNumber === null ? 'text-indigo-600 font-bold' : ''
                }`}
              >
                {activeCourse.name}
              </button>
            </>
          )}

          {selectedSessionNumber !== null && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-indigo-900 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                Pertemuan {selectedSessionNumber}
              </span>
            </>
          )}
        </div>

        {/* View mode toggle (only when course is selected) */}
        {selectedCourseId && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold gap-1">
              <button
                onClick={() => {
                  setViewMode('folder');
                  setSelectedSessionNumber(null);
                }}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'folder' && selectedSessionNumber === null
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span>Folder Pertemuan</span>
              </button>

              <button
                onClick={() => {
                  setViewMode('flat');
                  setSelectedSessionNumber(null);
                }}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'flat'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Semua Materi ({activeMaterials.length})</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LEVEL 1: ALL COURSE FOLDERS VIEW */}
      {!selectedCourseId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              <span>Daftar Folder Mata Kuliah</span>
            </h3>
            <span className="text-xs text-slate-500">
              Pilih mata kuliah untuk melihat folder pertemuan
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 text-sm">
              Belum ada mata kuliah yang terdaftar. Tambahkan mata kuliah terlebih dahulu di menu "Mata Kuliah".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => {
                const courseMats = materialsByCourse.get(course.id) || [];
                const courseFilesCount = courseMats.filter((m) => m.type === 'file').length;
                const courseLinksCount = courseMats.filter((m) => m.type === 'link').length;
                const courseSize = courseMats.reduce((acc, m) => acc + (m.fileSize || 0), 0);

                return (
                  <div
                    key={course.id}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setSelectedSessionNumber(null);
                      setViewMode('folder');
                    }}
                    className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between group space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center group-hover:scale-105 transition shrink-0">
                          <Folder className="w-6 h-6 fill-amber-400 text-amber-600" />
                        </div>
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                          {course.code}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition leading-snug line-clamp-1">
                          {course.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <span>{course.lecturer}</span>
                          <span>&bull;</span>
                          <span>{course.day}</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex flex-col text-left">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span>{courseMats.length} Materi</span>
                          <span>&bull;</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            {materialStorageService.formatFileSize(courseSize)}
                          </span>
                        </div>
                        {courseMats.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            {courseFilesCount} berkas, {courseLinksCount} tautan
                          </span>
                        )}
                      </div>

                      <span className="text-indigo-600 font-semibold group-hover:translate-x-1 transition flex items-center gap-1 text-[11px]">
                        <span>Buka Folder</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 2 & 3: COURSE LEVEL (Folders per Session or Flat View) */}
      {selectedCourseId && activeCourse && (
        <div className="space-y-5">
          
          {/* Active Course Card Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                    {activeCourse.code}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">
                    {activeCourse.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2.5">
                  <span>Dosen: <strong>{activeCourse.lecturer}</strong></span>
                  <span>&bull;</span>
                  <span>Jadwal: {activeCourse.day}, {activeCourse.startTime} - {activeCourse.endTime} (R.{activeCourse.room})</span>
                  <span>&bull;</span>
                  <span>Total {activeCourse.totalSessions} Pertemuan</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={isZipping || activeMaterials.length === 0}
                onClick={() => handleDownloadZip(activeMaterials, `materi-${activeCourse.code.toLowerCase()}`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer disabled:opacity-40"
                title="Unduh seluruh materi mata kuliah ini dalam 1 ZIP"
              >
                <Archive className="w-3.5 h-3.5 text-amber-600" />
                <span>{isZipping ? 'Mengemas...' : 'Unduh ZIP Matkul'}</span>
              </button>

              <button
                onClick={() => openUploadModal(activeCourse.id, selectedSessionNumber || 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Materi</span>
              </button>
            </div>
          </div>

          {/* SUB-VIEW 2A: FOLDER PER PERTEMUAN (Grid of 16 Session Folders) */}
          {viewMode === 'folder' && selectedSessionNumber === null && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span>Folder Berkas Berdasarkan Pertemuan (1 s/d {activeCourse.totalSessions})</span>
                </h4>
                <span className="text-xs text-slate-500">
                  Klik pada folder pertemuan untuk membuka materi
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {currentCourseSessions.map((sess) => {
                  const sessMats = materials.filter(
                    (m) => m.courseId === activeCourse.id && m.sessionNumber === sess.sessionNumber
                  );
                  const isMidterm = sess.sessionNumber === 8;
                  const isFinal = sess.sessionNumber === activeCourse.totalSessions;

                  return (
                    <div
                      key={sess.sessionNumber}
                      onClick={() => setSelectedSessionNumber(sess.sessionNumber)}
                      className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-3 group ${
                        sessMats.length > 0
                          ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-sm'
                          : 'bg-slate-50/70 border-dashed border-slate-300 hover:border-slate-400 hover:bg-white'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            sessMats.length > 0
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Folder className={`w-5 h-5 ${sessMats.length > 0 ? 'fill-amber-400 text-amber-600' : ''}`} />
                          </div>
                          
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isMidterm || isFinal
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isMidterm ? 'UTS' : isFinal ? 'UAS' : `P-${sess.sessionNumber}`}
                          </span>
                        </div>

                        <div>
                          <h5 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition leading-snug line-clamp-1">
                            Pertemuan {sess.sessionNumber}
                          </h5>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {sess.topic}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${sessMats.length > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                          {sessMats.length > 0 ? `${sessMats.length} Materi` : 'Kosong'}
                        </span>
                        <span className="text-slate-400 group-hover:text-indigo-600 transition font-bold">
                          Buka &rarr;
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUB-VIEW 2B: INSIDE A SPECIFIC SESSION FOLDER */}
          {viewMode === 'folder' && selectedSessionNumber !== null && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSessionNumber(null)}
                    className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer shrink-0"
                    title="Kembali ke semua pertemuan"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div>
                    <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>Pertemuan {selectedSessionNumber}</span>
                      <span className="text-xs font-normal text-slate-500">
                        ({currentCourseSessions.find((s) => s.sessionNumber === selectedSessionNumber)?.topic})
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600">
                      {filteredMaterials.length} materi tersimpan untuk sesi perkuliahan ini
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {filteredMaterials.length > 0 && (
                    <button
                      disabled={isZipping}
                      onClick={() =>
                        handleDownloadZip(
                          filteredMaterials,
                          `materi-${activeCourse.code.toLowerCase()}-pertemuan-${selectedSessionNumber}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer"
                      title="Unduh seluruh materi pada pertemuan ini sebagai ZIP"
                    >
                      <Archive className="w-3.5 h-3.5 text-amber-600" />
                      <span>Unduh ZIP</span>
                    </button>
                  )}

                  <button
                    onClick={() => openUploadModal(activeCourse.id, selectedSessionNumber)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Unggah Materi</span>
                  </button>
                </div>
              </div>

              {/* Material Items List */}
              {renderMaterialsList(filteredMaterials)}
            </div>
          )}

          {/* SUB-VIEW 2C: FLAT VIEW (ALL MATERIALS IN COURSE) */}
          {viewMode === 'flat' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari materi atau nama file..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>

                {/* Category filter pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Semua ({activeMaterials.length})
                  </button>
                  {(Object.keys(CATEGORY_LABELS) as MaterialCategory[]).map((cat) => {
                    const count = activeMaterials.filter((m) => m.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap ${
                          categoryFilter === cat
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {CATEGORY_LABELS[cat].icon} {CATEGORY_LABELS[cat].label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {renderMaterialsList(filteredMaterials, true)}
            </div>
          )}

        </div>
      )}

      {/* UPLOAD / ADD MATERIAL MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs text-left no-print">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 leading-snug">
                    Unggah / Tambah Materi Perkuliahan
                  </h4>
                  <p className="text-xs text-slate-500">
                    Simpan berkas offline atau tautan Google Drive / Cloud
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitMaterial} className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              
              {/* Target Course & Session Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Mata Kuliah:
                  </label>
                  <select
                    value={modalTargetCourseId}
                    onChange={(e) => setModalTargetCourseId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Pertemuan Ke:
                  </label>
                  <select
                    value={modalTargetSessionNumber}
                    onChange={(e) => setModalTargetSessionNumber(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  >
                    {Array.from({ length: courseMap.get(modalTargetCourseId)?.totalSessions || 16 }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>
                        Pertemuan {num} {num === 8 ? '(UTS)' : num === (courseMap.get(modalTargetCourseId)?.totalSessions || 16) ? '(UAS)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Upload Type Switcher */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Jenis Materi:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl font-semibold">
                  <button
                    type="button"
                    onClick={() => setUploadType('file')}
                    className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                      uploadType === 'file'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>Upload File Fisik</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadType('link')}
                    className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                      uploadType === 'link'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4 text-purple-600" />
                    <span>Tautan Link Cloud</span>
                  </button>
                </div>
              </div>

              {/* File Input Zone */}
              {uploadType === 'file' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Pilih File (PDF, PPT, DOC, Gambar, ZIP, dll):
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition space-y-1.5"
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                      <Upload className="w-4 h-4" />
                    </div>
                    {selectedFile ? (
                      <div>
                        <span className="font-bold text-slate-900 block truncate max-w-xs mx-auto">
                          {selectedFile.name}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-mono">
                          {materialStorageService.formatFileSize(selectedFile.size)} &bull; Siap diunggah
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-semibold text-slate-800 block">
                          Klik untuk memilih berkas dari komputer
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Disimpan offline aman di browser melalui IndexedDB
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link Input Zone */}
              {uploadType === 'link' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Alamat Tautan / URL (Google Drive, Dropbox, YouTube, dll):
                  </label>
                  <div className="relative">
                    <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      placeholder="https://drive.google.com/..."
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Title Input */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Judul Materi:
                </label>
                <input
                  type="text"
                  placeholder="Misal: Slide Bab 1 - Pengenalan Basis Data"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
              </div>

              {/* Category Picker */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Kategori Materi:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(CATEGORY_LABELS) as MaterialCategory[]).map((cat) => {
                    const info = CATEGORY_LABELS[cat];
                    const isSelected = formCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold ring-2 ring-indigo-500'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span className="text-sm">{info.icon}</span>
                        <span className="truncate">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Catatan Tambahan (Opsional):
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan dari dosen, instruksi tugas, atau password berkas..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Menyimpan...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Materi</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
