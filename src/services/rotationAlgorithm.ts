import type { Student, SessionSchedule, RotationConfig, Course, RotationMode } from '../types';

export interface StudentPjStat {
  student: Student;
  totalAssigned: number;
  completedCount: number;
  upcomingCount: number;
  sessionNumbers: number[];
}

/**
 * Helper to determine if a course is a practicum (does not have a PJ).
 * Checks explicit isPracticum flag, or falls back to name/code containing 'praktikum' / 'prak.'
 */
export function isPracticumCourse(course?: Course | null): boolean {
  if (!course) return false;
  if (typeof course.isPracticum === 'boolean') {
    return course.isPracticum;
  }
  const name = (course.name || '').toLowerCase();
  const code = (course.code || '').toLowerCase();
  return name.includes('praktikum') || name.includes('prak.') || code.startsWith('prak');
}

/**
 * Fisher-Yates Shuffle algorithm for true fair randomization
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Fair Random Rotation Candidate Selector
 * 
 * When students have completed a duty and names appear again:
 * 1. Strictly prioritizes students with the lowest cumulative duty count (load balancing).
 * 2. Strictly avoids multiple duties in the same week (if student pool >= slots).
 * 3. Maximizes rest period (cooldown): prioritizes students who haven't served for the longest time.
 * 4. Course variety: prefers students who haven't served as PJ for this specific course yet.
 * 5. Uses fair random selection or configured mode to break ties without bias.
 */
export function pickFairestCandidateStudent(
  activeStudents: Student[],
  alreadyAssignedInSession: string[],
  assignedThisWeek: Set<string>,
  dutyCountMap: Map<string, number>,
  lastAssignedIndexMap: Map<string, number>,
  courseHistoryMap: Map<string, Map<string, number>>,
  currentSessionIndex: number,
  courseId?: string,
  randomize: boolean = true,
  mode: RotationMode = 'fair_random',
  assignedLastWeek?: Set<string>
): Student | null {
  // Step 1: Filter out students already assigned in THIS exact session
  let candidates = activeStudents.filter((s) => !alreadyAssignedInSession.includes(s.id));
  if (candidates.length === 0) return null;

  // Step 2: Avoid double duty in the same week if enough students exist
  if (assignedThisWeek.size < activeStudents.length) {
    const freeThisWeek = candidates.filter((s) => !assignedThisWeek.has(s.id));
    if (freeThisWeek.length > 0) {
      candidates = freeThisWeek;
    }
  }

  // Step 2b: Avoid consecutive week duty if students are available who did not serve last week
  if (assignedLastWeek && assignedLastWeek.size > 0 && activeStudents.length > 1) {
    const freeLastWeek = candidates.filter((s) => !assignedLastWeek.has(s.id));
    if (freeLastWeek.length > 0) {
      candidates = freeLastWeek;
    }
  }

  // Step 3: Strictly balance duties (lowest duty count)
  let minDuty = Infinity;
  candidates.forEach((s) => {
    const count = dutyCountMap.get(s.id) || 0;
    if (count < minDuty) minDuty = count;
  });

  const lowestDutyCandidates = candidates.filter(
    (s) => (dutyCountMap.get(s.id) || 0) === minDuty
  );

  // Step 4: Maximize rest / cooldown period (distance from last duty)
  let maxRest = -Infinity;
  lowestDutyCandidates.forEach((s) => {
    const lastIndex = lastAssignedIndexMap.get(s.id);
    const rest = lastIndex === undefined ? 999999 : currentSessionIndex - lastIndex;
    if (rest > maxRest) maxRest = rest;
  });

  const bestRestedCandidates = lowestDutyCandidates.filter((s) => {
    const lastIndex = lastAssignedIndexMap.get(s.id);
    const rest = lastIndex === undefined ? 999999 : currentSessionIndex - lastIndex;
    return rest === maxRest;
  });

  // Step 5: Course Diversity (prefer students who have not served as PJ for this course yet)
  let bestCandidates = bestRestedCandidates;
  if (courseId) {
    let minCourseDuty = Infinity;
    bestRestedCandidates.forEach((s) => {
      const cCount = courseHistoryMap.get(s.id)?.get(courseId) || 0;
      if (cCount < minCourseDuty) minCourseDuty = cCount;
    });

    const lowestCourseDuty = bestRestedCandidates.filter((s) => {
      const cCount = courseHistoryMap.get(s.id)?.get(courseId) || 0;
      return cCount === minCourseDuty;
    });

    if (lowestCourseDuty.length > 0) {
      bestCandidates = lowestCourseDuty;
    }
  }

  // Step 6: Fair Random or Mode Tie-Breaker
  if (bestCandidates.length === 1) {
    return bestCandidates[0];
  }

  if (randomize || mode === 'fair_random') {
    const randomIndex = Math.floor(Math.random() * bestCandidates.length);
    return bestCandidates[randomIndex];
  }

  if (mode === 'sequential_nim') {
    return [...bestCandidates].sort((a, b) => a.nim.localeCompare(b.nim))[0];
  }

  if (mode === 'alphabetical') {
    return [...bestCandidates].sort((a, b) => a.name.localeCompare(b.name))[0];
  }

  return bestCandidates[0];
}

