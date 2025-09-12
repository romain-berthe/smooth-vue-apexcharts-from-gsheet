// Connecteur Google Sheets (client Vite)
// Deux modes de chargement:
// - API (clé simple): VITE_SHEETS_ID, VITE_SHEETS_API_KEY, VITE_SHEETS_RANGES
//   VITE_SHEETS_RANGES = un ou plusieurs Named ranges (séparés par des virgules).
//   Évitez toute référence à un nom d'onglet.
// - CSV (feuille publiée): VITE_SHEETS_CSV_URL

async function fetchJSON(url) {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json()
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

export async function fetchFromSheetsAPI({ spreadsheetId, apiKey, ranges }) {
  const missing = []
  if (!spreadsheetId) missing.push('VITE_SHEETS_ID')
  if (!apiKey) missing.push('VITE_SHEETS_API_KEY')
  if (!ranges?.length) missing.push('VITE_SHEETS_RANGES')
  if (missing.length) {
    console.warn(`Sheets API: configuration manquante: ${missing.join(', ')}`)
    return []
  }
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`)
  url.searchParams.set('key', apiKey)
  for (const r of ranges) url.searchParams.append('ranges', r)
  url.searchParams.set('majorDimension', 'ROWS')
  const data = await fetchJSON(url.toString())
  return data?.valueRanges || []
}

// Extremely small CSV parser (handles commas, no quotes/escapes). For production, prefer a CSV lib.
function parseCSVBasic(text) {
  return text.trim().split(/\r?\n/).map((line) => line.split(','))
}

export async function fetchFromCSV({ csvUrl }) {
  if (!csvUrl) throw new Error('Missing CSV URL')
  const text = await fetchText(csvUrl)
  const rows = parseCSVBasic(text)
  return rows
}

// Lecture des variables d'env côté Vite (avec fallback via __APP_ENV__ injecté dans vite.config)
function env(name, def = '') {
  const viteVal = import.meta?.env?.[name]
  const injected = (typeof __APP_ENV__ !== 'undefined' ? __APP_ENV__ : (typeof window !== 'undefined' ? window.__APP_ENV__ : undefined))
  const injVal = injected?.[name]
  return (viteVal ?? injVal ?? def)
}

// Normalisation d'une plage A1 (quote les noms d'onglet avec espaces/accents)
function sanitizeRange(r) {
  const s = (r || '').trim()
  // If already quoted as 'Sheet'!A1:E100 or "Sheet"!A1:E100 -> normalize to single quotes
  let m = s.match(/^(["'])([^"']+)\1!(.+)$/)
  if (m) return `'${m[2]}'!${m[3]}`
  // If not quoted, check sheet name part and quote when it contains spaces or non-alphanumerics
  m = s.match(/^([^!]+)!(.+)$/)
  if (!m) return s
  const raw = m[1].trim()
  const unquoted = raw.replace(/^['"]|['"]$/g, '')
  const needsQuote = /[^A-Za-z0-9_]/.test(unquoted)
  const sheet = needsQuote ? `'${unquoted}'` : unquoted
  return `${sheet}!${m[2]}`
}

// High-level loader that returns a normalized dataset for our charts
// Expected sheet layout options:
// - Single CSV with headers: year, remuneration, indemnites, dividendes, remboursements
// - API ranges: each range returns rows with a header row we skip
// Charge les KPIs pour les graphiques actuels (structure connue)
export async function loadKpisFromConfig({ force = false } = {}) {
  const mode = env('VITE_SHEETS_MODE', 'api') // 'backend' | 'api' | 'csv'
  const ttl = Number(env('VITE_SHEETS_CACHE_TTL_MS', '300000')) || 0

  if (mode === 'backend') {
    const backendUrl = env('VITE_BACKEND_URL', 'http://localhost:3001')
    const a1 = env('VITE_SHEETS_RANGES', 'A1:Z100')
    const range = sanitizeRange(`'Rémunération annuelle'!${a1}`)
    const cacheKey = `sheets:backend:${range}`
    const cached = !force && ttl > 0 && typeof window !== 'undefined' ? window.localStorage.getItem(cacheKey) : null
    if (cached) {
      try {
        const obj = JSON.parse(cached)
        if (obj && obj.t && (!ttl || Date.now() - obj.t < ttl)) {
          const table = obj.values || []
          return normalizeTable(table)
        }
      } catch {}
    }
    const url = new URL(`${backendUrl}/sheets/values`)
    url.searchParams.set('range', range)
    const data = await fetchJSON(url.toString())
    const table = data?.values || []
    if (typeof window !== 'undefined' && ttl > 0) {
      try { window.localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), values: table })) } catch {}
    }
    return normalizeTable(table)
  }

  if (mode === 'api') {
    const spreadsheetId = env('VITE_SHEETS_ID')
    const apiKey = env('VITE_SHEETS_API_KEY')
    // Utilise une seule plage A1 (par défaut A1:Z100) appliquée à l'onglet
    // "Rémunération annuelle" pour le graphe RBE.
    const a1 = sanitizeRange(env('VITE_SHEETS_RANGES', 'A1:Z100'))
    const ranges = [`'Rémunération annuelle'!${a1}`]
    // silent in production; no console logging of env/ranges
    // Try cache first
    const cacheKey = `sheets:${spreadsheetId}:${ranges.join('|')}`
    const cached = !force && ttl > 0 && typeof window !== 'undefined' ? window.localStorage.getItem(cacheKey) : null
    if (cached) {
      try {
        const obj = JSON.parse(cached)
        if (obj && obj.t && (!ttl || Date.now() - obj.t < ttl)) {
          const table = obj.values || []
          return normalizeTable(table)
        }
      } catch {}
    }
    const valueRanges = await fetchFromSheetsAPI({ spreadsheetId, apiKey, ranges })
    // Take the first range as a table with headers A:E
    const table = valueRanges?.[0]?.values || []
    // Save to cache
    if (typeof window !== 'undefined' && ttl > 0) {
      try { window.localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), values: table })) } catch {}
    }
    return normalizeTable(table)
  }

  if (mode === 'csv') {
    const csvUrl = env('VITE_SHEETS_CSV_URL')
    const cacheKey = `sheets:csv:${csvUrl}`
    const cached = !force && ttl > 0 && typeof window !== 'undefined' ? window.localStorage.getItem(cacheKey) : null
    if (cached) {
      try {
        const obj = JSON.parse(cached)
        if (obj && obj.t && (!ttl || Date.now() - obj.t < ttl)) {
          const rows = obj.values || []
          return normalizeTable(rows)
        }
      } catch {}
    }
    const rows = await fetchFromCSV({ csvUrl })
    if (typeof window !== 'undefined' && ttl > 0) {
      try { window.localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), values: rows })) } catch {}
    }
    return normalizeTable(rows)
  }

  // No fallback: return empty dataset so charts show "no data"
  return { years: [], remuneration: [], indemnites: [], dividendes: [], remboursements: [] }
}

export function toNumber(v) {
  const s = (v ?? '').toString().trim()
  if (!s) return 0
  // Keep digits, comma, dot, minus. Drop currency symbols and text.
  const cleaned = s.replace(/[^0-9,.-]/g, '').replace(/,/g, '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function cleanHeaderCell(s){
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
}

function findColumn(header, candidates) {
  const idx = header.findIndex((c) => candidates.some((k) => c.includes(k)))
  return idx
}

export function normalizeTable(rows) {
  if (!rows?.length) return { years: [], remuneration: [], indemnites: [], dividendes: [], remboursements: [] }
  // Detect header row
  const [h, ...body] = rows
  const header = h.map(cleanHeaderCell)
  // Expected columns by substring matching (accent-insensitive)
  const cYear = header.findIndex((c) => c.includes('annee') || c.includes('year') || c.includes('date'))
  const cRem = header.findIndex((c) => c.includes('remuneration') || c.includes('salaire') || c.includes('pay'))
  const cInd = header.findIndex((c) => c.includes('indem') || c.includes('km'))
  const cDiv = header.findIndex((c) => c.includes('divid'))
  const cRemB = header.findIndex((c) => c.includes('remb') || c.includes('frais'))
  const cLoyer = header.findIndex((c) => c.includes('loyer') || c.includes('location') || c.includes('rent'))

  // Aggregate by year to avoid duplicates
  const byYear = new Map()
  for (const row of body) {
    const yRaw = row[cYear]
    const yStr = (yRaw ?? '').toString().trim()
    if (!yStr) continue
    const key = yStr
    const cur = byYear.get(key) || { remuneration: 0, indemnites: 0, dividendes: 0, remboursements: 0 }
    cur.remuneration += toNumber(row[cRem])
    cur.indemnites += toNumber(row[cInd])
    cur.dividendes += toNumber(row[cDiv])
    cur.remboursements += toNumber(row[cRemB])
    byYear.set(key, cur)
  }

  // Sort years ascending numerically when possible
  const years = Array.from(byYear.keys()).sort((a, b) => Number(a) - Number(b))
  const remuneration = years.map((y) => byYear.get(y).remuneration)
  const indemnites = years.map((y) => byYear.get(y).indemnites)
  const dividendes = years.map((y) => byYear.get(y).dividendes)
  const remboursements = years.map((y) => byYear.get(y).remboursements)
  // Loyer (optionnel)
  const loyersRaw = new Map()
  if (cLoyer >= 0) {
    for (const row of body) {
      const yStr = (row[cYear] ?? '').toString().trim(); if (!yStr) continue
      const prev = loyersRaw.get(yStr) || 0
      loyersRaw.set(yStr, prev + toNumber(row[cLoyer]))
    }
  }
  const loyer = years.map((y) => loyersRaw.get(y) || 0)
  return { years, remuneration, indemnites, dividendes, remboursements, loyer }
}

export function totalsFromParts({ remuneration = [], indemnites = [], dividendes = [], remboursements = [] }) {
  const len = Math.max(remuneration.length, indemnites.length, dividendes.length, remboursements.length)
  const totals = new Array(len).fill(0).map((_, i) =>
    (remuneration[i] || 0) + (indemnites[i] || 0) + (dividendes[i] || 0) + (remboursements[i] || 0)
  )
  return totals
}

export function clearSheetsCache() {
  if (typeof window === 'undefined') return
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('sheets:')) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {}
}

// Supprime uniquement le cache pour une plage A1 spécifique (table + cooldown)
export function clearTableCache(range) {
  if (typeof window === 'undefined') return
  try {
    const spreadsheetId = env('VITE_SHEETS_ID')
    const r = sanitizeRange(range)
    const base = `sheets:table:${spreadsheetId}:${r}`
    window.localStorage.removeItem(base)
    window.localStorage.removeItem(`${base}:cd`)
  } catch {}
}

// Chargement générique d'une plage A1 (retourne table brute)
export async function loadTableFromRange(range, { force = false } = {}) {
  const r = sanitizeRange(range)
  const ttl = Number(env('VITE_SHEETS_CACHE_TTL_MS', '300000')) || 0
  const mode = env('VITE_SHEETS_MODE', 'api')
  const cacheScope = mode === 'backend' ? 'backend' : (env('VITE_SHEETS_ID') || 'api')
  const cacheKey = `sheets:table:${cacheScope}:${r}`
  const cooldownKey = `${cacheKey}:cd`
  if (!force && ttl > 0 && typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const obj = JSON.parse(cached)
        if (obj && obj.t && (!ttl || Date.now() - obj.t < ttl)) return obj.table
      } catch {}
    }
    const cd = window.localStorage.getItem(cooldownKey)
    if (cd && Date.now() < Number(cd)) {
      return { header: [], headerNorm: [], rows: [] }
    }
  }
  let values
  try {
    if (mode === 'backend') {
      const backendUrl = env('VITE_BACKEND_URL', 'http://localhost:3001')
      const url = new URL(`${backendUrl}/sheets/values`)
      url.searchParams.set('range', r)
      const data = await fetchJSON(url.toString())
      values = data?.values || []
    } else {
      const spreadsheetId = env('VITE_SHEETS_ID')
      const apiKey = env('VITE_SHEETS_API_KEY')
      const valueRanges = await fetchFromSheetsAPI({ spreadsheetId, apiKey, ranges: [r] })
      values = valueRanges?.[0]?.values || []
    }
  } catch (e) {
    if (typeof window !== 'undefined' && String(e?.message || '').includes('HTTP 429')) {
      try { window.localStorage.setItem(cooldownKey, String(Date.now() + 30000)) } catch {}
    }
    throw e
  }
  const table = {
    header: (values[0] || []).map((c) => (c ?? '')),
    headerNorm: (values[0] || []).map((c) => cleanHeaderCell(c)),
    rows: values.slice(1),
  }
  if (typeof window !== 'undefined' && ttl > 0) {
    try { window.localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), table })) } catch {}
  }
  return table
}
