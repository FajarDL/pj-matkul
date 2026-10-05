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

  // Calculate dates based on startDate and intervalDays
  const startDateObj = config.startDate ? new Date(config.startDate) : new Date();

  // Find assignments from other courses in existingSessions to avoid clashes in same week
  const otherSessions = existingSessions.filter((s) => s.courseId !== courseId);
  const otherWeekAssignments = new Map<number, Set<string>>();
  otherSessions.forEach((s) => {
    if (!otherWeekAssignments.has(s.sessionNumber)) {
      otherWeekAssignments.set(s.sessionNumber, new Set<string>());
    }
    const set = otherWeekAssignments.get(s.sessionNumber)!;
    s.assignedPjIds.forEach((id) => set.add(id));
  });

  const count = Math.max(1, config.pjCountPerSession);

  // If sequential queue mode, process in queue order
  if (config.mode === 'sequential_queue' || config.mode === 'sequential_nim' || config.mode === 'alphabetical') {
    let orderedStudents = [...activeStudents];
    if (config.mode === 'sequential_nim') {
      orderedStudents.sort((a, b) => a.nim.localeCompare(b.nim));
    } else if (config.mode === 'alphabetical') {
      orderedStudents.sort((a, b) => a.name.localeCompare(b.name));
    }

    let queueIdx = 0;
    const N = orderedStudents.length;
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
      const otherThisWeek = otherWeekAssignments.get(sNum) || new Set<string>();
      const otherLastWeek = otherWeekAssignments.get(sNum - 1) || new Set<string>();

      if (!isExcluded) {
        for (let p = 0; p < count; p++) {
          let chosen: Student | null = null;
          let chosenIdx = -1;

          // Pass 1: Strict (not in session, not in other courses this week, not in last week)
          for (let offset = 0; offset < N; offset++) {
            const idx = (queueIdx + offset) % N;
            const cand = orderedStudents[idx];
            if (assignedIds.includes(cand.id)) continue;
            if (otherThisWeek.has(cand.id)) continue;
            if (otherLastWeek.has(cand.id) && N > 2) continue;

            chosen = cand;
            chosenIdx = idx;
            break;
          }

          // Pass 2: Relax last week check
          if (!chosen) {
            for (let offset = 0; offset < N; offset++) {
              const idx = (queueIdx + offset) % N;
              const cand = orderedStudents[idx];
              if (assignedIds.includes(cand.id)) continue;
              if (otherThisWeek.has(cand.id)) continue;

              chosen = cand;
              chosenIdx = idx;
              break;
            }
          }

          // Pass 3: Ultimate fallback
          if (!chosen) {
            for (let offset = 0; offset < N; offset++) {
              const idx = (queueIdx + offset) % N;
              const cand = orderedStudents[idx];
              if (assignedIds.includes(cand.id)) continue;

              chosen = cand;
              chosenIdx = idx;
              break;
            }
          }

          if (chosen) {
            assignedIds.push(chosen.id);
            queueIdx = (chosenIdx + 1) % N;
          }
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

  // Fair random with cross-course awareness
  const dutyCountMap = new Map<string, number>();
  const lastAssignedIndexMap = new Map<string, number>();
  const courseHistoryMap = new Map<string, Map<string, number>>();

  activeStudents.forEach((s) => {
    let existingCount = 0;
    otherSessions.forEach((os) => {
      if (os.assignedPjIds.includes(s.id)) existingCount++;
    });
    dutyCountMap.set(s.id, existingCount);
    courseHistoryMap.set(s.id, new Map());
  });

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
    const otherThisWeek = otherWeekAssignments.get(sNum) || new Set<string>();
    const otherLastWeek = otherWeekAssignments.get(sNum - 1) || new Set<string>();

    if (!isExcluded) {
      for (let p = 0; p < count; p++) {
        const candidate = pickFairestCandidateStudent(
          activeStudents,
          assignedIds,
          otherThisWeek,
          dutyCountMap,
          lastAssignedIndexMap,
          courseHistoryMap,
          sNum,
          courseId,
          true,
          'fair_random',
          otherLastWeek
        );

        if (candidate) {
          assignedIds.push(candidate.id);
          dutyCountMap.set(candidate.id, (dutyCountMap.get(candidate.id) || 0) + 1);
          lastAssignedIndexMap.set(candidate.id, sNum);

          const cMap = courseHistoryMap.get(candidate.id) || new Map();
          cMap.set(courseId, (cMap.get(courseId) || 0) + 1);
          courseHistoryMap.set(candidate.id, cMap);
        }
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

  // Track duty counts, last assigned session index, and course histories across all sessions
  const dutyCountMap = new Map<string, number>();
  const lastAssignedIndexMap = new Map<string, number>();
  const courseHistoryMap = new Map<string, Map<string, number>>();
  const weekAssignments = new Map<number, Set<string>>();

  activeStudents.forEach((s) => {
    dutyCountMap.set(s.id, 0);
    courseHistoryMap.set(s.id, new Map());
  });

  const count = Math.max(1, config.pjCountPerSession);

  const updatedSessions: SessionSchedule[] = allSessions.map((session, sessionIdx) => {
    const course = courseMap.get(session.courseId);
    const isPracticum = isPracticumCourse(course);
    const isExcluded = isPracticum || config.excludeSessionNumbers?.includes(session.sessionNumber);

    if (isExcluded) {
      return { ...session, assignedPjIds: [], originalPjIds: [], isManuallyEdited: false, swapInfo: undefined };
    }

    if (!weekAssignments.has(session.sessionNumber)) {
      weekAssignments.set(session.sessionNumber, new Set<string>());
    }
    const assignedThisWeek = weekAssignments.get(session.sessionNumber)!;
    const assignedLastWeek = weekAssignments.get(session.sessionNumber - 1) || new Set<string>();

    const assignedIds: string[] = [];
    for (let p = 0; p < count; p++) {
      const candidate = pickFairestCandidateStudent(
        activeStudents,
        assignedIds,
        assignedThisWeek,
        dutyCountMap,
        lastAssignedIndexMap,
        courseHistoryMap,
        sessionIdx,
        session.courseId,
        true,
        'fair_random',
        assignedLastWeek
      );

      if (candidate) {
        assignedIds.push(candidate.id);
        assignedThisWeek.add(candidate.id);

        dutyCountMap.set(candidate.id, (dutyCountMap.get(candidate.id) || 0) + 1);
        lastAssignedIndexMap.set(candidate.id, sessionIdx);

        const cMap = courseHistoryMap.get(candidate.id) || new Map();
        cMap.set(session.courseId, (cMap.get(session.courseId) || 0) + 1);
        courseHistoryMap.set(candidate.id, cMap);
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
