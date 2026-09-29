import React, { useState } from 'react';
import type { AuthSession } from '../types';
import { authService } from '../services/authService';
import { 
  KeyRound, 
  Lock, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  X, 
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (session: AuthSession) => void;
  isGate?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  isGate = false,
}) => {
  const isKeyConfigured = authService.isConfigured();

  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // Handle Unlock or Initial Setup
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!inputKey.trim()) {
      setErrorMessage('Kunci akses tidak boleh kosong.');
      return;
    }

    const res = authService.unlock(inputKey, rememberMe);
    if (res.success && res.session) {
      onLoginSuccess(res.session);
      if (onClose) onClose();
    } else {
      setErrorMessage(res.message);
    }
  };



  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm no-print ${isGate ? 'min-h-screen' : ''}`}>
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative text-center">
          {!isGate && onClose && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 cursor-pointer transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 mx-auto mb-3 shadow-inner">
            {isKeyConfigured ? <Lock className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>

          <h3 className="text-base font-bold tracking-tight">
            {isKeyConfigured ? 'SI-ROTASI Terkunci' : 'Atur Kunci Akses Aplikasi'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isKeyConfigured
              ? 'Masukkan kunci rahasia untuk membuka halaman utama'
              : 'Tentukan satu kunci akses (PIN/Password) untuk mengamankan aplikasi'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {!isKeyConfigured && (
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  Kunci ini akan disimpan di penyimpanan lokal browser Anda. Hanya orang yang memiliki kunci ini yang dapat mengakses web Anda.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center justify-between">
                <span>{isKeyConfigured ? 'Kunci Akses' : 'Buat Kunci Akses Baru'}</span>
                <span className="text-[10px] text-slate-400 font-normal lowercase">(bebas huruf/angka)</span>
              </label>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={isKeyConfigured ? 'Ketik kunci akses rahasia...' : 'Contoh: 2026 atau komti123'}
                  value={inputKey}
                  onChange={(e) => {
                    setInputKey(e.target.value);
                    setErrorMessage('');
                  }}
                  className="w-full pr-10 p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-wider focus:ring-2 focus:ring-slate-900 focus:bg-white transition"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Toggle */}
            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-xs text-slate-600 select-none cursor-pointer">
                Ingat saya di perangkat ini
              </label>
            </div>

            {errorMessage && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <span>{isKeyConfigured ? 'Buka Halaman Utama' : 'Simpan Kunci & Masuk'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>



          </form>
        </div>

      </div>
    </div>
  );
};
