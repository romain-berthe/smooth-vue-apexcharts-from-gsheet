<template>
  <apexchart type="bar" :height="height" :options="options" :series="series" />
  <button class="refresh-btn" :disabled="loadingAny" @click="onRefresh" :aria-busy="loadingAny" title="Rafraîchir les données">
    <span v-if="!loadingAny">⟳</span>
    <span v-else class="spinner" />
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useKpis, loadKpis, refreshKpis } from '../data/kpis'
import { useSheetTable } from '../data/useSheetTable'

const props = defineProps({ height: { type: [Number, String], default: 420 } })

// Source 1: RBE (rémunération + indemnités + dividendes + remb. frais + loyer)
const { years: yearsRbe, remuneration, indemnites, dividendes, remboursements, loyer, loading: loadingRbe } = useKpis()
loadKpis()

const rbeTotals = computed(() => {
  const len = Math.max(
    remuneration.value?.length || 0,
    indemnites.value?.length || 0,
    dividendes.value?.length || 0,
    remboursements.value?.length || 0,
    loyer.value?.length || 0,
  )
  const out = []
  for (let i=0;i<len;i++){
    out.push((remuneration.value?.[i]||0)+(indemnites.value?.[i]||0)+(dividendes.value?.[i]||0)+(remboursements.value?.[i]||0)+(loyer.value?.[i]||0))
  }
  return out
})

// Source 2: applique la même plage A1 à l'onglet "Détail des frais"
const a1 = import.meta.env.VITE_SHEETS_RANGES || 'A1:Z200'
const feesRange = ref(`'Détail des frais'!${a1}`)
const { header, headerNorm, rows, loading: loadingFees, refresh: refreshFees } = useSheetTable(feesRange)

// Fallback: feuille "Synthèse bilans" pour la colonne "Cotisations" si absente dans Détail des frais
const synthRange = ref(`'Synthèse bilans'!${a1}`)
const { headerNorm: headerSynth, rows: rowsSynth } = useSheetTable(synthRange)

const colYearIdx = computed(() => headerNorm.value.findIndex(h => h.includes('annee') || h.includes('year') || h.includes('date')))
const feeCategoryIdxs = computed(() => {
  const yi = colYearIdx.value
  const idxs = []
  for (let i=0;i<headerNorm.value.length;i++){
    if (i===yi) continue
    const h = headerNorm.value[i]
    if (!h) continue
    if (h.includes('total')) continue
    if (h.includes('restaurant') || h.includes('restaurants') || h.includes('restau')) continue
    if (h.includes('cotis') || h.includes('csg')) continue
    idxs.push(i)
  }
  return idxs
})

const yearsFees = computed(() => {
  const yi = colYearIdx.value
  const set = new Set()
  for (const r of rows.value){ const y=(r[yi]??'').toString().trim(); if (y) set.add(y) }
  return Array.from(set.keys()).sort((a,b)=>Number(a)-Number(b))
})

const feesTotals = computed(() => {
  const yi = colYearIdx.value
  const idxs = feeCategoryIdxs.value
  const years = yearsFees.value
  const map = new Map(years.map(y=>[y,0]))
  for (const r of rows.value){
    const y = (r[yi]??'').toString().trim(); if(!map.has(y)) continue
    let s = map.get(y)||0
    for (const i of idxs){ const v = (r[i]??''); const n = Number(String(v).replace(/[^0-9,.-]/g,'').replace(/,/g,'.')) || 0; s += n }
    map.set(y,s)
  }
  return years.map(y => map.get(y)||0)
})

// Totaux spécifiques pour les colonnes de cotisations (si présentes) dans "Détail des frais"
const colCotSocIdxFees = computed(() => headerNorm.value.findIndex(h => h === 'cotisations sociales tns' || (h.includes('cotis') && h.includes('social'))))
const colCotFacIdxFees = computed(() => headerNorm.value.findIndex(h => h === 'cotisations facultatives tns' || (h.includes('cotis') && h.includes('facult'))))
const colCSGIdxFees    = computed(() => headerNorm.value.findIndex(h => h === 'csg deductible' || h.includes('csg')))

function totalsForSingleCol(rowsSrc, yearsSrc, yi, colIdx){
  const years = yearsSrc
  if (yi < 0 || colIdx < 0 || years.length === 0) return []
  const map = new Map(years.map(y=>[y,0]))
  for (const r of rowsSrc){
    const y = (r[yi]??'').toString().trim(); if(!map.has(y)) continue
    const v = (r[colIdx] ?? '')
    const n = Number(String(v).replace(/[^0-9,.-]/g,'').replace(/,/g,'.')) || 0
    map.set(y, (map.get(y) || 0) + n)
  }
  return years.map(y => map.get(y) || 0)
}

