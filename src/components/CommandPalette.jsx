import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Download,
  LayoutDashboard,
  MessageSquarePlus,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewDeal,
  onNewUpdate,
  onChangeCurrency,
  onExportCsv,
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  if (!open) return null;

  const actions = [
    {
      id: 'new-deal',
      label: 'Log New Closed Deal',
      group: 'Quick Actions',
      icon: Plus,
      run: () => onNewDeal(),
    },
    {
      id: 'new-update',
      label: 'Post Business Progress Update',
      group: 'Quick Actions',
      icon: MessageSquarePlus,
      run: () => onNewUpdate(),
    },
    {
      id: 'export-csv',
      label: 'Export Deals Ledger to CSV',
      group: 'Quick Actions',
      icon: Download,
      run: () => onExportCsv(),
    },
    {
      id: 'nav-overview',
      label: 'Go to Executive Overview',
      group: 'Navigation',
      icon: LayoutDashboard,
      run: () => onNavigate('overview'),
    },
    {
      id: 'nav-deals',
      label: 'Go to Deals Ledger',
      group: 'Navigation',
      icon: Briefcase,
      run: () => onNavigate('deals'),
    },
    {
      id: 'nav-updates',
      label: 'Go to Progress & Updates',
      group: 'Navigation',
      icon: MessageSquarePlus,
      run: () => onNavigate('updates'),
    },
    {
      id: 'nav-clients',
      label: 'Go to Client Directory',
      group: 'Navigation',
      icon: Users,
      run: () => onNavigate('clients'),
    },
    {
      id: 'nav-settings',
      label: 'Go to Partner Settings',
      group: 'Navigation',
      icon: Settings,
      run: () => onNavigate('settings'),
    },
    ...['USD', 'EUR', 'GBP', 'INR'].map((c) => ({
      id: `curr-${c}`,
      label: `Switch Display Currency to ${c}`,
      group: 'Currency',
      icon: Briefcase,
      run: () => onChangeCurrency(c),
    })),
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="obsidian-card w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to..."
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono-num text-zinc-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No matching commands.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs text-zinc-200 hover:bg-[#D4AF37]/10 hover:text-[#F3E5AB] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-zinc-400" />
                    {item.label}
                  </span>
                  <span className="text-[10px] text-zinc-500">{item.group}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
