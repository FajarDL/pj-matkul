import React, { useState, useMemo } from 'react';
import type { CashTransaction, TransactionType, UserRole } from '../types';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PlusCircle, 
  Share2, 
  Check, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  X, 
  ReceiptText,
  Calendar,
  Lock
} from 'lucide-react';

interface TreasuryManagerProps {
  transactions: CashTransaction[];
  userRole: UserRole;
  userName: string;
  onUpdateTransactions: (transactions: CashTransaction[]) => void;
  onRequestLogin?: () => void;
}

const INCOME_CATEGORIES = [
  'Iuran Rutin',
  'Sisa Dana Kegiatan',
  'Sumbangan / Donasi',
  'Denda Keterlambatan',
  'Lainnya',
];

const EXPENSE_CATEGORIES = [
  'Fotokopi / Cetak Materi',
  'Konsumsi Dosen / Tamu',
  'Peralatan & Perlengkapan Kelas',
  'Dana Sosial / Jenguk',
  'Kegiatan / Acara Kelas',
  'Lainnya',
];

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateCashWhatsAppMessage(
  transactions: CashTransaction[],
  totalIncome: number,
  totalExpense: number,
  netBalance: number
): string {
  const todayStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Sort descending by date
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recent = sorted.slice(0, 5);

  let msg = `💰 *LAPORAN ARUS KAS KELAS*\n`;
  msg += `📅 Per: ${todayStr}\n\n`;
  msg += `💵 *Total Pemasukan:* ${formatRupiah(totalIncome)}\n`;
  msg += `💸 *Total Pengeluaran:* ${formatRupiah(totalExpense)}\n`;
  msg += `💳 *SALDO KAS SAAT INI: ${formatRupiah(netBalance)}*\n\n`;

  if (recent.length > 0) {
    msg += `📋 *5 Catatan Transaksi Terakhir:*\n`;
    recent.forEach((t, i) => {
      const sign = t.type === 'income' ? '(+)' : '(-)';
      msg += `${i + 1}. ${sign} *${formatRupiah(t.amount)}* [${t.category}]\n   ↳ ${t.description} (${t.date})\n`;
    });
  }

  msg += `\n_Laporan kas ini transparan dan dapat ditinjau bersama melalui SI-ROTASI._`;
  return msg;
}

