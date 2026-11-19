import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getDb } from './db.js';
import {
  clearSessionCookie,
  createSession,
  getSessionUser,
  hashPassword,
  parseCookies,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from './auth.js';

const PORT = Number(process.env.PORT) || 3001;
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

const app = express();
app.use(express.json({ limit: '1mb' }));

const db = getDb();

function requireAuth(req, res, next) {
  const user = getSessionUser(db, req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

function getFxMap() {
  const rows = db.prepare('SELECT currency, rate_to_usd FROM fx_rates').all();
  const map = { USD: 1 };
  for (const r of rows) {
    map[r.currency] = r.rate_to_usd;
  }
  return map;
}

function convertCurrency(amount, fromCurrency, toCurrency, fxMap) {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = fxMap[fromCurrency] ?? 1;
  const toRate = fxMap[toCurrency] ?? 1;
  const inUsd = amount * fromRate;
  return inUsd / toRate;
}

function formatDealRow(row) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    dealTitle: row.deal_title,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientCompany: row.client_company,
    value: Number(row.value),
    currency: row.currency,
    closedDate: row.closed_date,
    status: row.status,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerInitials: row.owner_initials,
    ownerAccent: row.owner_accent,
    splitPercent: Number(row.split_percent),
    notes: row.notes,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Auth Routes ---

app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res
      .status(400)
      .json({ error: 'Username/email and password are required.' });
  }

  const normalized = String(identifier).trim().toLowerCase();
  const user = db
    .prepare(
      `SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?`
    )
    .get(normalized, normalized);

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const { token, expiresAt } = createSession(db, user.id);
  setSessionCookie(res, token, expiresAt);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarInitials: user.avatar_initials,
      accentColor: user.accent_color,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(db, req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const partners = db
    .prepare(
      'SELECT id, username, name, email, role, avatar_initials, accent_color FROM users ORDER BY id ASC'
    )
    .all()
    .map((p) => ({
      id: p.id,
      username: p.username,
      name: p.name,
      email: p.email,
      role: p.role,
      avatarInitials: p.avatar_initials,
      accentColor: p.accent_color,
    }));

  res.json({ user, partners, fxRates: getFxMap() });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ error: 'New password must be at least 6 characters.' });
  }
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user.id);
  if (!row || !verifyPassword(String(currentPassword), row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const nextHash = hashPassword(String(newPassword));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    nextHash,
    req.user.id
  );
  res.json({ ok: true });
});

// --- FX Rates ---

app.get('/api/fx', requireAuth, (_req, res) => {
  res.json({ fxRates: getFxMap() });
});

app.patch('/api/fx', requireAuth, (req, res) => {
  const rates = req.body?.rates;
  if (!rates || typeof rates !== 'object') {
    return res.status(400).json({ error: 'Invalid rates payload' });
  }
  const upsert = db.prepare(
    `INSERT INTO fx_rates (currency, rate_to_usd, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, updated_at = excluded.updated_at`
  );
  for (const [curr, val] of Object.entries(rates)) {
    if (!ALLOWED_CURRENCIES.has(curr) || curr === 'USD') continue;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) continue;
    upsert.run(curr, num);
  }
  res.json({ fxRates: getFxMap() });
});

// --- Deals Routes (Personal Ledger per User) ---