/**
 * Generates an equitable schedule rotation for the given course and student list
 */
export function generateRotationSchedule(
  courseId: string,
  students: Student[],
  totalSessions: number,
  config: RotationConfig,
  existingSessions: SessionSchedule[] = [],
  isPracticum: boolean = false
): SessionSchedule[] {
  const activeStudents = students.filter((s) => s.isActive);
  if (activeStudents.length === 0) {
    return [];
  }

  // Sort students strictly by NIM / attendance order
  const sortedStudents = [...activeStudents].sort((a, b) => {
    if (a.nim && b.nim) {
      return a.nim.localeCompare(b.nim, undefined, { numeric: true });
    }
    return a.name.localeCompare(b.name);
  });

  const startDateObj = config.startDate ? new Date(config.startDate) : new Date();
  const count = Math.max(1, config.pjCountPerSession);
  let studentPointer = 0;

  const newSessions: SessionSchedule[] = [];

  for (let sNum = 1; sNum <= totalSessions; sNum++) {
    const sessionDate = new Date(startDateObj);
    sessionDate.setDate(startDateObj.getDate() + (sNum - 1) * (config.intervalDays || 7));
    const dateStr = sessionDate.toISOString().split('T')[0];

    const existing = existingSessions.find((s) => s.sessionNumber === sNum && s.courseId === courseId);
    let defaultTopic = `Pertemuan ${sNum}`;
    if (sNum === 8) defaultTopic = 'Ujian Tengah Semester (UTS)';
    if (sNum === totalSessions) defaultTopic = 'Ujian Akhir Semester (UAS)';

    const topic = existing?.topic || defaultTopic;
    const notes = existing?.notes || '';
    const status = existing?.status || 'upcoming';

    const assignedIds: string[] = [];
    const isExcluded = isPracticum || config.excludeSessionNumbers?.includes(sNum);

    if (!isExcluded) {
      for (let p = 0; p < count; p++) {
        const student = sortedStudents[studentPointer % sortedStudents.length];
        assignedIds.push(student.id);
        studentPointer++;
      }
    }

    newSessions.push({
      id: existing?.id || `sess-${courseId}-${sNum}-${Date.now()}`,
      courseId,
      sessionNumber: sNum,
      date: existing?.date || dateStr,
      topic,
      assignedPjIds: assignedIds,
      originalPjIds: assignedIds,
      isManuallyEdited: false,
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
 * Strict Round-Robin Circular Queue Generator
 * Generates an orderly queue rotation from student 1 to student N.
 * Sessions are processed chronologically across all courses.
 * Guarantees no double duty in the same week, and no consecutive-week duty.
 */
export function generateQueueRotationSchedule(
  courses: Course[],
  activeStudents: Student[],
  config: RotationConfig,
  existingSessions: SessionSchedule[] = []
): SessionSchedule[] {
  const courseMap = new Map<string, Course>();
  courses.forEach((c) => courseMap.set(c.id, c));

  // Determine student ordering based on mode
  let orderedStudents = [...activeStudents];
  if (config.mode === 'sequential_nim') {
    orderedStudents.sort((a, b) => a.nim.localeCompare(b.nim));
  } else if (config.mode === 'alphabetical') {
    orderedStudents.sort((a, b) => a.name.localeCompare(b.name));
  }
  // If sequential_queue: preserves the exact order of activeStudents!

  const N = orderedStudents.length;
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

  // Sort sessions chronologically across all courses
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

  const weekAssignments = new Map<number, Set<string>>();
  let queuePointer = 0;
  const count = Math.max(1, config.pjCountPerSession);

  return allSessions.map((session) => {
    const course = courseMap.get(session.courseId);
    const isPracticum = isPracticumCourse(course);
    const isExcluded = isPracticum || config.excludeSessionNumbers?.includes(session.sessionNumber);

    if (isExcluded) {
      return { ...session, assignedPjIds: [], originalPjIds: [], isManuallyEdited: false, swapInfo: undefined };
    }

    const currentWeek = session.sessionNumber;
    if (!weekAssignments.has(currentWeek)) {
      weekAssignments.set(currentWeek, new Set<string>());
    }
    const assignedThisWeek = weekAssignments.get(currentWeek)!;
    const assignedLastWeek = weekAssignments.get(currentWeek - 1) || new Set<string>();

    const assignedIds: string[] = [];

    for (let p = 0; p < count; p++) {
      let chosen: Student | null = null;
      let chosenIdx = -1;

      // Pass 1: Strict - avoid same session, avoid same week, avoid last week (consecutive week)
      for (let offset = 0; offset < N; offset++) {
        const checkIdx = (queuePointer + offset) % N;
        const candidate = orderedStudents[checkIdx];

        if (assignedIds.includes(candidate.id)) continue;
        if (assignedThisWeek.size < N && assignedThisWeek.has(candidate.id)) continue;

        // Consecutive week avoidance
        if (assignedLastWeek.has(candidate.id) && N > 1) {
          const hasOtherCandidateFreeFromLastWeek = orderedStudents.some(
            (other) =>
              !assignedIds.includes(other.id) &&
              (assignedThisWeek.size >= N || !assignedThisWeek.has(other.id)) &&
              !assignedLastWeek.has(other.id)
          );
          if (hasOtherCandidateFreeFromLastWeek) {
            continue;
          }
        }

        chosen = candidate;
        chosenIdx = checkIdx;
        break;
      }

      // Pass 2: Relax consecutive week constraint if needed
      if (!chosen) {
        for (let offset = 0; offset < N; offset++) {
          const checkIdx = (queuePointer + offset) % N;
          const candidate = orderedStudents[checkIdx];

          if (assignedIds.includes(candidate.id)) continue;
          if (assignedThisWeek.size < N && assignedThisWeek.has(candidate.id)) continue;

          chosen = candidate;
          chosenIdx = checkIdx;
          break;
        }
      }

      // Pass 3: Ultimate fallback
      if (!chosen) {
        for (let offset = 0; offset < N; offset++) {
          const checkIdx = (queuePointer + offset) % N;
          const candidate = orderedStudents[checkIdx];
          if (assignedIds.includes(candidate.id)) continue;
          chosen = candidate;
          chosenIdx = checkIdx;
          break;
        }
      }

      if (chosen) {
        assignedIds.push(chosen.id);
        assignedThisWeek.add(chosen.id);
        queuePointer = (chosenIdx + 1) % N;
      }
    }

    return {
      ...session,
      assignedPjIds: assignedIds,
      originalPjIds: assignedIds,
      isManuallyEdited: false,
      swapInfo: undefined,
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

  // If sequential_queue, sequential_nim, or alphabetical, run the strict circular queue generator
  if (
    config.mode === 'sequential_queue' ||
    config.mode === 'sequential_nim' ||
    config.mode === 'alphabetical'
  ) {
    return generateQueueRotationSchedule(courses, activeStudents, config, existingSessions);
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

  // Sort students strictly by NIM / attendance order
  const sortedStudents = [...activeStudents].sort((a, b) => {
    if (a.nim && b.nim) {
      return a.nim.localeCompare(b.nim, undefined, { numeric: true });
    }
    return a.name.localeCompare(b.name);
  });

  const count = Math.max(1, config.pjCountPerSession);
  let studentPointer = 0;

  const updatedSessions: SessionSchedule[] = allSessions.map((session) => {
    const course = courseMap.get(session.courseId);
    const isPracticum = isPracticumCourse(course);
    const isExcluded = isPracticum || config.excludeSessionNumbers?.includes(session.sessionNumber);

    if (isExcluded) {
      return { ...session, assignedPjIds: [], originalPjIds: [], isManuallyEdited: false, swapInfo: undefined };
    }

    const assignedIds: string[] = [];
    for (let p = 0; p < count; p++) {
      const student = sortedStudents[studentPointer % sortedStudents.length];
      assignedIds.push(student.id);
      studentPointer++;
    }

    return {
      ...session,
      assignedPjIds: assignedIds,
      originalPjIds: assignedIds,
      isManuallyEdited: false,
      swapInfo: undefined,
    };
  });

  return updatedSessions;
}

/**
 * Swaps PJ between two sessions (Mutual Swap / Barter Giliran)
 */
export function swapPjBetweenSessions(
  sessions: SessionSchedule[],
  sessionAId: string,
  studentAId: string,
  sessionBId: string,
  studentBId: string
): SessionSchedule[] {
  const sessionA = sessions.find((s) => s.id === sessionAId);
  const sessionB = sessions.find((s) => s.id === sessionBId);

  return sessions.map((session) => {
    if (session.id === sessionAId) {
      const originalPjIds = session.originalPjIds !== undefined ? session.originalPjIds : [...session.assignedPjIds];
      const newPjs = session.assignedPjIds.map((id) => (id === studentAId ? studentBId : id));
      return {
        ...session,
        originalPjIds,
        assignedPjIds: newPjs,
        isManuallyEdited: true,
        swapInfo: {
          partnerSessionId: sessionBId,
          originalStudentId: studentAId,
          replacementStudentId: studentBId,
          note: sessionB ? `Barter giliran dengan M-${sessionB.sessionNumber}` : 'Barter giliran PJ',
        },
      };
    }
    if (session.id === sessionBId) {
      const originalPjIds = session.originalPjIds !== undefined ? session.originalPjIds : [...session.assignedPjIds];
      const newPjs = session.assignedPjIds.map((id) => (id === studentBId ? studentAId : id));
      return {
        ...session,
        originalPjIds,
        assignedPjIds: newPjs,
        isManuallyEdited: true,
        swapInfo: {
          partnerSessionId: sessionAId,
          originalStudentId: studentBId,
          replacementStudentId: studentAId,
          note: sessionA ? `Barter giliran dengan M-${sessionA.sessionNumber}` : 'Barter giliran PJ',
        },
      };
    }
    return session;
  });
}

/**
 * Reverts a session's assigned PJ back to its original rotation PJ
 */
export function revertSessionToOriginal(
  sessions: SessionSchedule[],
  sessionId: string
): SessionSchedule[] {
  return sessions.map((session) => {
    if (session.id === sessionId) {
      const targetPjIds = session.originalPjIds ? [...session.originalPjIds] : [...session.assignedPjIds];
      return {
        ...session,
        assignedPjIds: targetPjIds,
        isManuallyEdited: false,
        swapInfo: undefined,
      };
    }
    return session;
  });
}

export interface RebalanceResult {
  updatedSessions: SessionSchedule[];
  message: string;
  swappedFutureSession?: SessionSchedule;
  exemptedStudent?: Student;
}

/**
 * Intelligently rebalances duty schedules when a student is assigned or replaced:
 * 1. Replaces the student in the current session.
 * 2. If the new student (A) has an upcoming duty session in the future, automatically
 *    transfers the nearest upcoming slot to the replaced student (B), freeing student A
 *    from next week's duty!
 * 3. Obligation Cap & Immunity: If student A has completed/undertaken duties >= fair quota
 *    (e.g., covered 5 times), student A is granted 'Exempt/Lunas' status and freed from
 *    any remaining future sessions, which are reallocated to students with the fewest duties.
 */
export function smartRebalanceOnPjReplacement(
  sessions: SessionSchedule[],
  currentSessionId: string,
  newStudentId: string,
  replacedStudentId: string | undefined,
  allActiveStudents: Student[],
  courses: Course[]
): RebalanceResult {
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const studentMap = new Map(allActiveStudents.map((s) => [s.id, s]));
  const curSession = sessions.find((s) => s.id === currentSessionId);
  if (!curSession) {
    return { updatedSessions: sessions, message: 'Sesi tidak ditemukan' };
  }

  // Deep copy sessions
  const updatedSessions: SessionSchedule[] = sessions.map((s) => ({
    ...s,
    assignedPjIds: [...s.assignedPjIds],
    originalPjIds: s.originalPjIds ? [...s.originalPjIds] : [...s.assignedPjIds],
  }));

  const targetCurrent = updatedSessions.find((s) => s.id === currentSessionId)!;

  // Update current session PJ assignments
  if (replacedStudentId && targetCurrent.assignedPjIds.includes(replacedStudentId)) {
    targetCurrent.assignedPjIds = targetCurrent.assignedPjIds.map((id) =>
      id === replacedStudentId ? newStudentId : id
    );
  } else if (!targetCurrent.assignedPjIds.includes(newStudentId)) {
    targetCurrent.assignedPjIds.push(newStudentId);
  }
  targetCurrent.isManuallyEdited = true;

  // Chronologically sort all sessions to find exact timeline
  const chronoSessions = [...updatedSessions].sort((a, b) => {
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

  const currentChronoIdx = chronoSessions.findIndex((s) => s.id === currentSessionId);

  // Find future sessions where newStudentId is already assigned
  const futureSessionsOfNewStudent = chronoSessions.filter(
    (s, idx) => idx > currentChronoIdx && s.assignedPjIds.includes(newStudentId)
  );

  let swappedFutureSession: SessionSchedule | undefined;

  // 1. Mutual Swap with replacedStudentId (if exists and newStudent has a future turn)
  if (replacedStudentId && futureSessionsOfNewStudent.length > 0) {
    const nearestFuture = futureSessionsOfNewStudent[0];
    nearestFuture.assignedPjIds = nearestFuture.assignedPjIds.map((id) =>
      id === newStudentId ? replacedStudentId : id
    );
    nearestFuture.isManuallyEdited = true;
    swappedFutureSession = nearestFuture;
    futureSessionsOfNewStudent.shift(); // removed from remaining future list
  }

  // 2. Obligation Cap & Duty Exemption (Lunas Kewajiban)
  // Calculate fair quota: total active students and total duties
  const totalPjSlots = updatedSessions.reduce((acc, s) => {
    const c = courseMap.get(s.courseId);
    if (isPracticumCourse(c)) return acc;
    return acc + s.assignedPjIds.length;
  }, 0);
  const fairQuota = allActiveStudents.length > 0
    ? Math.ceil(totalPjSlots / allActiveStudents.length)
    : 1;

  // Count newStudent's total duties in updatedSessions
  const totalDutiesNewStudent = updatedSessions.reduce((acc, s) => {
    return acc + (s.assignedPjIds.includes(newStudentId) ? 1 : 0);
  }, 0);

  let exempted = false;
  // If newStudent has reached or exceeded fairQuota, free them from remaining future sessions
  if (totalDutiesNewStudent >= fairQuota && futureSessionsOfNewStudent.length > 0) {
    exempted = true;

    // Function to recalculate duty count of a student
    const getDutyCount = (stId: string) =>
      updatedSessions.reduce((acc, s) => acc + (s.assignedPjIds.includes(stId) ? 1 : 0), 0);

    futureSessionsOfNewStudent.forEach((futureSess) => {
      // Find eligible active student with fewest duties
      const candidates = allActiveStudents
        .filter((st) => st.id !== newStudentId && !futureSess.assignedPjIds.includes(st.id))
        .sort((a, b) => {
          // Prioritize replacedStudentId if they owe duties
          if (replacedStudentId) {
            if (a.id === replacedStudentId && b.id !== replacedStudentId) return -1;
            if (b.id === replacedStudentId && a.id !== replacedStudentId) return 1;
          }
          return getDutyCount(a.id) - getDutyCount(b.id);
        });

      if (candidates.length > 0) {
        const replacementForFuture = candidates[0];
        futureSess.assignedPjIds = futureSess.assignedPjIds.map((id) =>
          id === newStudentId ? replacementForFuture.id : id
        );
        futureSess.isManuallyEdited = true;
      }
    });
  }

  // Feedback message construction
  const studentA = studentMap.get(newStudentId);
  const studentB = replacedStudentId ? studentMap.get(replacedStudentId) : null;
  const currentCourse = courseMap.get(curSession.courseId);

  let message = `PJ ${currentCourse?.name || 'sesi'} diganti ke ${studentA?.name || ''}.`;
  if (swappedFutureSession && studentB) {
    const swappedCourse = courseMap.get(swappedFutureSession.courseId);
    message += ` Jadwal ${studentA?.name} di M-${swappedFutureSession.sessionNumber} (${swappedCourse?.name || ''}) dialihkan ke ${studentB.name}.`;
  }
  if (exempted) {
    message += ` ${studentA?.name} telah lunas kewajiban dan dibebaskan dari jadwal berikutnya!`;
  }

  return {
    updatedSessions,
    message,
    swappedFutureSession,
    exemptedStudent: exempted ? studentA : undefined,
  };
}

/**
 * Generate formatted WhatsApp broadcast message for a single class session (minimal 2-line style)
 */
export function generateWhatsAppMessage(
  courseName: string,
  lecturer: string,
  day: string,
  time: string,
  room: string,
  session: SessionSchedule,
  assignedStudents: Student[],
  isPracticum: boolean = false
): string {
  const pjs = isPracticum
    ? '- (Praktikum)'
    : assignedStudents.length > 0
    ? assignedStudents.map((s) => s.name).join(', ')
    : 'Belum ada PJ';

  const timeFormatted = time.replace(/:/g, '.');
  const roomText = room || '-';
  const lecturerText = lecturer || '-';

  return `📌 *${day.toUpperCase()} (M-${session.sessionNumber})*\n${timeFormatted} → ${courseName}\n📍 ${roomText} | Dosen: ${lecturerText} | PJ: ${pjs}`;
}

/**
 * Generate minimalist WhatsApp schedule digest for an entire week.
 * Matches exact campus template: 📌 HARI, Jam → Matkul, 📍 Ruang | Dosen | PJ
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
    return `*JADWAL MINGGU KE-${weekNumber}*\n(Tidak ada perkuliahan minggu ini)`;
  }

  let message = `*JADWAL MINGGU KE-${weekNumber}*\n`;

  let currentDay = '';
  sorted.forEach((session) => {
    const course = courseMap.get(session.courseId);
    if (!course) return;

    if (course.day.trim().toLowerCase() !== currentDay.trim().toLowerCase()) {
      currentDay = course.day.trim();
      message += `\n📌 ${currentDay.toUpperCase()}\n`;
    }

    const isPracticum = isPracticumCourse(course);
    const pjs = session.assignedPjIds
      .map((id) => studentMap.get(id)?.name)
      .filter(Boolean)
      .join(', ');

    const startTimeFormatted = course.startTime.replace(/:/g, '.');
    const endTimeFormatted = course.endTime.replace(/:/g, '.');
    const timeFormatted = `${startTimeFormatted}–${endTimeFormatted}`;
    const roomText = course.room || '-';
    const lecturerText = course.lecturer || '-';
    const pjsText = isPracticum ? '- (Praktikum)' : (pjs || 'Belum ada PJ');

    message += `${timeFormatted} → ${course.name}\n`;
    message += `📍 ${roomText} | Dosen: ${lecturerText} | PJ: ${pjsText}\n`;
  });

  return message.trim();
}
