import React, { useRef } from 'react';
import type { Course, UserRole } from '../types';
import { 
  CalendarDays, 
  Users, 
  BookOpen, 
  LayoutDashboard, 
  Download, 
  Upload, 
  RotateCcw, 
  GraduationCap,
  Lock,
  KeyRound,
  FolderOpen
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'schedule' | 'students' | 'courses' | 'materials';
  setActiveTab: (tab: 'dashboard' | 'schedule' | 'students' | 'courses' | 'materials') => void;
  courses?: Course[];
  activeCourseId?: string | null;
  userRole: UserRole;
  userName: string;
  pendingCount?: number;
  onSelectCourse?: (courseId: string) => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onReset: () => void;
  onOpenNewCourse?: () => void;
  onOpenLogin: () => void;
  onOpenSecurity: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  courses: _courses = [],
  activeCourseId: _activeCourseId,
  userRole,
  userName: _userName,
  pendingCount: _pendingCount = 0,
  onSelectCourse: _onSelectCourse,
  onBackup,
  onRestore,
  onReset,
  onOpenNewCourse: _onOpenNewCourse,
  onOpenLogin: _onOpenLogin,
  onOpenSecurity,
  onLogout,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = userRole === 'owner' || userRole === 'admin';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRestore(file);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs no-print">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Institutional Academic Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs shrink-0">
              <GraduationCap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-none">
                  SI-ROTASI
                </h1>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 tracking-wider">
                  AKADEMIK
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Sistem Manajemen Rotasi Penanggung Jawab Perkuliahan
              </p>
            </div>
          </div>

          {/* Right Controls: Role Badge & Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Kunci Akses Settings */}
            <button
              onClick={onOpenSecurity}
              title="Pengaturan Kunci Akses Aplikasi"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">Kunci Akses</span>
            </button>

            {/* Lock Application Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                title="Kunci Aplikasi Sekarang"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Kunci</span>
              </button>
            )}

            {/* Data Backup & Restore */}
            {isAdmin && (
              <div className="hidden lg:flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={onBackup}
                  title="Unduh Cadangan Data (JSON)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Pulihkan Data (JSON)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={onReset}
                  title="Reset Data ke Default"
                  className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-white rounded transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-t border-slate-200/80 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto py-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard Minggu Ini</span>
            </button>

            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Jadwal & Rotasi</span>
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Data Mahasiswa</span>
            </button>

            <button
              onClick={() => setActiveTab('courses')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'courses'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Mata Kuliah</span>
            </button>

            <button
              onClick={() => setActiveTab('materials')}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'materials'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Materi Kuliah</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
