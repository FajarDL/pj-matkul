import React, { useState } from 'react';
import type { Student, SessionSchedule, UserRole } from '../types';
import { calculateStudentStats } from '../services/rotationAlgorithm';
import { parseStudentList } from '../services/scheduleParser';
import { 
  UserPlus, 
  Search, 
  Trash2, 
  Edit2, 
  X, 
  Phone, 
  ClipboardList,
  Lock
} from 'lucide-react';

interface StudentManagerProps {
  students: Student[];
  sessions: SessionSchedule[];
  activeCourseId: string | null;
  userRole: UserRole;
  onUpdateStudents: (students: Student[]) => void;
  onDeleteAllStudents?: () => void;
  onRequestLogin?: () => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
  sessions,
  activeCourseId,
  userRole,
  onUpdateStudents,
  onDeleteAllStudents,
  onRequestLogin,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Single add form
  const [formData, setFormData] = useState({
    nim: '',
    name: '',
    phone: '',
  });

  // Bulk paste text
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Omit<Student, 'id' | 'isActive'>[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);

  // Calculate statistics per student
  const stats = calculateStudentStats(students, sessions, activeCourseId || undefined);

  // Filter students by search query
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nim.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle single student submit
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!formData.name.trim() || !formData.nim.trim()) return;

    const newStudent: Student = {
      id: `std-${Date.now()}`,
      nim: formData.nim.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim() || undefined,
      isActive: true,
    };

    onUpdateStudents([...students, newStudent]);
    setFormData({ nim: '', name: '', phone: '' });
    setIsAddModalOpen(false);
  };

  // Handle edit student save
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (!editingStudent) return;

    const updated = students.map((s) => (s.id === editingStudent.id ? editingStudent : s));
    onUpdateStudents(updated);
    setEditingStudent(null);
  };

  // Delete student
  const handleDeleteStudent = (id: string, name: string) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (confirm(`Hapus "${name}" dari daftar mahasiswa kelas?`)) {
      onUpdateStudents(students.filter((s) => s.id !== id));
    }
  };

  // Parse bulk text from WhatsApp/Excel/Pipe
  const handleParseBulk = (text: string) => {
    setBulkText(text);
    const result = parseStudentList(text);
    setBulkPreview(result.students);
    setDuplicateCount(result.duplicateCount);
  };

  // Confirm bulk import
  const handleConfirmBulk = () => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (bulkPreview.length === 0) return;

    const newEntries: Student[] = bulkPreview.map((item, idx) => ({
      id: `std-${Date.now()}-${idx}`,
      nim: item.nim,
      name: item.name,
      phone: item.phone,
      isActive: true,
    }));

    onUpdateStudents([...students, ...newEntries]);
    setBulkText('');
    setBulkPreview([]);
    setIsBulkModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Daftar Mahasiswa Kelas</span>
            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200">
              {students.length} Mahasiswa
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Data nomor induk mahasiswa (NIM), nama lengkap, dan kontak untuk pembagian giliran tugas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200 transition cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-slate-600" />
                <span>Bulk Import / Tempel</span>
              </button>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Tambah Mahasiswa</span>
              </button>

              {students.length > 0 && (
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Apakah Anda yakin ingin menghapus SELURUH mahasiswa (${students.length} mahasiswa)?\n\nDaftar mata kuliah dan jadwal akan tetap aman, namun seluruh penugasan PJ pada jadwal akan dikosongkan.`
                      )
                    ) {
                      onDeleteAllStudents?.();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs sm:text-sm px-3 py-2 rounded-xl border border-rose-200 transition cursor-pointer"
                  title="Hapus seluruh data mahasiswa"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span className="hidden sm:inline">Hapus Semua Mahasiswa</span>
                  <span className="sm:hidden">Hapus Semua</span>
                </button>
              )}
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs px-3 py-1.5 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Mode Hanya Baca (Mahasiswa)</span>
            </div>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Cari berdasarkan nama atau NIM..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-800"
        />
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4 w-36">NIM</th>
                <th className="py-3 px-4">Nama Mahasiswa</th>
                <th className="py-3 px-4 w-40">Kontak WhatsApp</th>
                <th className="py-3 px-4 w-44">Tugas Terjadwal</th>
                {isAdmin && <th className="py-3 px-4 w-24 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student, idx) => {
                  const stat = stats.find((s) => s.student.id === student.id);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {student.nim}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{student.name}</div>
                      </td>

                      <td className="py-3 px-4">
                        {student.phone ? (
                          <a
                            href={`https://wa.me/${student.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-mono text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{student.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-xs">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-xs ${
                              (stat?.totalAssigned || 0) === 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {stat?.totalAssigned || 0} Kali
                          </span>
                          {stat?.sessionNumbers && stat.sessionNumbers.length > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              (Sesi: {stat.sessionNumbers.join(', ')})
                            </span>
                          )}
                        </div>
                      </td>

                      {isAdmin && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingStudent({ ...student })}
                              title="Edit Data Mahasiswa"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(student.id, student.name)}
                              title="Hapus Mahasiswa"
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="py-10 text-center text-slate-500">
                    Tidak ditemukan data mahasiswa yang sesuai pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Tambah Mahasiswa Manual */}
      {isAddModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Tambah Mahasiswa Baru</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor Induk Mahasiswa (NIM)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 220101099"
                  value={formData.nim}
                  onChange={(e) => setFormData({ ...formData, nim: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap Mahasiswa
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Cahyono"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  Simpan Mahasiswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Paste / Import */}
      {isBulkModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Bulk Import Data Mahasiswa</h3>
                <p className="text-xs text-slate-500">Salin & tempel daftar mahasiswa dari WhatsApp, Excel, atau Google Sheets</p>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tempel (Paste) Teks Daftar Nama:
                </label>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => handleParseBulk(e.target.value)}
                  placeholder={`Contoh format yang didukung:\n[NIM] | [NAMA MAHASISWA]\n\nContoh pengisian:\n1234567890 | CONTOH MAHASISWA 1\n1234567891 | CONTOH MAHASISWA 2\n1234567892 | CONTOH MAHASISWA 3`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {bulkPreview.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Hasil Deteksi ({bulkPreview.length} Mahasiswa Unik Teridentifikasi):
                    </span>
                    {duplicateCount > 0 && (
                      <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                        {duplicateCount} Duplikat NIM Dibersihkan
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 text-xs">
                    {bulkPreview.map((item, i) => (
                      <div key={i} className="p-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-900">{item.name}</span>
                          <span className="text-slate-500 ml-2 font-mono">({item.nim})</span>
                        </div>
                        {item.phone && (
                          <span className="text-[11px] text-slate-600 font-mono">{item.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBulk}
                disabled={bulkPreview.length === 0}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg shadow-sm"
              >
                Tambahkan {bulkPreview.length} Mahasiswa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Mahasiswa */}
      {editingStudent && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Perbarui Data Mahasiswa</h3>
              <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  NIM
                </label>
                <input
                  type="text"
                  value={editingStudent.nim}
                  onChange={(e) => setEditingStudent({ ...editingStudent, nim: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nomor WhatsApp
                </label>
                <input
                  type="text"
                  value={editingStudent.phone || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
