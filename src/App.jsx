import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Check,
  Command,
  Copy,
  Download,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import {
  apiFetch,
  convertValue,
  CURRENCY_META,
  formatMoney,
} from './lib/api';
import LoginScreen from './components/LoginScreen';
import RevenueChart from './components/RevenueChart';
import DealModal from './components/DealModal';
import UpdateModal from './components/UpdateModal';
import CommandPalette from './components/CommandPalette';

const STATUS_BADGE = {
  'Closed Won':
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'In Negotiation':
    'border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#F3E5AB]',
  Proposal: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  Churned: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

const CATEGORY_BADGE = {
  milestone: 'border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#F3E5AB]',
  progress: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  strategy: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  blocker: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [founders, setFounders] = useState([]);
  const [fxRates, setFxRates] = useState({
    USD: 1,
    EUR: 1.08,
    GBP: 1.27,
    INR: 0.0119,
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  const [deals, setDeals] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Filters for personal Deals Ledger
  const [dealSearch, setDealSearch] = useState('');
  const [dealStatusFilter, setDealStatusFilter] = useState('ALL');
  const [dealCurrFilter, setDealCurrFilter] = useState('ALL');
  const [updateCatFilter, setUpdateCatFilter] = useState('ALL');

  // Modals
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Copy feedback
  const [copiedEmail, setCopiedEmail] = useState('');

  // Settings forms
  const [fxDraft, setFxDraft] = useState({});
  const [fxStatus, setFxStatus] = useState('');
  const [pwForm, setPwForm] = useState({ current: '', next: '' });
  const [pwStatus, setPwStatus] = useState({ type: '', msg: '' });

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data.user);
      setFounders(data.partners || []);
      if (data.fxRates) {
        setFxRates(data.fxRates);
        setFxDraft(data.fxRates);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loadPortalData = useCallback(async () => {
    if (!user) return;
    try {
      const [dealsRes, updatesRes, analyticsRes] = await Promise.all([
        apiFetch('/api/deals'),
        apiFetch('/api/updates'),
        apiFetch(`/api/analytics?currency=${displayCurrency}`),
      ]);
      setDeals(dealsRes.deals || []);
      setUpdates(updatesRes.updates || []);
      setAnalytics(analyticsRes);
      if (analyticsRes?.fxRates) {
        setFxRates(analyticsRes.fxRates);
      }
    } catch (err) {
      if (err.status === 401) setUser(null);
    }
  }, [user, displayCurrency]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user) loadPortalData();
  }, [user, loadPortalData]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCmdOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (dealStatusFilter !== 'ALL' && d.status !== dealStatusFilter) {
        return false;
      }
      if (dealCurrFilter !== 'ALL' && d.currency !== dealCurrFilter) {
        return false;
      }
      if (dealSearch.trim()) {
        const q = dealSearch.trim().toLowerCase();
        const hay = `${d.dealTitle} ${d.clientName} ${d.clientEmail} ${d.clientCompany}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deals, dealStatusFilter, dealCurrFilter, dealSearch]);

  const filteredUpdates = useMemo(() => {
    if (updateCatFilter === 'ALL') return updates;
    return updates.filter((u) => u.category === updateCatFilter);
  }, [updates, updateCatFilter]);

  function copyEmail(email) {
    navigator.clipboard?.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(''), 1600);
  }

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  async function togglePin(update) {
    await apiFetch(`/api/updates/${update.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !update.pinned }),
    });
    loadPortalData();
  }

  async function deleteUpdate(id) {
    await apiFetch(`/api/updates/${id}`, { method: 'DELETE' });
    loadPortalData();
  }

  async function saveFxRates(e) {
    e.preventDefault();
    setFxStatus('Saving...');
    try {
      const res = await apiFetch('/api/fx', {
        method: 'PATCH',
        body: JSON.stringify({ rates: fxDraft }),
      });
      setFxRates(res.fxRates);
      setFxStatus('FX rates updated.');
      loadPortalData();
      setTimeout(() => setFxStatus(''), 2500);
    } catch (err) {
      setFxStatus(err.message || 'Failed to update');
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwStatus({ type: '', msg: '' });
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwForm.current,
          newPassword: pwForm.next,
        }),
      });
      setPwForm({ current: '', next: '' });
      setPwStatus({ type: 'ok', msg: 'Passcode updated successfully.' });
    } catch (err) {
      setPwStatus({ type: 'err', msg: err.message || 'Update failed' });
    }
  }

  function exportCsv() {
    window.location.href = '/api/export/csv';
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="h-2.5 w-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
          Initializing Portal...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSuccess={loadSession} />;
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'deals', label: `${user.name}'s Ledger`, icon: Briefcase },
    { id: 'updates', label: 'Shared Updates', icon: MessageSquare },
    { id: 'clients', label: 'My Clients', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const combined = analytics?.combined || {
    closedRevenue: 0,
    pipelineValue: 0,
    closedCount: 0,
    pipelineCount: 0,
    avgDealSize: 0,
  };

  const friendBreakdown = analytics?.friendBreakdown || [];
  const myStats =
    friendBreakdown.find((f) => f.id === user.id) || {
      name: user.name,
      closedRevenue: 0,
      closedDeals: 0,
      pipelineValue: 0,
      pipelineDeals: 0,
      avgDealSize: 0,
    };
  const otherStats = friendBreakdown.find((f) => f.id !== user.id) || {
    name: user.username === 'ahmed' ? 'Afeef' : 'Ahmed',
    closedRevenue: 0,
    closedDeals: 0,
    pipelineValue: 0,
    pipelineDeals: 0,
    avgDealSize: 0,
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex">
      {/* Left Executive Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-white/8 bg-[#0B0B0E]">
        <div className="px-6 pt-6 pb-5 border-b border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F3DC8B] via-[#D4AF37] to-[#9A7414] text-zinc-950 font-bold text-xs tracking-tight shadow-md shadow-[#D4AF37]/15">
              AA
            </div>
            <div>
              <h1 className="font-serif-display text-xl leading-none text-white">
                Ahmed <span className="text-[#D4AF37]">&amp;</span> Afeef
              </h1>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Founder Portal
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37]/12 text-[#F3E5AB] border border-[#D4AF37]/25'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active ? 'text-[#D4AF37]' : 'text-zinc-500'
                  }`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/6">
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-zinc-950"
                style={{ backgroundColor: user.accentColor || '#D4AF37' }}
              >
                {user.avatarInitials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-white">
                  {user.name}
                </div>
                <div className="truncate text-[10px] text-zinc-500">
                  Separate Ledger
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Executive Bar */}
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#09090B]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-8 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex lg:hidden items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F3DC8B] to-[#D4AF37] text-zinc-950 font-bold text-xs">
                  AA
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {navItems.find((n) => n.id === activeTab)?.label}
                </h2>
                <p className="hidden sm:block text-[11px] text-zinc-500">
                  Signed in as {user.name} • Personal ledger &amp; combined progress
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className="hidden md:inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#121216] px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-zinc-200 cursor-pointer"
              >
                <Command className="h-3.5 w-3.5" />
                <span>Quick Actions</span>
                <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono-num text-zinc-500">
                  ⌘K
                </kbd>
              </button>

              <select
                aria-label="Display Currency"
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="rounded-xl border border-white/10 bg-[#121216] px-2.5 py-1.5 text-xs font-medium text-zinc-200 focus:border-[#D4AF37]/60 focus:outline-none cursor-pointer"
              >
                {Object.entries(CURRENCY_META).map(([code, m]) => (
                  <option key={code} value={code}>
                    {m.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setUpdateModalOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.07] cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5 text-[#D4AF37]" />
                Update
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingDeal(null);
                  setDealModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#E5C76B] to-[#D4AF37] px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-md shadow-[#D4AF37]/10 hover:brightness-105 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Log My Deal
              </button>
            </div>
          </div>

          <div className="flex lg:hidden overflow-x-auto border-t border-white/6 px-3 py-2 gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active
                      ? 'bg-[#D4AF37]/15 text-[#F3E5AB]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-8 py-6 sm:py-8 space-y-6">
          {/* ================= COMBINED OVERVIEW TAB ================= */}
          {activeTab === 'overview' && (
            <>
              {/* Top KPI Row: My Progress vs Friend's Progress & Head-to-Head */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="obsidian-card obsidian-card-hover rounded-2xl p-5 border-[#D4AF37]/20">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{myStats.name}&apos;s Closed ({displayCurrency})</span>
                    <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />
                  </div>
                  <div className="mt-3 font-mono-num text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                    {formatMoney(myStats.closedRevenue, displayCurrency)}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-400">
                    {myStats.closedDeals} closed
                    {myStats.closedCommissions > 0
                      ? ` • incl. +${formatMoney(myStats.closedCommissions, displayCurrency, true)} comm`
                      : ` • ${formatMoney(myStats.pipelineValue, displayCurrency, true)} pipeline`}
                  </div>
                </div>

                <div className="obsidian-card obsidian-card-hover rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{otherStats.name}&apos;s Closed ({displayCurrency})</span>
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                  </div>
                  <div className="mt-3 font-mono-num text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                    {formatMoney(otherStats.closedRevenue, displayCurrency)}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-400">
                    {otherStats.closedDeals} closed
                    {otherStats.closedCommissions > 0
                      ? ` • incl. +${formatMoney(otherStats.closedCommissions, displayCurrency, true)} comm`
                      : ` • ${formatMoney(otherStats.pipelineValue, displayCurrency, true)} pipeline`}
                  </div>
                </div>

                <div className="obsidian-card obsidian-card-hover rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Head-to-Head Share</span>
                    <Users className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {friendBreakdown.map((f) => {
                      const pct =
                        combined.closedRevenue > 0
                          ? Math.round(
                              (f.closedRevenue / combined.closedRevenue) * 100
                            )
                          : 0;
                      return (
                        <div key={f.id}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-zinc-200">
                              {f.name}
                            </span>
                            <span className="font-mono-num text-zinc-400">
                              {pct}% ({f.closedDeals})
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/6 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: f.accent || '#D4AF37',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Combined Chart + Shared Updates */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="obsidian-card rounded-2xl p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Combined Monthly Progress
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Side-by-side closed revenue in {displayCurrency}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#D4AF37]" />
                        {founders[0]?.name || 'Ahmed'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
                        {founders[1]?.name || 'Afeef'}
                      </span>
                    </div>
                  </div>
                  <RevenueChart
                    series={analytics?.monthlySeries || []}
                    currency={displayCurrency}
                    founders={founders}
                  />
                </div>

                <div className="obsidian-card rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Combined Updates
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Updates from both you &amp; {otherStats.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('updates')}
                      className="text-xs text-[#E5C76B] hover:underline cursor-pointer"
                    >
                      View all
                    </button>
                  </div>

                  <div className="space-y-3 flex-1">
                    {updates.slice(0, 3).map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-white/8 bg-[#121217] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                              CATEGORY_BADGE[u.category] ||
                              CATEGORY_BADGE.progress
                            }`}
                          >
                            {u.category}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {u.authorName}
                            {u.pinned ? ' • Pinned' : ''}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-zinc-100 line-clamp-1">
                          {u.title}
                        </h4>
                        <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {u.body}
                        </p>
                      </div>
                    ))}
                    {updates.length === 0 && (
                      <div className="text-xs text-zinc-500 py-8 text-center">
                        No updates posted yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Recent Deals Preview */}
              <div className="obsidian-card rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {user.name}&apos;s Recent Deals
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Only deals from your personal ledger appear here
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('deals')}
                    className="text-xs font-medium text-[#E5C76B] hover:underline cursor-pointer"
                  >
                    Open my ledger →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/6 bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Deal / Client</th>
                        <th className="px-4 py-3 font-medium">Value</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-6 py-3 font-medium text-right">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {deals.slice(0, 5).map((d) => {
                        const commPct = Number(d.commissionPercent) || 0;
                        const totalVal =
                          d.totalValue ?? Number(d.value) * (1 + commPct / 100);
                        const normalized = convertValue(
                          totalVal,
                          d.currency,
                          displayCurrency,
                          fxRates
                        );
                        return (
                          <tr
                            key={d.id}
                            onClick={() => {
                              setEditingDeal(d);
                              setDealModalOpen(true);
                            }}
                            className="hover:bg-white/[0.03] transition cursor-pointer"
                          >
                            <td className="px-6 py-3.5">
                              <div className="font-medium text-white">
                                {d.dealTitle}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {d.clientName}
                                {d.clientCompany ? ` • ${d.clientCompany}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono-num">
                              <div className="text-white font-medium">
                                {formatMoney(totalVal, d.currency)}
                              </div>
                              {commPct > 0 && (
                                <div className="text-[10px] text-[#E5C76B]">
                                  {formatMoney(d.value, d.currency)} + {commPct}% comm
                                </div>
                              )}
                              {d.currency !== displayCurrency && (
                                <div className="text-[10px] text-zinc-500">
                                  ≈ {formatMoney(normalized, displayCurrency)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 font-mono-num text-zinc-400">
                              {d.closedDate}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                                  STATUS_BADGE[d.status] || ''
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {deals.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 py-10 text-center text-xs text-zinc-500"
                          >
                            Your ledger is empty. Click &ldquo;Log My Deal&rdquo;
                            to add your first deal.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ================= PERSONAL DEALS LEDGER TAB ================= */}
          {activeTab === 'deals' && (
            <div className="space-y-4">
              <div className="obsidian-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[240px]">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      value={dealSearch}
                      onChange={(e) => setDealSearch(e.target.value)}
                      placeholder="Search your deals, client name, email..."
                      className="w-full rounded-xl border border-white/10 bg-[#121216] pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-[#D4AF37]/60 focus:outline-none"
                    />
                  </div>

                  <select
                    value={dealStatusFilter}
                    onChange={(e) => setDealStatusFilter(e.target.value)}
                    className="rounded-xl border border-white/10 bg-[#121216] px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Closed Won">Closed Won</option>
                    <option value="In Negotiation">In Negotiation</option>
                    <option value="Proposal">Proposal</option>
                    <option value="Churned">Churned</option>
                  </select>

                  <select
                    value={dealCurrFilter}
                    onChange={(e) => setDealCurrFilter(e.target.value)}
                    className="rounded-xl border border-white/10 bg-[#121216] px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="ALL">All Currencies</option>
                    {Object.keys(CURRENCY_META).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.07] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-[#D4AF37]" />
                  Export My CSV
                </button>
              </div>

              <div className="obsidian-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-6 py-3.5 font-medium">Deal</th>
                        <th className="px-4 py-3.5 font-medium">
                          Client &amp; Email
                        </th>
                        <th className="px-4 py-3.5 font-medium">Value</th>
                        <th className="px-4 py-3.5 font-medium">Date</th>
                        <th className="px-6 py-3.5 font-medium text-right">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {filteredDeals.map((d) => {
                        const commPct = Number(d.commissionPercent) || 0;
                        const totalVal =
                          d.totalValue ?? Number(d.value) * (1 + commPct / 100);
                        const normalized = convertValue(
                          totalVal,
                          d.currency,
                          displayCurrency,
                          fxRates
                        );
                        return (
                          <tr
                            key={d.id}
                            onClick={() => {
                              setEditingDeal(d);
                              setDealModalOpen(true);
                            }}
                            className="hover:bg-white/[0.03] transition cursor-pointer"
                          >
                            <td className="px-6 py-4">
                              <div className="font-semibold text-white">
                                {d.dealTitle}
                              </div>
                              {d.tags?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {d.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="font-medium text-zinc-200">
                                {d.clientName}
                                {d.clientCompany ? (
                                  <span className="text-zinc-500">
                                    {' '}
                                    • {d.clientCompany}
                                  </span>
                                ) : null}
                              </div>
                              {d.clientEmail && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                                  <span>{d.clientEmail}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyEmail(d.clientEmail);
                                    }}
                                    title="Copy email"
                                    className="rounded p-0.5 text-zinc-500 hover:text-[#D4AF37]"
                                  >
                                    {copiedEmail === d.clientEmail ? (
                                      <Check className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 font-mono-num">
                              <div className="text-white font-semibold">
                                {formatMoney(totalVal, d.currency)}
                              </div>
                              {commPct > 0 && (
                                <div className="text-[10px] text-[#E5C76B]">
                                  {formatMoney(d.value, d.currency)} + {commPct}% comm
                                </div>
                              )}
                              {d.currency !== displayCurrency && (
                                <div className="text-[10px] text-zinc-500">
                                  ≈ {formatMoney(normalized, displayCurrency)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 font-mono-num text-zinc-400">
                              {d.closedDate}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                                  STATUS_BADGE[d.status] || ''
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredDeals.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-xs text-zinc-500"
                          >
                            No deals in your ledger yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= SHARED UPDATES TAB ================= */}
          {activeTab === 'updates' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'ALL', label: 'All Updates' },
                    { id: 'milestone', label: 'Milestones' },
                    { id: 'progress', label: 'Progress' },
                    { id: 'strategy', label: 'Strategy' },
                    { id: 'blocker', label: 'Blockers' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setUpdateCatFilter(c.id)}
                      className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                        updateCatFilter === c.id
                          ? 'border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#F3E5AB]'
                          : 'border-white/10 bg-[#121216] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#E5C76B] to-[#D4AF37] px-4 py-2 text-xs font-semibold text-zinc-950 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Post Update
                </button>
              </div>

              {filteredUpdates.length === 0 ? (
                <div className="obsidian-card rounded-2xl p-12 text-center text-xs text-zinc-500">
                  No updates posted yet. Share a progress update or milestone so{' '}
                  {otherStats.name} can see what you&apos;re working on.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredUpdates.map((u) => (
                    <div
                      key={u.id}
                      className={`obsidian-card rounded-2xl p-5 flex flex-col justify-between ${
                        u.pinned ? 'border-[#D4AF37]/35' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize ${
                                CATEGORY_BADGE[u.category] ||
                                CATEGORY_BADGE.progress
                              }`}
                            >
                              {u.category}
                            </span>
                            {u.pinned && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#E5C76B]">
                                <Pin className="h-3 w-3" /> Pinned
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => togglePin(u)}
                              title={u.pinned ? 'Unpin' : 'Pin to top'}
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-[#D4AF37] cursor-pointer"
                            >
                              <Pin className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteUpdate(u.id)}
                              title="Delete update"
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-base font-semibold text-white">
                          {u.title}
                        </h3>
                        <p className="mt-2 text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                          {u.body}
                        </p>
                      </div>

                      <div className="mt-5 pt-3 border-t border-white/6 flex items-center justify-between text-[11px] text-zinc-500">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold text-zinc-950"
                            style={{
                              backgroundColor: u.authorAccent || '#D4AF37',
                            }}
                          >
                            {u.authorInitials}
                          </span>
                          <span className="text-zinc-300 font-medium">
                            {u.authorName}
                          </span>
                        </div>
                        <span className="font-mono-num">
                          {String(u.createdAt || '').slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= MY CLIENTS DIRECTORY TAB ================= */}
          {activeTab === 'clients' && (
            <div className="obsidian-card rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {user.name}&apos;s Client Directory
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Aggregated from your personal deals ledger ({displayCurrency})
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/8 bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-6 py-3.5 font-medium">Client</th>
                      <th className="px-4 py-3.5 font-medium">Email</th>
                      <th className="px-4 py-3.5 font-medium">Company</th>
                      <th className="px-4 py-3.5 font-medium">Closed LTV</th>
                      <th className="px-4 py-3.5 font-medium">Deals</th>
                      <th className="px-6 py-3.5 font-medium text-right">
                        Last Activity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {(analytics?.clients || []).map((c, idx) => (
                      <tr
                        key={`${c.clientEmail || c.clientName}-${idx}`}
                        className="hover:bg-white/[0.02] transition"
                      >
                        <td className="px-6 py-3.5 font-medium text-white">
                          {c.clientName}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-300">
                          {c.clientEmail ? (
                            <div className="flex items-center gap-1.5">
                              <span>{c.clientEmail}</span>
                              <button
                                type="button"
                                onClick={() => copyEmail(c.clientEmail)}
                                className="rounded p-0.5 text-zinc-500 hover:text-[#D4AF37] cursor-pointer"
                              >
                                {copiedEmail === c.clientEmail ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-zinc-400">
                          {c.clientCompany || '—'}
                        </td>
                        <td className="px-4 py-3.5 font-mono-num font-semibold text-[#E5C76B]">
                          {formatMoney(c.totalValue, displayCurrency)}
                        </td>
                        <td className="px-4 py-3.5 font-mono-num text-zinc-300">
                          {c.dealCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono-num text-zinc-400">
                          {c.lastDate}
                        </td>
                      </tr>
                    ))}
                    {(analytics?.clients || []).length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-xs text-zinc-500"
                        >
                          No clients yet. They appear automatically when you log deals.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= SETTINGS TAB ================= */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="obsidian-card rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white">
                  Multi-Currency Exchange Rates
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Conversion rate to 1 USD used for normalized totals.
                </p>

                <form onSubmit={saveFxRates} className="mt-5 space-y-4">
                  {['EUR', 'GBP', 'INR'].map((curr) => (
                    <div
                      key={curr}
                      className="flex items-center justify-between gap-4"
                    >
                      <label className="text-xs font-medium text-zinc-300">
                        1 {curr} in USD
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={fxDraft[curr] ?? fxRates[curr] ?? ''}
                        onChange={(e) =>
                          setFxDraft({
                            ...fxDraft,
                            [curr]: Number(e.target.value),
                          })
                        }
                        className="font-mono-num w-36 rounded-xl border border-white/10 bg-[#14141A] px-3 py-2 text-xs text-white focus:border-[#D4AF37]/60 focus:outline-none"
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-emerald-400">{fxStatus}</span>
                    <button
                      type="submit"
                      className="rounded-xl bg-gradient-to-r from-[#E5C76B] to-[#D4AF37] px-4 py-2 text-xs font-semibold text-zinc-950 cursor-pointer"
                    >
                      Update FX Rates
                    </button>
                  </div>
                </form>
              </div>

              <div className="obsidian-card rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white">
                  Account Security ({user.name})
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Update your personal portal passcode.
                </p>

                <form onSubmit={changePassword} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Current Passcode
                    </label>
                    <input
                      type="password"
                      required
                      value={pwForm.current}
                      onChange={(e) =>
                        setPwForm({ ...pwForm, current: e.target.value })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2 text-xs text-white focus:border-[#D4AF37]/60 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      New Passcode (min 6 characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={pwForm.next}
                      onChange={(e) =>
                        setPwForm({ ...pwForm, next: e.target.value })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#14141A] px-3.5 py-2 text-xs text-white focus:border-[#D4AF37]/60 focus:outline-none"
                    />
                  </div>

                  {pwStatus.msg && (
                    <div
                      className={`text-xs ${
                        pwStatus.type === 'ok'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {pwStatus.msg}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-4 py-2 text-xs font-semibold text-[#F3E5AB] hover:bg-[#D4AF37]/25 cursor-pointer"
                    >
                      Save Passcode
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <DealModal
        open={dealModalOpen}
        deal={editingDeal}
        currentUser={user}
        onClose={() => setDealModalOpen(false)}
        onSaved={loadPortalData}
      />

      <UpdateModal
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        onSaved={loadPortalData}
      />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onNewDeal={() => {
          setEditingDeal(null);
          setDealModalOpen(true);
        }}
        onNewUpdate={() => setUpdateModalOpen(true)}
        onChangeCurrency={(c) => setDisplayCurrency(c)}
        onExportCsv={exportCsv}
      />
    </div>
  );
}
