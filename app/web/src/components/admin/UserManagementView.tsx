import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, Plus, RefreshCw, Search, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';
import { AdminManagedUser, api } from '../../lib/apiClient';
import { confirmAction, showActionError, showActionSuccess } from '../../lib/swal';

type UserForm = { name: string; email: string; password: string; role: string; department: string };
const emptyForm: UserForm = { name: '', email: '', password: '', role: 'VIEWER', department: '' };

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-950';

export const UserManagementView: React.FC = () => {
  const { currentAdmin } = useApp();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const roleLabel = useMemo(() => (role: string) => t(`users.role.${role}`), [t]);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers((await api.users(search.trim())).items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('users.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search]);

  if (currentAdmin?.role !== 'SUPER_ADMIN') {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h1 className="text-base font-semibold">{t('users.title')}</h1>
            <p className="mt-1 text-sm">{t('users.superAdminOnly')}</p>
          </div>
        </div>
      </section>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };
  const openEdit = (user: AdminManagedUser) => {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role, department: user.department ?? '' });
    setFormOpen(true);
  };
  const closeForm = () => {
    if (!saving) setFormOpen(false);
  };
  const updateForm = (field: keyof UserForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || (!editing && !form.email.trim()) || (!editing && form.password.length < 8)) return;
    setSaving(true);
    try {
      if (editing) {
        await api.updateUser(editing.id, {
          name: form.name.trim(),
          role: form.role,
          department: form.department.trim() || null,
        });
        if (form.password) {
          if (form.password.length < 8) throw new Error(t('users.passwordMin'));
          await api.resetUserPassword(editing.id, form.password);
        }
        await showActionSuccess(t('crud.updated'), t('users.updated'));
      } else {
        await api.createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          department: form.department.trim() || undefined,
        });
        await showActionSuccess(t('crud.saved'), t('users.created'));
      }
      setFormOpen(false);
      await load();
    } catch (cause) {
      await showActionError(t('crud.error'), cause instanceof Error ? cause.message : t('users.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: AdminManagedUser) => {
    const disabling = !user.disabledAt;
    if (disabling) {
      const confirmed = await confirmAction({
        title: t('users.disableQuestion'),
        text: t('users.disableText'),
        confirmButtonText: t('users.disable'),
        cancelButtonText: t('crud.cancel'),
      });
      if (!confirmed) return;
    }
    try {
      if (disabling) await api.disableUser(user.id);
      else await api.enableUser(user.id);
      await showActionSuccess(t('crud.success'), disabling ? t('users.disabled') : t('users.enabled'));
      await load();
    } catch (cause) {
      await showActionError(t('crud.error'), cause instanceof Error ? cause.message : t('users.saveError'));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">{t('users.title')}</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('users.description')}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
          {t('users.add')}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('users.search')}
            className={`${inputClass} mt-0 pl-9`}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('users.refresh')}
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('users.loading')}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">{t('users.user')}</th>
                  <th className="px-4 py-3">{t('users.role')}</th>
                  <th className="px-4 py-3">{t('users.department')}</th>
                  <th className="px-4 py-3">{t('users.status')}</th>
                  <th className="px-4 py-3 text-right">{t('table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{user.name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.department || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${user.disabledAt ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}
                      >
                        {user.disabledAt ? <UserX className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {user.disabledAt ? t('users.inactive') : t('users.active')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t('users.edit')}
                        </button>
                        {user.id !== currentAdmin.id && (
                          <button
                            type="button"
                            onClick={() => void toggleStatus(user)}
                            className={`rounded-lg px-2.5 py-1.5 font-semibold ${user.disabledAt ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30' : 'text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30'}`}
                          >
                            {user.disabledAt ? t('users.enable') : t('users.disable')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-sm text-slate-500">
                      {t('users.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {editing ? t('users.editTitle') : t('users.addTitle')}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {editing ? t('users.editHelp') : t('users.addHelp')}
                </p>
              </div>
              <KeyRound className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('users.name')}
                <input
                  required
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('users.email')}
                <input
                  required={!editing}
                  disabled={Boolean(editing)}
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm('email', event.target.value)}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {editing ? t('users.newPassword') : t('users.password')}
                <input
                  required={!editing}
                  minLength={8}
                  type="password"
                  value={form.password}
                  onChange={(event) => updateForm('password', event.target.value)}
                  placeholder={editing ? t('users.passwordOptional') : ''}
                  className={inputClass}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('users.role')}
                  <select
                    value={form.role}
                    onChange={(event) => updateForm('role', event.target.value)}
                    className={inputClass}
                  >
                    <option value="SUPER_ADMIN">{roleLabel('SUPER_ADMIN')}</option>
                    <option value="ADMIN">{roleLabel('ADMIN')}</option>
                    <option value="REVIEWER">{roleLabel('REVIEWER')}</option>
                    <option value="VIEWER">{roleLabel('VIEWER')}</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t('users.department')}
                  <input
                    value={form.department}
                    onChange={(event) => updateForm('department', event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('crud.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {editing ? t('users.save') : t('users.create')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