app.get('/api/deals', requireAuth, (req, res) => {
  const { search, status, currency } = req.query;
  const conditions = ['d.owner_id = ?'];
  const params = [req.user.id];

  if (status && status !== 'ALL') {
    conditions.push('d.status = ?');
    params.push(String(status));
  }
  if (currency && currency !== 'ALL') {
    conditions.push('d.currency = ?');
    params.push(String(currency));
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim().toLowerCase()}%`;
    conditions.push(
      '(lower(d.deal_title) LIKE ? OR lower(d.client_name) LIKE ? OR lower(d.client_email) LIKE ? OR lower(d.client_company) LIKE ?)'
    );
    params.push(q, q, q, q);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db
    .prepare(
      `SELECT d.*, u.name AS owner_name, u.avatar_initials AS owner_initials, u.accent_color AS owner_accent
       FROM deals d
       JOIN users u ON u.id = d.owner_id
       ${where}
       ORDER BY d.closed_date DESC, d.id DESC`
    )
    .all(...params);

  res.json({ deals: rows.map(formatDealRow) });
});

app.post('/api/deals', requireAuth, (req, res) => {
  const b = req.body || {};
  const dealTitle = String(b.dealTitle || '').trim();
  const clientName = String(b.clientName || '').trim();
  const clientEmail = String(b.clientEmail || '').trim();
  const clientCompany = String(b.clientCompany || '').trim();
  const value = Number(b.value);
  const currency = ALLOWED_CURRENCIES.has(b.currency) ? b.currency : 'USD';
  const closedDate = String(b.closedDate || '').trim();
  const status = ALLOWED_STATUSES.has(b.status) ? b.status : 'Closed Won';
  const ownerId = req.user.id;
  const notes = String(b.notes || '').trim();
  const tags = Array.isArray(b.tags)
    ? b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!dealTitle || !clientName || !clientEmail || !closedDate || !Number.isFinite(value) || value < 0) {
    return res.status(400).json({
      error: 'Deal title, client name, client email, valid value, and date are required.',
    });
  }

  const result = db
    .prepare(
      `INSERT INTO deals
       (deal_title, client_name, client_email, client_company, value, currency, closed_date, status, owner_id, split_percent, notes, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?)`
    )
    .run(
      dealTitle,
      clientName,
      clientEmail,
      clientCompany,
      value,
      currency,
      closedDate,
      status,
      ownerId,
      notes,
      JSON.stringify(tags)
    );

  const created = db
    .prepare(
      `SELECT d.*, u.name AS owner_name, u.avatar_initials AS owner_initials, u.accent_color AS owner_accent
       FROM deals d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`
    )
    .get(Number(result.lastInsertRowid));

  res.status(201).json({ deal: formatDealRow(created) });
});

app.patch('/api/deals/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Deal not found' });
  }
  if (existing.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit deals in your own ledger.' });
  }

  const b = req.body || {};
  const dealTitle =
    b.dealTitle !== undefined ? String(b.dealTitle).trim() : existing.deal_title;
  const clientName =
    b.clientName !== undefined ? String(b.clientName).trim() : existing.client_name;
  const clientEmail =
    b.clientEmail !== undefined ? String(b.clientEmail).trim() : existing.client_email;
  const clientCompany =
    b.clientCompany !== undefined
      ? String(b.clientCompany).trim()
      : existing.client_company;
  const value =
    b.value !== undefined && Number.isFinite(Number(b.value))
      ? Number(b.value)
      : existing.value;
  const currency = ALLOWED_CURRENCIES.has(b.currency)
    ? b.currency
    : existing.currency;
  const closedDate =
    b.closedDate !== undefined ? String(b.closedDate).trim() : existing.closed_date;
  const status = ALLOWED_STATUSES.has(b.status) ? b.status : existing.status;
  const notes = b.notes !== undefined ? String(b.notes).trim() : existing.notes;
  const tags = Array.isArray(b.tags)
    ? JSON.stringify(b.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6))
    : existing.tags;

  db.prepare(
    `UPDATE deals SET
       deal_title = ?, client_name = ?, client_email = ?, client_company = ?,
       value = ?, currency = ?, closed_date = ?, status = ?,
       notes = ?, tags = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    dealTitle,
    clientName,
    clientEmail,
    clientCompany,
    value,
    currency,
    closedDate,
    status,
    notes,
    tags,
    id
  );

  const updated = db
    .prepare(
      `SELECT d.*, u.name AS owner_name, u.avatar_initials AS owner_initials, u.accent_color AS owner_accent
       FROM deals d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`
    )
    .get(id);

  res.json({ deal: formatDealRow(updated) });
});

app.delete('/api/deals/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT owner_id FROM deals WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Deal not found' });
  }
  if (existing.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete deals in your own ledger.' });
  }
  db.prepare('DELETE FROM deals WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Updates Routes ---

app.get('/api/updates', requireAuth, (req, res) => {
  const { category } = req.query;
  const where =
    category && category !== 'ALL' && ALLOWED_CATEGORIES.has(String(category))
      ? 'WHERE up.category = ?'
      : '';
  const params = where ? [String(category)] : [];

  const rows = db
    .prepare(
      `SELECT up.*, u.name AS author_name, u.avatar_initials AS author_initials, u.accent_color AS author_accent
       FROM updates up
       JOIN users u ON u.id = up.author_id
       ${where}
       ORDER BY up.pinned DESC, up.created_at DESC, up.id DESC`
    )
    .all(...params);

  res.json({
    updates: rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorInitials: r.author_initials,
      authorAccent: r.author_accent,
      category: r.category,
      title: r.title,
      body: r.body,
      pinned: Boolean(r.pinned),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/updates', requireAuth, (req, res) => {
  const b = req.body || {};
  const category = ALLOWED_CATEGORIES.has(b.category) ? b.category : 'progress';
  const title = String(b.title || '').trim();
  const body = String(b.body || '').trim();
  const pinned = b.pinned ? 1 : 0;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and update details are required.' });
  }

  const info = db
    .prepare(
      `INSERT INTO updates (author_id, category, title, body, pinned) VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.user.id, category, title, body, pinned);

  const r = db
    .prepare(
      `SELECT up.*, u.name AS author_name, u.avatar_initials AS author_initials, u.accent_color AS author_accent
       FROM updates up JOIN users u ON u.id = up.author_id WHERE up.id = ?`
    )
    .get(Number(info.lastInsertRowid));

  res.status(201).json({
    update: {
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorInitials: r.author_initials,
      authorAccent: r.author_accent,
      category: r.category,
      title: r.title,
      body: r.body,
      pinned: Boolean(r.pinned),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  });
});

app.patch('/api/updates/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM updates WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Update not found' });

  const b = req.body || {};
  const pinned = b.pinned !== undefined ? (b.pinned ? 1 : 0) : existing.pinned;
  const title = b.title !== undefined ? String(b.title).trim() : existing.title;
  const body = b.body !== undefined ? String(b.body).trim() : existing.body;
  const category = ALLOWED_CATEGORIES.has(b.category)
    ? b.category
    : existing.category;

  db.prepare(
    `UPDATE updates SET title = ?, body = ?, category = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, body, category, pinned, id);

  const r = db
    .prepare(
      `SELECT up.*, u.name AS author_name, u.avatar_initials AS author_initials, u.accent_color AS author_accent
       FROM updates up JOIN users u ON u.id = up.author_id WHERE up.id = ?`
    )
    .get(id);

  res.json({
    update: {
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorInitials: r.author_initials,
      authorAccent: r.author_accent,
      category: r.category,
      title: r.title,
      body: r.body,
      pinned: Boolean(r.pinned),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  });
});

app.delete('/api/updates/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM updates WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Update not found' });
  res.json({ ok: true });
});

