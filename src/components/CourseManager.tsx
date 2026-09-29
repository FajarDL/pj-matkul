import React, { useState } from 'react';
import type { Course, SessionSchedule, UserRole } from '../types';
import { COURSE_PRESETS, MASTER_LECTURERS, MASTER_ROOMS } from '../data/academicPresets';
import { parseWebSchedule, type ParsedScheduleCourse } from '../services/scheduleParser';
import { isPracticumCourse } from '../services/rotationAlgorithm';
import { checkCourseDuplicate, checkScheduleConflict } from '../services/scheduleValidation';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle, 
  X,
  Wand2,
  Lock,
  Globe,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';

interface CourseManagerProps {
  courses: Course[];
  activeCourseId: string | null;
  sessions: SessionSchedule[];
  userRole: UserRole;
  onSelectCourse: (courseId: string) => void;
  onUpdateCourses: (courses: Course[]) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddCourseWithPreset?: (newCourse: Course, topics: string[]) => void;
  onBatchImportCourses?: (courses: Omit<Course, 'id'>[]) => void;
  onRequestLogin?: () => void;
  onUpdateSessions?: (sessions: SessionSchedule[]) => void;
}

export const CourseManager: React.FC<CourseManagerProps> = ({
  courses,
  activeCourseId,
  sessions,
  userRole,
  onSelectCourse,
  onUpdateCourses,
  onDeleteCourse,
  onAddCourseWithPreset,
  onBatchImportCourses,
  onRequestLogin,
  onUpdateSessions,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Web Import State
  const [isWebImportModalOpen, setIsWebImportModalOpen] = useState(false);
  const [webImportText, setWebImportText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedScheduleCourse[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [formData, setFormData] = useState<Omit<Course, 'id'>>({
    code: '',
    name: '',
    lecturer: '',
    day: 'Senin',
    startTime: '08:00',
    endTime: '10:30',
    room: '',
    totalSessions: 16,
    color: 'indigo',
    isPracticum: false,
  });

  const openAddModal = () => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    setEditingCourse(null);
    setSelectedPresetIndex('');
    setFormError(null);
    setFormData({
      code: '',
      name: '',
      lecturer: '',
      day: 'Senin',
      startTime: '08:00',
      endTime: '10:30',
      room: '',
      totalSessions: 16,
      color: 'indigo',
      isPracticum: false,
    });
    setIsModalOpen(true);
  };

  const handleSelectPreset = (indexStr: string) => {
    setSelectedPresetIndex(indexStr);
    setFormError(null);
    if (!indexStr) return;
    const preset = COURSE_PRESETS[Number(indexStr)];
    if (preset) {
      const isPrak =
        preset.isPracticum !== undefined
          ? preset.isPracticum
          : preset.name.toLowerCase().includes('praktikum') ||
            preset.name.toLowerCase().includes('prak.');

      setFormData({
        code: preset.code,
        name: preset.name,
        lecturer: preset.lecturer,
        day: preset.day,
        startTime: preset.startTime,
        endTime: preset.endTime,
        room: preset.room,
        totalSessions: preset.totalSessions,
        color: 'indigo',
        isPracticum: isPrak,
      });
    }
  };

  const openEditModal = (course: Course) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    setEditingCourse(course);
    setSelectedPresetIndex('');
    setFormError(null);
    setFormData({
      code: course.code,
      name: course.name,
      lecturer: course.lecturer,
      day: course.day,
      startTime: course.startTime,
      endTime: course.endTime,
      room: course.room,
      totalSessions: course.totalSessions,
      color: course.color,
      isPracticum: course.isPracticum !== undefined ? course.isPracticum : isPracticumCourse(course),
    });
    setIsModalOpen(true);
  };

  const handleTogglePracticum = (courseId: string) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }

    const target = courses.find((c) => c.id === courseId);
    if (!target) return;

    const currentlyPracticum = isPracticumCourse(target);
    const nextPracticum = !currentlyPracticum;

    const confirmMsg = nextPracticum
      ? `Jadikan "${target.name}" sebagai Mata Kuliah Praktikum?\n\nSesi praktikum tidak memerlukan penanggung jawab (PJ) dan rotasi PJ yang ada akan dikosongkan.`
      : `Ubah "${target.name}" menjadi Mata Kuliah Teori Biasa?\n\nAnda dapat mengacak rotasi PJ untuk mata kuliah ini.`;

    if (confirm(confirmMsg)) {
      const updatedCourses = courses.map((c) =>
        c.id === courseId ? { ...c, isPracticum: nextPracticum } : c
      );
      onUpdateCourses(updatedCourses);

      if (nextPracticum && onUpdateSessions) {
        const updatedSessions = sessions.map((s) =>
          s.courseId === courseId ? { ...s, assignedPjIds: [] } : s
        );
        onUpdateSessions(updatedSessions);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) return;

    // 1. Check for Duplicate Course (code, name, or exact schedule)
    const dupCheck = checkCourseDuplicate(formData, courses, editingCourse?.id);
    if (dupCheck.isDuplicate) {
      setFormError(dupCheck.message || 'Mata kuliah duplikat terdeteksi. Silakan periksa kode atau nama mata kuliah.');
      return;
    }

    // 2. Check for Schedule Conflict (overlapping time on same day)
    const conflictCheck = checkScheduleConflict(formData, courses, editingCourse?.id);
    if (conflictCheck.hasConflict) {
      const proceed = confirm(
        `⚠️ PERINGATAN BENTROK JADWAL!\n\n${conflictCheck.message}\n\nApakah Anda yakin tetap ingin menyimpan jadwal ini?`
      );
      if (!proceed) return;
    }

    setFormError(null);

    if (editingCourse) {
      const updated = courses.map((c) =>
        c.id === editingCourse.id ? { ...c, ...formData } : c
      );
      onUpdateCourses(updated);

      if (formData.isPracticum && onUpdateSessions) {
        const updatedSessions = sessions.map((s) =>
          s.courseId === editingCourse.id ? { ...s, assignedPjIds: [] } : s
        );
        onUpdateSessions(updatedSessions);
      }
    } else {
      const newCourse: Course = {
        id: `course-${Date.now()}`,
        ...formData,
      };

      if (selectedPresetIndex !== '' && onAddCourseWithPreset) {
        const preset = COURSE_PRESETS[Number(selectedPresetIndex)];
        onAddCourseWithPreset(newCourse, preset?.topics || []);
      } else {
        onUpdateCourses([...courses, newCourse]);
      }

      if (!activeCourseId) {
        onSelectCourse(newCourse.id);
      }
    }

    setIsModalOpen(false);
  };

  // Handle live parsing when text is pasted
  const handleWebTextChange = (text: string) => {
    setWebImportText(text);
    const parsed = parseWebSchedule(text);
    setParsedPreview(parsed);
  };

  // Submit batch import
  const handleConfirmWebImport = () => {
    if (parsedPreview.length === 0) return;

    // Filter duplicates if skipDuplicates is enabled
    const itemsToImport = skipDuplicates
      ? parsedPreview.filter((item) => !checkCourseDuplicate(item, courses).isDuplicate)
      : parsedPreview;

    if (itemsToImport.length === 0) {
      alert('Semua mata kuliah yang diimpor sudah ada dalam daftar jadwal sistem. Tidak ada mata kuliah baru yang ditambahkan untuk mencegah duplikasi.');
      return;
    }

    const formattedCourses: Omit<Course, 'id'>[] = itemsToImport.map((item) => ({
      code: item.code,
      name: item.name,
      lecturer: item.lecturer,
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      room: item.room,
      totalSessions: 16,
      color: 'indigo',
      isPracticum:
        item.isPracticum !== undefined
          ? item.isPracticum
          : item.name.toLowerCase().includes('praktikum') ||
            item.name.toLowerCase().includes('prak.') ||
            item.code.toLowerCase().startsWith('prak'),
    }));

    if (onBatchImportCourses) {
      onBatchImportCourses(formattedCourses);
    } else {
      const newCreated: Course[] = formattedCourses.map((fc, idx) => ({
        id: `course-${Date.now()}-${idx}`,
        ...fc,
      }));
      onUpdateCourses([...courses, ...newCreated]);
      if (!activeCourseId && newCreated.length > 0) {
        onSelectCourse(newCreated[0].id);
      }
    }

    setWebImportText('');
    setParsedPreview([]);
    setIsWebImportModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Manajemen Mata Kuliah</span>
            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
              {courses.length} Terdaftar
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi mata kuliah, pengampu dosen, jadwal ruangan, dan jumlah pertemuan kelas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => {
                  setWebImportText('');
                  setParsedPreview([]);
                  setIsWebImportModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200 transition cursor-pointer"
                title="Tempel jadwal dari portal SIAKAD atau website kampus"
              >
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>Import Jadwal SIAKAD</span>
              </button>

              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Manual</span>
              </button>
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs px-3 py-1.5 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Mode Hanya Baca (Mahasiswa)</span>
            </div>
          )}
        </div>
      </div>

      {/* Courses Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {courses.map((course) => {
          const isActive = course.id === activeCourseId;
          const courseSessions = sessions.filter((s) => s.courseId === course.id);
          const completedCount = courseSessions.filter((s) => s.status === 'completed');

          return (
            <div
              key={course.id}
              className={`bg-white rounded-2xl border transition relative p-6 flex flex-col justify-between ${
                isActive
                  ? 'border-indigo-600 shadow-md ring-1 ring-indigo-600/20'
                  : 'border-slate-200/80 shadow-xs hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">
                      {course.code}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                    {isPracticumCourse(course) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200">
                        🧪 Praktikum (Tanpa PJ)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full border border-slate-200">
                        Teori
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(course)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Mata Kuliah"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Hapus mata kuliah "${course.name}"? Seluruh sesi terkait akan dihapus.`)) {
                            onDeleteCourse(course.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Hapus Mata Kuliah"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">
                    {course.name}
                  </h3>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-600">
                      Dosen: <span className="font-semibold text-slate-800">{course.lecturer}</span>
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleTogglePracticum(course.id)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${
                          isPracticumCourse(course)
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50 hover:text-purple-700'
                        }`}
                        title="Klik untuk mengubah jenis mata kuliah ini"
                      >
                        {isPracticumCourse(course) ? '🧪 Praktikum' : 'Ubah jadi Praktikum'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Setiap {course.day}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{course.startTime} - {course.endTime}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{course.room || 'Ruang Kuliah Belum Diatur'}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Kemajuan: {completedCount.length} dari {course.totalSessions} Pertemuan</span>
                    <span className="font-semibold">{Math.round((completedCount.length / (course.totalSessions || 1)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-slate-900 h-full rounded-full transition-all"
                      style={{ width: `${Math.round((completedCount.length / (course.totalSessions || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {courseSessions.length} sesi terdata
                </span>
                {!isActive ? (
                  <button
                    onClick={() => onSelectCourse(course.id)}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    Buka Mata Kuliah &rarr;
                  </button>
                ) : (
                  <span className="text-xs font-bold text-slate-600">
                    Sedang Aktif
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Import Jadwal SIAKAD / Web Portal */}
      {isWebImportModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Import Jadwal Kuliah dari Website / SIAKAD
                  </h3>
                  <p className="text-xs text-slate-500">
                    Salin (copy) tabel jadwal dari website kampus dan tempel langsung ke kotak di bawah ini
                  </p>
                </div>
              </div>
              <button onClick={() => setIsWebImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tempel (Paste) Teks Jadwal dari Website Kampus:
                </label>
                <textarea
                  rows={6}
                  value={webImportText}
                  onChange={(e) => handleWebTextChange(e.target.value)}
                  placeholder={`Contoh format yang didukung:\n[No]  [KODE_MK]  [NAMA_MATA_KULIAH]  [KELAS]  - [HARI], [JAM_MULAI] s/d [JAM_SELESAI]\n- [KODE_RUANGAN]\n- [NAMA_DOSEN_PENGAMPU]\n\nContoh pengisian:\n1  MK101  Contoh Mata Kuliah 1  A  - Senin, 08:00:00 s/d 10:00:00\n- Ruang Kuliah 01\n- Nama Dosen Pengampu, S.Kom., M.T.`}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              {/* Parsed Live Preview Table with Duplicate Detection */}
              {parsedPreview.length > 0 && (() => {
                const duplicateCount = parsedPreview.filter(
                  (item) => checkCourseDuplicate(item, courses).isDuplicate
                ).length;
                const newCount = parsedPreview.length - duplicateCount;

                return (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Hasil Ekstraksi ({parsedPreview.length} Mata Kuliah Terdeteksi)</span>
                      </span>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                          ✓ {newCount} Baru
                        </span>
                        {duplicateCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 border border-amber-200">
                            ⚠️ {duplicateCount} Sudah Terdaftar
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Toggle Lewati Duplikat */}
                    <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-slate-800">
                        <input
                          type="checkbox"
                          checked={skipDuplicates}
                          onChange={(e) => setSkipDuplicates(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="font-medium">
                          Lewati mata kuliah yang sudah ada dalam jadwal (Cegah Duplikasi)
                        </span>
                      </label>
                      <span className="text-[11px] text-slate-500 hidden sm:inline">
                        {skipDuplicates ? 'Hanya mata kuliah baru yang akan disimpan' : 'Semua mata kuliah akan disimpan'}
                      </span>
                    </div>

                    <div className="overflow-x-auto max-h-56 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100/75 text-slate-700 font-bold text-[11px] uppercase">
                          <tr>
                            <th className="p-2 w-8 text-center">No</th>
                            <th className="p-2 w-24">Kode</th>
                            <th className="p-2">Nama Mata Kuliah</th>
                            <th className="p-2 w-32">Hari & Jam</th>
                            <th className="p-2 w-24">Ruangan</th>
                            <th className="p-2">Dosen Pengampu</th>
                            <th className="p-2 w-28 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedPreview.map((item, idx) => {
                            const dup = checkCourseDuplicate(item, courses);
                            const isDup = dup.isDuplicate;

                            return (
                              <tr 
                                key={idx} 
                                className={isDup ? (skipDuplicates ? 'bg-amber-50/30 opacity-70 hover:opacity-100' : 'bg-amber-50/50') : 'hover:bg-slate-50'}
                              >
                                <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                                <td className="p-2 font-mono font-bold text-slate-800">{item.code}</td>
                                <td className="p-2 font-semibold text-slate-900">{item.name}</td>
                                <td className="p-2 whitespace-nowrap text-slate-700">
                                  <div>{item.day}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{item.startTime} - {item.endTime}</div>
                                </td>
                                <td className="p-2 text-slate-600 truncate max-w-[100px]">{item.room}</td>
                                <td className="p-2 text-slate-800">{item.lecturer}</td>
                                <td className="p-2 text-center">
                                  {isDup ? (
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 cursor-help"
                                      title={dup.message}
                                    >
                                      ⚠️ Sudah Ada
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      ✓ Baru
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsWebImportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmWebImport}
                disabled={
                  parsedPreview.length === 0 || 
                  (skipDuplicates && parsedPreview.every((item) => checkCourseDuplicate(item, courses).isDuplicate))
                }
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg shadow-sm cursor-pointer"
              >
                {(() => {
                  if (parsedPreview.length === 0) return 'Simpan & Tambahkan';
                  const dupCount = parsedPreview.filter((item) => checkCourseDuplicate(item, courses).isDuplicate).length;
                  const newCount = parsedPreview.length - dupCount;
                  if (skipDuplicates) {
                    return newCount === 0
                      ? 'Semua Sudah Ada (Tidak Ada Data Baru)'
                      : `Simpan ${newCount} Mata Kuliah Baru (${dupCount} Duplikat Dilewati)`;
                  }
                  return `Simpan & Tambahkan Semua (${parsedPreview.length})`;
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tambah / Edit Mata Kuliah Manual with AUTOFILL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingCourse ? 'Perbarui Data Mata Kuliah' : 'Tambah Mata Kuliah Baru'}
                </h3>
                <p className="text-xs text-slate-500">Isi manual atau gunakan preset kurikulum otomatis</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingCourse && (
              <div className="bg-indigo-50/70 border border-indigo-200/80 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <Wand2 className="w-4 h-4 text-indigo-600" />
                  <span>Autofill dari Template Kurikulum:</span>
                </div>
                <select
                  value={selectedPresetIndex}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full p-2 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">-- Pilih Template Mata Kuliah (Otomatis Isi Semua) --</option>
                  {COURSE_PRESETS.map((p, i) => (
                    <option key={i} value={i.toString()}>
                      {p.code} - {p.name} ({p.lecturer})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-700/80">
                  *Memilih template akan mengisi otomatis Nama MK, Dosen, Ruangan, dan 16 silabus materi pertemuan.
                </p>
              </div>
            )}

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <span className="font-bold block">Duplikasi Terdeteksi</span>
                  <span>{formError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Kode MK
                  </label>
                  <input
                    type="text"
                    placeholder="IF301"
                    value={formData.code}
                    onChange={(e) => {
                      if (formError) setFormError(null);
                      setFormData({ ...formData, code: e.target.value });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Mata Kuliah
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Basis Data Lanjut atau Praktikum Basis Data"
                    value={formData.name}
                    onChange={(e) => {
                      if (formError) setFormError(null);
                      const newName = e.target.value;
                      const isAutoPrak =
                        !editingCourse &&
                        (newName.toLowerCase().includes('praktikum') ||
                          newName.toLowerCase().includes('prak.'));
                      setFormData({
                        ...formData,
                        name: newName,
                        isPracticum: isAutoPrak ? true : formData.isPracticum,
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                    required
                  />
                </div>
              </div>

              {/* Praktikum Checkbox Toggle */}
              <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isPracticum"
                  checked={formData.isPracticum || false}
                  onChange={(e) => setFormData({ ...formData, isPracticum: e.target.checked })}
                  className="w-4 h-4 mt-0.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="isPracticum" className="text-xs text-slate-800 cursor-pointer select-none">
                  <span className="font-bold flex items-center gap-1.5 text-purple-950">
                    <span>🧪 Mata Kuliah Praktikum (Tanpa Rotasi PJ)</span>
                  </span>
                  <span className="text-[11px] text-purple-700/90 block mt-0.5 leading-relaxed">
                    Centang jika mata kuliah ini adalah praktikum laboratorium. Sesi praktikum otomatis dikecualikan dari rotasi penugasan PJ dan tidak membebani giliran mahasiswa.
                  </span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Dosen Pengampu
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        setFormData({ ...formData, lecturer: e.target.value });
                      }
                    }}
                    defaultValue=""
                    className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5"
                  >
                    <option value="">Pilih dari Master Dosen...</option>
                    {MASTER_LECTURERS.map((lec, i) => (
                      <option key={i} value={lec.name}>
                        {lec.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Prof. / Dr. / Ir. ..."
                  value={formData.lecturer}
                  onChange={(e) => setFormData({ ...formData, lecturer: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Hari
                  </label>
                  <select
                    value={formData.day}
                    onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Jam Mulai
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Jam Selesai
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Ruangan
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          setFormData({ ...formData, room: e.target.value });
                        }
                      }}
                      defaultValue=""
                      className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5"
                    >
                      <option value="">Preset Ruang...</option>
                      {MASTER_ROOMS.map((r, i) => (
                        <option key={i} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Lab 3 / R.304"
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Total Sesi Pertemuan
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={formData.totalSessions}
                    onChange={(e) => setFormData({ ...formData, totalSessions: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  {editingCourse ? 'Simpan Perubahan' : 'Buat Mata Kuliah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
