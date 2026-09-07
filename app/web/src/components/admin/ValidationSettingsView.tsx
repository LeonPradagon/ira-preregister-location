import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Info,
  Lock,
  MapPin,
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
import { confirmAction, showActionSuccess } from '../../lib/swal';

type FeatureToggleItem = {
  key: keyof ValidationConfig;
  label: string;
  desc: string;
};

const approvalToggleItem: FeatureToggleItem = {
  key: 'ENABLE_AUTO_APPROVAL',
  label: 'settings.feature.autoApproval',
  desc: 'settings.feature.autoApprovalDesc',
};

const otherToggleItems: FeatureToggleItem[] = [
  { key: 'ENABLE_ADDRESS_EDIT', label: 'settings.feature.addressEdit', desc: 'settings.feature.addressEditDesc' },
  { key: 'ENABLE_REMINDERS', label: 'settings.feature.reminders', desc: 'settings.feature.remindersDesc' },
  { key: 'ENABLE_IRA_COVERAGE', label: 'settings.feature.iraCoverage', desc: 'settings.feature.iraCoverageDesc' },
  { key: 'ENABLE_TICKETING', label: 'settings.feature.ticketing', desc: 'settings.feature.ticketingDesc' },
];

export const ValidationSettingsView: React.FC = () => {
  const { validationConfig, updateValidationConfig, currentAdmin } = useApp();
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ValidationConfig>({ ...validationConfig, ENABLE_MANUAL_REVIEW: true });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Manual review is the safety fallback for this single approval setting.
    setFormData({ ...validationConfig, ENABLE_MANUAL_REVIEW: true });
  }, [validationConfig]);

  const canEditSettings = currentAdmin?.role === 'SUPER_ADMIN';

  const handleChangeNumber = (field: keyof ValidationConfig, value: number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggle = (field: keyof ValidationConfig) => {
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleAutomaticApprovalToggle = () => {
    setFormData((prev) => ({
      ...prev,
      ENABLE_AUTO_APPROVAL: !prev.ENABLE_AUTO_APPROVAL,
      ENABLE_MANUAL_REVIEW: true,
    }));
  };

  const renderToggle = (item: FeatureToggleItem, onToggle?: () => void) => {
    const enabled = Boolean(formData[item.key]);
    return (
      <div
        key={item.key}
        className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 dark:border-gray-700 dark:bg-gray-800/40"
      >
        <div className="min-w-0">
          <div className="break-words text-xs font-semibold text-gray-900 dark:text-white">{t(item.label)}</div>
          <div className="mt-0.5 break-words text-[11px] text-gray-500 dark:text-gray-400">{t(item.desc)}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t(item.label)}
          disabled={!canEditSettings}
          onClick={onToggle ?? (() => handleToggle(item.key))}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${enabled ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <span>{enabled ? t('settings.enabled') : t('settings.disabled')}</span>
          {enabled ? <ToggleRight className="h-8 w-8 text-indigo-600 dark:text-indigo-400" /> : <ToggleLeft className="h-8 w-8 text-gray-400 dark:text-gray-600" />}
        </button>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) return;
    setSaveError(null);
    const confirmed = await confirmAction({
      title: t('crud.updateQuestion'),
      text: t('crud.updateText'),
      confirmButtonText: t('crud.continue'),
      cancelButtonText: t('crud.cancel'),
    });
    if (!confirmed) return;
    try {
      // Keep the legacy field enabled so the team-review fallback is always available.
      const configToSave = { ...formData, ENABLE_MANUAL_REVIEW: true };
      await updateValidationConfig(configToSave);
      setFormData(configToSave);
      await showActionSuccess(t('crud.updated'), t('settings.saved'));
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
            {t('settings.pageIntro')}
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

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/20">
        <div className="flex items-start gap-2 text-indigo-950 dark:text-indigo-100"><Info className="mt-0.5 h-4 w-4 shrink-0" /><div><h2 className="text-sm font-semibold">{t('settings.quickSummaryTitle')}</h2><p className="mt-1 text-xs leading-relaxed text-indigo-800 dark:text-indigo-200">{t('settings.quickSummaryText')}</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-indigo-100 bg-white/80 p-3 dark:border-indigo-900/80 dark:bg-gray-900/50"><div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200"><CheckCircle2 className="h-4 w-4" />{t('settings.autoApprovalSummary')}</div><p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">{t('settings.autoApprovalSummaryText')}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${formData.ENABLE_AUTO_APPROVAL ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{formData.ENABLE_AUTO_APPROVAL ? t('settings.enabled') : t('settings.disabled')}</span></div>
          <div className="rounded-xl border border-indigo-100 bg-white/80 p-3 dark:border-indigo-900/80 dark:bg-gray-900/50"><div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200"><Shield className="h-4 w-4" />{t('settings.teamReviewSummary')}</div><p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">{t('settings.teamReviewSummaryText')}</p><span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{t('settings.enabled')}</span></div>
          <div className="rounded-xl border border-indigo-100 bg-white/80 p-3 dark:border-indigo-900/80 dark:bg-gray-900/50"><div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200"><Bell className="h-4 w-4" />{t('settings.reminderSummary')}</div><p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">{t('settings.reminderSummaryText', { count: formData.MAX_REMINDERS_PER_SESSION })}</p><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{formData.MAX_REMINDERS_PER_SESSION} {t('settings.maxReminders')}</span></div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SPATIAL & GPS THRESHOLDS (PRD Section 16 & 27) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t('settings.spatial')}</span>
          </h2>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('settings.spatialHelp')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.gpsAccuracy')}
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
                {t('settings.gpsAccuracyHelp')}
              </p>
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.homeRadius')}
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
                {t('settings.streetMatch')}
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
                {t('settings.addressScore')}
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

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.autoApprovalScore')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  min="0.9"
                  max="1.0"
                  disabled={!canEditSettings}
                  value={formData.AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD}
                  onChange={(e) => handleChangeNumber('AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD', parseFloat(e.target.value) || 0.9)}
                  className="w-32 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
                />
                <span className="text-gray-500 dark:text-gray-400">ratio (min. 0.90)</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.autoApprovalScoreHelp')}
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
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('settings.sessionHelp')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
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

            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t('settings.reminderLinkLifetime')}
              </label>
              <input
                type="number"
                min="1"
                max="168"
                disabled={!canEditSettings}
                value={formData.REMINDER_LINK_TTL_HOURS}
                onChange={(e) => handleChangeNumber('REMINDER_LINK_TTL_HOURS', parseInt(e.target.value) || 24)}
                className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-gray-900 dark:focus:border-gray-300"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t('settings.reminderLinkLifetimeHelp')}</p>
            </div>
          </div>
        </div>

        {/* FEATURE FLAGS */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('settings.features')}</span>
          </h2>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('settings.featuresHelp')}</p>

          <div className="space-y-4 pt-1">
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 dark:border-indigo-900 dark:bg-indigo-950/20">
              <div>
                <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">{t('settings.approvalRulesTitle')}</h3>
                <p className="mt-1 break-words text-[11px] leading-relaxed text-indigo-800 dark:text-indigo-200">{t('settings.approvalRulesDescription')}</p>
              </div>
              <div className="space-y-2">{renderToggle(approvalToggleItem, handleAutomaticApprovalToggle)}</div>
              <div className="space-y-1 rounded-lg bg-white/80 p-3 text-[11px] leading-relaxed text-indigo-900 dark:bg-gray-900/40 dark:text-indigo-100">
                <p>{t('settings.approvalRulesAutoInfo')}</p>
                <p>{t('settings.approvalRulesManualInfo')}</p>
                <p className="font-semibold">{t('settings.approvalRulesSafety')}</p>
              </div>
            </div>
            <div className="space-y-3">{otherToggleItems.map((item) => renderToggle(item))}</div>
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
