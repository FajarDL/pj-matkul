import type { Student, SessionSchedule, RotationConfig, Course } from '../types';

export interface StudentPjStat {
  student: Student;
  totalAssigned: number;
  completedCount: number;
  upcomingCount: number;
  sessionNumbers: number[];
}

/**
 * Fisher-Yates Shuffle algorithm for true fair randomization
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates an equitable schedule rotation for the given course and student list
 */
export function generateRotationSchedule(
  courseId: string,
  students: Student[],
  totalSessions: number,
  config: RotationConfig,
  existingSessions: SessionSchedule[] = []
): SessionSchedule[] {
  const activeStudents = students.filter((s) => s.isActive);
  if (activeStudents.length === 0) {
    return [];
  }

  // Determine ordering based on mode
  let sortedStudents: Student[] = [];
  if (config.mode === 'fair_random') {
    sortedStudents = shuffleArray(activeStudents);
  } else if (config.mode === 'sequential_nim') {
    sortedStudents = [...activeStudents].sort((a, b) => a.nim.localeCompare(b.nim));
  } else if (config.mode === 'alphabetical') {
    sortedStudents = [...activeStudents].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sortedStudents = [...activeStudents];
  }

  // Calculate dates based on startDate and intervalDays
  const startDateObj = config.startDate ? new Date(config.startDate) : new Date();

  // Pointer for rotation queue
  let studentPool = [...sortedStudents];
  let poolIndex = 0;

  const newSessions: SessionSchedule[] = [];

  for (let sNum = 1; sNum <= totalSessions; sNum++) {
    // Calculate session date
    const sessionDate = new Date(startDateObj);
    sessionDate.setDate(startDateObj.getDate() + (sNum - 1) * (config.intervalDays || 7));
    const dateStr = sessionDate.toISOString().split('T')[0];

    // Check if session already had custom topic or notes
    const existing = existingSessions.find((s) => s.sessionNumber === sNum && s.courseId === courseId);
    let defaultTopic = `Pertemuan ${sNum}`;
    if (sNum === 8) defaultTopic = 'Ujian Tengah Semester (UTS)';
    if (sNum === totalSessions) defaultTopic = 'Ujian Akhir Semester (UAS)';

    const topic = existing?.topic || defaultTopic;
    const notes = existing?.notes || '';
    const status = existing?.status || 'upcoming';

    // Assign PJs for this session
    const assignedIds: string[] = [];
    const count = Math.max(1, config.pjCountPerSession);

    // If session is marked as excluded (e.g. holiday or no PJ required)
    const isExcluded = config.excludeSessionNumbers?.includes(sNum);

    if (!isExcluded) {
      for (let p = 0; p < count; p++) {
        // If we ran out of students in the current pool, re-fill and re-shuffle if random
        if (poolIndex >= studentPool.length) {
          studentPool = config.mode === 'fair_random' ? shuffleArray(activeStudents) : [...sortedStudents];
          poolIndex = 0;
        }

        // Avoid assigning duplicate student in the exact same session
        let candidate = studentPool[poolIndex];
        let searchAttempts = 0;
        while (assignedIds.includes(candidate.id) && searchAttempts < studentPool.length) {
          poolIndex = (poolIndex + 1) % studentPool.length;
          candidate = studentPool[poolIndex];
          searchAttempts++;
        }

        assignedIds.push(candidate.id);
        poolIndex++;
      }
    }

    newSessions.push({
      id: existing?.id || `sess-${courseId}-${sNum}-${Date.now()}`,
      courseId,
      sessionNumber: sNum,
      date: existing?.date || dateStr,
      topic,
      assignedPjIds: assignedIds,
      notes,
      status,
    });
  }

  return newSessions;
}

export const DAY_ORDER: Record<string, number> = {
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
  minggu: 7,
};

export function getDayOrder(dayName: string): number {
  return DAY_ORDER[dayName?.trim().toLowerCase()] ?? 8;
}

/**
 * Calculates how many times each student has been assigned, completed, etc.
 */
export function calculateStudentStats(
  students: Student[],
  sessions: SessionSchedule[],
  courseId?: string
): StudentPjStat[] {
  const filteredSessions = courseId ? sessions.filter((s) => s.courseId === courseId) : sessions;

  return students.map((student) => {
    const studentSessions = filteredSessions.filter((s) => s.assignedPjIds.includes(student.id));
    const completedCount = studentSessions.filter((s) => s.status === 'completed').length;
    const upcomingCount = studentSessions.filter((s) => s.status === 'upcoming' || s.status === 'ongoing').length;

    return {
      student,
      totalAssigned: studentSessions.length,
      completedCount,
      upcomingCount,
      sessionNumbers: studentSessions.map((s) => s.sessionNumber).sort((a, b) => a - b),
    };
  });
}

