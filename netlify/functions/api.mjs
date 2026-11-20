import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const SESSION_COOKIE = 'aa_portal_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const ALLOWED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'INR']);
const ALLOWED_STATUSES = new Set([
  'Closed Won',
  'In Negotiation',
  'Proposal',
  'Churned',
]);
const ALLOWED_CATEGORIES = new Set([
  'milestone',
  'progress',
  'blocker',
  'strategy',
]);

function getSecret() {
  return (
    globalThis.Netlify?.env?.get('SESSION_SECRET') ||
    process.env.SESSION_SECRET ||
    'aa-founders-portal-default-signing-key-2026'
  );
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, keyHex] = String(storedHash || '').split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function signSession(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

function convertCurrency(amount, fromCurrency, toCurrency, fxMap) {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = fxMap[fromCurrency] ?? 1;
  const toRate = fxMap[toCurrency] ?? 1;
  return (amount * fromRate) / toRate;
}

async function loadState() {
  const store = getStore('founders-portal');
  let state = await store.get('state', { type: 'json' });
  if (!state) {
    const passHash = hashPassword('portal2026');
    state = {
      users: [
        {
          id: 1,
          username: 'ahmed',
          name: 'Ahmed',
          email: 'ahmed@ahmedafeef.co',
          passwordHash: passHash,
          role: 'Founder',
          avatarInitials: 'AH',
          accentColor: '#D4AF37',
        },
        {
          id: 2,
          username: 'afeef',
          name: 'Afeef',
          email: 'afeef@ahmedafeef.co',
          passwordHash: passHash,
          role: 'Founder',
          avatarInitials: 'AF',
          accentColor: '#94A3B8',
        },
      ],
      fxRates: {
        USD: 1.0,
        EUR: 1.08,
        GBP: 1.27,
        INR: 0.0119,
      },
      deals: [],
      updates: [],
      nextDealId: 1,
      nextUpdateId: 1,
    };
    await store.setJSON('state', state);
  }
  return { store, state };
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarInitials: u.avatarInitials,
    accentColor: u.accentColor,
  };
}

