import React, { useState } from 'react';
import { Pin, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const CATEGORIES = [
  { id: 'progress', label: 'Progress' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'blocker', label: 'Blocker' },
];

export default function UpdateModal({ open, onClose, onSaved }) {
  const [category, setCategory] = useState('progress');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/api/updates', {
        method: 'POST',
        body: JSON.stringify({ category, title, body, pinned }),
      });
      setTitle('');
      setBody('');
      setPinned(false);
      setCategory('progress');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to post update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="obsidian-card w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/8 pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#D4AF37]">
              Shared Feed
            </p>
            <h2 className="mt-1 font-serif-display text-2xl text-white">
              Post Business Update
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              Category
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`rounded-xl border py-2 text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#F3E5AB]'
                        : 'border-white/10 bg-[#14141A] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Headline *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Closed Q4 retainer with Vantage Labs"
              className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Details &amp; Next Steps *
            </label>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share key metrics, client feedback, or action items for your partner..."
              className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#14141A] accent-[#D4AF37]"
            />
            <Pin className="h-3.5 w-3.5 text-[#D4AF37]" />
            Pin this update to the top of the portal
          </label>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/8">
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
              className="rounded-xl bg-gradient-to-r from-[#E5C76B] to-[#D4AF37] px-5 py-2 text-xs font-semibold text-zinc-950 hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Posting...' : 'Publish Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