const cotSocTotalsFees = computed(() => totalsForSingleCol(rows.value, yearsFees.value, colYearIdx.value, colCotSocIdxFees.value))
const cotFacTotalsFees = computed(() => totalsForSingleCol(rows.value, yearsFees.value, colYearIdx.value, colCotFacIdxFees.value))
const csgTotalsFees    = computed(() => totalsForSingleCol(rows.value, yearsFees.value, colYearIdx.value, colCSGIdxFees.value))

const cotisationsTotalsFees = computed(() => { // compat: ancienne unique colonne
  const yi = colYearIdx.value
  const ci = headerNorm.value.findIndex(h => h.includes('cotis'))
  const years = yearsFees.value
  if (yi < 0 || ci < 0 || years.length === 0) return []
  const map = new Map(years.map(y=>[y,0]))
  for (const r of rows.value){
    const y = (r[yi]??'').toString().trim(); if(!map.has(y)) continue
    const v = (r[ci] ?? '')
    const n = Number(String(v).replace(/[^0-9,.-]/g,'').replace(/,/g,'.')) || 0
    map.set(y, (map.get(y) || 0) + n)
  }
  return years.map(y => map.get(y) || 0)
})

// Fallback depuis "Synthèse bilans"
const colYearIdxSynth = computed(() => headerSynth.value.findIndex(h => h.includes('annee') || h.includes('year') || h.includes('date')))
const colCotSocIdxSynth = computed(() => headerSynth.value.findIndex(h => h === 'cotisations sociales tns' || (h.includes('cotis') && h.includes('social'))))
const colCotFacIdxSynth = computed(() => headerSynth.value.findIndex(h => h === 'cotisations facultatives tns' || (h.includes('cotis') && h.includes('facult'))))
const colCSGIdxSynth    = computed(() => headerSynth.value.findIndex(h => h === 'csg deductible' || h.includes('csg')))
const colCotisationsIdxSynth = computed(() => headerSynth.value.findIndex(h => h === 'cotisations' || h.includes('cotis')))
const yearsSynth = computed(() => {
  const yi = colYearIdxSynth.value
  const set = new Set()
  for (const r of rowsSynth.value){ const y=(r[yi]??'').toString().trim(); if (y) set.add(y) }
  return Array.from(set.keys()).sort((a,b)=>Number(a)-Number(b))
})
const cotSocTotalsSynth = computed(() => totalsForSingleCol(rowsSynth.value, yearsSynth.value, colYearIdxSynth.value, colCotSocIdxSynth.value))
const cotFacTotalsSynth = computed(() => totalsForSingleCol(rowsSynth.value, yearsSynth.value, colYearIdxSynth.value, colCotFacIdxSynth.value))
const csgTotalsSynth    = computed(() => totalsForSingleCol(rowsSynth.value, yearsSynth.value, colYearIdxSynth.value, colCSGIdxSynth.value))

const cotisationsTotalsSynth = computed(() => { // compat: ancienne unique colonne
  const yi = colYearIdxSynth.value
  const ci = colCotisationsIdxSynth.value
  const years = yearsSynth.value
  if (yi < 0 || ci < 0 || years.length === 0) return []
  const map = new Map(years.map(y=>[y,0]))
  for (const r of rowsSynth.value){
    const y = (r[yi]??'').toString().trim(); if(!map.has(y)) continue
    const n = Number(String(r[ci] ?? '').replace(/[^0-9,.-]/g,'').replace(/,/g,'.')) || 0
    map.set(y, (map.get(y) || 0) + n)
  }
  return years.map(y => map.get(y) || 0)
})

// Sélectionne la meilleure source (frais puis synthèse) pour chaque sous-catégorie
const cotSocTotals = computed(() => {
  const fees = cotSocTotalsFees.value
  const has = Array.isArray(fees) && fees.some(v => (v||0) !== 0)
  return has ? fees : cotSocTotalsSynth.value
})
const cotFacTotals = computed(() => {
  const fees = cotFacTotalsFees.value
  const has = Array.isArray(fees) && fees.some(v => (v||0) !== 0)
  return has ? fees : cotFacTotalsSynth.value
})
const csgTotals = computed(() => {
  const fees = csgTotalsFees.value
  const has = Array.isArray(fees) && fees.some(v => (v||0) !== 0)
  return has ? fees : csgTotalsSynth.value
})

