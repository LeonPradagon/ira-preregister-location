import React, { useState } from 'react';
import { Lock, Mail, Shield, CheckCircle2, ArrowRight, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminRole } from '../../types';
import { API_MODE } from '../../lib/apiClient';

export const LoginView: React.FC = () => {
  const { loginAdmin, allAdminUsers } = useApp();
  const apiMode = API_MODE;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const authenticated = await loginAdmin(email, password);
      if (!authenticated) {
        setError('Autentikasi gagal. Silakan periksa email dan kata sandi Anda.');
      }
    } catch {
      setError('Autentikasi gagal. Silakan periksa kembali email Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuickAccount = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('');
    setError('Akun dipilih. Masukkan kata sandi demo untuk melanjutkan.');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Top Branding */}
        <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-8 text-center border-b border-gray-100 dark:border-gray-800">
          <div className="w-12 h-12 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-xs">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Exact Location Ops</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Customer Validation & Dispatch Verification Portal
          </p>
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Better Auth Session Guard Active</span>
          </div>
        </div>

        {/* Login Form */}
        <div className="p-7 space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-lg font-medium">
                {error}
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-blue-800 dark:text-blue-300">
              {apiMode
                ? 'Mode API aktif: gunakan kredensial Better Auth yang dibuat melalui seed atau administrasi platform.'
                : <>Mode demo lokal: kata sandi default adalah <code className="font-mono font-semibold">demo-password</code>.</>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email Perusahaan
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.id"
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300 transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300 transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white active:scale-[0.99] text-white rounded-lg text-xs font-medium shadow-xs transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>Memverifikasi Sesi...</span>
              ) : (
                <>
                  <span>Masuk ke Dashboard Ops</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Role Switcher for Testing (PRD Section 5.1) */}
          {!apiMode && <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
              <span>Akses Cepat Pengujian Role (RBAC):</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {allAdminUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelectQuickAccount(user.email)}
                  className="p-2.5 text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group bg-white dark:bg-gray-850"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 group-hover:text-gray-950 dark:group-hover:text-white truncate">
                      {user.name}
                    </span>
                    <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 group-hover:bg-gray-900 group-hover:text-white dark:group-hover:bg-gray-100 dark:group-hover:text-gray-900 transition-colors">
                      {user.role}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.department}</div>
                </button>
              ))}
            </div>
          </div>}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-950 px-6 py-3 border-t border-gray-100 dark:border-gray-800 text-center text-[11px] text-gray-500 dark:text-gray-400">
          Protected by Better Auth • PostgreSQL / PostGIS Spatial Engine
        </div>
      </div>
    </div>
  );
};
