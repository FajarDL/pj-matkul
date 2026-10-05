import React, { useState, useMemo } from 'react';
import type { Course, Student, SessionSchedule, SessionStatus, UserRole, CourseMaterial } from '../types';
import { 
  rescheduleAllSequential,
  generateWhatsAppMessage, 
  swapPjBetweenSessions,
  getDayOrder,
  isPracticumCourse
} from '../services/rotationAlgorithm';
import { 
  RotateCcw,
  ArrowLeftRight, 
  Printer, 
  Download, 
  Share2, 
  Check, 
  Edit3, 
  X, 
  Search, 
  Info,
  Lock,
  Layers,
  FolderOpen
} from 'lucide-react';

interface ScheduleViewProps {
  courses: Course[];
  students: Student[];
  sessions: SessionSchedule[];
  materials?: CourseMaterial[];
  userRole: UserRole;
  course?: Course;
  onUpdateSessions: (newSessions: SessionSchedule[]) => void;
  onNavigateToMaterials?: (courseId?: string, sessionNumber?: number) => void;
  onRequestLogin?: () => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  courses,
  students,
  sessions,
  materials = [],
  userRole,
  course,
  onUpdateSessions,
  onNavigateToMaterials,
  onRequestLogin,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [selectedCourseId, setSelectedCourseId] = useState<string>(course?.id || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SessionStatus>('all');
  
  // Modals state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionSchedule | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  // Swap State
  const [swapSessionAId, setSwapSessionAId] = useState<string>('');
  const [swapStudentAId, setSwapStudentAId] = useState<string>('');
  const [swapSessionBId, setSwapSessionBId] = useState<string>('');
  const [swapStudentBId, setSwapStudentBId] = useState<string>('');

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  // Track duties per student per week across all courses (for fairness & duplicate auditing)
  const weeklyDuties = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    sessions.forEach((s) => {
      if (!map.has(s.sessionNumber)) {
        map.set(s.sessionNumber, new Map<string, number>());
      }
      const wMap = map.get(s.sessionNumber)!;
      s.assignedPjIds.forEach((id) => {
        wMap.set(id, (wMap.get(id) || 0) + 1);
      });
    });
    return map;
  }, [sessions]);

  // Count materials mapped by courseId-sessionNumber
  const materialCountBySession = useMemo(() => {
    const map: Record<string, number> = {};
    (materials || []).forEach((m) => {
      const key = `${m.courseId}-${m.sessionNumber}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [materials]);

  const activeCourse = selectedCourseId !== 'all' ? courseMap.get(selectedCourseId) : null;

  // Filter sessions based on course filter
  const displayedSessions = useMemo(() => {
    let list = sessions;
    if (selectedCourseId !== 'all') {
      list = list.filter((s) => s.courseId === selectedCourseId);
    }

    // Sort: if 'all', sort by sessionNumber, day, startTime; else by sessionNumber
    return [...list].sort((a, b) => {
      if (a.sessionNumber !== b.sessionNumber) {
        return a.sessionNumber - b.sessionNumber;
      }
      const cA = courseMap.get(a.courseId);
      const cB = courseMap.get(b.courseId);
      const dayA = getDayOrder(cA?.day || '');
      const dayB = getDayOrder(cB?.day || '');
      if (dayA !== dayB) return dayA - dayB;
      return (cA?.startTime || '').localeCompare(cB?.startTime || '');
    });
  }, [sessions, selectedCourseId, courseMap]);

  // Filtered sessions with search & status
  const filteredSessions = useMemo(() => {
    return displayedSessions.filter((session) => {
      if (statusFilter !== 'all' && session.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      const courseObj = courseMap.get(session.courseId);
      const courseName = courseObj?.name.toLowerCase() || '';
      const courseCode = courseObj?.code.toLowerCase() || '';
      const matchesCourse = courseName.includes(query) || courseCode.includes(query);
      const matchesSession = `pertemuan ${session.sessionNumber}`.includes(query) ||
        `m-${session.sessionNumber}`.includes(query) ||
        session.topic.toLowerCase().includes(query) ||
        session.date.includes(query);

      const assignedStudents = students.filter((s) => session.assignedPjIds.includes(s.id));
      const matchesStudent = assignedStudents.some(
        (s) => s.name.toLowerCase().includes(query) || s.nim.toLowerCase().includes(query)
      );

      return matchesCourse || matchesSession || matchesStudent;
    });
  }, [displayedSessions, statusFilter, searchQuery, courseMap, students]);

  // Handle Reschedule All Sequentially based on Attendance Order / NIM
  const handleRescheduleAll = () => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }

    if (students.filter((s) => s.isActive).length === 0) {
      alert('Tambahkan mahasiswa aktif terlebih dahulu di tab "Data Mahasiswa"!');
      return;
    }

    if (courses.length === 0) {
      alert('Tambahkan mata kuliah terlebih dahulu di tab "Mata Kuliah"!');
      return;
    }

    if (
      confirm(
        'Jadwalkan ulang seluruh sesi perkuliahan secara berurutan sesuai nomor urut absen (1 s/d N)?\n\nSeluruh penugasan akan diselaraskan kembali dari nomor absen awal, dan penyesuaian manual yang pernah dibuat akan diatur ulang.'
      )
    ) {
      const updated = rescheduleAllSequential(courses, students, sessions);
      onUpdateSessions(updated);
    }
  };

  // Handle Swap PJ
  const handleExecuteSwap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }

    if (!swapSessionAId || !swapStudentAId || !swapSessionBId || !swapStudentBId) {
      alert('Pilih pertemuan dan mahasiswa yang ingin ditukar secara lengkap.');
      return;
    }

    const updated = swapPjBetweenSessions(
      sessions,
      swapSessionAId,
      swapStudentAId,
      swapSessionBId,
      swapStudentBId
    );

    onUpdateSessions(updated);
    setIsSwapModalOpen(false);
    setSwapSessionAId('');
    setSwapStudentAId('');
    setSwapSessionBId('');
    setSwapStudentBId('');
  };

  // Handle Copy WA
  const handleCopyWA = (session: SessionSchedule) => {
    const courseObj = courseMap.get(session.courseId);
    if (!courseObj) return;

    const assigned = students.filter((s) => session.assignedPjIds.includes(s.id));
    const isPrak = isPracticumCourse(courseObj);
    const text = generateWhatsAppMessage(
      courseObj.name,
      courseObj.lecturer,
      courseObj.day,
      `${courseObj.startTime} - ${courseObj.endTime}`,
      courseObj.room,
      session,
      assigned,
      isPrak
    );
    navigator.clipboard.writeText(text);
    setCopiedSessionId(session.id);
    setTimeout(() => setCopiedSessionId(null), 2500);
  };

  // Handle Export CSV
  const handleExportCSV = () => {
    const headers = ['Mata Kuliah', 'Kode', 'Pertemuan', 'Hari', 'Jam', 'Ruangan', 'Tanggal', 'Topik', 'PJ 1', 'PJ 2', 'Status', 'Catatan'];
    const rows = displayedSessions.map((session) => {
      const courseObj = courseMap.get(session.courseId);
      const assigned = students.filter((s) => session.assignedPjIds.includes(s.id));
      const pj1 = assigned[0] ? `${assigned[0].name} (${assigned[0].nim})` : '-';
      const pj2 = assigned[1] ? `${assigned[1].name} (${assigned[1].nim})` : '-';
      return [
        `"${courseObj?.name || '-'}"`,
        `"${courseObj?.code || '-'}"`,
        `Pertemuan ${session.sessionNumber}`,
        `"${courseObj?.day || '-'}"`,
        `"${courseObj?.startTime || '-'} - ${courseObj?.endTime || '-'}"`,
        `"${courseObj?.room || '-'}"`,
        session.date,
        `"${session.topic.replace(/"/g, '""')}"`,
        `"${pj1}"`,
        `"${pj2}"`,
        session.status,
        `"${(session.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const filename = activeCourse ? `jadwal-rotasi-${activeCourse.code.toLowerCase()}.csv` : `jadwal-rotasi-semua-matkul.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Save edited session
  const handleSaveSessionEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;

    const updated = sessions.map((s) => (s.id === editingSession.id ? editingSession : s));
    onUpdateSessions(updated);
    setEditingSession(null);
  };

  // Toggle status
  const handleStatusToggle = (sessionId: string) => {
    if (!isAdmin) return;
    const statusCycle: SessionStatus[] = ['upcoming', 'ongoing', 'completed'];
    const updated = sessions.map((s) => {
      if (s.id === sessionId) {
        const nextIdx = (statusCycle.indexOf(s.status) + 1) % statusCycle.length;
        return { ...s, status: statusCycle[nextIdx] };
      }
      return s;
    });
    onUpdateSessions(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* Course Filter Pills: View All or Filter by Course */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3 no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Pilih Mata Kuliah untuk Ditampilkan:</span>
          </div>
          <span className="text-xs text-slate-400">
            {courses.length} Mata Kuliah Terdaftar
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCourseId('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
              selectedCourseId === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Semua Mata Kuliah ({sessions.length} Sesi)
          </button>

          {courses.map((c) => {
            const isSelected = selectedCourseId === c.id;

            return (
              <button
                key={c.id}
                onClick={() => setSelectedCourseId(c.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-600 ring-offset-1'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{c.name}</span>
                {isPracticumCourse(c) && (
                  <span className="text-[10px] bg-purple-200/80 text-purple-900 px-1.5 py-0.2 rounded font-bold">
                    🧪 Prak
                  </span>
                )}
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {c.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>
                {activeCourse ? `Jadwal & Penugasan: ${activeCourse.name} (${activeCourse.code})` : 'Jadwal & Penugasan PJ Semua Mata Kuliah'}
              </span>
              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
                {displayedSessions.length} Sesi
              </span>
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Terjadwal Otomatis Urutan Absen (1 s/d N)</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {activeCourse 
              ? `${activeCourse.day}, ${activeCourse.startTime} - ${activeCourse.endTime} WIB | Dosen: ${activeCourse.lecturer}`
              : 'Seluruh sesi perkuliahan terjadwal terurut dan seimbang berdasarkan nomor urut absen / NIM.'
            }
          </p>
          {activeCourse && isPracticumCourse(activeCourse) && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 font-medium">
              <span>🧪</span>
              <span>Mata kuliah ini berstatus Praktikum (tanpa penugasan PJ).</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              {/* Single Clean Reschedule Button */}
              <button
                onClick={handleRescheduleAll}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl shadow-xs transition cursor-pointer"
                title="Jadwalkan ulang seluruh sesi perkuliahan secara berurutan sesuai nomor urut absen"
              >
                <RotateCcw className="w-4 h-4 text-indigo-400" />
                <span>Jadwalkan Ulang Sesuai Urutan Absen</span>
              </button>

              <button
                onClick={() => setIsSwapModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl transition cursor-pointer border border-slate-200"
                title="Tukar atau ambil jatah PJ antar dua sesi perkuliahan"
              >
                <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                <span>Tukar / Ambil Jatah PJ</span>
              </button>
            </>
          ) : (
            <button
              onClick={onRequestLogin}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs px-3 py-2 rounded-xl border border-slate-200 transition"
              title="Masukkan kunci akses untuk mengatur jadwal atau menukar giliran"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Buka Kunci untuk Edit</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm px-3 py-2.5 rounded-xl transition cursor-pointer"
            title="Download CSV"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm px-3 py-2.5 rounded-xl transition cursor-pointer"
            title="Cetak Dokumen Resmi"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Cetak PDF</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari matkul, sesi, materi, atau nama PJ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Status:</span>
          {(['all', 'upcoming', 'ongoing', 'completed'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? 'Semua' : st === 'upcoming' ? 'Akan Datang' : st === 'ongoing' ? 'Berlangsung' : 'Selesai'}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3 px-4 w-16 text-center">Minggu</th>
                {selectedCourseId === 'all' && (
                  <th className="py-3 px-4 w-52">Mata Kuliah & Jadwal</th>
                )}
                <th className="py-3 px-4 w-32">Hari & Tanggal</th>
                <th className="py-3 px-4">Pokok Bahasan / Materi</th>
                <th className="py-3 px-4">Penanggung Jawab (PJ)</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                <th className="py-3 px-4 w-28 text-right no-print">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.length > 0 ? (
                filteredSessions.map((session) => {
                  const courseObj = courseMap.get(session.courseId);
                  const assignedStudents = students.filter((s) => session.assignedPjIds.includes(s.id));
                  const isSpecial = session.sessionNumber === 8 || session.sessionNumber === (courseObj?.totalSessions || 16);

                  return (
                    <tr 
                      key={session.id} 
                      className={`hover:bg-slate-50/70 transition ${
                        isSpecial ? 'bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md font-mono font-bold text-xs ${
                          isSpecial 
                            ? 'bg-slate-900 text-white' 
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          M-{session.sessionNumber}
                        </span>
                      </td>

                      {/* Course Identity (shown when in "all" view) */}
                      {selectedCourseId === 'all' && (
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="font-mono text-[10px] bg-slate-900 text-white px-1.5 py-0.2 rounded">
                              {courseObj?.code || '-'}
                            </span>
                            <span className="truncate">{courseObj?.name || 'Mata Kuliah'}</span>
                            {isPracticumCourse(courseObj) && (
                              <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold border border-purple-200 shrink-0">
                                🧪 Prak
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{courseObj?.startTime} - {courseObj?.endTime} WIB</span>
                            <span>&bull;</span>
                            <span className="truncate">{courseObj?.room}</span>
                          </div>
                        </td>
                      )}

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {courseObj?.day || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(session.date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {session.topic}
                        </div>
                        {session.notes && (
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <Info className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="italic">{session.notes}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {assignedStudents.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1.5">
                              {assignedStudents.map((student) => {
                                const dutiesThisWeek = weeklyDuties.get(session.sessionNumber)?.get(student.id) || 1;
                                return (
                                  <div
                                    key={student.id}
                                    className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded-lg text-xs font-semibold"
                                  >
                                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold shrink-0">
                                      {student.name.charAt(0)}
                                    </span>
                                    <span>{student.name}</span>
                                    <span className="text-[10px] font-mono text-indigo-600">({student.nim})</span>
                                    {dutiesThisWeek > 1 && (
                                      <span
                                        className="text-[9px] bg-rose-100 text-rose-800 border border-rose-300 px-1 py-0.2 rounded font-bold"
                                        title={`Mahasiswa ini memiliki ${dutiesThisWeek} jadwal di Minggu ke-${session.sessionNumber}`}
                                      >
                                        ⚠️ {dutiesThisWeek}x M-{session.sessionNumber}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {session.swapInfo && (
                              <div className="flex items-center gap-1">
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium"
                                  title={session.swapInfo.note || 'Barter jadwal penugasan PJ'}
                                >
                                  <span>🔄 Barter PJ</span>
                                  {session.swapInfo.note && (
                                    <span className="text-amber-700 opacity-90">({session.swapInfo.note})</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : isPracticumCourse(courseObj) ? (
                          <span className="text-xs text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 font-medium inline-flex items-center gap-1">
                            <span>🧪 Praktikum (Tanpa PJ)</span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 italic">
                            Belum Ada PJ
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleStatusToggle(session.id)}
                          disabled={!isAdmin}
                          title={isAdmin ? 'Klik untuk mengubah status' : 'Status pertemuan'}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition border ${
                            isAdmin ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            session.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : session.status === 'ongoing'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <span>
                            {session.status === 'completed' ? 'Selesai' : session.status === 'ongoing' ? 'Berlangsung' : 'Belum'}
                          </span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right no-print whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {onNavigateToMaterials && (
                            <button
                              onClick={() => onNavigateToMaterials(session.courseId, session.sessionNumber)}
                              title={`Buka folder materi pertemuan ke-${session.sessionNumber}`}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition cursor-pointer relative"
                            >
                              <FolderOpen className="w-4 h-4" />
                              {(materialCountBySession[`${session.courseId}-${session.sessionNumber}`] || 0) > 0 && (
                                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                                  {materialCountBySession[`${session.courseId}-${session.sessionNumber}`]}
                                </span>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleCopyWA(session)}
                            title="Salin Pesan Format WhatsApp"
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          >
                            {copiedSessionId === session.id ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Share2 className="w-4 h-4" />
                            )}
                          </button>
                          {isAdmin && !isPracticumCourse(courseObj) && session.assignedPjIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSwapSessionAId(session.id);
                                setSwapStudentAId(session.assignedPjIds[0] || '');
                                setSwapSessionBId('');
                                setSwapStudentBId('');
                                setIsSwapModalOpen(true);
                              }}
                              title="Tukar / Barter PJ Pertemuan Ini"
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => setEditingSession({ ...session })}
                              title="Edit Detail Sesi & PJ"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={selectedCourseId === 'all' ? 7 : 6} className="py-10 text-center text-slate-500">
                    Tidak ditemukan sesi perkuliahan yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Swap / Barter PJ */}
      {isSwapModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                <span>Tukar / Ambil Jatah PJ (Barter Giliran)</span>
              </h3>
              <button onClick={() => setIsSwapModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 flex items-start gap-2.5">
              <ArrowLeftRight className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Mekanisme Barter Jatah Tugas (Mutual Swap):</span>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Jika Mahasiswa Pihak Pertama bertukar dengan Mahasiswa Pihak Kedua, maka kedua mahasiswa saling bertukar jadwal tugas secara seimbang. Jatah tugas otomatis saling bertukar sehingga kuota penugasan tetap adil.
                </p>
              </div>
            </div>

            <form onSubmit={handleExecuteSwap} className="space-y-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase">Pihak Pertama</span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={swapSessionAId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      setSwapSessionAId(targetId);
                      const sess = sessions.find((s) => s.id === targetId);
                      if (sess && sess.assignedPjIds.length === 1) {
                        setSwapStudentAId(sess.assignedPjIds[0]);
                      } else {
                        setSwapStudentAId('');
                      }
                    }}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="">Pilih Sesi...</option>
                    {displayedSessions.map((s) => {
                      const c = courseMap.get(s.courseId);
                      return (
                        <option key={s.id} value={s.id}>
                          {c ? `[${c.code}] ` : ''}M-{s.sessionNumber} ({s.date})
                        </option>
                      );
                    })}
                  </select>

                  <select
                    value={swapStudentAId}
                    onChange={(e) => setSwapStudentAId(e.target.value)}
                    disabled={!swapSessionAId}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="">Pilih Mahasiswa...</option>
                    {students
                      .filter((std) => {
                        const sess = sessions.find((s) => s.id === swapSessionAId);
                        return sess?.assignedPjIds.includes(std.id);
                      })
                      .map((std) => (
                        <option key={std.id} value={std.id}>
                          {std.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase">Pihak Kedua (Pengganti)</span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={swapSessionBId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      setSwapSessionBId(targetId);
                      const sess = sessions.find((s) => s.id === targetId);
                      if (sess && sess.assignedPjIds.length === 1) {
                        setSwapStudentBId(sess.assignedPjIds[0]);
                      } else {
                        setSwapStudentBId('');
                      }
                    }}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="">Pilih Sesi...</option>
                    {displayedSessions.map((s) => {
                      const c = courseMap.get(s.courseId);
                      return (
                        <option key={s.id} value={s.id}>
                          {c ? `[${c.code}] ` : ''}M-{s.sessionNumber} ({s.date})
                        </option>
                      );
                    })}
                  </select>

                  <select
                    value={swapStudentBId}
                    onChange={(e) => setSwapStudentBId(e.target.value)}
                    disabled={!swapSessionBId}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    required
                  >
                    <option value="">Pilih Mahasiswa...</option>
                    {students
                      .filter((std) => {
                        const sess = sessions.find((s) => s.id === swapSessionBId);
                        return sess?.assignedPjIds.includes(std.id);
                      })
                      .map((std) => (
                        <option key={std.id} value={std.id}>
                          {std.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSwapModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm cursor-pointer"
                >
                  Tukar Penugasan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Session */}
      {editingSession && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Edit Sesi Minggu #{editingSession.sessionNumber}
              </h3>
              <button onClick={() => setEditingSession(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSessionEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Materi / Pokok Bahasan
                </label>
                <input
                  type="text"
                  value={editingSession.topic}
                  onChange={(e) => setEditingSession({ ...editingSession, topic: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tanggal Perkuliahan
                  </label>
                  <input
                    type="date"
                    value={editingSession.date}
                    onChange={(e) => setEditingSession({ ...editingSession, date: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={editingSession.status}
                    onChange={(e) => setEditingSession({ ...editingSession, status: e.target.value as SessionStatus })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="upcoming">Akan Datang</option>
                    <option value="ongoing">Berlangsung</option>
                    <option value="completed">Selesai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Penugasan PJ (Pilih Mahasiswa)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 space-y-1">
                  {students.filter((s) => s.isActive).map((std) => {
                    const isChecked = editingSession.assignedPjIds.includes(std.id);
                    return (
                      <label
                        key={std.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newIds = e.target.checked
                              ? [...editingSession.assignedPjIds, std.id]
                              : editingSession.assignedPjIds.filter((id) => id !== std.id);
                            setEditingSession({ ...editingSession, assignedPjIds: newIds });
                          }}
                          className="rounded text-slate-900 focus:ring-slate-900"
                        />
                        <span className="font-semibold text-slate-800">{std.name}</span>
                        <span className="text-slate-400 font-mono">({std.nim})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Catatan Sesi (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={editingSession.notes || ''}
                  onChange={(e) => setEditingSession({ ...editingSession, notes: e.target.value })}
                  placeholder="Catatan persiapan ruang atau tugas kelas..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
