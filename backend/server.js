// Minimal backend for authentication and protected data
// ----------------------------------------------------
// Goals (educational):
// - Expose 3 simple auth routes: /auth/google (login), /auth/me, /auth/logout
// - Verify a Google ID Token server‑side (signature + audience)
// - Enforce an allowlist (emails/domains) to control access
// - Set a secure session cookie for subsequent requests
// - Provide a few sample endpoints (in‑memory CRUD) to show the pattern
// Note: there is no local database; an in‑memory store is used.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieSession from 'cookie-session'
import { OAuth2Client, JWT } from 'google-auth-library'
// In‑memory store (replaces the old db.js)
const db = {
  data: {
    users: [],
    remunerations: [],
    annualCompensations: [],
  },
  async read() { /* no-op for memory */ },
  async write() { /* no-op for memory */ },
}
import { nanoid } from 'nanoid'

const {
  PORT = 3002,
  NODE_ENV = 'development',
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_IDS = '',
  SESSION_SECRET = 'dev_secret',
  FRONTEND_ORIGIN = 'http://localhost:5173',
  AUTH_ALLOWED_EMAILS = '',
  AUTH_ALLOWED_DOMAINS = '',
  // Google Sheets via Service Account
  GOOGLE_SA_EMAIL = '',
  GOOGLE_SA_PRIVATE_KEY = '', // may contain escaped \n
  SHEETS_ID = '',
  SHEETS_DEFAULT_RANGE = 'A1:Z200',
} = process.env

const CLIENT_IDS = String(GOOGLE_CLIENT_IDS || GOOGLE_CLIENT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!CLIENT_IDS.length) {
  console.warn('[WARN] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_IDS is not set. Set it in .env for auth to work.')
}

const app = express()
// Behind a TLS-terminating reverse proxy (Nginx/HAProxy), trust the proxy so
// req.secure reflects X-Forwarded-Proto=https and secure cookies are set.
app.set('trust proxy', 1)
const client = new OAuth2Client(CLIENT_IDS[0])

// Service Account JWT client (lazy init)
let saClient = null
function getServiceAccountClient(){
  if (saClient) return saClient
  if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY) {
    console.warn('[sheets] Service account not configured; routes /sheets/* will be disabled')
    return null
  }
  const key = GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n')
  saClient = new JWT({
    email: GOOGLE_SA_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return saClient
}

// Disable caching to avoid 304 + empty bodies in dev
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json())
app.use(
  cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
)

// Seed annual compensations once if empty, based on existing first user
async function seedAnnualIfEmpty() {
  await db.read()
  db.data.users ||= []
  db.data.annualCompensations ||= []
  if (!db.data.users.length || db.data.annualCompensations.length) return
  const userId = db.data.users[0].id
  const rows = [
    { year: 2022, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 41965.0, kmAllowances: 4544.0, dividends: 0.0, expenseReimbursements: 3431.89 },
    { year: 2023, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 48006.02, kmAllowances: 9586.66, dividends: 1011.6, expenseReimbursements: 5657.44 },
    { year: 2024, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 50990.28, kmAllowances: 7291.13, dividends: 0.0, expenseReimbursements: 5679.94 },
  ]
  for (const r of rows) {
    db.data.annualCompensations.push({ id: nanoid(12), userId, ...r, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }
  await db.write()
  console.log(`[backend] Seeded annual compensations for user ${userId}`)
}

// trigger seed at startup (non-blocking)
seedAnnualIfEmpty().catch((e) => console.error('Seed error:', e))

// Helpers
const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// Auth routes
app.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {}
    if (!credential) return res.status(400).json({ error: 'Missing credential' })

    const ticket = await client.verifyIdToken({ idToken: credential, audience: CLIENT_IDS })
    const payload = ticket.getPayload()
    const { sub, email, name, picture } = payload
    if (!sub) return res.status(400).json({ error: 'Invalid token' })
    if (NODE_ENV !== 'production') {
      // extra diagnostics in dev for audience issues
      // eslint-disable-next-line no-console
      console.log('[auth] token aud=', payload?.aud, 'accepted=', CLIENT_IDS)
    }

    // Enforce allowlist
    if (!isEmailAllowed(email)) {
      return res.status(403).json({ error: 'Account not allowed' })
    }

    await db.read()
    const existing = db.data.users.find((u) => u.id === sub)
    if (!existing) {
      db.data.users.push({ id: sub, email, name, picture, createdAt: new Date().toISOString() })
      await db.write()
    }

    req.session.user = { id: sub, email, name, picture }
    res.json({ user: req.session.user })
  } catch (err) {
    console.error('Auth error:', err.message)
    const body = { error: 'Authentication failed' }
    if (NODE_ENV !== 'production') body.details = err?.message
    res.status(401).json(body)
  }
})