export const TreasuryManager: React.FC<TreasuryManagerProps> = ({
  transactions,
  userRole,
  userName,
  onUpdateTransactions,
  onRequestLogin,
}) => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCopied, setIsCopied] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CashTransaction | null>(null);

  // Form State
  const [formType, setFormType] = useState<TransactionType>('income');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [formCustomCategory, setFormCustomCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Statistics Calculation
  const { totalIncome, totalExpense, netBalance } = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    });
    return {
      totalIncome: income,
      totalExpense: expense,
      netBalance: income - expense,
    };
  }, [transactions]);

  // Available categories based on selected type
  const availableCategories = formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return [...transactions]
      .filter((t) => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = t.description.toLowerCase().includes(q);
          const matchCat = t.category.toLowerCase().includes(q);
          const matchAmount = t.amount.toString().includes(q);
          if (!matchDesc && !matchCat && !matchAmount) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, typeFilter, categoryFilter, searchQuery]);

  // Handle open add modal
  const handleOpenAddModal = (type: TransactionType = 'income') => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    setEditingTransaction(null);
    setFormType(type);
    setFormAmount('');
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setFormCategory(cats[0]);
    setFormCustomCategory('');
    setFormDescription('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEditModal = (transaction: CashTransaction) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    setEditingTransaction(transaction);
    setFormType(transaction.type);
    setFormAmount(transaction.amount.toString());

    const defaultCats = transaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (defaultCats.includes(transaction.category)) {
      setFormCategory(transaction.category);
      setFormCustomCategory('');
    } else {
      setFormCategory('Lainnya');
      setFormCustomCategory(transaction.category);
    }

    setFormDescription(transaction.description);
    setFormDate(transaction.date);
    setIsModalOpen(true);
  };

  // Handle Save Transaction
  const handleSubmitTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }

    const numAmount = Number(formAmount.replace(/[^0-9]/g, ''));
    if (!numAmount || numAmount <= 0) {
      alert('Masukkan nominal uang yang valid!');
      return;
    }

    if (!formDescription.trim()) {
      alert('Masukkan keterangan transaksi!');
      return;
    }

    const finalCategory =
      formCategory === 'Lainnya' && formCustomCategory.trim()
        ? formCustomCategory.trim()
        : formCategory;

    if (editingTransaction) {
      const updated = transactions.map((t) =>
        t.id === editingTransaction.id
          ? {
              ...t,
              type: formType,
              amount: numAmount,
              category: finalCategory,
              description: formDescription.trim(),
              date: formDate,
            }
          : t
      );
      onUpdateTransactions(updated);
    } else {
      const newTransaction: CashTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: formType,
        amount: numAmount,
        category: finalCategory,
        description: formDescription.trim(),
        date: formDate,
        recordedBy: userName || (userRole === 'owner' ? 'Ketua Kelas' : 'Bendahara'),
        createdAt: new Date().toISOString(),
      };
      onUpdateTransactions([newTransaction, ...transactions]);
    }

    setIsModalOpen(false);
  };

  // Handle Delete Transaction
  const handleDeleteTransaction = (id: string, desc: string) => {
    if (!isAdmin) {
      onRequestLogin?.();
      return;
    }
    if (confirm(`Hapus catatan transaksi "${desc}"?`)) {
      onUpdateTransactions(transactions.filter((t) => t.id !== id));
    }
  };

  // Copy WhatsApp summary
  const handleCopyWhatsApp = () => {
    const text = generateCashWhatsAppMessage(
      transactions,
      totalIncome,
      totalExpense,
      netBalance
    );
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
              <Wallet className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Buku Kas Kelas (Bendahara)
            </h2>
            <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
              Transparan
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pencatatan arus kas kelas, iuran, fotokopi, konsumsi, dan transparansi saldo keuangan perkuliahan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-slate-200 transition cursor-pointer"
            title="Salin rekap saldo dan transaksi kas untuk dibagikan ke WhatsApp kelas"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Tersalin!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>Salin Rekap WA</span>
              </>
            )}
          </button>

          {isAdmin ? (
            <button
              onClick={() => handleOpenAddModal('income')}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-xs transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>Catat Transaksi</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs px-3 py-1.5 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Mode Lihat Saja</span>
            </div>
          )}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Income */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Pemasukan
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 tracking-tight font-mono">
            {formatRupiah(totalIncome)}
          </div>
          <div className="text-[11px] text-slate-400">
            Dari iuran, donasi, dan sisa anggaran
          </div>
        </div>

        {/* Total Expense */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Pengeluaran
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-700 tracking-tight font-mono">
            {formatRupiah(totalExpense)}
          </div>
          <div className="text-[11px] text-slate-400">
            Untuk keperluan materi, konsumsi, dan kelas
          </div>
        </div>

        {/* Net Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2 bg-gradient-to-br from-white to-indigo-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
              Saldo Kas Tersedia
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black tracking-tight font-mono ${netBalance >= 0 ? 'text-indigo-950' : 'text-rose-700'}`}>
            {formatRupiah(netBalance)}
          </div>
          <div className="text-[11px] text-indigo-700/80 font-medium">
            Saldo bersih kas kelas saat ini
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter Buttons */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                typeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({transactions.length})
            </button>
            <button
              onClick={() => setTypeFilter('income')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                typeFilter === 'income' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pemasukan</span>
            </button>
            <button
              onClick={() => setTypeFilter('expense')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                typeFilter === 'expense' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pengeluaran</span>
            </button>
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              <option value="all">Semua Kategori</option>
              {[...new Set(transactions.map((t) => t.category))].map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari keterangan / nominal..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4 w-28">Tanggal</th>
                <th className="py-3 px-4 w-28">Jenis</th>
                <th className="py-3 px-4 w-44">Kategori</th>
                <th className="py-3 px-4">Keterangan</th>
                <th className="py-3 px-4 w-36 text-right">Nominal</th>
                <th className="py-3 px-4 w-32">Pencatat</th>
                {isAdmin && <th className="py-3 px-4 w-20 text-right no-print">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx, idx) => {
                  const isIncome = tx.type === 'income';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap text-xs">
                        {tx.date}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            isIncome
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isIncome ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{isIncome ? 'Masuk' : 'Keluar'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                          {tx.category}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{tx.description}</div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isIncome ? 'text-emerald-700' : 'text-rose-700'}>
                          {isIncome ? '+' : '-'} {formatRupiah(tx.amount)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-xs">
                        {tx.recordedBy || '-'}
                      </td>

                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right no-print whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditModal(tx)}
                              title="Edit Transaksi"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(tx.id, tx.description)}
                              title="Hapus Transaksi"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-slate-500">
                    <ReceiptText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Belum ada catatan transaksi kas</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {transactions.length === 0
                        ? 'Klik tombol "Catat Transaksi" untuk mulai mendokumentasikan kas kelas.'
                        : 'Tidak ada transaksi yang cocok dengan filter atau pencarian Anda.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Tambah / Edit Transaksi */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-600" />
                <span>{editingTransaction ? 'Edit Catatan Kas' : 'Catat Transaksi Kas Baru'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransaction} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Jenis Transaksi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormType('income');
                      setFormCategory(INCOME_CATEGORIES[0]);
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formType === 'income'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>Pemasukan (+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormType('expense');
                      setFormCategory(EXPENSE_CATEGORIES[0]);
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formType === 'expense'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Pengeluaran (-)</span>
                  </button>
                </div>
              </div>

              {/* Nominal Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nominal Uang (Rupiah) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500 font-mono">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1000"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="Contoh: 50000"
                    required
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Kategori Transaksi
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {formCategory === 'Lainnya' && (
                  <input
                    type="text"
                    value={formCustomCategory}
                    onChange={(e) => setFormCustomCategory(e.target.value)}
                    placeholder="Ketik kategori kustom..."
                    className="w-full mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tanggal Transaksi
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Keterangan / Rincian <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Misal: Iuran minggu ke-2 dari 30 mahasiswa, atau Beli 2 spidol & penghapus..."
                  rows={2}
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm cursor-pointer"
                >
                  {editingTransaction ? 'Simpan Perubahan' : 'Catat Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
