import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { apiFetch, CURRENCY_META, formatMoney } from '../lib/api';

const STATUSES = ['Closed Won', 'In Negotiation', 'Proposal', 'Churned'];

export default function DealModal({
  open,
  deal,
  currentUser,
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(deal?.id);
  const [form, setForm] = useState({
    dealTitle: '',
    clientName: '',
    clientEmail: '',
    clientCompany: '',
    value: '',
    commissionPercent: '0',
    currency: 'USD',
    closedDate: new Date().toISOString().slice(0, 10),
    status: 'Closed Won',
    tagsText: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(false);
    if (deal) {
      setForm({
        dealTitle: deal.dealTitle || '',
        clientName: deal.clientName || '',
        clientEmail: deal.clientEmail || '',
        clientCompany: deal.clientCompany || '',
        value: String(deal.value ?? ''),
        commissionPercent: String(deal.commissionPercent ?? 0),
        currency: deal.currency || 'USD',
        closedDate: deal.closedDate || new Date().toISOString().slice(0, 10),
        status: deal.status || 'Closed Won',
        tagsText: Array.isArray(deal.tags) ? deal.tags.join(', ') : '',
        notes: deal.notes || '',
      });
    } else {
      setForm({
        dealTitle: '',
        clientName: '',
        clientEmail: '',
        clientCompany: '',
        value: '',
        commissionPercent: '0',
        currency: 'USD',
        closedDate: new Date().toISOString().slice(0, 10),
        status: 'Closed Won',
        tagsText: '',
        notes: '',
      });
    }
  }, [open, deal]);

  if (!open) return null;

  const numericValue = Number(form.value) || 0;
  const numericCommPct = Math.min(100, Math.max(0, Number(form.commissionPercent) || 0));
  const commissionAmount = numericValue * (numericCommPct / 100);
  const totalWithCommission = numericValue + commissionAmount;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        dealTitle: form.dealTitle,
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        clientCompany: form.clientCompany,
        value: Number(form.value),
        commissionPercent: numericCommPct,
        currency: form.currency,
        closedDate: form.closedDate,
        status: form.status,
        tags: form.tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes,
      };

      if (isEditing) {
        await apiFetch(`/api/deals/${deal.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/deals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save deal');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/deals/${deal.id}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete deal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0D0D11] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/8 pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#D4AF37]">
              {currentUser?.name}&apos;s Ledger •{' '}
              {isEditing ? 'Edit Deal' : 'New Entry'}
            </p>
            <h2 className="mt-1 font-serif-display text-2xl text-white">
              {isEditing ? deal.dealTitle : 'Log Deal'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Deal / Engagement Title *
            </label>
            <input
              type="text"
              required
              value={form.dealTitle}
              onChange={(e) => setForm({ ...form, dealTitle: e.target.value })}
              placeholder="e.g. SaaS Retainer / Custom Build"
              className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Client Name *
              </label>
              <input
                type="text"
                required
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="Client full name"
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Client Email
              </label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                placeholder="client@company.com (optional)"
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Company
              </label>
              <input
                type="text"
                value={form.clientCompany}
                onChange={(e) =>
                  setForm({ ...form, clientCompany: e.target.value })
                }
                placeholder="Company name"
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3 py-2.5 text-sm text-white focus:border-[#D4AF37]/60 focus:outline-none"
              >
                {Object.entries(CURRENCY_META).map(([code, meta]) => (
                  <option key={code} value={code}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Deal Value *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="5000"
                className="font-mono-num w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Commission %
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={form.commissionPercent}
                onChange={(e) =>
                  setForm({ ...form, commissionPercent: e.target.value })
                }
                placeholder="0"
                className="font-mono-num w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>
          </div>

          {numericValue > 0 && (
            <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/6 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-zinc-400">
                Commission (+{numericCommPct}%):{' '}
                <span className="font-mono-num text-[#E5C76B]">
                  +{formatMoney(commissionAmount, form.currency)}
                </span>
              </span>
              <span className="font-medium text-zinc-200">
                Total Closed:{' '}
                <span className="font-mono-num font-semibold text-white">
                  {formatMoney(totalWithCommission, form.currency)}
                </span>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Closed / Target Date *
              </label>
              <input
                type="date"
                required
                value={form.closedDate}
                onChange={(e) => setForm({ ...form, closedDate: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3 py-2.5 text-sm text-white focus:border-[#D4AF37]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3 py-2.5 text-sm text-white focus:border-[#D4AF37]/60 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={form.tagsText}
              onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
              placeholder="Retainer, SaaS, Advisory"
              className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Scope, deliverables, payment terms..."
              className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-white/8">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition cursor-pointer ${
                  confirmDelete
                    ? 'border-red-500 bg-red-500/20 text-red-200'
                    : 'border-white/10 text-zinc-400 hover:border-red-500/40 hover:text-red-300'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-[#E5C76B] to-[#D4AF37] px-5 py-2 text-xs font-semibold text-zinc-950 shadow-lg shadow-[#D4AF37]/10 hover:brightness-105 disabled:opacity-50 cursor-pointer"
              >
                {saving
                  ? 'Saving...'
                  : isEditing
                    ? 'Save Changes'
                    : 'Record Deal'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
