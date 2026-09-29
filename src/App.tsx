import { useState, useEffect } from 'react';
import type { AppState, Course, SessionSchedule, Student, SessionStatus, AuthSession } from './types';
import { storageService } from './services/storageService';
import { authService } from './services/authService';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { ScheduleView } from './components/ScheduleView';
import { StudentManager } from './components/StudentManager';
import { CourseManager } from './components/CourseManager';
import { PrintScheduleView } from './components/PrintScheduleView';
import { LoginModal } from './components/LoginModal';
import { SecuritySettingsModal } from './components/SecuritySettingsModal';
import { checkCourseDuplicate } from './services/scheduleValidation';
import { CheckCircle2 } from 'lucide-react';

export function App() {
  const [data, setData] = useState<AppState>(() => storageService.loadData());
  const [authSession, setAuthSession] = useState<AuthSession>(() => authService.getSession());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedule' | 'students' | 'courses'>('dashboard');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Handle URL reset flags (e.g. ?reset=true or ?reset=auth)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === 'all') {
        storageService.clearAllData();
        authService.resetAllAuthAndSecurity();
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      } else if (params.get('reset') === 'true' || params.get('reset') === 'auth') {
        authService.resetAllAuthAndSecurity();
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-save to localStorage whenever data changes
  useEffect(() => {
    storageService.saveData(data);
  }, [data]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Active course
  const activeCourse = data.courses.find((c) => c.id === data.activeCourseId) || data.courses[0];

  // Handler to switch active course
  const handleSelectCourse = (courseId: string) => {
    setData((prev) => ({ ...prev, activeCourseId: courseId }));
    showToast('Mata kuliah aktif diubah');
  };

  // Handlers for Courses
  const handleUpdateCourses = (newCourses: Course[]) => {
    setData((prev) => {
      let activeId = prev.activeCourseId;
      if (!newCourses.some((c) => c.id === activeId)) {
        activeId = newCourses[0]?.id || null;
      }
      return { ...prev, courses: newCourses, activeCourseId: activeId };
    });
    showToast('Data mata kuliah diperbarui');
  };

  // Add course with curriculum preset (autofills syllabus topics for 16 sessions)
  const handleAddCourseWithPreset = (newCourse: Course, topics: string[]) => {
    const dupCheck = checkCourseDuplicate(newCourse, data.courses);
    if (dupCheck.isDuplicate) {
      alert(`Gagal menambahkan: ${dupCheck.message}`);
      return;
    }

    const today = new Date();
    const newSessions: SessionSchedule[] = [];

    for (let i = 1; i <= newCourse.totalSessions; i++) {
      const sDate = new Date(today);
      sDate.setDate(today.getDate() + (i - 1) * 7);
      const topic = topics[i - 1] || `Pertemuan ${i}`;

      newSessions.push({
        id: `sess-${newCourse.id}-${i}-${Date.now()}`,
        courseId: newCourse.id,
        sessionNumber: i,
        date: sDate.toISOString().split('T')[0],
        topic,
        assignedPjIds: [],
        status: 'upcoming',
      });
    }

    setData((prev) => ({
      ...prev,
      courses: [...prev.courses, newCourse],
      sessions: [...prev.sessions, ...newSessions],
      activeCourseId: newCourse.id,
    }));

    showToast(`Mata kuliah ${newCourse.name} & 16 silabus berhasil dibuat otomatis!`);
  };

  // Helper to get next date matching day name
  const getNextDateForDay = (dayName: string): Date => {
    const dayMap: Record<string, number> = {
      minggu: 0,
      senin: 1,
      selasa: 2,
      rabu: 3,
      kamis: 4,
      jumat: 5,
      sabtu: 6,
    };
    const targetDay = dayMap[dayName.trim().toLowerCase()] ?? 1;
    const now = new Date();
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7;
    const result = new Date(now);
    result.setDate(now.getDate() + diff);
    return result;
  };

  // Batch import courses from SIAKAD parser
  const handleBatchImportCourses = (newCourses: Omit<Course, 'id'>[]) => {
    const timestamp = Date.now();
    const createdCourses: Course[] = [];
    const allSessions: SessionSchedule[] = [];
    let skippedDuplicates = 0;

    // Filter duplicates against existing data.courses and within the newCourses batch
    const candidateCourses: Omit<Course, 'id'>[] = [];
    const tempExisting: Course[] = [...data.courses];

    for (const c of newCourses) {
      const existingCheck = checkCourseDuplicate(c, tempExisting);
      if (existingCheck.isDuplicate) {
        skippedDuplicates++;
        continue;
      }
      candidateCourses.push(c);
      tempExisting.push({ ...c, id: `temp-${candidateCourses.length}` });
    }

    if (candidateCourses.length === 0) {
      showToast('Semua mata kuliah sudah terdaftar sebelumnya (tidak ada data baru).');
      return;
    }

    candidateCourses.forEach((c, cIdx) => {
      const courseId = `course-${timestamp}-${cIdx}`;
      const course: Course = { ...c, id: courseId };
      createdCourses.push(course);

      const firstSessionDate = getNextDateForDay(course.day);

      for (let i = 1; i <= course.totalSessions; i++) {
        const sDate = new Date(firstSessionDate);
        sDate.setDate(firstSessionDate.getDate() + (i - 1) * 7);

        let topic = `Pertemuan ${i} - ${course.name}`;
        if (i === 8) topic = `Ujian Tengah Semester (UTS) - ${course.name}`;
        if (i === 16) topic = `Ujian Akhir Semester (UAS) - ${course.name}`;

        allSessions.push({
          id: `sess-${courseId}-${i}-${timestamp}`,
          courseId,
          sessionNumber: i,
          date: sDate.toISOString().split('T')[0],
          topic,
          assignedPjIds: [],
          status: 'upcoming',
        });
      }
    });

    setData((prev) => ({
      ...prev,
      courses: [...prev.courses, ...createdCourses],
      sessions: [...prev.sessions, ...allSessions],
      activeCourseId: prev.activeCourseId || createdCourses[0]?.id || null,
    }));

    if (skippedDuplicates > 0) {
      showToast(`Berhasil mengimpor ${createdCourses.length} mata kuliah baru (${skippedDuplicates} duplikat dilewati)!`);
    } else {
      showToast(`Berhasil mengimpor ${createdCourses.length} mata kuliah & sesi pertemuan otomatis!`);
    }
  };

  const handleDeleteCourse = (courseId: string) => {
    setData((prev) => {
      const remainingCourses = prev.courses.filter((c) => c.id !== courseId);
      const remainingSessions = prev.sessions.filter((s) => s.courseId !== courseId);
      const newActiveId = remainingCourses[0]?.id || null;
      return {
        ...prev,
        courses: remainingCourses,
        sessions: remainingSessions,
        activeCourseId: newActiveId,
      };
    });
    showToast('Mata kuliah berhasil dihapus');
  };

  // Handlers for Students
  const handleUpdateStudents = (newStudents: Student[]) => {
    setData((prev) => ({ ...prev, students: newStudents }));
    showToast('Data mahasiswa berhasil diperbarui');
  };

  // Handlers for Sessions
  const handleUpdateSessions = (newSessions: SessionSchedule[]) => {
    setData((prev) => ({ ...prev, sessions: newSessions }));
    showToast('Jadwal rotasi diperbarui');
  };

  // Toggle single session status from dashboard
  const handleToggleSessionStatus = (sessionId: string) => {
    setData((prev) => {
      const updated = prev.sessions.map((s) => {
        if (s.id === sessionId) {
          const nextStatus: SessionStatus = s.status === 'completed' ? 'upcoming' : 'completed';
          return { ...s, status: nextStatus };
        }
        return s;
      });
      return { ...prev, sessions: updated };
    });
    showToast('Status pertemuan diperbarui');
  };

  // Backup & Restore
  const handleBackup = () => {
    storageService.exportBackup(data);
    showToast('File cadangan data berhasil diunduh');
  };

  const handleRestore = async (file: File) => {
    try {
      const restored = await storageService.importBackup(file);
      setData(restored);
      showToast('Data berhasil dipulihkan dari file!');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleReset = (skipConfirm: boolean = false) => {
    if (skipConfirm || confirm('Apakah Anda yakin ingin menghapus seluruh data? Semua mata kuliah, jadwal, dan daftar mahasiswa akan dikosongkan.')) {
      const emptyData = storageService.clearAllData();
      setData(emptyData);
      showToast('Seluruh data berhasil dihapus dan dikosongkan.');
    }
  };

  const handleLoginSuccess = (session: AuthSession) => {
    setAuthSession(session);
    showToast('Kunci akses terverifikasi! Halaman utama terbuka.');
  };

  const handleLogout = () => {
    authService.lock();
    setAuthSession(authService.getSession());
    showToast('Aplikasi telah dikunci.');
  };

  // Gated Access: Require login to view or use the application
  if (!authSession.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
        <LoginModal
          isOpen={true}
          isGate={true}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col font-sans antialiased text-slate-900">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        courses={data.courses}
        activeCourseId={activeCourse?.id || null}
        userRole={authSession.role}
        userName={authSession.name || authSession.username || 'Tamu'}
        pendingCount={authService.getPendingCount()}
        onSelectCourse={handleSelectCourse}
        onBackup={handleBackup}
        onRestore={handleRestore}
        onReset={handleReset}
        onOpenNewCourse={() => {
          if (authSession.role !== 'admin' && authSession.role !== 'owner') {
            setIsLoginModalOpen(true);
          } else {
            setActiveTab('courses');
          }
        }}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 no-print">
        {activeTab === 'students' && (
          <StudentManager
            students={data.students}
            sessions={data.sessions}
            activeCourseId={activeCourse?.id || null}
            userRole={authSession.role}
            onUpdateStudents={handleUpdateStudents}
            onRequestLogin={() => setIsLoginModalOpen(true)}
          />
        )}

        {activeTab === 'courses' && (
          <CourseManager
            courses={data.courses}
            activeCourseId={activeCourse?.id || null}
            sessions={data.sessions}
            userRole={authSession.role}
            onSelectCourse={(id) => {
              handleSelectCourse(id);
              setActiveTab('dashboard');
            }}
            onUpdateCourses={handleUpdateCourses}
            onDeleteCourse={handleDeleteCourse}
            onAddCourseWithPreset={handleAddCourseWithPreset}
            onBatchImportCourses={handleBatchImportCourses}
            onRequestLogin={() => setIsLoginModalOpen(true)}
            onUpdateSessions={handleUpdateSessions}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            courses={data.courses}
            students={data.students}
            sessions={data.sessions}
            userRole={authSession.role}
            currentStudentNim={authSession.studentNim}
            onNavigateToSchedule={(courseId) => {
              if (courseId) handleSelectCourse(courseId);
              setActiveTab('schedule');
            }}
            onNavigateToCourses={() => setActiveTab('courses')}
            onNavigateToStudents={() => setActiveTab('students')}
            onToggleSessionStatus={handleToggleSessionStatus}
            onOpenGlobalRotationModal={() => {
              setActiveTab('schedule');
            }}
            onRequestLogin={() => setIsLoginModalOpen(true)}
            onReset={() => handleReset(true)}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleView
            courses={data.courses}
            students={data.students}
            sessions={data.sessions}
            userRole={authSession.role}
            course={activeCourse}
            onUpdateSessions={handleUpdateSessions}
            onRequestLogin={() => setIsLoginModalOpen(true)}
          />
        )}
      </main>

      {/* Print View for PDF generation */}
      {activeCourse && (
        <PrintScheduleView
          course={activeCourse}
          students={data.students}
          sessions={data.sessions}
        />
      )}

      {/* Modals for Auth and Security */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <SecuritySettingsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onSuccess={(msg) => showToast(msg)}
      />

      {/* Professional Academic Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">SI-ROTASI</span>
            <span>&bull;</span>
            <span>Sistem Informasi Manajemen Rotasi Penanggung Jawab Akademik</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
              Status: Akses Penuh (Kunci Terverifikasi)
            </span>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-slate-700 hover:text-slate-900 font-medium"
            >
              Kembali ke Atas &uarr;
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