/**
 * Generates a global fair rotation schedule across ALL courses sequentially
 * so students take turns across the entire schedule rather than per-course duplicates.
 */
export function generateGlobalRotationSchedule(
  courses: Course[],
  students: Student[],
  config: RotationConfig,
  existingSessions: SessionSchedule[] = []
): SessionSchedule[] {
  const activeStudents = students.filter((s) => s.isActive);
  if (activeStudents.length === 0 || courses.length === 0) {
    return existingSessions;
  }

  // Determine student order based on mode
  let sortedStudents: Student[] = [];
  if (config.mode === 'fair_random') {
    sortedStudents = shuffleArray(activeStudents);
  } else if (config.mode === 'sequential_nim') {
    sortedStudents = [...activeStudents].sort((a, b) => a.nim.localeCompare(b.nim));
  } else if (config.mode === 'alphabetical') {
    sortedStudents = [...activeStudents].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sortedStudents = [...activeStudents];
  }

  const courseMap = new Map<string, Course>();
  courses.forEach((c) => courseMap.set(c.id, c));

  // Build sessions map for all courses
  const startDateObj = config.startDate ? new Date(config.startDate) : new Date();
  const sessionsByCourse: Map<string, SessionSchedule[]> = new Map();

  courses.forEach((course) => {
    const list: SessionSchedule[] = [];
    const courseExisting = existingSessions.filter((s) => s.courseId === course.id);

    for (let sNum = 1; sNum <= course.totalSessions; sNum++) {
      const existing = courseExisting.find((s) => s.sessionNumber === sNum);
      if (existing) {
        list.push({ ...existing });
      } else {
        const sessionDate = new Date(startDateObj);
        sessionDate.setDate(startDateObj.getDate() + (sNum - 1) * (config.intervalDays || 7));
        const dateStr = sessionDate.toISOString().split('T')[0];

        let defaultTopic = `Pertemuan ${sNum} - ${course.name}`;
        if (sNum === 8) defaultTopic = `Ujian Tengah Semester (UTS) - ${course.name}`;
        if (sNum === course.totalSessions) defaultTopic = `Ujian Akhir Semester (UAS) - ${course.name}`;

        list.push({
          id: `sess-${course.id}-${sNum}-${Date.now()}`,
          courseId: course.id,
          sessionNumber: sNum,
          date: dateStr,
          topic: defaultTopic,
          assignedPjIds: [],
          status: 'upcoming',
        });
      }
    }
    sessionsByCourse.set(course.id, list);
  });

  // Flatten all sessions
  const allSessions: SessionSchedule[] = [];
  sessionsByCourse.forEach((list) => allSessions.push(...list));

  // Chronologically sort sessions across all courses:
  // 1. sessionNumber (Week 1, Week 2, ..., Week 16)
  // 2. Day of week (Senin=1, Selasa=2, ...)
  // 3. startTime ("08:00", "13:00")
  allSessions.sort((a, b) => {
    if (a.sessionNumber !== b.sessionNumber) {
      return a.sessionNumber - b.sessionNumber;
    }
    const courseA = courseMap.get(a.courseId);
    const courseB = courseMap.get(b.courseId);
    const dayOrderA = getDayOrder(courseA?.day || '');
    const dayOrderB = getDayOrder(courseB?.day || '');
    if (dayOrderA !== dayOrderB) {
      return dayOrderA - dayOrderB;
    }
    const timeA = courseA?.startTime || '00:00';
    const timeB = courseB?.startTime || '00:00';
    return timeA.localeCompare(timeB);
  });

  // Now distribute students fairly across all sessions in continuous round-robin
  let studentPool = [...sortedStudents];
  let poolIndex = 0;
  const count = Math.max(1, config.pjCountPerSession);

  // Keep track of assignments per week to avoid double assignment in same week if possible
  const weekAssignments = new Map<number, Set<string>>();

  const updatedSessions: SessionSchedule[] = allSessions.map((session) => {
    const isExcluded = config.excludeSessionNumbers?.includes(session.sessionNumber);
    if (isExcluded) {
      return { ...session, assignedPjIds: [] };
    }

    if (!weekAssignments.has(session.sessionNumber)) {
      weekAssignments.set(session.sessionNumber, new Set<string>());
    }
    const assignedThisWeek = weekAssignments.get(session.sessionNumber)!;

    const assignedIds: string[] = [];
    for (let p = 0; p < count; p++) {
      if (poolIndex >= studentPool.length) {
        studentPool = config.mode === 'fair_random' ? shuffleArray(activeStudents) : [...sortedStudents];
        poolIndex = 0;
      }

      let candidate = studentPool[poolIndex];
      let searchAttempts = 0;

      while (
        (assignedIds.includes(candidate.id) ||
          (activeStudents.length > count * 2 &&
            assignedThisWeek.has(candidate.id) &&
            searchAttempts < Math.floor(studentPool.length / 2))) &&
        searchAttempts < studentPool.length
      ) {
        poolIndex = (poolIndex + 1) % studentPool.length;
        candidate = studentPool[poolIndex];
        searchAttempts++;
      }

      assignedIds.push(candidate.id);
      assignedThisWeek.add(candidate.id);
      poolIndex++;
    }

    return {
      ...session,
      assignedPjIds: assignedIds,
    };
  });

  return updatedSessions;
}

