import type { Student } from '../types';

export interface ParsedScheduleCourse {
  code: string;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  lecturer: string;
  classSection?: string;
  isPracticum?: boolean;
}

export interface ParseStudentResult {
  students: Omit<Student, 'id' | 'isActive'>[];
  duplicateCount: number;
  totalParsed: number;
}

/**
 * Format time from HH:MM:SS or HH:MM to clean HH:MM
 */
function normalizeTime(timeStr: string): string {
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return timeStr.trim();
}

/**
 * Convert all-caps string to clean Title Case (optional helper)
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parses web schedule text copied from university portals (SIAKAD/academic websites)
 */
export function parseWebSchedule(rawText: string): ParsedScheduleCourse[] {
  if (!rawText || !rawText.trim()) return [];

  const results: ParsedScheduleCourse[] = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentCourse: Partial<ParsedScheduleCourse> | null = null;
  let lineIndexInBlock = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect beginning of a new course entry
    // Usually starts with index number followed by Course Code e.g. "1\tMK101" or "1 MK101"
    // Or starts directly with a Course Code pattern like CS101 / IF101 / MK202
    const startMatch = line.match(/^(\d+[\s\t]+)?([A-Z]{2,5}\d{4,8}|[A-Z]{2,4}[0-9]{3,6})/i);

    if (startMatch) {
      // Save previously accumulated course if valid
      if (currentCourse && currentCourse.code && currentCourse.name) {
        results.push(finalizeParsedCourse(currentCourse));
      }

      currentCourse = {};
      lineIndexInBlock = 1;

      // Extract details from the first line
      // Example: "1\tMK101\tNama Mata Kuliah\tA\t- Senin, 08:00:00 s/d 10:00:00"
      const parts = line.split(/\t+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      
      let code = startMatch[2].toUpperCase();
      currentCourse.code = code;

      // Find day & time in the first line if present
      const dayTimeMatch = line.match(/(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:s\/d|-)\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
      if (dayTimeMatch) {
        currentCourse.day = dayTimeMatch[1].charAt(0).toUpperCase() + dayTimeMatch[1].slice(1).toLowerCase();
        currentCourse.startTime = normalizeTime(dayTimeMatch[2]);
        currentCourse.endTime = normalizeTime(dayTimeMatch[3]);
      }

      // Try to extract course name and class section
      // In format: [Index] [Code] [Name] [Class] [- Day, Time...]
      if (parts.length >= 3) {
        let nameIndex = 1;
        if (/^\d+$/.test(parts[0])) {
          nameIndex = 2; // parts[0] is number, parts[1] is code, parts[2] is name
        }

        if (parts[nameIndex]) {
          currentCourse.name = parts[nameIndex].replace(/^-\s*/, '').trim();
        }

        // Next part might be class section e.g. "D"
        if (parts[nameIndex + 1] && parts[nameIndex + 1].length <= 3 && !parts[nameIndex + 1].includes('-')) {
          currentCourse.classSection = parts[nameIndex + 1];
        }
      } else {
        // Fallback: search between code and day/dash
        const afterCode = line.substring(line.indexOf(code) + code.length).trim();
        const beforeDash = afterCode.split(/-\s*(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)/i)[0];
        const tokens = beforeDash.split(/\s+/).filter(Boolean);
        if (tokens.length > 0) {
          const lastToken = tokens[tokens.length - 1];
          if (lastToken.length === 1 && /[A-Z]/i.test(lastToken)) {
            currentCourse.classSection = lastToken.toUpperCase();
            tokens.pop();
          }
          currentCourse.name = tokens.join(' ');
        }
      }

      continue;
    }

    // Inside a course block (subsequent lines for Room, Lecturer, or Schedule)
    if (currentCourse) {
      lineIndexInBlock++;
      const cleanLine = line.replace(/^[\-\*]\s*/, '').replace(/[\t\s\-]+$/, '').trim();

      // Check if this line is Day & Time (if not matched on line 1)
      const dayTimeMatch = cleanLine.match(/(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:s\/d|-)\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);
      if (dayTimeMatch && !currentCourse.day) {
        currentCourse.day = dayTimeMatch[1].charAt(0).toUpperCase() + dayTimeMatch[1].slice(1).toLowerCase();
        currentCourse.startTime = normalizeTime(dayTimeMatch[2]);
        currentCourse.endTime = normalizeTime(dayTimeMatch[3]);
        continue;
      }

      // Check if this line is Room
      // e.g. "R2-2 FSI", "R2-4", "Lab IF 2-3", "Ruang 301"
      if (
        !currentCourse.room &&
        (cleanLine.startsWith('R') ||
          cleanLine.toLowerCase().startsWith('lab') ||
          cleanLine.toLowerCase().startsWith('ruang') ||
          cleanLine.toLowerCase().includes('gedung') ||
          lineIndexInBlock === 2)
      ) {
        // Double check it's not a person's name with academic degrees
        if (!/(?:S\.T\.|M\.T\.|S\.Kom\.|M\.Kom\.|Dr\.|Drs\.|M\.Si\.|M\.Ag|Ph\.D)/i.test(cleanLine)) {
          currentCourse.room = cleanLine;
          continue;
        }
      }

      // Check if this line is Lecturer
      // e.g. "Nama Dosen Pengampu, S.Kom., M.T.", "Dr. Nama Dosen, M.Si."
      if (!currentCourse.lecturer) {
        // Clean leading/trailing punctuation
        const lecturerClean = cleanLine.replace(/^Dr\.,\s*/i, 'Dr. ').replace(/,\s*$/, '').trim();
        currentCourse.lecturer = lecturerClean;
        continue;
      }
    }
  }

  // Push last course if exists
  if (currentCourse && currentCourse.code && currentCourse.name) {
    results.push(finalizeParsedCourse(currentCourse));
  }

  return results;
}

function finalizeParsedCourse(c: Partial<ParsedScheduleCourse>): ParsedScheduleCourse {
  const fullName = c.classSection ? `${c.name} (Kelas ${c.classSection})` : c.name || 'Mata Kuliah';
  const isPracticum =
    c.isPracticum !== undefined
      ? c.isPracticum
      : fullName.toLowerCase().includes('praktikum') ||
        fullName.toLowerCase().includes('prak.') ||
        (c.code || '').toLowerCase().startsWith('prak');

  return {
    code: c.code || 'MK001',
    name: fullName,
    day: c.day || 'Senin',
    startTime: c.startTime || '08:00',
    endTime: c.endTime || '10:30',
    room: c.room || 'Ruang Kuliah',
    lecturer: c.lecturer || 'Dosen Pengampu',
    classSection: c.classSection,
    isPracticum,
  };
}

/**
 * Parses student lists from text, supporting pipe delimiter:
 * Format: [NIM] | [NAMA_MAHASISWA]
 * Example:
 * 1234567890 | CONTOH MAHASISWA 1
 * 1234567891 | CONTOH MAHASISWA 2
 *
 * Automatically deduplicates entries with the same NIM!
 */
export function parseStudentList(rawText: string): ParseStudentResult {
  if (!rawText || !rawText.trim()) {
    return { students: [], duplicateCount: 0, totalParsed: 0 };
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seenNims = new Set<string>();
  const students: Omit<Student, 'id' | 'isActive'>[] = [];
  let duplicateCount = 0;

  for (const line of lines) {
    // Skip obvious header titles like "Students", "Daftar Mahasiswa", "No", "NIM", etc.
    if (/^(students|daftar\s+mahasiswa|mahasiswa|peserta\s+kelas)$/i.test(line)) {
      continue;
    }

    let nim = '';
    let name = '';
    let phone: string | undefined;

    // Check pipe format: "[NIM] | [NAMA MAHASISWA]"
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      // Usually part 0 is NIM, part 1 is Name
      const matchNim0 = parts[0].match(/\b\d{6,14}\b/);
      const matchNim1 = parts[1]?.match(/\b\d{6,14}\b/);

      if (matchNim0) {
        nim = matchNim0[0];
        name = parts[1] || '';
      } else if (matchNim1) {
        nim = matchNim1[0];
        name = parts[0] || '';
      } else {
        nim = parts[0];
        name = parts[1] || '';
      }
    } else {
      // General format: numbers, commas, tabs, spaces
      // Find phone number if exists (starts with 08 or +62)
      let clean = line.replace(/^\s*\[?\d+\]?[\.\-\)\s]+/, '').trim();
      const phoneMatch = clean.match(/(\+62|08)[0-9\-\s]{8,15}/);
      if (phoneMatch) {
        phone = phoneMatch[0].replace(/[\-\s]/g, '');
        clean = clean.replace(phoneMatch[0], '').trim();
      }

      // Find NIM (sequence of 6 to 14 digits)
      const nimMatch = clean.match(/\b\d{6,14}\b/);
      if (nimMatch) {
        nim = nimMatch[0];
        clean = clean.replace(nimMatch[0], '').trim();
      }

      clean = clean.replace(/^[\-\|\,\s]+|[\-\|\,\s]+$/g, '').trim();
      name = clean;
    }

    // Clean up name
    name = name.replace(/^[\-\|\,\s]+|[\-\|\,\s]+$/g, '').trim();

    if (nim && name) {
      if (seenNims.has(nim)) {
        duplicateCount++;
      } else {
        seenNims.add(nim);
        students.push({
          nim,
          name: toTitleCase(name), // Clean title case formatting
          phone,
        });
      }
    }
  }

  return {
    students,
    duplicateCount,
    totalParsed: students.length,
  };
}
