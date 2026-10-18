import type { Course, Student, SessionSchedule, AppState } from '../types';

export const REAL_CLASS_STUDENTS: Student[] = [
  { id: 'std-2450081091', nim: '2450081091', name: 'IRGI MAULANA ARDIRTO', isActive: true, order: 1 },
  { id: 'std-2450081092', nim: '2450081092', name: 'MUTIA NUR SAFIQA', isActive: true, order: 2 },
  { id: 'std-2450081093', nim: '2450081093', name: 'RIZKY KHAIRUNISA', isActive: true, order: 3 },
  { id: 'std-2450081095', nim: '2450081095', name: 'MUAMAR JAENUL ANWAR SIDIQ', isActive: true, order: 4 },
  { id: 'std-2450081097', nim: '2450081097', name: 'JULIUS STEFANUS SAIBAN', isActive: true, order: 5 },
  { id: 'std-2450081098', nim: '2450081098', name: 'RIGGO YOGA DARMAWAN', isActive: true, order: 6 },
  { id: 'std-2450081100', nim: '2450081100', name: 'RYESISCA TAJWITTA MULYADI', isActive: true, order: 7 },
  { id: 'std-2450081101', nim: '2450081101', name: 'GUSNI KEANU', isActive: true, order: 8 },
  { id: 'std-2450081104', nim: '2450081104', name: 'FATIH DAFFA KHAIRAN MUSTOFA', isActive: true, order: 9 },
  { id: 'std-2450081105', nim: '2450081105', name: 'FAJAR DAYA LUTFIANA', isActive: true, order: 10 },
  { id: 'std-2450081107', nim: '2450081107', name: 'RIZKY FIRMANSYAH', isActive: true, order: 11 },
  { id: 'std-2450081109', nim: '2450081109', name: 'FIQRI ARISANDI', isActive: true, order: 12 },
  { id: 'std-2450081110', nim: '2450081110', name: 'MUHAMMAD UMAIR TILMISANI', isActive: true, order: 13 },
  { id: 'std-2450081111', nim: '2450081111', name: 'SOFYAN HADI SUMARNO', isActive: true, order: 14 },
  { id: 'std-2450081112', nim: '2450081112', name: 'ALSA ILHAMI BINSAR', isActive: true, order: 15 },
  { id: 'std-2450081113', nim: '2450081113', name: 'DHELA JUNITA ANANDA', isActive: true, order: 16 },
  { id: 'std-2450081116', nim: '2450081116', name: 'DIKI BAGAS PUTRA', isActive: true, order: 17 },
  { id: 'std-2450081117', nim: '2450081117', name: 'JOLY TIARA NURJANNAH', isActive: true, order: 18 },
  { id: 'std-2450081118', nim: '2450081118', name: 'ARLY MAULANA', isActive: true, order: 19 },
  { id: 'std-2450081120', nim: '2450081120', name: 'MAULANA ARBY FATSANI', isActive: true, order: 20 },
  { id: 'std-2450081096', nim: '2450081096', name: 'RARA WINASTI HANIFA AGISTINI', isActive: true, order: 21 },
];