/**
 * Swaps PJ between two sessions
 */
export function swapPjBetweenSessions(
  sessions: SessionSchedule[],
  sessionAId: string,
  studentAId: string,
  sessionBId: string,
  studentBId: string
): SessionSchedule[] {
  return sessions.map((session) => {
    if (session.id === sessionAId) {
      const newPjs = session.assignedPjIds.map((id) => (id === studentAId ? studentBId : id));
      return { ...session, assignedPjIds: newPjs };
    }
    if (session.id === sessionBId) {
      const newPjs = session.assignedPjIds.map((id) => (id === studentBId ? studentAId : id));
      return { ...session, assignedPjIds: newPjs };
    }
    return session;
  });
}

/**
 * Generate formatted WhatsApp broadcast message for a single class session (ultra-compact)
 */
export function generateWhatsAppMessage(
  courseName: string,
  _lecturer: string,
  day: string,
  time: string,
  room: string,
  session: SessionSchedule,
  assignedStudents: Student[]
): string {
  const pjs = assignedStudents.length > 0
    ? assignedStudents.map((s) => s.name).join(', ')
    : 'Belum ada PJ';

  const roomInfo = room ? `, ${room}` : '';

  return `*PJ ${courseName} (M-${session.sessionNumber})*\n🗓️ ${day} (${time}${roomInfo})\n👤 PJ: ${pjs}`;
}

/**
 * Generate ultra-compact and simple WhatsApp schedule digest for an entire week.
 * 1 line per course so it's super short, neat, and easy to copy-paste into chat.
 */
export function generateWeeklyWhatsAppMessage(
  weekNumber: number,
  courses: Course[],
  sessions: SessionSchedule[],
  students: Student[]
): string {
  const weekSessions = sessions.filter((s) => s.sessionNumber === weekNumber);
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Sort sessions by day of week then time
  const sorted = [...weekSessions].sort((a, b) => {
    const cA = courseMap.get(a.courseId);
    const cB = courseMap.get(b.courseId);
    const dayA = getDayOrder(cA?.day || '');
    const dayB = getDayOrder(cB?.day || '');
    if (dayA !== dayB) return dayA - dayB;
    return (cA?.startTime || '').localeCompare(cB?.startTime || '');
  });

  if (sorted.length === 0) {
    return `*Jadwal & PJ Minggu Ke-${weekNumber}*\n(Tidak ada perkuliahan minggu ini)`;
  }

  let message = `*Jadwal & PJ Minggu Ke-${weekNumber}*\n`;

  let currentDay = '';
  sorted.forEach((session) => {
    const course = courseMap.get(session.courseId);
    if (!course) return;

    if (course.day.trim().toLowerCase() !== currentDay.trim().toLowerCase()) {
      currentDay = course.day.trim();
      message += `\n*${currentDay}*\n`;
    }

    const pjs = session.assignedPjIds
      .map((id) => studentMap.get(id)?.name)
      .filter(Boolean)
      .join(', ');

    const timeRoom = course.room 
      ? `${course.startTime}, ${course.room}`
      : `${course.startTime}`;

    message += `• ${course.name} (${timeRoom}): ${pjs || 'Belum ada PJ'}\n`;
  });

  return message.trim();
}
