import type { Course } from '../types';

/**
 * Converts "HH:MM" (or "H:MM", "HH.MM") to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace('.', ':');
  const parts = clean.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 60 + minutes;
}

/**
 * Checks if two time intervals [startA, endA] and [startB, endB] overlap
 */
export function isTimeOverlapping(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);

  // If end is less than or equal to start, treat as default duration 90 mins
  const actualEndA = eA > sA ? eA : sA + 90;
  const actualEndB = eB > sB ? eB : sB + 90;

  return sA < actualEndB && sB < actualEndA;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  type?: 'code' | 'name' | 'exact_schedule';
  message?: string;
  existingCourse?: Course;
}

/**
 * Checks if a course is a duplicate based on code, name, or exact schedule
 */
export function checkCourseDuplicate(
  candidate: {
    code: string;
    name: string;
    day?: string;
    startTime?: string;
    endTime?: string;
    room?: string;
  },
  existingCourses: Course[],
  ignoreCourseId?: string
): DuplicateCheckResult {
  const cleanCode = candidate.code.trim().toLowerCase();
  const cleanName = candidate.name.trim().toLowerCase();

  const others = ignoreCourseId
    ? existingCourses.filter((c) => c.id !== ignoreCourseId)
    : existingCourses;

  // 1. Check same Course Code
  if (cleanCode) {
    const codeMatch = others.find((c) => c.code && c.code.trim().toLowerCase() === cleanCode);
    if (codeMatch) {
      return {
        isDuplicate: true,
        type: 'code',
        message: `Kode mata kuliah "${candidate.code.trim()}" sudah digunakan oleh "${codeMatch.name}".`,
        existingCourse: codeMatch,
      };
    }
  }

  // 2. Check same Course Name
  if (cleanName) {
    const nameMatch = others.find((c) => c.name && c.name.trim().toLowerCase() === cleanName);
    if (nameMatch) {
      return {
        isDuplicate: true,
        type: 'name',
        message: `Mata kuliah dengan nama "${candidate.name.trim()}" sudah ada dalam daftar jadwal (${nameMatch.code}).`,
        existingCourse: nameMatch,
      };
    }
  }

  // 3. Check exact same schedule (same day & same start time & same end time & same room)
  if (candidate.day && candidate.startTime && candidate.endTime) {
    const exactMatch = others.find(
      (c) =>
        c.day.trim().toLowerCase() === candidate.day!.trim().toLowerCase() &&
        c.startTime.trim() === candidate.startTime!.trim() &&
        c.endTime.trim() === candidate.endTime!.trim() &&
        (!candidate.room ||
          !c.room ||
          c.room.trim().toLowerCase() === candidate.room.trim().toLowerCase())
    );
    if (exactMatch) {
      return {
        isDuplicate: true,
        type: 'exact_schedule',
        message: `Jadwal pada hari ${candidate.day} (${candidate.startTime} - ${candidate.endTime}) sudah terdaftar pada mata kuliah "${exactMatch.name}".`,
        existingCourse: exactMatch,
      };
    }
  }

  return { isDuplicate: false };
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  message?: string;
  conflictingCourse?: Course;
}

/**
 * Checks if a course time overlaps on the same day with an existing course (jadwal bentrok)
 */
export function checkScheduleConflict(
  candidate: { day: string; startTime: string; endTime: string; room?: string },
  existingCourses: Course[],
  ignoreCourseId?: string
): ConflictCheckResult {
  if (!candidate.day || !candidate.startTime || !candidate.endTime) {
    return { hasConflict: false };
  }

  const cleanDay = candidate.day.trim().toLowerCase();
  const others = ignoreCourseId
    ? existingCourses.filter((c) => c.id !== ignoreCourseId)
    : existingCourses;

  const conflicting = others.find((c) => {
    if (c.day.trim().toLowerCase() !== cleanDay) return false;
    return isTimeOverlapping(candidate.startTime, candidate.endTime, c.startTime, c.endTime);
  });

  if (conflicting) {
    const roomInfo =
      candidate.room &&
      conflicting.room &&
      candidate.room.trim().toLowerCase() === conflicting.room.trim().toLowerCase()
        ? ` di ruangan yang sama (${conflicting.room})`
        : '';

    return {
      hasConflict: true,
      conflictingCourse: conflicting,
      message: `Bentrok jadwal pada hari ${candidate.day}: jam ${candidate.startTime} - ${candidate.endTime} bertabrakan dengan "${conflicting.name}" (${conflicting.startTime} - ${conflicting.endTime})${roomInfo}.`,
    };
  }

  return { hasConflict: false };
}