app.get('/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' })
  res.json({ user: req.session.user })
})

app.post('/auth/logout', (req, res) => {
  req.session = null
  res.json({ ok: true })
})

// Google Sheets proxy (requires session)
app.get('/sheets/values', requireAuth, async (req, res) => {
  try {
    if (!SHEETS_ID) return res.status(500).json({ error: 'Sheets not configured' })
    const range = String(req.query.range || '').trim() || SHEETS_DEFAULT_RANGE
    const auth = getServiceAccountClient()
    if (!auth) return res.status(500).json({ error: 'Service account not configured' })
    // Fetch values via REST to avoid extra deps
    const token = await auth.getAccessToken()
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(range)}`)
    url.searchParams.set('majorDimension', 'ROWS')
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token.token || token}` } })
    if (!r.ok) {
      const body = await r.text()
      return res.status(r.status).type('application/json').send(body)
    }
    const data = await r.json()
    res.json({ values: data.values || [] })
  } catch (e) {
    console.error('Sheets values error:', e.message)
    res.status(500).json({ error: 'Sheets proxy error' })
  }
})

// Remuneration CRUD
// Model: { id, userId, date (ISO), gross, net, charges, notes }

app.get('/api/remunerations', requireAuth, async (req, res) => {
  await db.read()
  const userId = req.session.user.id
  const items = db.data.remunerations.filter((r) => r.userId === userId)
  res.json({ items })
})

app.post('/api/remunerations', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const { date, gross = 0, net = 0, charges = 0, notes = '' } = req.body || {}
  if (!date) return res.status(400).json({ error: 'Missing date' })

  const item = {
    id: nanoid(12),
    userId,
    date,
    gross: Number(gross) || 0,
    net: Number(net) || 0,
    charges: Number(charges) || 0,
    notes: String(notes || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.read()
  db.data.remunerations.push(item)
  await db.write()
  res.status(201).json({ item })
})

app.put('/api/remunerations/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const { id } = req.params
  const { date, gross, net, charges, notes } = req.body || {}

  await db.read()
  const idx = db.data.remunerations.findIndex((r) => r.id === id && r.userId === userId)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })

  const current = db.data.remunerations[idx]
  const updated = {
    ...current,
    date: date ?? current.date,
    gross: gross != null ? Number(gross) : current.gross,
    net: net != null ? Number(net) : current.net,
    charges: charges != null ? Number(charges) : current.charges,
    notes: notes != null ? String(notes) : current.notes,
    updatedAt: new Date().toISOString(),
  }
  db.data.remunerations[idx] = updated
  await db.write()
  res.json({ item: updated })
})

app.delete('/api/remunerations/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const { id } = req.params
  await db.read()
  const before = db.data.remunerations.length
  db.data.remunerations = db.data.remunerations.filter((r) => !(r.id === id && r.userId === userId))
  if (db.data.remunerations.length === before) return res.status(404).json({ error: 'Not found' })
  await db.write()
  res.json({ ok: true })
})

// Annual Compensation by category
// Model: { id, userId, year, associate, percent, shares, remuneration, kmAllowances, dividends, expenseReimbursements, notes }

