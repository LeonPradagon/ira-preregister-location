import React, { useState } from 'react';
import { Lock, Mail, Shield, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

export const LoginView: React.FC = () => {
  const { loginAdmin } = useApp();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('auth.emailPasswordRequired'));
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const authenticated = await loginAdmin(email, password);
      if (!authenticated) {
        setError(t('auth.invalidCredentials'));
      }
    } catch {
      setError(t('auth.emailCheck'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="fixed right-4 top-4"><LanguageSwitcher /></div>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Top Branding */}
        <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-8 text-center border-b border-gray-100 dark:border-gray-800">
          <div className="w-12 h-12 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-xs">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">IRA Preregist Ops</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('auth.portalSubtitle')}
          </p>
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('auth.sessionGuard')}</span>
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
              {t('auth.seedHint')}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('auth.companyEmail')}
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
                {t('auth.password')}
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
                <span>{t('auth.signingIn')}</span>
              ) : (
                <>
                  <span>{t('auth.signInDashboard')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-950 px-6 py-3 border-t border-gray-100 dark:border-gray-800 text-center text-[11px] text-gray-500 dark:text-gray-400">
          {t('auth.protectedBy')}
        </div>
      </div>
    </div>
  );
};
