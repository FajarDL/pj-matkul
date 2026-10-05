import React, { useState, useMemo } from 'react';
import type { Student, SessionSchedule, UserRole, Course } from '../types';
import { 
  calculateStudentDutyDetails, 
  type StudentDutyDetail 
} from '../services/rotationAlgorithm';
import { parseStudentList } from '../services/scheduleParser';
import { 
  UserPlus, 
  Search, 
  Trash2, 
  Edit2, 
  X, 
  Phone, 
  ClipboardList,
  Lock,
  Eye,
  BookOpen,
  Filter,
  ArrowUpDown,
  UserCheck,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface StudentManagerProps {
  students: Student[];
  sessions: SessionSchedule[];
  courses?: Course[];
  activeCourseId: string | null;
  userRole: UserRole;
  onUpdateStudents: (students: Student[]) => void;
  onDeleteAllStudents?: () => void;
  onRequestLogin?: () => void;
  onNavigateToSchedule?: (courseId?: string) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
  sessions,
  courses = [],
  activeCourseId,
  userRole,
  onUpdateStudents,
  onDeleteAllStudents,
  onRequestLogin,
  onNavigateToSchedule,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>(activeCourseId || 'all');
  const [dutyStatusFilter, setDutyStatusFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [sortBy, setSortBy] = useState<'nim' | 'name' | 'duty_asc' | 'duty_desc'>('nim');
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<StudentDutyDetail | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Single add form
  const [formData, setFormData] = useState({
    nim: '',
    name: '',
    phone: '',
  });

  // Bulk paste text
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Omit<Student, 'id' | 'isActive'>[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);

  // Detailed duty calculations per student
  const dutyDetailsMap = useMemo(() => {
    return calculateStudentDutyDetails(students, sessions, courses);
  }, [students, sessions, courses]);

  // Active students & class statistics
  const activeStudents = useMemo(() => students.filter((s) => s.isActive), [students]);

  const classDutyStats = useMemo(() => {
    let totalAssigned = 0;
    let studentsWithDuty = 0;
    let studentsWithoutDuty = 0;

    activeStudents.forEach((st) => {
      const detail = dutyDetailsMap.get(st.id);
      const count = detail?.totalAssigned || 0;
      totalAssigned += count;
      if (count > 0) {
        studentsWithDuty++;
      } else {
        studentsWithoutDuty++;
      }
    });

    const avgDuty = activeStudents.length > 0 ? (totalAssigned / activeStudents.length).toFixed(1) : '0';

    return {
      totalAssigned,
      studentsWithDuty,
      studentsWithoutDuty,
      avgDuty,
    };
  }, [activeStudents, dutyDetailsMap]);

  // Filtered & Sorted Students
  const filteredAndSortedStudents = useMemo(() => {
    return students
      .filter((student) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = student.name.toLowerCase().includes(q);
          const matchNim = student.nim.toLowerCase().includes(q);
          if (!matchName && !matchNim) return false;
        }

        const detail = dutyDetailsMap.get(student.id);
        const totalDuty = detail?.totalAssigned || 0;

        // Duty status filter
        if (dutyStatusFilter === 'unassigned' && totalDuty > 0) return false;
        if (dutyStatusFilter === 'assigned' && totalDuty === 0) return false;

        // Course filter
        if (courseFilter !== 'all') {
          const hasCourse = detail?.courses.some((c) => c.courseId === courseFilter);
          if (!hasCourse) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aDetail = dutyDetailsMap.get(a.id);
        const bDetail = dutyDetailsMap.get(b.id);
        const aCount = aDetail?.totalAssigned || 0;
        const bCount = bDetail?.totalAssigned || 0;

        if (sortBy === 'duty_asc') {
          if (aCount !== bCount) return aCount - bCount;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'duty_desc') {
          if (aCount !== bCount) return bCount - aCount;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        // Default NIM
        if (a.nim && b.nim) {
          return a.nim.localeCompare(b.nim, undefined, { numeric: true });
        }
        return a.name.localeCompare(b.name);
      });
  }, [students, searchQuery, courseFilter, dutyStatusFilter, sortBy, dutyDetailsMap]);

  // Handle single student submit
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!formData.name.trim() || !formData.nim.trim()) return;

    const newStudent: Student = {
      id: `std-${Date.now()}`,
      nim: formData.nim.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim() || undefined,
      isActive: true,
    };

    onUpdateStudents([...students, newStudent]);
    setFormData({ nim: '', name: '', phone: '' });
    setIsAddModalOpen(false);
  };

  // Handle edit student save
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!editingStudent) return;

    const updated = students.map((s) => (s.id === editingStudent.id ? editingStudent : s));
    onUpdateStudents(updated);
    setEditingStudent(null);
  };

  // Delete student
  const handleDeleteStudent = (id: string, name: string) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (confirm(`Hapus "${name}" dari daftar mahasiswa kelas?`)) {
      onUpdateStudents(students.filter((s) => s.id !== id));
    }
  };

  // Parse bulk text from WhatsApp/Excel/Pipe
  const handleParseBulk = (text: string) => {
    setBulkText(text);
    const result = parseStudentList(text);
    setBulkPreview(result.students);
    setDuplicateCount(result.duplicateCount);
  };

  // Confirm bulk import
  const handleConfirmBulk = () => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (bulkPreview.length === 0) return;

    const newEntries: Student[] = bulkPreview.map((item, idx) => ({
      id: `std-${Date.now()}-${idx}`,
      nim: item.nim,
      name: item.name,
      phone: item.phone,
      isActive: true,
    }));

    onUpdateStudents([...students, ...newEntries]);
    setBulkText('');
    setBulkPreview([]);
    setIsBulkModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Daftar Mahasiswa Kelas</span>
            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
              {students.length} Mahasiswa
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Data nomor induk mahasiswa (NIM), nama lengkap, dan kontak untuk pembagian giliran tugas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200 transition cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-slate-600" />
                <span>Bulk Import / Tempel</span>
              </button>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Tambah Mahasiswa</span>
              </button>

              {students.length > 0 && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Apakah Anda yakin ingin menghapus SELURUH mahasiswa (${students.length} mahasiswa)?\n\nDaftar mata kuliah dan jadwal akan tetap aman, namun seluruh penugasan PJ pada jadwal akan dikosongkan.`
                      )
                    ) {
                      onDeleteAllStudents?.();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm px-3 py-2 rounded-xl border border-rose-200 transition cursor-pointer"
                  title="Hapus seluruh data mahasiswa"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span className="hidden sm:inline">Hapus Semua Mahasiswa</span>
                  <span className="sm:hidden">Hapus Semua</span>
                </button>
              )}
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs px-3 py-1.5 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Mode Hanya Baca (Mahasiswa)</span>
            </div>
          )}
        </div>
      </div>

      {/* 3 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Rata-rata Beban Tugas
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
              {classDutyStats.avgDuty}x <span className="text-xs font-semibold text-slate-500 font-normal">/ mhs</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Total {classDutyStats.totalAssigned} penugasan kelas semester ini
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDutyStatusFilter(dutyStatusFilter === 'assigned' ? 'all' : 'assigned')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3.5 shadow-2xs ${
            dutyStatusFilter === 'assigned'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span>Sudah Bertugas</span>
              {dutyStatusFilter === 'assigned' && (
                <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
                  Aktif
                </span>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-900 mt-0.5">
              {classDutyStats.studentsWithDuty}{' '}
              <span className="text-xs font-semibold text-slate-500 font-normal">
                / {activeStudents.length} Mhs
              </span>
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
              {activeStudents.length > 0 ? Math.round((classDutyStats.studentsWithDuty / activeStudents.length) * 100) : 0}% telah dapat giliran
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDutyStatusFilter(dutyStatusFilter === 'unassigned' ? 'all' : 'unassigned')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3.5 shadow-2xs ${
            dutyStatusFilter === 'unassigned'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span>Belum Bertugas (0x)</span>
              {dutyStatusFilter === 'unassigned' && (
                <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.2 rounded font-bold">
                  Aktif
                </span>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-900 mt-0.5">
              {classDutyStats.studentsWithoutDuty}{' '}
              <span className="text-xs font-semibold text-slate-500 font-normal">Mahasiswa</span>
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-0.5">
              Prioritas giliran rotasi berikutnya
            </div>
          </div>
        </button>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama atau NIM mahasiswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters & Sorting */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Course */}
            {courses && courses.length > 0 && (
              <div className="relative flex items-center">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
                >
                  <option value="all">Semua Mata Kuliah ({courses.length})</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter by Duty Status */}
            <div className="relative flex items-center">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={dutyStatusFilter}
                onChange={(e) => setDutyStatusFilter(e.target.value as any)}
                className="pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                <option value="all">Semua Status Tugas</option>
                <option value="unassigned">⚠️ Belum Bertugas (0x)</option>
                <option value="assigned">✓ Sudah Bertugas (≥ 1x)</option>
              </select>
            </div>

            {/* Sort By */}
            <div className="relative flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                <option value="nim">Urut NIM / No Absen</option>
                <option value="name">Urut Nama (A - Z)</option>
                <option value="duty_asc">Tugas Tersedikit (Prioritas)</option>
                <option value="duty_desc">Tugas Terbanyak</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filters Reset Indicator */}
        {(searchQuery || courseFilter !== 'all' || dutyStatusFilter !== 'all' || sortBy !== 'nim') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Menampilkan <strong>{filteredAndSortedStudents.length}</strong> dari {students.length} mahasiswa
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCourseFilter('all');
                setDutyStatusFilter('all');
                setSortBy('nim');
              }}
              className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              Reset Filter & Urutan
            </button>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4 w-32">NIM</th>
                <th className="py-3 px-4 min-w-[160px]">Nama Mahasiswa</th>
                <th className="py-3 px-4 w-36">Kontak WA</th>
                <th className="py-3 px-4 w-44">Total Tugas</th>
                <th className="py-3 px-4 min-w-[220px]">Mata Kuliah Yang Dipegang</th>
                <th className="py-3 px-4 w-32 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedStudents.length > 0 ? (
                filteredAndSortedStudents.map((student, idx) => {
                  const detail = dutyDetailsMap.get(student.id);
                  const totalAssigned = detail?.totalAssigned || 0;
                  const completedCount = detail?.completedCount || 0;
                  const upcomingCount = detail?.upcomingCount || 0;
                  const courseBreakdowns = detail?.courses || [];

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {student.nim}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{student.name}</div>
                      </td>

                      <td className="py-3 px-4">
                        {student.phone ? (
                          <a
                            href={`https://wa.me/${student.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-mono text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{student.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-xs">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-xs ${
                                totalAssigned === 0
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-900 text-white'
                              }`}
                            >
                              {totalAssigned === 0 ? '⚠️ 0 Kali' : `${totalAssigned}x Tugas`}
                            </span>
                          </div>
                          {totalAssigned > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="text-emerald-700 font-semibold">{completedCount} selesai</span>
                              <span>&bull;</span>
                              <span className="text-indigo-700 font-semibold">{upcomingCount} mendatang</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {courseBreakdowns.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {courseBreakdowns.map((cb) => (
                              <span
                                key={cb.courseId}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200/80 hover:bg-indigo-100/70 transition"
                                title={`${cb.courseName}: ${cb.count}x tugas (Pertemuan: ${cb.sessions.map((s) => `M-${s.sessionNumber}`).join(', ')})`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0"></span>
                                <span className="truncate max-w-[130px]">{cb.courseName}</span>
                                <span className="font-extrabold text-indigo-700 bg-white px-1 py-0.1 rounded text-[10px] border border-indigo-200">
                                  {cb.count}x
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">- (Belum ada)</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => detail && setSelectedStudentForDetail(detail)}
                            title="Lihat rincian lengkap tugas mahasiswa ini"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Detail</span>
                          </button>

                          {isAdmin && (
                            <>
                              <button
                                onClick={() => setEditingStudent({ ...student })}
                                title="Edit Data Mahasiswa"
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(student.id, student.name)}
                                title="Hapus Mahasiswa"
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                    <p className="font-semibold text-slate-700 text-xs sm:text-sm">
                      Tidak ditemukan data mahasiswa yang sesuai filter atau pencarian.
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Coba ubah kata kunci pencarian atau klik Reset Filter.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Tambah Mahasiswa Manual */}
      {isAddModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Tambah Mahasiswa Baru</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor Induk Mahasiswa (NIM)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 220101099"
                  value={formData.nim}
                  onChange={(e) => setFormData({ ...formData, nim: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap Mahasiswa
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Cahyono"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  Simpan Mahasiswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Paste / Import */}
      {isBulkModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Bulk Import Data Mahasiswa</h3>
                <p className="text-xs text-slate-500">Salin & tempel daftar mahasiswa dari WhatsApp, Excel, atau Google Sheets</p>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tempel (Paste) Teks Daftar Nama:
                </label>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => handleParseBulk(e.target.value)}
                  placeholder={`Contoh format yang didukung:\n[NIM] | [NAMA MAHASISWA]\n\nContoh pengisian:\n1234567890 | CONTOH MAHASISWA 1\n1234567891 | CONTOH MAHASISWA 2\n1234567892 | CONTOH MAHASISWA 3`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {bulkPreview.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Hasil Deteksi ({bulkPreview.length} Mahasiswa Unik Teridentifikasi):
                    </span>
                    {duplicateCount > 0 && (
                      <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                        {duplicateCount} Duplikat NIM Dibersihkan
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 text-xs">
                    {bulkPreview.map((item, i) => (
                      <div key={i} className="p-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-900">{item.name}</span>
                          <span className="text-slate-500 ml-2 font-mono">({item.nim})</span>
                        </div>
                        {item.phone && (
                          <span className="text-[11px] text-slate-600 font-mono">{item.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBulk}
                disabled={bulkPreview.length === 0}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg shadow-sm"
              >
                Tambahkan {bulkPreview.length} Mahasiswa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Mahasiswa */}
      {editingStudent && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Perbarui Data Mahasiswa</h3>
              <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  NIM
                </label>
                <input
                  type="text"
                  value={editingStudent.nim}
                  onChange={(e) => setEditingStudent({ ...editingStudent, nim: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor WhatsApp
                </label>
                <input
                  type="text"
                  value={editingStudent.phone || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Rincian Lengkap Tugas PJ Mahasiswa */}
      {selectedStudentForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 my-auto max-h-[90vh] flex flex-col">
            
            {/* Header Profil Mahasiswa */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                  {selectedStudentForDetail.student.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                      {selectedStudentForDetail.student.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      selectedStudentForDetail.student.isActive 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {selectedStudentForDetail.student.isActive ? 'Aktif' : 'Non-aktif'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 font-mono">
                    <span>NIM: <strong className="text-slate-700">{selectedStudentForDetail.student.nim}</strong></span>
                    {selectedStudentForDetail.student.phone && (
                      <a
                        href={`https://wa.me/${selectedStudentForDetail.student.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                        title="Hubungi via WhatsApp"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{selectedStudentForDetail.student.phone}</span>
                        <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedStudentForDetail(null)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">Total Tugas</span>
                <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">
                  {selectedStudentForDetail.totalAssigned} <span className="text-xs font-normal text-slate-500">kali</span>
                </span>
              </div>
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-center">
                <span className="text-[11px] font-semibold text-indigo-700 block uppercase tracking-wider">Mata Kuliah</span>
                <span className="text-xl font-extrabold text-indigo-900 mt-0.5 block">
                  {selectedStudentForDetail.courses.length} <span className="text-xs font-normal text-indigo-500">matkul</span>
                </span>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                <span className="text-[11px] font-semibold text-emerald-700 block uppercase tracking-wider">Selesai</span>
                <span className="text-xl font-extrabold text-emerald-900 mt-0.5 block">
                  {selectedStudentForDetail.completedCount} <span className="text-xs font-normal text-emerald-500">sesi</span>
                </span>
              </div>
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-center">
                <span className="text-[11px] font-semibold text-blue-700 block uppercase tracking-wider">Mendatang</span>
                <span className="text-xl font-extrabold text-blue-900 mt-0.5 block">
                  {selectedStudentForDetail.upcomingCount} <span className="text-xs font-normal text-blue-500">sesi</span>
                </span>
              </div>
            </div>

            {/* List Tugas & Matkul (Scrollable content) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  Rincian Mata Kuliah & Jadwal Tugas ({selectedStudentForDetail.courses.length})
                </h4>
              </div>

              {selectedStudentForDetail.courses.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm">
                    Belum Ada Tugas PJ Yang Ditugaskan
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Mahasiswa ini belum mendapatkan giliran tugas di mata kuliah manapun. Anda dapat membuat rotasi otomatis di tab Jadwal Perkuliahan.
                  </p>
                  {onNavigateToSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentForDetail(null);
                        onNavigateToSchedule();
                      }}
                      className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      Buka Jadwal Perkuliahan
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedStudentForDetail.courses.map((courseGroup) => (
                    <div
                      key={courseGroup.courseId}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs"
                    >
                      {/* Course Header */}
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: courseGroup.courseColor || '#4f46e5' }}
                          />
                          <div>
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {courseGroup.courseName}
                            </span>
                            {courseGroup.courseCode && courseGroup.courseCode !== '-' && (
                              <span className="ml-2 font-mono text-[11px] text-slate-500">
                                ({courseGroup.courseCode})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {courseGroup.count}x Tugas
                          </span>
                          {onNavigateToSchedule && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStudentForDetail(null);
                                onNavigateToSchedule(courseGroup.courseId);
                              }}
                              className="text-[11px] text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1 font-semibold ml-1 cursor-pointer"
                              title="Buka jadwal mata kuliah ini"
                            >
                              <span>Lihat</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Sessions Table / List */}
                      <div className="divide-y divide-slate-100 text-xs">
                        {courseGroup.sessions.map((sess) => (
                          <div
                            key={sess.sessionId}
                            className="p-3 hover:bg-slate-50/80 transition flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-10 h-7 rounded-lg bg-slate-100 text-slate-800 font-extrabold flex items-center justify-center text-xs shrink-0 font-mono">
                                M-{sess.sessionNumber}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  <span>{sess.day}</span>
                                  {sess.startTime && (
                                    <span className="text-slate-500 font-normal font-mono">
                                      • {sess.startTime} - {sess.endTime}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                  <span>Ruang: <strong className="text-slate-600">{sess.room || '-'}</strong></span>
                                  <span>•</span>
                                  <span>Dosen: <strong className="text-slate-600">{sess.lecturer || '-'}</strong></span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {sess.status === 'completed' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Selesai</span>
                                </span>
                              )}
                              {sess.status === 'ongoing' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Berlangsung</span>
                                </span>
                              )}
                              {sess.status === 'upcoming' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  <Clock className="w-3 h-3 text-blue-500" />
                                  <span>Mendatang</span>
                                </span>
                              )}
                              {sess.status === 'cancelled' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Dibatalkan</span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-400">
                Data diperbarui secara otomatis berdasarkan jadwal rotasi kelas
              </span>
              <div className="flex items-center gap-2">
                {onNavigateToSchedule && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentForDetail(null);
                      onNavigateToSchedule();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                  >
                    Buka Tab Jadwal
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStudentForDetail(null)}
                  className="px-4 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