app.get('/api/annual-compensations', requireAuth, async (req, res) => {
  await db.read()
  db.data.annualCompensations ||= []
  const userId = req.session.user.id
  let items = db.data.annualCompensations.filter((r) => r.userId === userId)
  // If no data for this user, seed with defaults (from the provided image)
  if (items.length === 0) {
    const seedRows = [
      { year: 2022, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 41965.0, kmAllowances: 4544.0, dividends: 0.0, expenseReimbursements: 3431.89 },
      { year: 2023, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 48006.02, kmAllowances: 9586.66, dividends: 1011.6, expenseReimbursements: 5657.44 },
      { year: 2024, associate: 'Romain Berthe', percent: 40, shares: 0, remuneration: 50990.28, kmAllowances: 7291.13, dividends: 0.0, expenseReimbursements: 5679.94 },
    ]
    for (const r of seedRows) {
      db.data.annualCompensations.push({ id: nanoid(12), userId, ...r, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    }
    await db.write()
    items = db.data.annualCompensations.filter((r) => r.userId === userId)
  }
  res.json({ items })
})

app.post('/api/annual-compensations', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const {
    year,
    associate = '',
    percent = 0,
    shares = 0,
    remuneration = 0,
    kmAllowances = 0,
    dividends = 0,
    expenseReimbursements = 0,
    notes = '',
  } = req.body || {}
  if (!year) return res.status(400).json({ error: 'Missing year' })

  const item = {
    id: nanoid(12),
    userId,
    year: String(year),
    associate: String(associate || ''),
    percent: Number(percent) || 0,
    shares: Number(shares) || 0,
    remuneration: Number(remuneration) || 0,
    kmAllowances: Number(kmAllowances) || 0,
    dividends: Number(dividends) || 0,
    expenseReimbursements: Number(expenseReimbursements) || 0,
    notes: String(notes || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.read()
  db.data.annualCompensations ||= []
  db.data.annualCompensations.push(item)
  await db.write()
  res.status(201).json({ item })
})

app.put('/api/annual-compensations/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const { id } = req.params
  await db.read()
  db.data.annualCompensations ||= []
  const idx = db.data.annualCompensations.findIndex((r) => r.id === id && r.userId === userId)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })

  const current = db.data.annualCompensations[idx]
  const {
    year,
    associate,
    percent,
    shares,
    remuneration,
    kmAllowances,
    dividends,
    expenseReimbursements,
    notes,
  } = req.body || {}

  const updated = {
    ...current,
    year: year ?? current.year,
    associate: associate ?? current.associate,
    percent: percent != null ? Number(percent) : current.percent,
    shares: shares != null ? Number(shares) : current.shares,
    remuneration: remuneration != null ? Number(remuneration) : current.remuneration,
    kmAllowances: kmAllowances != null ? Number(kmAllowances) : current.kmAllowances,
    dividends: dividends != null ? Number(dividends) : current.dividends,
    expenseReimbursements:
      expenseReimbursements != null ? Number(expenseReimbursements) : current.expenseReimbursements,
    notes: notes ?? current.notes,
    updatedAt: new Date().toISOString(),
  }
  db.data.annualCompensations[idx] = updated
  await db.write()
  res.json({ item: updated })
})

app.delete('/api/annual-compensations/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id
  const { id } = req.params
  await db.read()
  db.data.annualCompensations ||= []
  const before = db.data.annualCompensations.length
  db.data.annualCompensations = db.data.annualCompensations.filter(
    (r) => !(r.id === id && r.userId === userId)
  )
  if (db.data.annualCompensations.length === before) return res.status(404).json({ error: 'Not found' })
  await db.write()
  res.json({ ok: true })
})

// Allowlist helpers
const allowedEmails = String(AUTH_ALLOWED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const allowedDomains = String(AUTH_ALLOWED_DOMAINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function isEmailAllowed(email) {
  if (!email) return false
  const normalized = String(email).toLowerCase()
  if (allowedEmails.length && allowedEmails.includes(normalized)) return true
  if (allowedDomains.length) {
    const domain = normalized.split('@')[1] || ''
    if (allowedDomains.includes(domain)) return true
  }
  // If no lists configured, deny by default (enforce explicit allowlist)
  if (!allowedEmails.length && !allowedDomains.length) {
    if (NODE_ENV !== 'production') {
      console.warn('[auth] No AUTH_ALLOWED_EMAILS or AUTH_ALLOWED_DOMAINS set; denying all logins by default in dev. Configure an allowlist in backend/.env')
    }
    return false
  }
  return false
}

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`[backend] Listening on http://localhost:${PORT}`)
})
