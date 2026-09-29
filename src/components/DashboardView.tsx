import React, { useState, useMemo } from 'react';
import type { Course, Student, SessionSchedule, UserRole } from '../types';
import { 
  generateWhatsAppMessage, 
  generateWeeklyWhatsAppMessage, 
  getDayOrder,
  isPracticumCourse,
  swapPjBetweenSessions,
  revertSessionToOriginal,
  pickFairestCandidateStudent
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
  X,
  RotateCcw,
  Trash2,
  KeyRound,
  ShieldAlert,
  ArrowLeftRight,
  UserCheck,
  UserPlus,
  Undo2,
  History
} from 'lucide-react';
import { authService } from '../services/authService';

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
  onReset?: () => void;
  onDeleteAllCourses?: () => void;
  onDeleteAllStudents?: () => void;
  onUpdateSessions?: (sessions: SessionSchedule[]) => void;
}

interface UndoToastState {
  message: string;
  previousSessions: SessionSchedule[];
  timerId?: ReturnType<typeof setTimeout>;
}

const DAYS_OF_WEEK = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  courses,
  students,
  sessions,
  userRole,
  currentStudentNim,
  onNavigateToSchedule,
  onNavigateToCourses,
  onNavigateToStudents,
  onToggleSessionStatus,
  onOpenGlobalRotationModal,
  onRequestLogin,
  onReset,
  onDeleteAllCourses,
  onDeleteAllStudents,
  onUpdateSessions,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copiedWeekDigest, setCopiedWeekDigest] = useState(false);
  const [personalSearchQuery, setPersonalSearchQuery] = useState(currentStudentNim || '');
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [editableWaText, setEditableWaText] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Swap & Replace PJ Modal State
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [activeSessionForSwap, setActiveSessionForSwap] = useState<SessionSchedule | null>(null);
  const [swapTab, setSwapTab] = useState<'replace' | 'swap'>('replace');
  const [selectedStudentToReplace, setSelectedStudentToReplace] = useState<string>('');
  const [searchStudentQuery, setSearchStudentQuery] = useState('');
  const [onlyShowFreeStudents, setOnlyShowFreeStudents] = useState(false);

  // In Swap mode
  const [swapTargetSessionId, setSwapTargetSessionId] = useState<string>('');
  const [swapSourceStudentId, setSwapSourceStudentId] = useState<string>('');
  const [swapTargetStudentId, setSwapTargetStudentId] = useState<string>('');

  // Undo Toast Notification State
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);

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
  const weekSessionsWithoutPj = weekSessions.filter((s) => {
    const course = courseMap.get(s.courseId);
    return s.assignedPjIds.length === 0 && !isPracticumCourse(course);
  }).length;

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
      assignedStudents,
      isPracticumCourse(course)
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

  // Map of total duties assigned per student across all sessions
  const studentDutyCountMap = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      s.assignedPjIds.forEach((id) => {
        map.set(id, (map.get(id) || 0) + 1);
      });
    });
    return map;
  }, [sessions]);

  // Map of student assignments in this specific selected week
  const studentWeekAssignmentsMap = useMemo(() => {
    const map = new Map<string, { courseName: string; day: string; sessionNumber: number }[]>();
    weekSessions.forEach((s) => {
      const c = courseMap.get(s.courseId);
      if (c) {
        s.assignedPjIds.forEach((id) => {
          const list = map.get(id) || [];
          list.push({ courseName: c.name, day: c.day, sessionNumber: s.sessionNumber });
          map.set(id, list);
        });
      }
    });
    return map;
  }, [weekSessions, courseMap]);

  // Minimum duty count among active students who are free this week (for fair recommendation)
  const minDutyAmongFree = useMemo(() => {
    let min = Infinity;
    activeStudents.forEach((s) => {
      const weekAssignments = studentWeekAssignmentsMap.get(s.id) || [];
      if (weekAssignments.length === 0) {
        const count = studentDutyCountMap.get(s.id) || 0;
        if (count < min) min = count;
      }
    });
    return min === Infinity ? 0 : min;
  }, [activeStudents, studentWeekAssignmentsMap, studentDutyCountMap]);

  // Active course for swap modal
  const activeCourseForSwap = useMemo(() => {
    if (!activeSessionForSwap) return null;
    return courseMap.get(activeSessionForSwap.courseId) || null;
  }, [activeSessionForSwap, courseMap]);

  // Other sessions this week for swapping
  const otherWeekSessionsForSwap = useMemo(() => {
    if (!activeSessionForSwap) return [];
    return weekSessions
      .filter((s) => s.id !== activeSessionForSwap.id)
      .map((s) => ({
        session: s,
        course: courseMap.get(s.courseId),
      }))
      .filter(
        (item): item is { session: SessionSchedule; course: Course } =>
          Boolean(item.course) && !isPracticumCourse(item.course) && item.session.assignedPjIds.length > 0
      );
  }, [activeSessionForSwap, weekSessions, courseMap]);

  const handleOpenSwapModal = (session: SessionSchedule) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    setActiveSessionForSwap(session);
    setSwapTab('replace');
    setSelectedStudentToReplace(session.assignedPjIds[0] || '');
    setSwapSourceStudentId(session.assignedPjIds[0] || '');
    setSearchStudentQuery('');
    setOnlyShowFreeStudents(false);

    // Pick first available target session if any
    const otherSessions = weekSessions
      .filter((s) => s.id !== session.id)
      .filter((s) => {
        const c = courseMap.get(s.courseId);
        return c && !isPracticumCourse(c) && s.assignedPjIds.length > 0;
      });

    if (otherSessions.length > 0) {
      setSwapTargetSessionId(otherSessions[0].id);
      setSwapTargetStudentId(otherSessions[0].assignedPjIds[0] || '');
    } else {
      setSwapTargetSessionId('');
      setSwapTargetStudentId('');
    }

    setIsSwapModalOpen(true);
  };

  // Trigger Undo Toast notification with 8-second auto-dismiss
  const triggerUndoToast = (message: string, previousSessions: SessionSchedule[]) => {
    if (undoToast?.timerId) {
      clearTimeout(undoToast.timerId);
    }
    const timer = setTimeout(() => {
      setUndoToast(null);
    }, 8000);

    setUndoToast({
      message,
      previousSessions,
      timerId: timer,
    });
  };

  // Revert/Undo last action
  const handleUndo = () => {
    if (!undoToast || !onUpdateSessions) return;
    if (undoToast.timerId) {
      clearTimeout(undoToast.timerId);
    }
    const restoredSessions = undoToast.previousSessions;
    onUpdateSessions(restoredSessions);

    if (activeSessionForSwap) {
      const match = restoredSessions.find((s) => s.id === activeSessionForSwap.id);
      if (match) {
        setActiveSessionForSwap(match);
      }
    }
    setUndoToast(null);
  };

  // Revert a session back to original rotation PJ
  const handleRevertToOriginal = (sessionId: string) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!onUpdateSessions) return;

    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) return;

    const previousSessions = [...sessions];
    const updated = revertSessionToOriginal(sessions, sessionId);
    onUpdateSessions(updated);

    const updatedSession = updated.find((s) => s.id === sessionId);
    if (updatedSession && activeSessionForSwap?.id === sessionId) {
      setActiveSessionForSwap(updatedSession);
    }

    const c = courseMap.get(targetSession.courseId);
    triggerUndoToast(
      `PJ sesi ${c?.name || ''} berhasil dikembalikan ke jadwal rotasi awal`,
      previousSessions
    );
  };

  const handleRemovePjFromSession = (studentId: string) => {
    if (!activeSessionForSwap || !onUpdateSessions) return;
    const previousSessions = [...sessions];
    const originalPjIds =
      activeSessionForSwap.originalPjIds !== undefined
        ? activeSessionForSwap.originalPjIds
        : [...activeSessionForSwap.assignedPjIds];

    const nextIds = activeSessionForSwap.assignedPjIds.filter((id) => id !== studentId);
    const updatedSession: SessionSchedule = {
      ...activeSessionForSwap,
      originalPjIds,
      assignedPjIds: nextIds,
      isManuallyEdited: true,
    };

    const updated = sessions.map((s) =>
      s.id === activeSessionForSwap.id ? updatedSession : s
    );
    onUpdateSessions(updated);
    setActiveSessionForSwap(updatedSession);
    if (selectedStudentToReplace === studentId) {
      setSelectedStudentToReplace('');
    }

    const st = studentMap.get(studentId);
    const c = activeCourseForSwap;
    triggerUndoToast(
      `PJ ${st?.name || ''} dicopot dari ${c?.name || 'sesi'}`,
      previousSessions
    );
  };

  const handleAssignOrReplaceStudent = (newStudentId: string) => {
    if (!activeSessionForSwap || !onUpdateSessions) return;
    const previousSessions = [...sessions];
    const originalPjIds =
      activeSessionForSwap.originalPjIds !== undefined
        ? activeSessionForSwap.originalPjIds
        : [...activeSessionForSwap.assignedPjIds];

    let nextIds = [...activeSessionForSwap.assignedPjIds];

    if (selectedStudentToReplace && nextIds.includes(selectedStudentToReplace)) {
      // Replace
      nextIds = nextIds.map((id) => (id === selectedStudentToReplace ? newStudentId : id));
    } else {
      // Add if not already assigned
      if (!nextIds.includes(newStudentId)) {
        nextIds.push(newStudentId);
      }
    }

    const updatedSession: SessionSchedule = {
      ...activeSessionForSwap,
      originalPjIds,
      assignedPjIds: nextIds,
      isManuallyEdited: true,
    };

    const updated = sessions.map((s) =>
      s.id === activeSessionForSwap.id ? updatedSession : s
    );
    onUpdateSessions(updated);
    setActiveSessionForSwap(updatedSession);
    setSelectedStudentToReplace('');

    const newStudent = studentMap.get(newStudentId);
    const c = activeCourseForSwap;
    triggerUndoToast(
      `PJ ${c?.name || 'sesi'} diganti ke ${newStudent?.name || ''}`,
      previousSessions
    );
  };

  const handleExecuteSwap = () => {
    if (
      !activeSessionForSwap ||
      !swapTargetSessionId ||
      !swapSourceStudentId ||
      !swapTargetStudentId ||
      !onUpdateSessions
    ) {
      return;
    }

    const previousSessions = [...sessions];
    const updated = swapPjBetweenSessions(
      sessions,
      activeSessionForSwap.id,
      swapSourceStudentId,
      swapTargetSessionId,
      swapTargetStudentId
    );

    onUpdateSessions(updated);
    setIsSwapModalOpen(false);

    const cA = courseMap.get(activeSessionForSwap.courseId)?.name || 'Sesi 1';
    const cB =
      courseMap.get(sessions.find((s) => s.id === swapTargetSessionId)?.courseId || '')?.name ||
      'Sesi 2';
    triggerUndoToast(
      `Rotasi PJ antara ${cA} dan ${cB} berhasil ditukar`,
      previousSessions
    );
  };

  // Automatically pick the fairest candidate student
  const handleAutoPickFairestStudent = () => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!activeSessionForSwap || !onUpdateSessions) return;

    // Calculate duty counts, last assigned index, course history from all sessions
    const dutyCountMap = new Map<string, number>();
    const lastAssignedIndexMap = new Map<string, number>();
    const courseHistoryMap = new Map<string, Map<string, number>>();

    activeStudents.forEach((s) => {
      dutyCountMap.set(s.id, 0);
      courseHistoryMap.set(s.id, new Map());
    });

    // Chronologically sort all sessions to calculate accurate rest interval
    const sortedSessions = [...sessions].sort((a, b) => {
      if (a.sessionNumber !== b.sessionNumber) return a.sessionNumber - b.sessionNumber;
      const cA = courseMap.get(a.courseId);
      const cB = courseMap.get(b.courseId);
      const dA = getDayOrder(cA?.day || '');
      const dB = getDayOrder(cB?.day || '');
      if (dA !== dB) return dA - dB;
      return (cA?.startTime || '').localeCompare(cB?.startTime || '');
    });

    let currentSessionIdx = 0;
    sortedSessions.forEach((sess, idx) => {
      if (sess.id === activeSessionForSwap.id) {
        currentSessionIdx = idx;
      }
      sess.assignedPjIds.forEach((id) => {
        dutyCountMap.set(id, (dutyCountMap.get(id) || 0) + 1);
        lastAssignedIndexMap.set(id, idx);
        const cMap = courseHistoryMap.get(id) || new Map();
        cMap.set(sess.courseId, (cMap.get(sess.courseId) || 0) + 1);
        courseHistoryMap.set(id, cMap);
      });
    });

    // If replacing someone, exclude that duty from the replaced student's count
    if (selectedStudentToReplace) {
      const curDuty = dutyCountMap.get(selectedStudentToReplace) || 0;
      dutyCountMap.set(selectedStudentToReplace, Math.max(0, curDuty - 1));
    }

    const assignedThisWeek = new Set<string>();
    weekSessions.forEach((sess) => {
      sess.assignedPjIds.forEach((id) => assignedThisWeek.add(id));
    });
    // Remove students currently on this active session from the exclusion set
    activeSessionForSwap.assignedPjIds.forEach((id) => assignedThisWeek.delete(id));

    const chosen = pickFairestCandidateStudent(
      activeStudents,
      activeSessionForSwap.assignedPjIds.filter((id) => id !== selectedStudentToReplace),
      assignedThisWeek,
      dutyCountMap,
      lastAssignedIndexMap,
      courseHistoryMap,
      currentSessionIdx,
      activeSessionForSwap.courseId,
      true,
      'fair_random'
    );

    if (!chosen) {
      alert('Tidak ada mahasiswa aktif yang tersedia untuk penugasan adil saat ini.');
      return;
    }

    handleAssignOrReplaceStudent(chosen.id);
  };

  // Render dedicated Reset Modal
  const renderResetModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print text-left">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">
                Pusat Reset Aplikasi
              </h3>
              <p className="text-xs text-slate-500">
                Pilih opsi pembersihan data yang diinginkan
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsResetModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 pt-1">
          {/* Option 1: Hapus Seluruh Mata Kuliah Saja */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition space-y-2">
            <div className="flex items-start gap-2.5">
              <BookOpen className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Hapus Seluruh Mata Kuliah Saja
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                  Menghapus seluruh daftar mata kuliah ({courses.length}), jadwal mingguan, dan sesi rotasi PJ. Data daftar mahasiswa tetap aman tersimpan.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={courses.length === 0}
              onClick={() => {
                if (courses.length === 0) return;
                if (
                  confirm(
                    `Apakah Anda yakin ingin menghapus SELURUH mata kuliah (${courses.length} mata kuliah)?\n\nSeluruh jadwal sesi dan rotasi PJ yang terkait akan dihapus. Data mahasiswa akan tetap aman.`
                  )
                ) {
                  setIsResetModalOpen(false);
                  onDeleteAllCourses?.();
                }
              }}
              className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua Mata Kuliah ({courses.length})</span>
            </button>
          </div>

          {/* Option 2: Hapus Seluruh Mahasiswa Saja */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition space-y-2">
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Hapus Seluruh Mahasiswa Saja
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                  Menghapus seluruh data mahasiswa ({students.length}) dan mengosongkan penugasan PJ. Daftar mata kuliah dan jadwal sesi tetap aman tersimpan.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={students.length === 0}
              onClick={() => {
                if (students.length === 0) return;
                if (
                  confirm(
                    `Apakah Anda yakin ingin menghapus SELURUH mahasiswa (${students.length} mahasiswa)?\n\nDaftar mata kuliah dan jadwal akan tetap aman, namun seluruh penugasan PJ pada jadwal akan dikosongkan.`
                  )
                ) {
                  setIsResetModalOpen(false);
                  onDeleteAllStudents?.();
                }
              }}
              className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua Mahasiswa ({students.length})</span>
            </button>
          </div>

          {/* Option 2: Reset Kunci Akses */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition space-y-2">
            <div className="flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Reset Kunci Akses Masuk
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                  Menghapus kunci akses dari browser ini. Anda akan diminta membuat kunci baru saat berikutnya membuka aplikasi. Data perkuliahan tetap aman tersimpan.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('Apakah Anda yakin ingin mereset kunci akses aplikasi?')) {
                  authService.resetKey();
                  setIsResetModalOpen(false);
                  window.location.reload();
                }
              }}
              className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Reset Kunci Akses</span>
            </button>
          </div>

          {/* Option 3: Reset Total */}
          <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">
                  Reset Total Aplikasi (Kembali ke Awal)
                </h4>
                <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                  Menghapus seluruh jadwal, mahasiswa, DAN kunci akses secara menyeluruh (Factory Reset).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('PERINGATAN: Seluruh data perkuliahan, rotasi PJ, dan kunci akses akan dihapus total secara permanen. Lanjutkan?')) {
                  authService.resetAllAuthAndSecurity();
                  onReset?.();
                  setIsResetModalOpen(false);
                  window.location.reload();
                }
              }}
              className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Reset Total Seluruh Aplikasi</span>
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsResetModalOpen(false)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );

  // Render dedicated Swap & Replace PJ Modal
  const renderSwapModal = () => {
    if (!isSwapModalOpen || !activeSessionForSwap || !activeCourseForSwap) return null;

    const currentPjStudents = activeSessionForSwap.assignedPjIds
      .map((id) => studentMap.get(id))
      .filter((s): s is Student => Boolean(s));

    // Target session object for swap
    const targetSessionObj = otherWeekSessionsForSwap.find(
      (item) => item.session.id === swapTargetSessionId
    );
    const targetPjStudents = targetSessionObj
      ? targetSessionObj.session.assignedPjIds
          .map((id) => studentMap.get(id))
          .filter((s): s is Student => Boolean(s))
      : [];

    // Filter students for Tab 1 (Replace/Add)
    const availableStudents = students
      .filter((s) => s.isActive)
      .filter((s) => {
        if (!searchStudentQuery.trim()) return true;
        const q = searchStudentQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.nim.toLowerCase().includes(q);
      })
      .filter((s) => {
        if (!onlyShowFreeStudents) return true;
        const assignments = studentWeekAssignmentsMap.get(s.id) || [];
        return assignments.length === 0;
      })
      .sort((a, b) => {
        // Sort students: those who haven't worked this week first, then by least duties
        const aAssignedThisWeek = (studentWeekAssignmentsMap.get(a.id) || []).length;
        const bAssignedThisWeek = (studentWeekAssignmentsMap.get(b.id) || []).length;
        if (aAssignedThisWeek !== bAssignedThisWeek) {
          return aAssignedThisWeek - bAssignedThisWeek;
        }
        const aCount = studentDutyCountMap.get(a.id) || 0;
        const bCount = studentDutyCountMap.get(b.id) || 0;
        if (aCount !== bCount) return aCount - bCount;
        return a.name.localeCompare(b.name);
      });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs no-print text-left">
        <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
          
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                  {activeCourseForSwap.code}
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Tukar / Ganti Penanggung Jawab (PJ)
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2.5">
                <span className="font-semibold text-slate-900">{activeCourseForSwap.name}</span>
                <span>&bull;</span>
                <span>{activeCourseForSwap.day}, {activeCourseForSwap.startTime} - {activeCourseForSwap.endTime}</span>
                <span>&bull;</span>
                <span>Minggu Ke-{selectedWeek}</span>
              </p>
            </div>
            <button
              onClick={() => setIsSwapModalOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100 transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSwapTab('replace')}
              className={`flex-1 py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                swapTab === 'replace'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>Ganti / Tambah PJ</span>
            </button>
            <button
              type="button"
              onClick={() => setSwapTab('swap')}
              className={`flex-1 py-2 px-3 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                swapTab === 'swap'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4 text-amber-600" />
              <span>Tukar dengan Sesi Lain</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            
            {/* Original PJ Status & Quick Revert Banner */}
            {(() => {
              const originalIds = activeSessionForSwap.originalPjIds || activeSessionForSwap.assignedPjIds;
              const originalStudents = originalIds
                .map((id) => studentMap.get(id))
                .filter((s): s is Student => Boolean(s));

              const isDifferent =
                activeSessionForSwap.isManuallyEdited ||
                (activeSessionForSwap.originalPjIds &&
                  JSON.stringify(activeSessionForSwap.originalPjIds) !==
                    JSON.stringify(activeSessionForSwap.assignedPjIds));

              if (isDifferent) {
                return (
                  <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <History className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Sesi Ini Pernah Mengalami Perubahan Manual</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-snug">
                        PJ Asli Rotasi Awal:{' '}
                        <span className="font-semibold text-slate-900">
                          {originalStudents.length > 0
                            ? originalStudents.map((s) => s.name).join(', ')
                            : 'Belum Ditugaskan'}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevertToOriginal(activeSessionForSwap.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer shrink-0"
                      title="Kembalikan penugasan PJ sesi ini ke jadwal rotasi awal"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Kembalikan ke PJ Semula</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Sesuai rotasi otomatis awal</span>
                  </div>
                  {originalStudents.length > 0 && (
                    <span className="text-slate-500 font-medium truncate max-w-[200px] sm:max-w-xs">
                      PJ: {originalStudents.map((s) => s.name).join(', ')}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* TAB 1: REPLACE / ADD PJ */}
            {swapTab === 'replace' && (
              <div className="space-y-4 text-xs">
                
                {/* Current PJs on this session */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>Mahasiswa Bertugas Saat Ini:</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                        {currentPjStudents.length} Mahasiswa
                      </span>
                    </span>
                    {selectedStudentToReplace && (
                      <button
                        type="button"
                        onClick={() => setSelectedStudentToReplace('')}
                        className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                      >
                        Batal Pilih Penggantian
                      </button>
                    )}
                  </div>

                  {currentPjStudents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentPjStudents.map((st) => {
                        const isSelectedForReplace = selectedStudentToReplace === st.id;
                        const dutyCount = studentDutyCountMap.get(st.id) || 0;

                        return (
                          <div
                            key={st.id}
                            className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                              isSelectedForReplace
                                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500 ring-offset-1'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                                {st.name.charAt(0)}
                              </div>
                              <div className="min-w-0 leading-tight">
                                <span className="font-bold text-slate-900 block truncate">{st.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{st.nim}</span>
                                <span className="text-[10px] text-indigo-700 font-medium block">
                                  {dutyCount}x bertugas semester ini
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentToReplace(isSelectedForReplace ? '' : st.id)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  isSelectedForReplace
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                                title="Pilih mahasiswa ini untuk digantikan"
                              >
                                {isSelectedForReplace ? 'Akan Diganti' : 'Ganti Ini'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemovePjFromSession(st.id)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus dari sesi ini"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs italic bg-white p-3 rounded-lg border border-dashed border-slate-300 text-center">
                      Belum ada mahasiswa yang ditugaskan pada sesi ini. Pilih mahasiswa dari daftar di bawah untuk menugaskan.
                    </div>
                  )}

                  {selectedStudentToReplace && (
                    <div className="p-2 bg-indigo-100/60 text-indigo-900 rounded-lg text-[11px] font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        Pilih satu mahasiswa dari daftar di bawah untuk menggantikan{' '}
                        <strong>{studentMap.get(selectedStudentToReplace)?.name}</strong>.
                      </span>
                    </div>
                  )}
                </div>

                {/* Candidate Student Selection */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs">
                      {selectedStudentToReplace ? 'Pilih Mahasiswa Pengganti:' : 'Pilih Mahasiswa untuk Ditugaskan:'}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAutoPickFairestStudent}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer"
                        title="Pilih mahasiswa secara acak yang paling adil (beban tugas terendah, bebas minggu ini, istirahat terlama)"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>🎲 Acak yang Paling Adil</span>
                      </button>

                      {/* Filter checkbox: Free students this week */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition">
                        <input
                          type="checkbox"
                          checked={onlyShowFreeStudents}
                          onChange={(e) => setOnlyShowFreeStudents(e.target.checked)}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>Hanya bebas tugas minggu ini</span>
                      </label>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari nama atau NIM mahasiswa..."
                      value={searchStudentQuery}
                      onChange={(e) => setSearchStudentQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    />
                  </div>

                  {/* Student Candidates List */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {availableStudents.length > 0 ? (
                      availableStudents.map((st) => {
                        const isAlreadyAssignedToThis = activeSessionForSwap.assignedPjIds.includes(st.id);
                        const isOriginalPjOfThis = (activeSessionForSwap.originalPjIds || []).includes(st.id);
                        const weekAssignments = studentWeekAssignmentsMap.get(st.id) || [];
                        const isAssignedOtherDaysThisWeek = weekAssignments.length > 0;
                        const dutyCount = studentDutyCountMap.get(st.id) || 0;

                        return (
                          <div
                            key={st.id}
                            className={`p-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 transition ${
                              isOriginalPjOfThis && !isAlreadyAssignedToThis ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                                {st.name.charAt(0)}
                              </div>
                              <div className="min-w-0 leading-tight">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-900 block truncate">{st.name}</span>
                                  {isOriginalPjOfThis && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                      ★ PJ Asli Rotasi
                                    </span>
                                  )}
                                  {!isAssignedOtherDaysThisWeek && dutyCount === minDutyAmongFree && (
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.2 rounded">
                                      ✨ Rekomendasi Paling Adil
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                                  <span className="font-mono">{st.nim}</span>
                                  <span>&bull;</span>
                                  <span>Total {dutyCount}x tugas</span>
                                  <span>&bull;</span>
                                  {isAssignedOtherDaysThisWeek ? (
                                    <span className="text-amber-700 font-semibold">
                                      ⚠️ Minggu ini: {weekAssignments.map((a) => `${a.day} (${a.courseName})`).join(', ')}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-semibold">
                                      ✓ Bebas tugas minggu ini
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isAlreadyAssignedToThis ? (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                  Sedang Bertugas
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAssignOrReplaceStudent(st.id)}
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1"
                                >
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>
                                    {selectedStudentToReplace ? 'Gantikan' : '+ Jadikan PJ'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-slate-400 text-xs italic">
                        Tidak ada mahasiswa yang cocok dengan pencarian / filter bebas tugas.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: SWAP WITH ANOTHER SESSION */}
            {swapTab === 'swap' && (
              <div className="space-y-4 text-xs">
                
                {/* Step 1: Select Student from Current Session */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 block">
                    1. Pilih Mahasiswa dari Sesi Ini ({activeCourseForSwap.name}):
                  </span>
                  {currentPjStudents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentPjStudents.map((st) => (
                        <label
                          key={st.id}
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2.5 transition ${
                            swapSourceStudentId === st.id
                              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-500'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="swapSource"
                            value={st.id}
                            checked={swapSourceStudentId === st.id}
                            onChange={() => setSwapSourceStudentId(st.id)}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">{st.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{st.nim}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs">
                      Sesi ini belum memiliki PJ untuk ditukar. Silakan gunakan tab <strong>"Ganti / Tambah PJ"</strong> terlebih dahulu.
                    </div>
                  )}
                </div>

                {/* Step 2: Select Target Session from this week */}
                {currentPjStudents.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 block">
                      2. Pilih Sesi Lain di Minggu Ke-{selectedWeek} untuk Ditukar:
                    </span>
                    {otherWeekSessionsForSwap.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={swapTargetSessionId}
                          onChange={(e) => {
                            const newTargetId = e.target.value;
                            setSwapTargetSessionId(newTargetId);
                            const found = otherWeekSessionsForSwap.find((item) => item.session.id === newTargetId);
                            if (found && found.session.assignedPjIds.length > 0) {
                              setSwapTargetStudentId(found.session.assignedPjIds[0]);
                            } else {
                              setSwapTargetStudentId('');
                            }
                          }}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        >
                          {otherWeekSessionsForSwap.map(({ session, course }) => (
                            <option key={session.id} value={session.id}>
                              {course.day} ({course.startTime}) &mdash; {course.name} ({session.assignedPjIds.length} PJ)
                            </option>
                          ))}
                        </select>

                        {/* Step 3: Select Target Student */}
                        {targetPjStudents.length > 0 && (
                          <div className="pt-2">
                            <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                              Pilih Mahasiswa dari Sesi Tujuan:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {targetPjStudents.map((st) => (
                                <label
                                  key={st.id}
                                  className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2.5 transition ${
                                    swapTargetStudentId === st.id
                                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500'
                                      : 'bg-white border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="swapTarget"
                                    value={st.id}
                                    checked={swapTargetStudentId === st.id}
                                    onChange={() => setSwapTargetStudentId(st.id)}
                                    className="text-amber-600 focus:ring-amber-500"
                                  />
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-900 block truncate">{st.name}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{st.nim}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs">
                        Tidak ada sesi perkuliahan lain di minggu ini yang memiliki PJ untuk ditukar.
                      </div>
                    )}
                  </div>
                )}

                {/* Preview Box */}
                {swapSourceStudentId && swapTargetStudentId && targetSessionObj && (
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider block">
                      Pratinjau Pertukaran Tugas:
                    </span>
                    <div className="flex items-center justify-between gap-3 text-xs bg-white p-3 rounded-lg border border-indigo-200">
                      <div className="text-left leading-tight">
                        <span className="font-bold text-indigo-950 block">
                          {studentMap.get(swapSourceStudentId)?.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Pindah ke: {targetSessionObj.course.day} ({targetSessionObj.course.name})
                        </span>
                      </div>
                      <ArrowLeftRight className="w-5 h-5 text-indigo-600 shrink-0" />
                      <div className="text-right leading-tight">
                        <span className="font-bold text-amber-950 block">
                          {studentMap.get(swapTargetStudentId)?.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Pindah ke: {activeCourseForSwap.day} ({activeCourseForSwap.name})
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action button */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={!swapSourceStudentId || !swapTargetStudentId}
                    onClick={handleExecuteSwap}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Konfirmasi & Tukar Posisi PJ</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsSwapModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
            >
              Tutup
            </button>
          </div>

        </div>
      </div>
    );
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
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onNavigateToCourses}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-xs transition cursor-pointer"
          >
            <span>Buka Menu Mata Kuliah</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-rose-200 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-rose-600" />
            <span>Reset Data</span>
          </button>
        </div>
        {isResetModalOpen && renderResetModal()}
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

            <button
              onClick={() => setIsResetModalOpen(true)}
              title="Reset data jadwal atau aplikasi"
              className="inline-flex items-center gap-1.5 bg-slate-800/80 hover:bg-rose-950/50 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800 font-medium px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-rose-400" />
              <span>Reset</span>
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
                            {isPracticumCourse(course) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                🧪 Praktikum
                              </span>
                            )}
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
                          <div className="space-y-1.5">
                            {(() => {
                              const isManuallyEdited =
                                session.isManuallyEdited ||
                                (session.originalPjIds &&
                                  JSON.stringify(session.originalPjIds) !==
                                    JSON.stringify(session.assignedPjIds));

                              const originalPjNames = (session.originalPjIds || [])
                                .map((id) => studentMap.get(id)?.name)
                                .filter(Boolean)
                                .join(', ');

                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                      Penanggung Jawab (PJ):
                                    </span>
                                    {isManuallyEdited && (
                                      <span
                                        className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded"
                                        title={`Diedit manual. PJ asli rotasi: ${originalPjNames || 'Belum ada'}`}
                                      >
                                        ✏️ Diedit Manual
                                      </span>
                                    )}
                                  </div>
                                  {!isPracticumCourse(course) && (
                                    <div className="flex items-center gap-1.5">
                                      {isManuallyEdited && (
                                        <button
                                          type="button"
                                          onClick={() => handleRevertToOriginal(session.id)}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 transition cursor-pointer"
                                          title={`Kembalikan ke PJ asli rotasi (${originalPjNames || 'rotasi awal'})`}
                                        >
                                          <RotateCcw className="w-3 h-3 text-amber-600" />
                                          <span className="hidden sm:inline">PJ Asli</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSwapModal(session)}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition cursor-pointer"
                                        title="Tukar atau ganti penanggung jawab sesi ini"
                                      >
                                        <ArrowLeftRight className="w-3 h-3 text-indigo-600" />
                                        <span>Tukar / Ganti</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

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
                            ) : isPracticumCourse(course) ? (
                              <div className="inline-flex items-center gap-1.5 text-xs text-purple-800 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                                <span className="text-xs">🧪</span>
                                <span className="font-semibold">Praktikum (Tanpa PJ)</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenSwapModal(session)}
                                className="inline-flex items-center gap-1.5 text-xs text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-300 font-semibold cursor-pointer transition"
                              >
                                <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                                <span>Belum ada PJ (Klik untuk Menugaskan)</span>
                              </button>
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

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={onNavigateToStudents}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Lihat Statistik Mahasiswa</span>
            </button>
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3.5 py-2 rounded-xl border border-rose-200 shadow-2xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>Reset Data</span>
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

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && renderResetModal()}

      {/* Swap / Replace PJ Modal */}
      {renderSwapModal()}

      {/* Floating Undo Toast Notification */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200 no-print">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 max-w-md">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-100 truncate">
                {undoToast.message}
              </p>
              <p className="text-[10px] text-slate-400">
                Salah klik? Anda dapat mengurungkannya sekarang
              </p>
            </div>
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Urungkan</span>
            </button>
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