// Compatibilité: si aucune des nouvelles colonnes n'existe mais une ancienne colonne "Cotisations" existe,
// on l'assigne aux obligatoires et on laisse facultatives à 0 pour ne pas casser le graphe.
const legacyCotisations = computed(() => {
  const fromFees = cotisationsTotalsFees.value
  const hasFees = Array.isArray(fromFees) && fromFees.some(v => (v||0) !== 0)
  return hasFees ? fromFees : cotisationsTotalsSynth.value
})

const cotObligTotals = computed(() => {
  const hasNew = [cotSocTotals.value, csgTotals.value].some(arr => Array.isArray(arr) && arr.length && arr.some(v => (v||0) !== 0))
  if (hasNew){
    const a = cotSocTotals.value || []
    const b = csgTotals.value || []
    const len = Math.max(a.length, b.length)
    const out = []
    for (let i=0;i<len;i++) out.push((a[i]||0)+(b[i]||0))
    return out
  }
  return legacyCotisations.value // ancienne unique colonne
})

const cotFacTotalsAll = computed(() => {
  const arr = cotFacTotals.value
  const has = Array.isArray(arr) && arr.some(v => (v||0) !== 0)
  return has ? arr : Array.from({ length: (yearsFees.value.length ? yearsFees.value.length : yearsSynth.value.length) }, () => 0)
})

// Fusion des années des 2 sources
const yearsAll = computed(() => {
  const set = new Set([...(yearsRbe.value||[]).map(String), ...(yearsFees.value||[])])
  return Array.from(set.values()).sort((a,b)=>Number(a)-Number(b))
})

// Aligner les séries sur yearsAll
function align(values, yearsSrc){
  const map = new Map((yearsSrc||[]).map((y,i)=>[String(y), values?.[i]||0]))
  return yearsAll.value.map(y => map.get(String(y)) || 0)
}

const series = computed(() => ([
  { name: 'Rémunération RBE', data: align(rbeTotals.value, yearsRbe.value), color: '#3B82F6' },
  { name: 'Frais généraux', data: align(feesTotals.value, yearsFees.value), color: '#F59E0B' },
  { name: 'Cotisations obligatoires', data: align(cotObligTotals.value, yearsFees.value.length ? yearsFees.value : yearsSynth.value), color: '#EF4444' },
  // Cotisations facultatives retirées de la balance
]))

const euro = v => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(v)
const options = computed(() => ({
  chart: { type: 'bar', stacked: true, toolbar: { show: false }, foreColor: '#cbd5e1' },
  colors: ['#3B82F6', '#F59E0B', '#EF4444'],
  noData: { text: 'Aucune donnée à afficher', align: 'center', verticalAlign: 'middle', style: { color: '#94a3b8', fontSize: '14px', fontWeight: 600 } },
  xaxis: { categories: yearsAll.value, labels: { style: { colors: '#cbd5e1' } }, title: { text: 'Année', style: { color: '#cbd5e1' } } },
  yaxis: { labels: { formatter: euro, style: { colors: '#cbd5e1' } }, title: { text: '€', style: { color: '#cbd5e1' } } },
  legend: { position: 'right', labels: { colors: '#cbd5e1' }, inverseOrder: false },
  dataLabels: { enabled: true, formatter: (v) => (v > 0 ? euro(v) : ''), style: { colors: ['#fff'], fontSize: '12px', fontWeight: 700 } },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 10, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last', dataLabels: { total: { enabled: true, style: { color: '#fff', fontSize: '13px', fontWeight: 800 }, formatter: (t) => euro(t) } } } },
  grid: { borderColor: 'rgba(255,255,255,0.08)' },
  tooltip: { theme: 'dark', style: { fontSize: '14px' }, y: { formatter: euro } },
}))

const loadingAny = computed(() => loadingRbe.value || loadingFees.value)
function onRefresh(){ if (!loadingAny.value) { refreshKpis(); refreshFees() } }
</script>

<style scoped>
.refresh-btn{ position:absolute; right:14px; bottom:14px; width:36px; height:36px; display:grid; place-items:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; cursor:pointer; backdrop-filter: blur(6px); z-index:10 }
.refresh-btn span{ font-size:20px; line-height:1 }
.refresh-btn:hover{ background:rgba(255,255,255,0.14) }
.refresh-btn[disabled]{ opacity:.7; cursor:default }
.spinner{ width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation: spin .8s linear infinite }
@keyframes spin{ to{ transform: rotate(360deg) } }
</style>