function getAuthUser(req, state) {
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const token = cookies[SESSION_COOKIE];
  const uid = verifySessionToken(token);
  if (!uid) return null;
  return state.users.find((u) => u.id === uid) || null;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  const { store, state } = await loadState();

  // --- Auth ---
  if (path === '/api/auth/login' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!identifier || !password) {
      return json({ error: 'Username/email and password are required.' }, 400);
    }

    const user = state.users.find(
      (u) =>
        u.username.toLowerCase() === identifier ||
        u.email.toLowerCase() === identifier
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return json({ error: 'Invalid credentials.' }, 401);
    }

    const token = signSession(user.id);
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    return json(
      { user: publicUser(user) },
      200,
      {
        'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Secure; Max-Age=${maxAge}`,
      }
    );
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    return json(
      { ok: true },
      200,
      {
        'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Secure; Max-Age=0`,
      }
    );
  }

  const user = getAuthUser(req, state);
  if (!user) {
    return json({ error: 'Authentication required' }, 401);
  }

  if (path === '/api/auth/me' && method === 'GET') {
    return json({
      user: publicUser(user),
      partners: state.users.map(publicUser),
      fxRates: state.fxRates,
    });
  }

  if (path === '/api/auth/change-password' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || newPassword.length < 6) {
      return json(
        { error: 'New password must be at least 6 characters.' },
        400
      );
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return json({ error: 'Current password is incorrect.' }, 401);
    }
    user.passwordHash = hashPassword(newPassword);
    await store.setJSON('state', state);
    return json({ ok: true });
  }

  // --- FX ---
  if (path === '/api/fx' && method === 'GET') {
    return json({ fxRates: state.fxRates });
  }

  if (path === '/api/fx' && method === 'PATCH') {
    const body = await req.json().catch(() => ({}));
    const rates = body.rates;
    if (!rates || typeof rates !== 'object') {
      return json({ error: 'Invalid rates payload' }, 400);
    }
    for (const [curr, val] of Object.entries(rates)) {
      if (!ALLOWED_CURRENCIES.has(curr) || curr === 'USD') continue;
      const num = Number(val);
      if (Number.isFinite(num) && num > 0) {
        state.fxRates[curr] = num;
      }
    }
    await store.setJSON('state', state);
    return json({ fxRates: state.fxRates });
  }

  // --- Deals (Personal Ledger) ---
  if (path === '/api/deals' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || 'ALL';
    const currency = url.searchParams.get('currency') || 'ALL';

    const list = state.deals
      .filter((d) => {
        if (d.ownerId !== user.id) return false;
        if (status !== 'ALL' && d.status !== status) return false;
        if (currency !== 'ALL' && d.currency !== currency) return false;
        if (search) {
          const hay = `${d.dealTitle} ${d.clientName} ${d.clientEmail} ${d.clientCompany}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((d) => {
        const val = Number(d.value);
        const commPct = Number(d.commissionPercent) || 0;
        const commAmt = val * (commPct / 100);
        return {
          ...d,
          commissionPercent: commPct,
          commissionAmount: commAmt,
          totalValue: val + commAmt,
        };
      })
      .sort(
        (a, b) =>
          b.closedDate.localeCompare(a.closedDate) || b.id - a.id
      );

    return json({ deals: list });
  }

  if (path === '/api/deals' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const dealTitle = String(b.dealTitle || '').trim();
    const clientName = String(b.clientName || '').trim();
    const clientEmail = String(b.clientEmail || '').trim();
    const clientCompany = String(b.clientCompany || '').trim();
    const value = Number(b.value);
    const commissionPercent = Math.min(
      100,
      Math.max(
        0,
        Number.isFinite(Number(b.commissionPercent))
          ? Number(b.commissionPercent)
          : 0
      )
    );
    const commissionAmount = value * (commissionPercent / 100);
    const currency = ALLOWED_CURRENCIES.has(b.currency) ? b.currency : 'USD';
    const closedDate = String(b.closedDate || '').trim();
    const status = ALLOWED_STATUSES.has(b.status) ? b.status : 'Closed Won';
    const notes = String(b.notes || '').trim();
    const tags = Array.isArray(b.tags)
      ? b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
      : [];

    if (
      !dealTitle ||
      !clientName ||
      !closedDate ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return json(
        {
          error:
            'Deal title, client name, valid value, and date are required.',
        },
        400
      );
    }

    const now = new Date().toISOString();
    const deal = {
      id: state.nextDealId++,
      dealTitle,
      clientName,
      clientEmail,
      clientCompany,
      value,
      commissionPercent,
      commissionAmount,
      totalValue: value + commissionAmount,
      currency,
      closedDate,
      status,
      ownerId: user.id,
      ownerName: user.name,
      ownerInitials: user.avatarInitials,
      ownerAccent: user.accentColor,
      splitPercent: 100,
      notes,
      tags,
      createdAt: now,
      updatedAt: now,
    };
    state.deals.push(deal);
    await store.setJSON('state', state);
    return json({ deal }, 201);
  }

  const dealMatch = path.match(/^\/api\/deals\/(\d+)$/);
  if (dealMatch) {
    const id = Number(dealMatch[1]);
    const idx = state.deals.findIndex((d) => d.id === id);
    if (idx === -1) return json({ error: 'Deal not found' }, 404);
    const existing = state.deals[idx];
    if (existing.ownerId !== user.id) {
      return json(
        { error: 'You can only modify deals in your own ledger.' },
        403
      );
    }

    if (method === 'PATCH') {
      const b = await req.json().catch(() => ({}));
      const nextValue =
        b.value !== undefined && Number.isFinite(Number(b.value))
          ? Number(b.value)
          : Number(existing.value);
      const nextCommPct =
        b.commissionPercent !== undefined &&
        Number.isFinite(Number(b.commissionPercent))
          ? Math.min(100, Math.max(0, Number(b.commissionPercent)))
          : Number(existing.commissionPercent) || 0;
      const nextCommAmt = nextValue * (nextCommPct / 100);
      const updated = {
        ...existing,
        dealTitle:
          b.dealTitle !== undefined
            ? String(b.dealTitle).trim()
            : existing.dealTitle,
        clientName:
          b.clientName !== undefined
            ? String(b.clientName).trim()
            : existing.clientName,
        clientEmail:
          b.clientEmail !== undefined
            ? String(b.clientEmail).trim()
            : existing.clientEmail,
        clientCompany:
          b.clientCompany !== undefined
            ? String(b.clientCompany).trim()
            : existing.clientCompany,
        value: nextValue,
        commissionPercent: nextCommPct,
        commissionAmount: nextCommAmt,
        totalValue: nextValue + nextCommAmt,
        currency: ALLOWED_CURRENCIES.has(b.currency)
          ? b.currency
          : existing.currency,
        closedDate:
          b.closedDate !== undefined
            ? String(b.closedDate).trim()
            : existing.closedDate,
        status: ALLOWED_STATUSES.has(b.status) ? b.status : existing.status,
        notes: b.notes !== undefined ? String(b.notes).trim() : existing.notes,
        tags: Array.isArray(b.tags)
          ? b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
          : existing.tags,
        updatedAt: new Date().toISOString(),
      };
      state.deals[idx] = updated;
      await store.setJSON('state', state);
      return json({ deal: updated });
    }

    if (method === 'DELETE') {
      state.deals.splice(idx, 1);
      await store.setJSON('state', state);
      return json({ ok: true });
    }
  }

  // --- Updates (Shared Feed) ---
  if (path === '/api/updates' && method === 'GET') {
    const category = url.searchParams.get('category') || 'ALL';
    const list = state.updates
      .filter((u) => category === 'ALL' || u.category === category)
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id - a.id
      );
    return json({ updates: list });
  }

  if (path === '/api/updates' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const category = ALLOWED_CATEGORIES.has(b.category)
      ? b.category
      : 'progress';
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    const pinned = Boolean(b.pinned);
    if (!title || !body) {
      return json({ error: 'Title and update details are required.' }, 400);
    }

    const now = new Date().toISOString();
    const update = {
      id: state.nextUpdateId++,
      authorId: user.id,
      authorName: user.name,
      authorInitials: user.avatarInitials,
      authorAccent: user.accentColor,
      category,
      title,
      body,
      pinned,
      createdAt: now,
      updatedAt: now,
    };
    state.updates.push(update);
    await store.setJSON('state', state);
    return json({ update }, 201);
  }

  const updateMatch = path.match(/^\/api\/updates\/(\d+)$/);
  if (updateMatch) {
    const id = Number(updateMatch[1]);
    const idx = state.updates.findIndex((u) => u.id === id);
    if (idx === -1) return json({ error: 'Update not found' }, 404);
    const existing = state.updates[idx];

    if (method === 'PATCH') {
      const b = await req.json().catch(() => ({}));
      const updated = {
        ...existing,
        pinned: b.pinned !== undefined ? Boolean(b.pinned) : existing.pinned,
        title: b.title !== undefined ? String(b.title).trim() : existing.title,
        body: b.body !== undefined ? String(b.body).trim() : existing.body,
        category: ALLOWED_CATEGORIES.has(b.category)
          ? b.category
          : existing.category,
        updatedAt: new Date().toISOString(),
      };
      state.updates[idx] = updated;
      await store.setJSON('state', state);
      return json({ update: updated });
    }

    if (method === 'DELETE') {
      state.updates.splice(idx, 1);
      await store.setJSON('state', state);
      return json({ ok: true });
    }
  }

  // --- Analytics ---
  if (path === '/api/analytics' && method === 'GET') {
    const reqCurr = url.searchParams.get('currency') || 'USD';
    const displayCurrency = ALLOWED_CURRENCIES.has(reqCurr) ? reqCurr : 'USD';
    const fxMap = state.fxRates;

    let combinedClosedRevenue = 0;
    let combinedPipelineValue = 0;
    let combinedClosedCount = 0;
    let combinedPipelineCount = 0;

    const founderTotals = {};
    for (const f of state.users) {
      founderTotals[f.id] = {
        id: f.id,
        username: f.username,
        name: f.name,
        initials: f.avatarInitials,
        accent: f.accentColor,
        closedDeals: 0,
        pipelineDeals: 0,
        closedRevenue: 0,
        closedCommissions: 0,
        pipelineValue: 0,
        avgDealSize: 0,
      };
    }

    const monthlyMap = new Map();
    const clientMap = new Map();

    for (const d of state.deals) {
      const owner = state.users.find((u) => u.id === d.ownerId);
      const baseValue = Number(d.value);
      const commPct = Number(d.commissionPercent) || 0;
      const commValue = baseValue * (commPct / 100);
      const convertedBase = convertCurrency(
        baseValue,
        d.currency,
        displayCurrency,
        fxMap
      );
      const convertedComm = convertCurrency(
        commValue,
        d.currency,
        displayCurrency,
        fxMap
      );
      const convertedTotal = convertedBase + convertedComm;
      const monthKey = (d.closedDate || '').slice(0, 7) || 'Unknown';
      if (!monthlyMap.has(monthKey)) {
        const byUser = {};
        for (const f of state.users) {
          byUser[f.username] = {
            id: f.id,
            name: f.name,
            accent: f.accentColor,
            closed: 0,
            pipeline: 0,
            count: 0,
          };
        }
        monthlyMap.set(monthKey, {
          month: monthKey,
          totalClosed: 0,
          totalPipeline: 0,
          totalCount: 0,
          byUser,
        });
      }

      const mEntry = monthlyMap.get(monthKey);
      const uBucket = owner ? mEntry.byUser[owner.username] : null;

      if (d.status === 'Closed Won') {
        combinedClosedRevenue += convertedTotal;
        combinedClosedCount += 1;
        mEntry.totalClosed += convertedTotal;
        mEntry.totalCount += 1;
        if (uBucket) {
          uBucket.closed += convertedTotal;
          uBucket.count += 1;
        }
        if (founderTotals[d.ownerId]) {
          founderTotals[d.ownerId].closedDeals += 1;
          founderTotals[d.ownerId].closedRevenue += convertedTotal;
          founderTotals[d.ownerId].closedCommissions += convertedComm;
        }
      } else if (d.status === 'In Negotiation' || d.status === 'Proposal') {
        combinedPipelineValue += convertedTotal;
        combinedPipelineCount += 1;
        mEntry.totalPipeline += convertedTotal;
        if (uBucket) {
          uBucket.pipeline += convertedTotal;
        }
        if (founderTotals[d.ownerId]) {
          founderTotals[d.ownerId].pipelineDeals += 1;
          founderTotals[d.ownerId].pipelineValue += convertedTotal;
        }
      }

      if (d.ownerId === user.id) {
        const emailClean = String(d.clientEmail || '').trim().toLowerCase();
        const clientKey =
          emailClean ||
          `${String(d.clientName || '').trim().toLowerCase()}::${String(d.clientCompany || '').trim().toLowerCase()}`;
        if (!clientMap.has(clientKey)) {
          clientMap.set(clientKey, {
            clientName: d.clientName,
            clientEmail: d.clientEmail,
            clientCompany: d.clientCompany,
            totalValue: 0,
            dealCount: 0,
            lastDate: d.closedDate,
            statuses: new Set(),
          });
        }
        const cEntry = clientMap.get(clientKey);
        if (d.status === 'Closed Won') {
          cEntry.totalValue += convertedTotal;
        }
        cEntry.dealCount += 1;
        if (d.closedDate > cEntry.lastDate) {
          cEntry.lastDate = d.closedDate;
        }
        cEntry.statuses.add(d.status);
      }
    }

    for (const f of Object.values(founderTotals)) {
      f.avgDealSize = f.closedDeals > 0 ? f.closedRevenue / f.closedDeals : 0;
    }

    const monthlySeries = Array.from(monthlyMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
    const clients = Array.from(clientMap.values())
      .map((c) => ({ ...c, statuses: Array.from(c.statuses) }))
      .sort((a, b) => b.totalValue - a.totalValue);

    return json({
      displayCurrency,
      fxRates: fxMap,
      combined: {
        closedRevenue: combinedClosedRevenue,
        pipelineValue: combinedPipelineValue,
        closedCount: combinedClosedCount,
        pipelineCount: combinedPipelineCount,
        avgDealSize:
          combinedClosedCount > 0
            ? combinedClosedRevenue / combinedClosedCount
            : 0,
      },
      friendBreakdown: Object.values(founderTotals),
      monthlySeries,
      clients,
    });
  }

  // --- CSV Export ---
  if (path === '/api/export/csv' && method === 'GET') {
    const rows = state.deals
      .filter((d) => d.ownerId === user.id)
      .sort(
        (a, b) =>
          b.closedDate.localeCompare(a.closedDate) || b.id - a.id
      );

    const escapeCsv = (v) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    };

    const headers = [
      'ID',
      'Deal Title',
      'Client Name',
      'Client Email',
      'Company',
      'Value',
      'Commission %',
      'Commission Amount',
      'Total With Commission',
      'Currency',
      'Closed Date',
      'Status',
      'Notes',
    ];
    const lines = [
      headers.join(','),
      ...rows.map((r) => {
        const val = Number(r.value);
        const commPct = Number(r.commissionPercent) || 0;
        const commAmt = val * (commPct / 100);
        return [
          r.id,
          r.dealTitle,
          r.clientName,
          r.clientEmail,
          r.clientCompany,
          val,
          commPct,
          commAmt,
          val + commAmt,
          r.currency,
          r.closedDate,
          r.status,
          r.notes,
        ]
          .map(escapeCsv)
          .join(',');
      }),
    ];

    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${user.username}-deals-ledger.csv"`,
      },
    });
  }

  return json({ error: 'Not found' }, 404);
};

export const config = {
  path: '/api/*',
};
