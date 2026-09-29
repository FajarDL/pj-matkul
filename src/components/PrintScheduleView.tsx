import React from 'react';
import type { Course, Student, SessionSchedule } from '../types';
import { isPracticumCourse } from '../services/rotationAlgorithm';

interface PrintScheduleViewProps {
  course: Course;
  students: Student[];
  sessions: SessionSchedule[];
}

export const PrintScheduleView: React.FC<PrintScheduleViewProps> = ({
  course,
  students,
  sessions,
}) => {
  const courseSessions = sessions
    .filter((s) => s.courseId === course.id)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  return (
    <div className="hidden print:block p-8 bg-white text-black font-serif text-sm">
      {/* Kop / Header Dokumen Resmi */}
      <div className="text-center border-b-2 border-black pb-4 mb-6">
        <h1 className="text-xl font-bold uppercase tracking-wider">
          JADWAL & ROTASI PENANGGUNG JAWAB (PJ) PERKULIAHAN
        </h1>
        <h2 className="text-base font-semibold uppercase mt-1">
          SEMESTER GANJIL / GENAP TAHUN AKADEMIK 2026/2027
        </h2>
      </div>

      {/* Identitas Mata Kuliah */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6 text-xs font-sans">
        <div className="flex">
          <span className="w-36 font-bold">Mata Kuliah:</span>
          <span>{course.name} ({course.code})</span>
        </div>
        <div className="flex">
          <span className="w-36 font-bold">Hari, Waktu:</span>
          <span>{course.day}, {course.startTime} - {course.endTime} WIB</span>
        </div>
        <div className="flex">
          <span className="w-36 font-bold">Dosen Pengampu:</span>
          <span>{course.lecturer}</span>
        </div>
        <div className="flex">
          <span className="w-36 font-bold">Ruangan / Lab:</span>
          <span>{course.room}</span>
        </div>
      </div>

      {/* Tabel Jadwal */}
      <table className="w-full border-collapse border border-black text-xs font-sans mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2 w-12 text-center">Sesi</th>
            <th className="border border-black p-2 w-28 text-center">Tanggal</th>
            <th className="border border-black p-2 text-left">Materi / Pokok Bahasan</th>
            <th className="border border-black p-2 text-left">Penanggung Jawab (PJ)</th>
            <th className="border border-black p-2 w-24 text-center">Paraf Dosen</th>
          </tr>
        </thead>
        <tbody>
          {courseSessions.map((session) => {
            const assigned = students.filter((s) => session.assignedPjIds.includes(s.id));
            const pjNames = assigned.map((s) => `${s.name} (${s.nim})`).join(', ');

            return (
              <tr key={session.id}>
                <td className="border border-black p-2 text-center font-bold">
                  {session.sessionNumber}
                </td>
                <td className="border border-black p-2 text-center whitespace-nowrap">
                  {new Date(session.date).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="border border-black p-2 font-medium">
                  {session.topic}
                </td>
                <td className="border border-black p-2">
                  {isPracticumCourse(course) ? 'Praktikum (Tanpa PJ)' : (pjNames || '-')}
                </td>
                <td className="border border-black p-2 text-center"></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Lembar Pengesahan */}
      <div className="grid grid-cols-2 text-center text-xs font-sans mt-12 page-break">
        <div>
          <p>Mengetahui,</p>
          <p className="font-semibold">Dosen Pengampu Mata Kuliah</p>
          <div className="h-20" />
          <p className="font-bold underline">{course.lecturer}</p>
        </div>
        <div>
          <p>Dibuat oleh,</p>
          <p className="font-semibold">Ketua Tingkat / Koordinator Kelas</p>
          <div className="h-20" />
          <p className="font-bold underline">( ............................................ )</p>
        </div>
      </div>
    </div>
  );
};