export const REAL_CLASS_COURSES: Course[] = [
  {
    id: 'crs-man',
    code: 'IF-MAN',
    name: 'Metode dan Analisis Numerik (Kelas D)',
    lecturer: 'Dr. Melina, S.Si., M.Si.',
    day: 'Senin',
    startTime: '07:00',
    endTime: '08:30',
    room: 'R2-4',
    totalSessions: 16,
    color: '#2563eb',
    isPracticum: false,
  },
  {
    id: 'crs-dm',
    code: 'IF-DM',
    name: 'Data Mining (Kelas D)',
    lecturer: 'Yulison Herry Chrisnanto, S.T., M.T.',
    day: 'Senin',
    startTime: '08:50',
    endTime: '10:30',
    room: 'R2-2 FSI',
    totalSessions: 16,
    color: '#7c3aed',
    isPracticum: false,
  },
  {
    id: 'crs-aia',
    code: 'IF-AIA',
    name: 'AI Agent (Kelas C)',
    lecturer: 'Dr. Ridwan Ilyas, S.Kom., M.T.',
    day: 'Senin',
    startTime: '10:40',
    endTime: '12:20',
    room: 'R2-3',
    totalSessions: 16,
    color: '#0891b2',
    isPracticum: true, // W1 ada PJ Fajar, W3 dst ditandai Praktikum tanpa PJ
  },
  {
    id: 'crs-agm',
    code: 'IF-AGM',
    name: 'Agama (Kelas D)',
    lecturer: 'Drs. H. Zaenal Abidin, M.Ag',
    day: 'Senin',
    startTime: '13:00',
    endTime: '14:40',
    room: 'R2-2 FSI',
    totalSessions: 16,
    color: '#059669',
    isPracticum: false,
  },
  {
    id: 'crs-prak-cc',
    code: 'PRAK-CC',
    name: 'Praktikum Cloud Computing (Kelas D)',
    lecturer: 'Puspita Nurul Sabrina, S.Kom., M.T.',
    day: 'Selasa',
    startTime: '07:00',
    endTime: '08:40',
    room: 'Lab IF 2-3',
    totalSessions: 16,
    color: '#64748b',
    isPracticum: true,
  },
  {
    id: 'crs-ipl',
    code: 'IF-IPL',
    name: 'Implementasi Perangkat Lunak (Kelas D)',
    lecturer: 'Fatan Kasyidi, S.Kom., M.T.',
    day: 'Selasa',
    startTime: '10:40',
    endTime: '12:15',
    room: 'R2-4',
    totalSessions: 16,
    color: '#d97706',
    isPracticum: false,
  },
  {
    id: 'crs-bdnr',
    code: 'IF-BDNR',
    name: 'Basis Data Non Relasional (Kelas D)',
    lecturer: 'Edvin Ramadhan, S.Kom., M.T.',
    day: 'Selasa',
    startTime: '13:00',
    endTime: '14:30',
    room: 'R2-5',
    totalSessions: 16,
    color: '#db2777',
    isPracticum: false,
  },
  {
    id: 'crs-prak-pwl',
    code: 'PRAK-PWL',
    name: 'Praktikum Pemrograman Web Lanjut (Kelas I)',
    lecturer: 'Dr. Ridwan Ilyas, S.Kom., M.T.',
    day: 'Rabu',
    startTime: '07:00',
    endTime: '09:30',
    room: 'Lab IF 2-2',
    totalSessions: 16,
    color: '#64748b',
    isPracticum: true,
  },
  {
    id: 'crs-pwl',
    code: 'IF-PWL',
    name: 'Pemrograman Web Lanjut (Kelas I)',
    lecturer: 'Dr. Ridwan Ilyas, S.Kom., M.T.',
    day: 'Rabu',
    startTime: '10:40',
    endTime: '12:20',
    room: 'R2-6',
    totalSessions: 16,
    color: '#4f46e5',
    isPracticum: false,
  },
  {
    id: 'crs-cc',
    code: 'IF-CC',
    name: 'Cloud Computing (Kelas D)',
    lecturer: 'Puspita Nurul Sabrina, S.Kom., M.T.',
    day: 'Rabu',
    startTime: '14:50',
    endTime: '16:30',
    room: 'R1-3 FSI',
    totalSessions: 16,
    color: '#0284c7',
    isPracticum: false,
  },
  {
    id: 'crs-mob',
    code: 'IF-MOB',
    name: 'Mobile Programming (Kelas D)',
    lecturer: 'Dr. Agus Komarudin, S.Kom., M.T.',
    day: 'Kamis',
    startTime: '08:50',
    endTime: '10:30',
    room: 'R2-4',
    totalSessions: 16,
    color: '#0d9488',
    isPracticum: false,
  },
  {
    id: 'crs-prak-mob',
    code: 'PRAK-MOB',
    name: 'Praktikum Mobile Programming (Kelas D)',
    lecturer: 'Dr. Agus Komarudin, S.Kom., M.T.',
    day: 'Kamis',
    startTime: '13:00',
    endTime: '15:30',
    room: 'Lab IF 2-2',
    totalSessions: 16,
    color: '#64748b',
    isPracticum: true,
  },
  {
    id: 'crs-prak-ipl',
    code: 'PRAK-IPL',
    name: 'Praktikum Implementasi Perangkat Lunak (Kelas D)',
    lecturer: 'Fatan Kasyidi, S.Kom., M.T.',
    day: 'Jumat',
    startTime: '07:00',
    endTime: '09:30',
    room: 'Lab IF 2-1',
    totalSessions: 16,
    color: '#64748b',
    isPracticum: true,
  },
  {
    id: 'crs-bind',
    code: 'UNIV-BIND',
    name: 'Bahasa Indonesia',
    lecturer: 'Drs. H. Zaenal Abidin, M.Ag',
    day: 'Jumat',
    startTime: '13:00',
    endTime: '14:40',
    room: 'R1-3',
    totalSessions: 16,
    color: '#94a3b8',
    isPracticum: true, // Tanpa PJ
  },
];

