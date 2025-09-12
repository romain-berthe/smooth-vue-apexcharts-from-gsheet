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

// Utilise une plage A1 unique définie par VITE_SHEETS_RANGES (ex: A1:Z200)
// appliquée à l'onglet spécifique de la feuille.
const a1 = import.meta.env.VITE_SHEETS_RANGES || 'A1:Z200'
const range = ref(`'Détail des frais'!${a1}`)
const { header, headerNorm, rows, loading, refresh } = useSheetTable(range)
function onRefresh(){ if (!loading.value) refresh() }

const euro = v => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(v)
const toNumber = (v) => {
  const s = (v ?? '').toString().trim(); if (!s) return 0
  const cleaned = s.replace(/[^0-9,.-]/g,'').replace(/,/g,'.')
  const n = Number(cleaned); return Number.isFinite(n) ? n : 0
}

// Index de colonne Année
const colYearIdx = computed(() => headerNorm.value.findIndex(h => h.includes('annee') || h.includes('year') || h.includes('date')))

// Catégories dynamiques = toutes les colonnes numériques hors année/total
const categoryCols = computed(() => {
  const yi = colYearIdx.value
  if (headerNorm.value.length === 0) return []
  const cols = []
  for (let i = 0; i < headerNorm.value.length; i++){
    if (i === yi) continue
    const h = headerNorm.value[i]
    if (!h || h.includes('total')) continue
    // Exclure explicitement la colonne "Restaurants"
    if (h.includes('restaurant') || h.includes('restaurants') || h.includes('restau')) continue
    cols.push({ idx: i, label: header.value[i] || `Col ${i}` })
  }
  return cols
})

// Années (une fois chacune, triées)
const xCategories = computed(() => {
  const yi = colYearIdx.value
  if (yi < 0 || rows.value.length === 0) return []
  const set = new Set()
  for (const r of rows.value){ const y=(r[yi]??'').toString().trim(); if (y) set.add(y) }
  return Array.from(set.keys()).sort((a,b)=>Number(a)-Number(b))
})

// Séries empilées (une par colonne catégorie)
const series = computed(() => {
  const yi = colYearIdx.value
  const years = xCategories.value
  const cols = categoryCols.value
  if (yi < 0 || years.length === 0 || cols.length === 0) return []

  // init sums
  const byYear = new Map(years.map(y => [y, Object.fromEntries(cols.map(c => [c.idx, 0]))]))
  for (const r of rows.value){
    const y = (r[yi]??'').toString().trim(); if (!byYear.has(y)) continue
    const map = byYear.get(y)
    for (const c of cols){ map[c.idx] += toNumber(r[c.idx]) }
  }

  return cols.map((c, i) => ({
    name: c.label,
    data: years.map(y => byYear.get(y)[c.idx])
  }))
})

// Palette alignée sur le 1er chart (boucle sur 4 couleurs)
const colors = computed(() => {
  const base = ['#008FFB', '#00E396', '#FEB019', '#FF4560']
  const n = categoryCols.value.length || 1
  return Array.from({ length: n }, (_, i) => base[i % base.length])
})

const options = computed(() => ({
  chart: { type: 'bar', stacked: true, toolbar: { show: false }, foreColor: '#cbd5e1' },
  noData: { text: 'Aucune donnée à afficher', align: 'center', verticalAlign: 'middle', style: { color: '#94a3b8', fontSize: '14px', fontWeight: 600 } },
  colors: colors.value,
  xaxis: { categories: xCategories.value, labels: { style: { colors: '#cbd5e1' } }, title: { text: 'Année', style: { color: '#cbd5e1' } } },
  yaxis: { labels: { formatter: euro, style: { colors: '#cbd5e1' } }, title: { text: '€', style: { color: '#cbd5e1' } } },
  legend: { position: 'right', labels: { colors: '#cbd5e1' }, inverseOrder: true },
  dataLabels: { enabled: true, formatter: (v) => (v > 0 ? euro(v) : ''), style: { colors: ['#fff'], fontSize: '12px', fontWeight: 700 } },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 10, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last', dataLabels: { total: { enabled: true, style: { color: '#fff', fontSize: '13px', fontWeight: 800 }, formatter: (t) => euro(t) } } } },
  grid: { borderColor: 'rgba(255,255,255,0.08)' },
  tooltip: { theme: 'dark', style: { fontSize: '14px' }, y: { formatter: euro } },
}))
</script>

<style scoped>
.refresh-btn{ position:absolute; right:14px; bottom:14px; width:36px; height:36px; display:grid; place-items:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; cursor:pointer; backdrop-filter: blur(6px); z-index:10 }
.refresh-btn span{ font-size:20px; line-height:1 }
.refresh-btn:hover{ background:rgba(255,255,255,0.14) }
.refresh-btn[disabled]{ opacity:.7; cursor:default }
.spinner{ width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation: spin .8s linear infinite }
@keyframes spin{ to{ transform: rotate(360deg) } }
/* Légende lisible si libellés longs */
:deep(.apexcharts-legend-text){ max-width: 180px; white-space: pre-line; display:inline-block }
</style>
