import React from 'react';
import { Languages } from 'lucide-react';
import { Language, useTranslation } from '../../i18n';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage, t } = useTranslation();
  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      title={t('language.switch')}
    >
      <Languages className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
      {!compact && <span className="hidden sm:inline">{t('language.switch')}</span>}
      <select
        aria-label={t('language.switch')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        className="cursor-pointer bg-transparent outline-none"
      >
        <option value="id">ID</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
};
