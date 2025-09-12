<!-- Graphique simple: total annuel (somme des catégories) -->
<template>
  <apexchart type="bar" :height="height" :options="options" :series="series" />
  <button class="refresh-btn" :disabled="loading" @click="onRefresh" :aria-busy="loading" title="Rafraîchir les données">
    <span v-if="!loading">⟳</span>
    <span v-else class="spinner" />
  </button>
</template>

<script setup>
// Construit la série "total" en additionnant les colonnes sources via le composable KPIs
import { computed, onMounted } from 'vue'
import { useKpis, loadKpis, refreshKpis } from '../data/kpis'
const props = defineProps({ height: { type: [Number, String], default: 420 } })

const { years, remuneration, indemnites, dividendes, remboursements, loading } = useKpis()
onMounted(() => { loadKpis() })

function onRefresh(){ refreshKpis() }

const totals = computed(() => {
  // Longueur maximale parmi les colonnes (tolère des colonnes de tailles différentes)
  const len = Math.max(
    remuneration.value?.length || 0,
    indemnites.value?.length || 0,
    dividendes.value?.length || 0,
    remboursements.value?.length || 0,
  )
  const arr = []
  for (let i = 0; i < len; i++) {
    arr.push(
      (remuneration.value?.[i] || 0) +
      (indemnites.value?.[i] || 0) +
      (dividendes.value?.[i] || 0) +
      (remboursements.value?.[i] || 0)
    )
  }
  return arr
})
const series = computed(() => ([{ name: 'Total annuel', data: totals.value || [] }]))

const euro = v => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(v)

const options = computed(() => ({
  chart: { type: 'bar', stacked: false, toolbar: { show: false }, foreColor: '#cbd5e1' },
  noData: {
    text: 'Aucune donnée à afficher',
    align: 'center',
    verticalAlign: 'middle',
    style: { color: '#94a3b8', fontSize: '14px', fontWeight: 600 }
  },
  colors: ['#008FFB'],
  xaxis: { categories: years.value || [], labels: { style: { colors: '#cbd5e1' } }, title: { text: 'Année', style: { color: '#cbd5e1' } } },
  yaxis: { labels: { formatter: euro, style: { colors: '#cbd5e1' } }, title: { text: '€', style: { color: '#cbd5e1' } } },
  legend: { position: 'right', labels: { colors: '#cbd5e1' } },
  dataLabels: { enabled: true, formatter: (v) => euro(v), style: { colors: ['#fff'], fontSize: '12px', fontWeight: 700 } },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 10, borderRadiusApplication: 'end' } },
  grid: { borderColor: 'rgba(255,255,255,0.08)' },
  tooltip: { theme: 'dark', y: { formatter: euro } },
}))
</script>

 <style scoped>
  .refresh-btn{ position:absolute; right:14px; bottom:14px; width:36px; height:36px; display:grid; place-items:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; cursor:pointer; backdrop-filter: blur(6px); z-index:10 }
  .refresh-btn span{ font-size:20px; line-height:1 }
  .refresh-btn:hover{ background:rgba(255,255,255,0.14) }
  .refresh-btn[disabled]{ opacity:.7; cursor:default }
  .spinner{ width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation: spin .8s linear infinite }
  @keyframes spin{ to{ transform: rotate(360deg) } }
 </style>
