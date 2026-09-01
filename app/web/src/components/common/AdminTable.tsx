import React, { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../i18n';

export const TABLE_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;
export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];

interface AdminTableProps {
  children: ReactNode;
  minWidthClass?: string;
  className?: string;
  footer?: ReactNode;
  embedded?: boolean;
}

export const AdminTable: React.FC<AdminTableProps> = ({ children, minWidthClass = 'min-w-[960px]', className = '', footer, embedded = false }) => {
  const table = <table className={`${minWidthClass} w-full table-fixed text-left text-xs ${className}`}>{children}</table>;
  if (embedded) return <div className="overflow-x-auto">{table}</div>;
  return <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto">{table}</div>{footer}</div>;
};

interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: TablePageSize) => void;
  disabled?: boolean;
}

function pageNumbers(page: number, totalPages: number): Array<number | 'ellipsis-start' | 'ellipsis-end'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1];
  if (page > 3) pages.push('ellipsis-start');
  for (let value = Math.max(2, page - 1); value <= Math.min(totalPages - 1, page + 1); value += 1) pages.push(value);
  if (page < totalPages - 2) pages.push('ellipsis-end');
  pages.push(totalPages);
  return pages;
}

export const TablePagination: React.FC<TablePaginationProps> = ({ page, pageSize, total, onPageChange, onPageSizeChange, disabled = false }) => {
  const { t } = useTranslation();
  const totalPages = Math.ceil(total / pageSize);
  const currentPage = totalPages ? Math.min(Math.max(page, 1), totalPages) : 1;
  const firstItem = total ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="table-page-size" className="whitespace-nowrap">{t('table.show')}</label>
        <select
          id="table-page-size"
          value={pageSize}
          disabled={disabled}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as TablePageSize)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-medium text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {TABLE_PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span>{t('table.perPage')}</span>
        <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">{firstItem}-{lastItem} {t('table.of')} {total}</span>
      </div>

      <nav aria-label={t('table.navigation')} className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-label={t('table.previous')}
          disabled={disabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title={t('table.previous')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageNumbers(currentPage, totalPages).map((value) => value === 'ellipsis-start' || value === 'ellipsis-end' ? (
          <span key={value} className="px-1.5 text-gray-400">…</span>
        ) : (
          <button
            key={value}
            type="button"
            aria-label={`${t('table.openPage')} ${value}`}
            aria-current={value === currentPage ? 'page' : undefined}
            disabled={disabled}
            onClick={() => onPageChange(value)}
            className={`min-w-8 rounded-lg border px-2 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${value === currentPage ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('table.next')}
          disabled={disabled || !totalPages || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title={t('table.next')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </nav>
    </div>
  );
};
