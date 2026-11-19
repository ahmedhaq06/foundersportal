import React, { useState } from 'react';
import { formatMoney } from '../lib/api';

function formatMonthLabel(ym) {
  if (!ym || !ym.includes('-')) return ym;
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function RevenueChart({
  series = [],
  currency = 'USD',
  founders = [],
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!series.length) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-zinc-500 text-center px-6">
        No closed deals logged yet. Once you or Afeef log deals, your combined monthly progress will appear here.
      </div>
    );
  }

  const keys =
    founders.length >= 2
      ? [founders[0].username, founders[1].username]
      : ['ahmed', 'afeef'];

  const maxVal = Math.max(
    ...series.map((d) =>
      Math.max(
        d.byUser?.[keys[0]]?.closed || 0,
        d.byUser?.[keys[1]]?.closed || 0,
        1
      )
    ),
    1
  );

  const width = 680;
  const height = 220;
  const padLeft = 64;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const slotW = plotW / series.length;
  const barW = Math.min(22, Math.max(10, slotW * 0.28));
  const gap = 4;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Combined monthly closed revenue comparison chart"
      >
        <defs>
          <linearGradient id="ahmedBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F3DC8B" />
            <stop offset="100%" stopColor="#B89020" />
          </linearGradient>
          <linearGradient id="afeefBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {ticks.map((t) => {
          const y = padTop + plotH * (1 - t);
          const val = maxVal * t;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray={t === 0 ? undefined : '3 4'}
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-500 text-[10px] font-mono-num"
              >
                {formatMoney(val, currency, true)}
              </text>
            </g>
          );
        })}

        {/* Grouped Bars (Ahmed vs Afeef) */}
        {series.map((d, idx) => {
          const cx = padLeft + slotW * idx + slotW / 2;
          const v1 = d.byUser?.[keys[0]]?.closed || 0;
          const v2 = d.byUser?.[keys[1]]?.closed || 0;

          const h1 = (v1 / maxVal) * plotH;
          const h2 = (v2 / maxVal) * plotH;

          const y1 = padTop + plotH - h1;
          const y2 = padTop + plotH - h2;
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={d.month}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {isHovered && (
                <rect
                  x={cx - slotW * 0.44}
                  y={padTop}
                  width={slotW * 0.88}
                  height={plotH}
                  rx={8}
                  fill="rgba(255,255,255,0.03)"
                />
              )}

              {/* Founder 1 (Ahmed) */}
              {h1 > 0 && (
                <rect
                  x={cx - barW - gap / 2}
                  y={y1}
                  width={barW}
                  height={Math.max(3, h1)}
                  rx={4}
                  fill="url(#ahmedBarGrad)"
                  opacity={isHovered ? 1 : 0.9}
                />
              )}

              {/* Founder 2 (Afeef) */}
              {h2 > 0 && (
                <rect
                  x={cx + gap / 2}
                  y={y2}
                  width={barW}
                  height={Math.max(3, h2)}
                  rx={4}
                  fill="url(#afeefBarGrad)"
                  opacity={isHovered ? 1 : 0.9}
                />
              )}

              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className={`text-[10.5px] font-medium transition-colors ${
                  isHovered ? 'fill-[#E5C76B]' : 'fill-zinc-500'
                }`}
              >
                {formatMonthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && series[hoveredIdx] && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#121216] px-3.5 py-2 text-xs">
          <div className="font-medium text-zinc-200">
            {formatMonthLabel(series[hoveredIdx].month)}
            <span className="ml-2 text-zinc-500 font-mono-num">
              Combined: {formatMoney(series[hoveredIdx].totalClosed, currency)}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono-num">
            <span className="flex items-center gap-1.5 text-[#E5C76B]">
              <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />
              {series[hoveredIdx].byUser?.[keys[0]]?.name || 'Ahmed'}:{' '}
              {formatMoney(
                series[hoveredIdx].byUser?.[keys[0]]?.closed || 0,
                currency
              )}
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              {series[hoveredIdx].byUser?.[keys[1]]?.name || 'Afeef'}:{' '}
              {formatMoney(
                series[hoveredIdx].byUser?.[keys[1]]?.closed || 0,
                currency
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
