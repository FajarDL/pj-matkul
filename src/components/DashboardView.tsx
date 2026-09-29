import React, { useState, useMemo } from 'react';
import type { Course, Student, SessionSchedule, UserRole } from '../types';
import { 
  generateWhatsAppMessage, 
  generateWeeklyWhatsAppMessage, 
  getDayOrder 
} from '../services/rotationAlgorithm';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Check, 
  CheckCircle2, 
  Share2, 
  ArrowRight, 
  Search, 
  Shuffle, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  AlertCircle,
  Sparkles,
  Users,
  Copy,
  ExternalLink,
  MessageSquare,
  X
} from 'lucide-react';

interface DashboardViewProps {
  courses: Course[];
  students: Student[];
  sessions: SessionSchedule[];
  userRole: UserRole;
  currentStudentNim?: string;
  onNavigateToSchedule: (courseId?: string) => void;
  onNavigateToCourses: () => void;
  onNavigateToStudents: () => void;
  onToggleSessionStatus: (sessionId: string) => void;
  onOpenGlobalRotationModal?: () => void;
  onRequestLogin?: () => void;
}

const DAYS_OF_WEEK = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  courses,
  students,
  sessions,
  userRole: _userRole,
  currentStudentNim,
  onNavigateToSchedule,
  onNavigateToCourses,
  onNavigateToStudents,
  onToggleSessionStatus,
  onOpenGlobalRotationModal,
  onRequestLogin: _onRequestLogin,
}) => {
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copiedWeekDigest, setCopiedWeekDigest] = useState(false);
  const [personalSearchQuery, setPersonalSearchQuery] = useState(currentStudentNim || '');
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [editableWaText, setEditableWaText] = useState('');

  // Calculate maximum total sessions across courses (usually 16)
  const maxSessions = useMemo(() => {
    if (courses.length === 0) return 16;
    return Math.max(...courses.map((c) => c.totalSessions || 16), 16);
  }, [courses]);

  // Determine the default active week (earliest week with upcoming or ongoing sessions)
  const defaultWeek = useMemo(() => {
    if (sessions.length === 0) return 1;
    const upcomingSessions = sessions
      .filter((s) => s.status === 'upcoming' || s.status === 'ongoing')
      .sort((a, b) => a.sessionNumber - b.sessionNumber);
    return upcomingSessions.length > 0 ? upcomingSessions[0].sessionNumber : 1;
  }, [sessions]);

  const [selectedWeek, setSelectedWeek] = useState<number>(defaultWeek);

  // Map courses by ID
  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  // Map students by ID
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Filter sessions for the selected week
  const weekSessions = useMemo(() => {
    return sessions.filter((s) => s.sessionNumber === selectedWeek);
  }, [sessions, selectedWeek]);

  // Group week sessions by day
  const sessionsByDay = useMemo(() => {
    const grouped: Record<string, { session: SessionSchedule; course: Course }[]> = {};
    DAYS_OF_WEEK.forEach((d) => (grouped[d] = []));

    weekSessions.forEach((session) => {
      const course = courseMap.get(session.courseId);
      if (course) {
        const dayKey = DAYS_OF_WEEK.find(
          (d) => d.toLowerCase() === course.day.trim().toLowerCase()
        ) || course.day;

        if (!grouped[dayKey]) grouped[dayKey] = [];
        grouped[dayKey].push({ session, course });
      }
    });

    // Sort each day's sessions by start time
    Object.keys(grouped).forEach((dayKey) => {
      grouped[dayKey].sort((a, b) => (a.course.startTime || '').localeCompare(b.course.startTime || ''));
    });

    return grouped;
  }, [weekSessions, courseMap]);

  // Summary statistics for this week
  const weekTotalSessions = weekSessions.length;
  const weekCompletedSessions = weekSessions.filter((s) => s.status === 'completed').length;
  const weekSessionsWithoutPj = weekSessions.filter((s) => s.assignedPjIds.length === 0).length;

  // Active students stats
  const activeStudents = useMemo(() => students.filter((s) => s.isActive), [students]);

  // Personal schedule lookup
  const searchedStudent = useMemo(() => {
    if (!personalSearchQuery.trim()) return null;
    const query = personalSearchQuery.trim().toLowerCase();
    return students.find(
      (s) => s.nim.toLowerCase() === query || s.name.toLowerCase().includes(query)
    );
  }, [personalSearchQuery, students]);

  const studentAssignedSessions = useMemo(() => {
    if (!searchedStudent) return [];
    return sessions
      .filter((s) => s.assignedPjIds.includes(searchedStudent.id))
      .map((s) => ({
        session: s,
        course: courseMap.get(s.courseId),
      }))
      .filter((item): item is { session: SessionSchedule; course: Course } => Boolean(item.course))
      .sort((a, b) => {
        if (a.session.sessionNumber !== b.session.sessionNumber) {
          return a.session.sessionNumber - b.session.sessionNumber;
        }
        return getDayOrder(a.course.day) - getDayOrder(b.course.day);
      });
  }, [searchedStudent, sessions, courseMap]);

  // Handle Copy Single Class WA Reminder
  const handleCopySingleWA = (session: SessionSchedule, course: Course) => {
    const assignedStudents = session.assignedPjIds
      .map((id) => studentMap.get(id))
      .filter((s): s is Student => Boolean(s));

    const text = generateWhatsAppMessage(
      course.name,
      course.lecturer,
      course.day,
      `${course.startTime} - ${course.endTime}`,
      course.room,
      session,
      assignedStudents
    );

    navigator.clipboard.writeText(text);
    setCopiedSessionId(session.id);
    setTimeout(() => setCopiedSessionId(null), 2500);
  };

  // Handle Copy Entire Week WA Digest
  const handleCopyWeekWA = () => {
    const text = generateWeeklyWhatsAppMessage(selectedWeek, courses, sessions, students);
    navigator.clipboard.writeText(text);
    setCopiedWeekDigest(true);
    setTimeout(() => setCopiedWeekDigest(false), 2500);
  };

  // Open WhatsApp Preview Modal
  const openWaModal = () => {
    const text = generateWeeklyWhatsAppMessage(selectedWeek, courses, sessions, students);
    setEditableWaText(text);
    setIsWaModalOpen(true);
  };

  // If no courses added yet
  if (courses.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 sm:p-14 text-center border border-slate-200 shadow-2xs max-w-lg mx-auto my-10">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Belum Ada Jadwal Mata Kuliah</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-2 mb-6 leading-relaxed">
          Mulai dengan menambahkan daftar mata kuliah kelas Anda atau gunakan fitur impor otomatis dari jadwal SIAKAD universitas.
        </p>
        <button
          onClick={onNavigateToCourses}
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-xs transition cursor-pointer"
        >
          <span>Buka Menu Mata Kuliah</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Welcome Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded border border-indigo-400/30">
                SEMESTER BERJALAN
              </span>
              <span className="text-xs text-slate-400">
                {courses.length} Mata Kuliah &bull; {activeStudents.length} Mahasiswa
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Jadwal Lengkap & Rotasi PJ Mingguan
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Penugasan penanggung jawab (PJ) digenerate bergiliran secara adil di seluruh mata kuliah. Pantau jadwal per minggu, status pelaksanaan, dan bagikan pengingat langsung ke grup WhatsApp kelas.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            {onOpenGlobalRotationModal && (
              <button
                onClick={onOpenGlobalRotationModal}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer shadow-xs"
              >
                <Shuffle className="w-4 h-4" />
                <span>Acak Rotasi Semua Matkul</span>
              </button>
            )}

            <button
              onClick={() => onNavigateToSchedule()}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm border border-slate-700 transition cursor-pointer shadow-xs"
            >
              <span>Jadwal Semester</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Week Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}
              disabled={selectedWeek <= 1}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Minggu Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                Minggu Ke-{selectedWeek}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                (Pertemuan Ke-{selectedWeek})
              </span>
              {selectedWeek === defaultWeek && (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  Minggu Ini
                </span>
              )}
            </div>

            <button
              onClick={() => setSelectedWeek((w) => Math.min(maxSessions, w + 1))}
              disabled={selectedWeek >= maxSessions}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Minggu Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Broadcast Week Digest to WhatsApp */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyWeekWA}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              title="Salin rekap jadwal minggu ini ke clipboard (Format ringkas & rapi)"
            >
              {copiedWeekDigest ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>Jadwal Minggu Ini Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Salin Jadwal WA</span>
                </>
              )}
            </button>

            <button
              onClick={openWaModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer"
              title="Lihat pratinjau teks atau kirim langsung ke aplikasi WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Pratinjau / Kirim</span>
            </button>
          </div>
        </div>

        {/* Quick Week Slider/Pills (1 to 16) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          {Array.from({ length: maxSessions }, (_, i) => i + 1).map((weekNum) => {
            const isSelected = weekNum === selectedWeek;
            const isCurrent = weekNum === defaultWeek;
            const isSpecial = weekNum === 8 || weekNum === 16;

            return (
              <button
                key={weekNum}
                onClick={() => setSelectedWeek(weekNum)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-2xs ring-2 ring-slate-900 ring-offset-1'
                    : isCurrent
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                M-{weekNum}
                {isSpecial && <span className="ml-1 text-[10px] opacity-75">{weekNum === 8 ? 'UTS' : 'UAS'}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Warning banner if PJs have not been generated for this week */}
      {weekSessionsWithoutPj > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold">Perhatian:</span> Terdapat {weekSessionsWithoutPj} mata kuliah di minggu ini yang belum memiliki PJ.
            </div>
          </div>
          {onOpenGlobalRotationModal && (
            <button
              onClick={onOpenGlobalRotationModal}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shrink-0 transition cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Acak Rotasi Otomatis</span>
            </button>
          )}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Total Mata Kuliah
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{courses.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Mata kuliah aktif semester ini</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Jadwal Minggu Ke-{selectedWeek}
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{weekTotalSessions} Sesi</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pertemuan terjadwal minggu ini</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Progress Minggu Ini
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {weekCompletedSessions} / {weekTotalSessions}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Sesi telah selesai dilaksanakan</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Mahasiswa Aktif
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600">{activeStudents.length} Orang</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pool rotasi giliran kelas</div>
        </div>
      </div>

      {/* Main Weekly Schedule Grid (Grouped by Day - Senin s/d Sabtu) */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Rincian Jadwal & PJ Kuliah (Minggu Ke-{selectedWeek})</span>
          </h3>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Klik centang untuk menandai sesi telah selesai
          </span>
        </div>

        <div className="space-y-4">
          {DAYS_OF_WEEK.map((dayName) => {
            const dayClasses = sessionsByDay[dayName] || [];

            if (dayClasses.length === 0) {
              return null; // Skip days with no classes to keep UI clean and compact
            }

            return (
              <div 
                key={dayName} 
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
              >
                {/* Day Header */}
                <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                    <h4 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
                      {dayName}
                    </h4>
                    <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200/60">
                      {dayClasses.length} Mata Kuliah
                    </span>
                  </div>

                  <span className="text-xs text-slate-400 font-mono">
                    Pertemuan {selectedWeek}
                  </span>
                </div>

                {/* Day Classes List */}
                <div className="divide-y divide-slate-100">
                  {dayClasses.map(({ session, course }) => {
                    const isCompleted = session.status === 'completed';
                    const assignedStudents = session.assignedPjIds
                      .map((id) => studentMap.get(id))
                      .filter((s): s is Student => Boolean(s));

                    return (
                      <div 
                        key={session.id}
                        className={`p-4 sm:p-5 transition hover:bg-slate-50/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                          isCompleted ? 'bg-slate-50/40 opacity-80' : ''
                        }`}
                      >
                        {/* Course & Schedule Details */}
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                              {course.code}
                            </span>
                            <span className="text-sm sm:text-base font-bold text-slate-900">
                              {course.name}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isCompleted 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {isCompleted ? 'Selesai' : 'Mendatang'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              {course.startTime} - {course.endTime} WIB
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {course.room}
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <span className="text-slate-400">Dosen:</span>
                              <strong className="font-medium text-slate-900">{course.lecturer}</strong>
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 bg-slate-100/70 rounded-lg px-3 py-1.5 inline-block">
                            <span className="font-semibold text-slate-700">Topik:</span>{' '}
                            <span>{session.topic || `Pertemuan Ke-${session.sessionNumber}`}</span>
                          </div>
                        </div>

                        {/* PJ In-Charge Badges & Action Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                          
                          {/* PJ Mahasiswa Badges */}
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              Penanggung Jawab (PJ):
                            </div>
                            {assignedStudents.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {assignedStudents.map((st) => (
                                  <div
                                    key={st.id}
                                    className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-lg text-xs"
                                  >
                                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                      {st.name.charAt(0)}
                                    </div>
                                    <div className="leading-tight">
                                      <span className="font-bold text-indigo-950 block">{st.name}</span>
                                      <span className="text-[10px] text-indigo-600 font-mono">{st.nim}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Belum ada PJ</span>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-1 sm:pt-0">
                            {/* Copy WhatsApp Button */}
                            <button
                              onClick={() => handleCopySingleWA(session, course)}
                              title="Salin Pesan Pengingat WhatsApp"
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 transition cursor-pointer"
                            >
                              {copiedSessionId === session.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="hidden sm:inline">Salin WA</span>
                                </>
                              )}
                            </button>

                            {/* Status Toggle Button */}
                            <button
                              onClick={() => onToggleSessionStatus(session.id)}
                              title={isCompleted ? 'Tandai Belum Selesai' : 'Tandai Selesai'}
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                                isCompleted
                                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              <CheckCircle2 className={`w-3.5 h-3.5 ${isCompleted ? 'text-white' : 'text-slate-400'}`} />
                              <span>{isCompleted ? 'Selesai' : 'Tandai Selesai'}</span>
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Personal Schedule Lookup ("Cari Tugas Saya") */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-600" />
              <span>Cari Jadwal Tugas Saya</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ketik NIM atau nama Anda untuk melihat seluruh jadwal giliran menjadi PJ di semua mata kuliah semester ini.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Ketik NIM atau Nama Mahasiswa..."
              value={personalSearchQuery}
              onChange={(e) => setPersonalSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {searchedStudent ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between bg-indigo-50/70 border border-indigo-100 p-3.5 rounded-xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {searchedStudent.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-indigo-950">
                    {searchedStudent.name}
                  </h4>
                  <span className="font-mono text-[11px] text-indigo-600">
                    {searchedStudent.nim}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold bg-indigo-600 text-white px-2.5 py-1 rounded-lg">
                  {studentAssignedSessions.length} Kali Bertugas
                </span>
              </div>
            </div>

            {studentAssignedSessions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentAssignedSessions.map(({ session, course }) => (
                  <div
                    key={session.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate">{course.name}</span>
                      <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                        M-{session.sessionNumber}
                      </span>
                    </div>
                    <div className="text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{course.day}, {course.startTime} - {course.endTime} WIB</span>
                    </div>
                    <div className="text-slate-500 flex items-center gap-1.5 truncate">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{course.room}</span>
                    </div>
                    <div className="pt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 truncate">Topik: {session.topic}</span>
                      <span className={`font-semibold ${session.status === 'completed' ? 'text-emerald-600' : 'text-blue-600'}`}>
                        {session.status === 'completed' ? '✓ Selesai' : 'Mendatang'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-2">
                Mahasiswa ini belum memiliki penugasan PJ. Klik tombol "Acak Rotasi Semua Matkul" di atas untuk membagikan tugas.
              </p>
            )}
          </div>
        ) : (
          personalSearchQuery.trim() && (
            <p className="text-xs text-slate-500 italic py-2">
              Tidak ditemukan mahasiswa dengan nama atau NIM "{personalSearchQuery}".
            </p>
          )
        )}
      </div>

      {/* Fairness & Equity Distribution Panel */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 sm:p-6 text-xs text-slate-600">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                Distribusi Rotasi PJ yang Adil & Merata
              </h4>
              <p className="text-slate-500 text-xs">
                Sistem menghitung giliran secara berkesinambungan di seluruh mata kuliah sehingga tidak ada mahasiswa yang terbebani berkali-kali di waktu berdekatan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToStudents}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Lihat Statistik Mahasiswa</span>
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Preview & Direct Share Modal */}
      {isWaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    Format WhatsApp Minggu Ke-{selectedWeek}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Format sederhana, rapi, dan ringkas untuk dibagikan ke grup kelas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Pratinjau Teks (Dapat Diedit):</span>
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Siap Kirim
                </span>
              </div>
              <textarea
                rows={9}
                value={editableWaText}
                onChange={(e) => setEditableWaText(e.target.value)}
                className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 leading-relaxed scrollbar-thin"
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(editableWaText);
                  setCopiedWeekDigest(true);
                  setTimeout(() => setCopiedWeekDigest(false), 2500);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition cursor-pointer"
              >
                {copiedWeekDigest ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Tersalin ke Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600" />
                    <span>Salin Teks (Copy)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(editableWaText)}`;
                  window.open(url, '_blank');
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Buka di WhatsApp Langsung</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
