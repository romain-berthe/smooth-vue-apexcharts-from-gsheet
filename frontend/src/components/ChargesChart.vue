<template>
  <apexchart type="bar" :height="height" :options="options" :series="series" />
  <button class="refresh-btn" :disabled="loading" @click="onRefresh" :aria-busy="loading" title="Rafraîchir les données">
    <span v-if="!loading">⟳</span>
    <span v-else class="spinner" />
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSheetTable } from '../data/useSheetTable'

const props = defineProps({ height: { type: [Number, String], default: 420 } })

// Utilise une plage A1 unique (VITE_SHEETS_RANGES) appliquée à l'onglet Synthèse
const a1 = import.meta.env.VITE_SHEETS_RANGES || 'A1:Z200'
const range = ref(`'Synthèse bilans'!${a1}`)
const { headerNorm, rows, loading, refresh } = useSheetTable(range)
function onRefresh(){ if (!loading.value) refresh() }

const euro = v => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(v)
const norm = s => (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
function toNumber(v){
  const s = (v ?? '').toString().trim()
  if (!s) return 0
  const cleaned = s.replace(/[^0-9,.-]/g,'').replace(/,/g,'.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Recherche stricte par intitulé d'entête (après normalisation)
function colEquals(label){
  const target = norm(label)
  return headerNorm.value.findIndex(h => h === target)
}

const colYearIdx = computed(() => headerNorm.value.findIndex(h => h.includes('annee') || h.includes('year') || h.includes('date')))

// mapping accepte soit une seule colonne via "label",
// soit plusieurs colonnes à sommer via "labels".
const mapping = [
  { key: 'autres_achats', label: 'Autres achats et charges externes', color: '#F59E0B' },
  { key: 'charges_sociales', label: 'Charges sociales', color: '#6366F1' },
  { key: 'dotations', label: 'Dotations aux amortissements et dépréciations', color: '#EAB308' },
  // Nouvelle séparation des cotisations
  { key: 'cotisations_obligatoires', labels: ['Cotisations sociales TNS', 'CSG déductible', 'Cotisations'], display: 'Cotisations obligatoires', color: '#EF4444' },
  { key: 'cotisations_facultatives', label: 'Cotisations facultatives TNS', display: 'Cotisations facultatives', color: '#EF4444' },
  { key: 'impots_taxes', label: 'Impôts, taxes et versements assimilés', color: '#6366F1' },
  { key: 'autres_charges', label: 'Autres charges', color: '#F97316' },
  { key: 'remu_tns', label: 'Rémunération TNS', color: '#3B82F6' },
]

// Palette alignée sur le 1er chart (bleu, vert, orange, rouge), répétée si besoin
const palette = computed(() => {
  const base = ['#008FFB', '#00E396', '#FEB019', '#FF4560']
  return Array.from({ length: mapping.length }, (_, i) => base[i % base.length])
})

// Deux catégories par année: "Produits AAAA" et "Charges AAAA" (dans cet ordre)
const xCategories = computed(() => {
  const yIdx = colYearIdx.value
  if (yIdx < 0 || rows.value.length === 0) return []
  const set = new Set()
  for (const r of rows.value){ const y = (r[yIdx] ?? '').toString().trim(); if (y) set.add(y) }
  const years = Array.from(set.keys()).sort((a,b) => Number(a) - Number(b))
  const cats = []
  for (const y of years){ cats.push(`Produits ${y}`, `Charges ${y}`) }
  return cats
})

const series = computed(() => {
  const yIdx = colYearIdx.value
  const cats = xCategories.value
  if (yIdx < 0 || rows.value.length === 0 || cats.length === 0) return []

  const idxs = mapping.map(m => ({
    m,
    idx: Array.isArray(m.labels)
      ? m.labels.map(colEquals)
      : [colEquals(m.label)],
  }))
  // Colonne "Total des produits d'exploitation" (nom approché, insensible accents)
  const colProdTotalIdx = headerNorm.value.findIndex(h => h.includes('total') && (h.includes('produit') || h.includes('produits') || h.includes('produ')) && (h.includes('exploitation') || h.includes('exploit')))
  // Construire base années triées pour indexer pIndex/cIndex
  const yearsSorted = []
  for (let i = 0; i < cats.length; i += 2){ const label = cats[i]; const y = String(label).replace(/^Produits\s+/,''); yearsSorted.push(y) }
  const byYear = new Map(yearsSorted.map(y => [y, Object.fromEntries(mapping.map(m => [m.key, 0]))]))
  const produitsByYear = new Map(yearsSorted.map(y => [y, 0]))
  for (const r of rows.value){
    const y = (r[yIdx] ?? '').toString().trim()
    if (!y || !byYear.has(y)) continue
    const cur = byYear.get(y)
    for (const {m, idx} of idxs){
      const sum = idx.reduce((acc, i) => acc + toNumber(r[i]), 0)
      cur[m.key] += sum
    }
    if (colProdTotalIdx >= 0) {
      produitsByYear.set(y, (produitsByYear.get(y) || 0) + toNumber(r[colProdTotalIdx]))
    }
  }
  // Initialiser tableaux data de longueur cats
  const zeroArray = () => Array(cats.length).fill(0)
  // Charges empilées uniquement sur la position "Charges AAAA" (index impair)
  const chargesSeries = mapping.map((m) => {
    const data = zeroArray()
    yearsSorted.forEach((y, i) => { const idx = i*2 + 1; data[idx] = byYear.get(y)[m.key] })
    const name = m.display || m.label
    return { name, data, stack: 'charges', color: m.color }
  })
  // Produits uniquement sur la position "Produits AAAA" (index pair)
  const produitsSeries = (colProdTotalIdx >= 0) ? (() => {
    const data = zeroArray()
    yearsSorted.forEach((y, i) => { const idx = i*2; data[idx] = produitsByYear.get(y) || 0 })
    return [{ name: "Total des produits d'exploitation", data, stack: 'produits', color: '#00E396' }]
  })() : []
  return [...chargesSeries, ...produitsSeries]
})

const options = computed(() => ({
  chart: { type: 'bar', stacked: true, toolbar: { show: false }, foreColor: '#cbd5e1' },
  noData: { text: 'Aucune donnée à afficher', align: 'center', verticalAlign: 'middle', style: { color: '#94a3b8', fontSize: '14px', fontWeight: 600 } },
  // Palette par défaut (les séries de charges définissent déjà leur couleur)
  colors: palette.value,
  xaxis: { categories: xCategories.value, labels: { style: { colors: '#cbd5e1' } }, title: { text: 'Année', style: { color: '#cbd5e1' } } },
  yaxis: { labels: { formatter: euro, style: { colors: '#cbd5e1' } }, title: { text: '€', style: { color: '#cbd5e1' } } },
  legend: {
    position: 'right',
    labels: { colors: '#cbd5e1' },
    // Retour à la ligne uniquement pour "Autres achats et charges externes"
    formatter: (name) => {
      const n = String(name)
      if (/^Autres achats et charges externes$/i.test(n)) return n.replace(/charges\s/i, 'charges\n')
      return n
    },
  },
  dataLabels: { enabled: true, formatter: (val) => (val > 0 ? euro(val) : ''), style: { colors: ['#fff'], fontSize: '12px', fontWeight: 700 } },
  plotOptions: { bar: { horizontal: false, columnWidth: '72%', borderRadius: 10, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last', dataLabels: { total: { enabled: true, style: { color: '#fff', fontSize: '13px', fontWeight: 800 }, formatter: (t) => euro(t) } } } },
  grid: { borderColor: 'rgba(255,255,255,0.08)' },
  tooltip: { theme: 'dark', style: { fontSize: '14px' }, y: { formatter: euro } },
}))
</script>

<style scoped>
 .refresh-btn{ position:absolute; right:14px; bottom:14px; width:36px; height:36px; display:grid; place-items:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; cursor:pointer; backdrop-filter: blur(6px); z-index:1000; pointer-events:auto }
.refresh-btn span{ font-size:20px; line-height:1 }
.refresh-btn:hover{ background:rgba(255,255,255,0.14) }
.refresh-btn[disabled]{ opacity:.7; cursor:default }
.spinner{ width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation: spin .8s linear infinite }
@keyframes spin{ to{ transform: rotate(360deg) } }
:deep(.apexcharts-legend-text){ max-width: 160px; white-space: pre-line; display:inline-block }
</style>