// Helper to calculate date string for each week session
function calculateSessionDate(weekNumber: number, dayName: string): string {
  // Base date for Monday Week 1: 2026-09-07
  const baseMonday = new Date(2026, 8, 7); // Sept 7, 2026
  const dayOffsetMap: Record<string, number> = {
    senin: 0,
    selasa: 1,
    rabu: 2,
    kamis: 3,
    jumat: 4,
    sabtu: 5,
  };
  const offset = dayOffsetMap[dayName.toLowerCase()] ?? 0;
  const targetDate = new Date(baseMonday);
  targetDate.setDate(baseMonday.getDate() + (weekNumber - 1) * 7 + offset);
  return targetDate.toISOString().split('T')[0];
}

/**
 * Builds the complete 16-week session schedule reflecting:
 * 1. Weeks 1 - 3: Exact real historical records locked as completed
 * 2. Week 4: Special rebalance solution (Irgi & Ryesisca compensate 0-duty debt + tail finishes at Rara #21)
 * 3. Weeks 5 - 16: Pure circular round-robin sequence starting from #1 Irgi immediately after Rara #21,
 *    skipping Fajar (#10) who already completed 6 duties in Week 1.
 */
export function buildRealClassSchedule(): SessionSchedule[] {
  const sessions: SessionSchedule[] = [];

  // Active regular PJ courses in weekly chronological order
  const regularPjCourseIds = [
    'crs-man',  // Senin 07:00
    'crs-dm',   // Senin 08:50
    'crs-agm',  // Senin 13:00
    'crs-ipl',  // Selasa 10:40
    'crs-bdnr', // Selasa 13:00
    'crs-pwl',  // Rabu 10:40
    'crs-cc',   // Rabu 14:50
    'crs-mob',  // Kamis 08:50
  ];

  // Specific PJ mappings for historical Weeks 1 - 3
  const week1PjMap: Record<string, string[]> = {
    'crs-man': ['std-2450081105'], // Fajar Daya Lutfiana
    'crs-dm': ['std-2450081105'],  // Fajar Daya Lutfiana
    'crs-aia': ['std-2450081105'], // Fajar Daya Lutfiana
    'crs-agm': ['std-2450081105'], // Fajar Daya Lutfiana
    'crs-ipl': ['std-2450081105'], // Fajar Daya Lutfiana
    'crs-bdnr': ['std-2450081105'],// Fajar Daya Lutfiana
    'crs-pwl': ['std-2450081118'], // Arly Maulana
    'crs-cc': ['std-2450081101'],  // Gusni Keanu
    'crs-mob': ['std-2450081109'], // Fiqri Arisandi
  };

  const week2PjMap: Record<string, string[]> = {
    'crs-man': ['std-2450081120'], // Maulana Arby Fatsani
    'crs-dm': ['std-2450081095'],  // Muamar Jaenul Anwar Sidiq
    'crs-agm': ['std-2450081098'], // Riggo Yoga Darmawan
    'crs-ipl': ['std-2450081111'], // Sofyan Hadi Sumarno
    'crs-bdnr': ['std-2450081097'],// Julius Stefanus Saiban
    'crs-pwl': ['std-2450081113'], // Dhela Junita Ananda
    'crs-cc': ['std-2450081116'],  // Diki Bagas Putra
    'crs-mob': ['std-2450081117'], // Joly Tiara Nurjannah
  };

  const week3PjMap: Record<string, string[]> = {
    'crs-man': ['std-2450081096'], // Rara Winasti Hanifa Agistini
    'crs-dm': ['std-2450081093'],  // Rizky Khairunisa
    'crs-agm': ['std-2450081092'], // Mutia Nur Safiqa
    'crs-ipl': ['std-2450081110'], // Muhammad Umair Tilmisani
    'crs-bdnr': ['std-2450081109'],// Fiqri Arisandi
    'crs-pwl': ['std-2450081104'], // Fatih Daffa Khairan Mustofa
    'crs-cc': ['std-2450081107'],  // Rizky Firmansyah
    'crs-mob': ['std-2450081112'], // Alsa Ilhami Binsar
  };

  // Week 4 special rebalance:
  // Irgi & Ryesisca (debt from W1) take Senin morning, then tail (#16 - #21) finishes on Rara (#21)
  const week4PjMap: Record<string, string[]> = {
    'crs-man': ['std-2450081091'], // #1 Irgi Maulana Ardirto (menebus hutang W1)
    'crs-dm': ['std-2450081100'],  // #7 Ryesisca Tajwitta Mulyadi (menebus hutang W1)
    'crs-agm': ['std-2450081113'], // #16 Dhela Junita Ananda
    'crs-ipl': ['std-2450081116'], // #17 Diki Bagas Putra
    'crs-bdnr': ['std-2450081117'],// #18 Joly Tiara Nurjannah
    'crs-pwl': ['std-2450081118'], // #19 Arly Maulana
    'crs-cc': ['std-2450081120'],  // #20 Maulana Arby Fatsani
    'crs-mob': ['std-2450081096'], // #21 Rara Winasti Hanifa Agistini
  };

  // Student queue for regular circular rotation from Week 5 to Week 16
  // Fajar (#10) already has 6 duties in Week 1, so Fajar is exempt during rounds until quota parity
  const rotationPoolStudents = REAL_CLASS_STUDENTS.filter(
    (s) => s.id !== 'std-2450081105' // Exclude Fajar Daya Lutfiana (Lunas 6 tugas)
  );

  let rotationPointer = 0; // Starts at index 0 (#1 Irgi) on Week 5 Session 1!

  for (let w = 1; w <= 16; w++) {
    REAL_CLASS_COURSES.forEach((course) => {
      const dateStr = calculateSessionDate(w, course.day);
      let assignedPjIds: string[] = [];
      let status: 'completed' | 'upcoming' = w <= 3 ? 'completed' : 'upcoming';
      let isManuallyEdited = false;
      let notes = '';

      if (w === 1) {
        assignedPjIds = week1PjMap[course.id] || [];
        if (course.id === 'crs-man' || course.id === 'crs-dm' || course.id === 'crs-aia' || course.id === 'crs-agm' || course.id === 'crs-ipl' || course.id === 'crs-bdnr') {
          notes = 'Digantikan oleh Fajar (PJ asli berhalangan/tidak hadir)';
          isManuallyEdited = true;
        }
      } else if (w === 2) {
        assignedPjIds = week2PjMap[course.id] || [];
      } else if (w === 3) {
        assignedPjIds = week3PjMap[course.id] || [];
      } else if (w === 4) {
        assignedPjIds = week4PjMap[course.id] || [];
        if (course.id === 'crs-man') {
          notes = 'Penyeimbangan giliran: Irgi Maulana Ardirto';
        } else if (course.id === 'crs-dm') {
          notes = 'Penyeimbangan giliran: Ryesisca Tajwitta Mulyadi';
        }
      } else {
        // Week 5 to 16: Pure circular queue for regular courses
        if (regularPjCourseIds.includes(course.id)) {
          const chosen = rotationPoolStudents[rotationPointer % rotationPoolStudents.length];
          assignedPjIds = [chosen.id];
          rotationPointer++;
        }
      }

      let defaultTopic = `Pertemuan ${w}`;
      if (w === 8) defaultTopic = 'Ujian Tengah Semester (UTS)';
      if (w === 16) defaultTopic = 'Ujian Akhir Semester (UAS)';

      sessions.push({
        id: `sess-${course.id}-${w}`,
        courseId: course.id,
        sessionNumber: w,
        date: dateStr,
        topic: `${defaultTopic} - ${course.name}`,
        assignedPjIds,
        originalPjIds: [...assignedPjIds],
        isManuallyEdited,
        notes,
        status,
      });
    });
  }

  return sessions;
}

export function getRealClassInitialAppState(): AppState {
  return {
    courses: REAL_CLASS_COURSES,
    students: REAL_CLASS_STUDENTS,
    sessions: buildRealClassSchedule(),
    materials: [],
    transactions: [],
    activeCourseId: 'crs-man',
  };
}
