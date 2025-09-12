import { ref, toRef, isRef, watch } from 'vue'
import { loadTableFromRange, clearTableCache, toNumber as toNum, cleanHeaderCell as cleanCell } from './sheets'

export function useSheetTable(range, { autoLoad = true } = {}) {
  const rangeRef = typeof range === 'string' ? ref(range) : (isRef(range) ? range : toRef(range))
  const loading = ref(false)
  const error = ref('')
  const header = ref([])
  const headerNorm = ref([])
  const rows = ref([])

  async function load(force = false){
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      const t = await loadTableFromRange(rangeRef.value)
      header.value = t.header
      headerNorm.value = t.headerNorm
      rows.value = t.rows
    } catch(e){
      console.error(e)
      error.value = e?.message || 'Erreur chargement tableau'
    } finally {
      loading.value = false
    }
  }

  function colIndex(matchers){
    const tests = Array.isArray(matchers) ? matchers : [matchers]
    return headerNorm.value.findIndex(h => tests.some(m => m instanceof RegExp ? m.test(h) : h.includes(String(m).toLowerCase())))
  }

  function column(matchers, asNumber=false){
    const i = colIndex(matchers)
    if (i < 0) return []
    return rows.value.map(r => asNumber ? toNum(r[i]) : r[i])
  }

  async function refresh(){
    clearTableCache(rangeRef.value)
    await load(true)
  }

  if (autoLoad) {
    watch(() => rangeRef.value, (val) => { if (val) load(false) }, { immediate: true })
  }

  return { loading, error, header, headerNorm, rows, load, refresh, colIndex, column }
}