// --- Analytics & Clients ---

app.get('/api/analytics', requireAuth, (req, res) => {
  const displayCurrency = ALLOWED_CURRENCIES.has(req.query.currency)
    ? String(req.query.currency)
    : 'USD';
  const fxMap = getFxMap();

  const deals = db
    .prepare(
      `SELECT d.*, u.username AS owner_username, u.name AS owner_name, u.avatar_initials AS owner_initials, u.accent_color AS owner_accent
       FROM deals d JOIN users u ON u.id = d.owner_id`
    )
    .all();

  const founders = db
    .prepare(
      'SELECT id, username, name, avatar_initials, accent_color FROM users ORDER BY id ASC'
    )
    .all();

  let combinedClosedRevenue = 0;
  let combinedPipelineValue = 0;
  let combinedClosedCount = 0;
  let combinedPipelineCount = 0;

  const founderTotals = {};
  for (const f of founders) {
    founderTotals[f.id] = {
      id: f.id,
      username: f.username,
      name: f.name,
      initials: f.avatar_initials,
      accent: f.accent_color,
      closedDeals: 0,
      pipelineDeals: 0,
      closedRevenue: 0,
      pipelineValue: 0,
      avgDealSize: 0,
    };
  }

  const monthlyMap = new Map();
  const clientMap = new Map();

  for (const d of deals) {
    const converted = convertCurrency(
      Number(d.value),
      d.currency,
      displayCurrency,
      fxMap
    );
    const monthKey = (d.closed_date || '').slice(0, 7) || 'Unknown';
    if (!monthlyMap.has(monthKey)) {
      const byUser = {};
      for (const f of founders) {
        byUser[f.username] = {
          id: f.id,
          name: f.name,
          accent: f.accent_color,
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
    const uBucket = mEntry.byUser[d.owner_username];

    if (d.status === 'Closed Won') {
      combinedClosedRevenue += converted;
      combinedClosedCount += 1;
      mEntry.totalClosed += converted;
      mEntry.totalCount += 1;
      if (uBucket) {
        uBucket.closed += converted;
        uBucket.count += 1;
      }
      if (founderTotals[d.owner_id]) {
        founderTotals[d.owner_id].closedDeals += 1;
        founderTotals[d.owner_id].closedRevenue += converted;
      }
    } else if (d.status === 'In Negotiation' || d.status === 'Proposal') {
      combinedPipelineValue += converted;
      combinedPipelineCount += 1;
      mEntry.totalPipeline += converted;
      if (uBucket) {
        uBucket.pipeline += converted;
      }
      if (founderTotals[d.owner_id]) {
        founderTotals[d.owner_id].pipelineDeals += 1;
        founderTotals[d.owner_id].pipelineValue += converted;
      }
    }

    // Client directory is personal to the logged-in user's own business
    if (d.owner_id === req.user.id) {
      const emailKey = String(d.client_email || '').toLowerCase();
      if (!clientMap.has(emailKey)) {
        clientMap.set(emailKey, {
          clientName: d.client_name,
          clientEmail: d.client_email,
          clientCompany: d.client_company,
          totalValue: 0,
          dealCount: 0,
          lastDate: d.closed_date,
          statuses: new Set(),
        });
      }
      const cEntry = clientMap.get(emailKey);
      if (d.status === 'Closed Won') {
        cEntry.totalValue += converted;
      }
      cEntry.dealCount += 1;
      if (d.closed_date > cEntry.lastDate) {
        cEntry.lastDate = d.closed_date;
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
    .map((c) => ({
      ...c,
      statuses: Array.from(c.statuses),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  res.json({
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
});

// --- CSV Export (Personal Ledger) ---

app.get('/api/export/csv', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*
       FROM deals d
       WHERE d.owner_id = ?
       ORDER BY d.closed_date DESC, d.id DESC`
    )
    .all(req.user.id);

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
    'Currency',
    'Closed Date',
    'Status',
    'Notes',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.deal_title,
        r.client_name,
        r.client_email,
        r.client_company,
        r.value,
        r.currency,
        r.closed_date,
        r.status,
        r.notes,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${req.user.username}-deals-ledger.csv"`
  );
  res.send(lines.join('\n'));
});

// --- Production Static Serving ---
const distDir = path.resolve(process.cwd(), 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Portal API listening on http://localhost:${PORT}`);
});
