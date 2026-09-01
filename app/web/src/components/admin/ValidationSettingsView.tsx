import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Lock,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sliders,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';
import { ValidationConfig } from '../../types';

export const ValidationSettingsView: React.FC = () => {
  const { validationConfig, updateValidationConfig, currentAdmin } = useApp();
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ValidationConfig>(validationConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setFormData(validationConfig);
  }, [validationConfig]);

  const canEditSettings = currentAdmin?.role === 'SUPER_ADMIN';

  const handleChangeNumber = (field: keyof ValidationConfig, value: number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggle = (field: keyof ValidationConfig) => {
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) return;
    setSaveError(null);
    try {
      await updateValidationConfig(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Konfigurasi gagal disimpan.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('settings.title')}</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.description')}
          </p>
        </div>

        {!canEditSettings && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>{t('settings.readOnly')} ({currentAdmin?.role})</span>
          </div>
        )}
      </div>

      {savedSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium rounded-xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{t('settings.saved')}</span>
        </div>
      )}
      {saveError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{saveError}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SPATIAL & GPS THRESHOLDS (PRD Section 16 & 27) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('settings.spatial')}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.gpsAccuracy')} (GPS_MAX_ACCURACY_METERS)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="100"
                  disabled={!canEditSettings}
                  value={formData.GPS_MAX_ACCURACY_METERS}
                  onChange={(e) => handleChangeNumber('GPS_MAX_ACCURACY_METERS', parseInt(e.target.value) || 30)}
                  className="w-32 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
                />
                <span className="text-gray-500 dark:text-gray-400">meter</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.gpsAccuracyHelp')} (LOW_GPS_ACCURACY).
              </p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.homeRadius')} (HOME_RADIUS_METERS)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="200"
                  disabled={!canEditSettings}
                  value={formData.HOME_RADIUS_METERS}
                  onChange={(e) => handleChangeNumber('HOME_RADIUS_METERS', parseInt(e.target.value) || 50)}
                  className="w-32 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
                />
                <span className="text-gray-500 dark:text-gray-400">meter</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.homeRadiusHelp')}
              </p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.streetMatch')} (STREET_MATCH_THRESHOLD)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.0"
                  disabled={!canEditSettings}
                  value={formData.STREET_MATCH_THRESHOLD}
                  onChange={(e) => handleChangeNumber('STREET_MATCH_THRESHOLD', parseFloat(e.target.value) || 0.9)}
                  className="w-32 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
                />
                <span className="text-gray-500 dark:text-gray-400">ratio (0.0 - 1.0)</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.streetMatchHelp')}
              </p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.addressScore')} (ADDRESS_SCORE_THRESHOLD)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.0"
                  disabled={!canEditSettings}
                  value={formData.ADDRESS_SCORE_THRESHOLD}
                  onChange={(e) => handleChangeNumber('ADDRESS_SCORE_THRESHOLD', parseFloat(e.target.value) || 0.9)}
                  className="w-32 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
                />
                <span className="text-gray-500 dark:text-gray-400">ratio (0.0 - 1.0)</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.addressScoreHelp')}
              </p>
            </div>
          </div>
        </div>

        {/* SESSION & REMINDERS (PRD Section 18) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('settings.session')}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.maxReminders')}
              </label>
              <input
                type="number"
                min="1"
                max="5"
                disabled={!canEditSettings}
                value={formData.MAX_REMINDERS_PER_SESSION}
                onChange={(e) => handleChangeNumber('MAX_REMINDERS_PER_SESSION', parseInt(e.target.value) || 3)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('settings.strictReminder')}</p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.tokenLifetime')}
              </label>
              <input
                type="number"
                min="1"
                max="30"
                disabled={!canEditSettings}
                value={formData.VERIFICATION_TOKEN_TTL_DAYS}
                onChange={(e) => handleChangeNumber('VERIFICATION_TOKEN_TTL_DAYS', parseInt(e.target.value) || 7)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('settings.defaultExpiry')}</p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.decimalPrecision')}
              </label>
              <input
                type="number"
                min="4"
                max="8"
                disabled={!canEditSettings}
                value={formData.COORDINATE_DISPLAY_DECIMALS}
                onChange={(e) => handleChangeNumber('COORDINATE_DISPLAY_DECIMALS', parseInt(e.target.value) || 6)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('settings.decimalPrecisionHelp')}</p>
            </div>
          </div>
        </div>

        {/* FEATURE FLAGS */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('settings.features')}</span>
          </h2>

          <div className="space-y-3 pt-1">
            {[
              {
                key: 'ENABLE_MANUAL_REVIEW' as keyof ValidationConfig,
                label: 'settings.feature.manualReview',
                desc: 'settings.feature.manualReviewDesc',
              },
              {
                key: 'ENABLE_ADDRESS_EDIT' as keyof ValidationConfig,
                label: 'settings.feature.addressEdit',
                desc: 'settings.feature.addressEditDesc',
              },
              {
                key: 'ENABLE_REMINDERS' as keyof ValidationConfig,
                label: 'settings.feature.reminders',
                desc: 'settings.feature.remindersDesc',
              },
              {
                key: 'ENABLE_IRA_COVERAGE' as keyof ValidationConfig,
                label: 'settings.feature.iraCoverage',
                desc: 'settings.feature.iraCoverageDesc',
              },
              {
                key: 'ENABLE_TICKETING' as keyof ValidationConfig,
                label: 'settings.feature.ticketing',
                desc: 'settings.feature.ticketingDesc',
              },
            ].map((item) => (
              <div
                key={item.key}
                className="p-3.5 bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-xs">{t(item.label)}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{t(item.desc)}</div>
                </div>
                <button
                  type="button"
                  disabled={!canEditSettings}
                  onClick={() => handleToggle(item.key)}
                  className={`text-2xl transition-colors ${
                    formData[item.key] ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {formData[item.key] ? (
                    <ToggleRight className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Actions */}
        {canEditSettings && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium shadow-xs flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{t('settings.save')}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
