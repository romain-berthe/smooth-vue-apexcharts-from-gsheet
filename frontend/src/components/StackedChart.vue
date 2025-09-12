<!--
  Graphique empilé par catégories (ApexCharts)
  - Lit les données via le composable KPIs (Google Sheets)
  - Affiche un label "total" au sommet de chaque barre
-->
<template>
  <apexchart type="bar" :height="height" :options="options" :series="series" />
  <button class="refresh-btn" :disabled="loading" @click="onRefresh" :aria-busy="loading" title="Rafraîchir les données">
    <span v-if="!loading">⟳</span>
    <span v-else class="spinner" />
  </button>
</template>

<script setup>
// Données réactives et actions exposées par useKpis
import { computed, onMounted } from 'vue'
import { useKpis, loadKpis, refreshKpis } from '../data/kpis'
const props = defineProps({ height: { type: [Number, String], default: 420 } })

const { years, remuneration, indemnites, dividendes, remboursements, loyer, loading } = useKpis()
onMounted(() => { loadKpis() })

function onRefresh(){ refreshKpis() }

// Séries empilées pour ApexCharts
const series = computed(() => ([
  { name: 'Rémunération', data: remuneration.value || [] },
  { name: 'Indemnités km', data: indemnites.value || [] },
  { name: 'Dividendes', data: dividendes.value || [] },
  { name: 'Remb. frais', data: remboursements.value || [] },
  { name: 'Loyer', data: loyer.value || [] },
]))

// Formateur € français
const euro = v => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(v)

const options = computed(() => ({
  chart: {
    type: 'bar',
    stacked: true,
    toolbar: { show: false },
    foreColor: '#cbd5e1',
  },
  // Texte affiché si aucune donnée
  noData: {
    text: 'Aucune donnée à afficher',
    align: 'center',
    verticalAlign: 'middle',
    style: { color: '#94a3b8', fontSize: '14px', fontWeight: 600 }
  },
  colors: ['#008FFB', '#00E396', '#FEB019', '#FF4560', '#775DD0'],
  xaxis: {
    categories: years.value || [],
    labels: { style: { colors: '#cbd5e1' } },
    title: { text: 'Année', style: { color: '#cbd5e1' } },
  },
  yaxis: {
    labels: { formatter: euro, style: { colors: '#cbd5e1' } },
    title: { text: '€', style: { color: '#cbd5e1' } },
  },
  legend: { position: 'right', labels: { colors: '#cbd5e1' }, inverseOrder: true },
  dataLabels: {
    enabled: true,
    formatter: (val) => (val > 0 ? euro(val) : ''),
    style: { colors: ['#fff'], fontSize: '12px', fontWeight: 700 }
  },
  plotOptions: {
    bar: {
      horizontal: false,
      columnWidth: '55%',
      borderRadius: 10,
      borderRadiusApplication: 'end',
      borderRadiusWhenStacked: 'last',
      dataLabels: {
        total: {
          enabled: true,
          style: { color: '#fff', fontSize: '13px', fontWeight: 800 },
          // ApexCharts fournit le total en premier argument → on le formate
          formatter: (total /* number */) => euro(total)
        }
      }
    }
  },
  grid: { borderColor: 'rgba(255,255,255,0.08)' },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '14px' },
    y: { formatter: euro }
  },
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
