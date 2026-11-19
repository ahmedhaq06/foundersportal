import React, { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, User } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function LoginScreen({ onSuccess }) {
  const [identifier, setIdentifier] = useState('ahmed');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      await onSuccess();
    } catch (err) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#09090B] px-4 overflow-hidden">
      {/* Ambient executive radial glow */}
      <div
        className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 h-[480px] w-[760px] rounded-full opacity-20 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(212,175,55,0.45) 0%, rgba(212,175,55,0.05) 55%, transparent 75%)',
        }}
      />

      {/* Subtle architectural grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#E5C76B] mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Private Founder Portal
          </div>
          <h1 className="font-serif-display text-4xl sm:text-5xl tracking-tight text-white">
            Ahmed <span className="gold-gradient-text italic">&amp;</span> Afeef
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Personal deal ledgers, combined progress &amp; shared updates.
          </p>
        </div>

        <div className="obsidian-card rounded-2xl p-6 sm:p-8">
          <div className="mb-5">
            <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 mb-2">
              Quick Account Select
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'ahmed', label: 'Ahmed', initials: 'AH', role: 'Founder' },
                { id: 'afeef', label: 'Afeef', initials: 'AF', role: 'Founder' },
              ].map((p) => {
                const active = identifier.toLowerCase() === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIdentifier(p.id)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-white'
                        : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${
                        active
                          ? 'bg-[#D4AF37] text-zinc-950'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {p.initials}
                    </span>
                    <div>
                      <div className="text-xs font-medium leading-tight">
                        {p.label}
                      </div>
                      <div className="text-[10px] text-zinc-500">{p.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ahmed or ahmed@ahmedafeef.co"
                  required
                  className="w-full rounded-xl border border-white/10 bg-[#0B0B0E] pl-9 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Passcode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your passcode"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-[#0B0B0E] pl-9 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D4AF37]/60 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E5C76B] via-[#D4AF37] to-[#B89225] px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-[#D4AF37]/10 transition hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Enter Portal'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/6 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Initial passcode:</span>
            <code className="font-mono-num rounded bg-white/5 px-2 py-0.5 text-zinc-300 border border-white/8">
              portal2026
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
