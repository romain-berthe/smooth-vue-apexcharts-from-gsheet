import { ref } from 'vue'
import { loadKpisFromConfig, totalsFromParts, clearSheetsCache } from './sheets'

// Etat réactif global (singleton) pour partager les données entre composants
const loading = ref(false)
const error = ref('')
const years = ref([])
const remuneration = ref([])
const indemnites = ref([])
const dividendes = ref([])
const remboursements = ref([])
const loyer = ref([])

export async function loadKpis() {
  if (loading.value) return
  // Données déjà présentes en session → on évite une requête inutile
  if ((years.value?.length || 0) > 0) return
  loading.value = true
  error.value = ''
  try {
    const data = await loadKpisFromConfig()
    years.value = data.years || []
    remuneration.value = data.remuneration || []
    indemnites.value = data.indemnites || []
    dividendes.value = data.dividendes || []
    remboursements.value = data.remboursements || []
    loyer.value = data.loyer || []
  } catch (e) {
    console.error(e)
    error.value = e?.message || 'Erreur chargement des données'
  } finally {
    loading.value = false
  }
}

export function useKpis() {
  return {
    loading,
    error,
    years,
    remuneration,
    indemnites,
    dividendes,
    remboursements,
    loyer,
    // Calcul à la volée du total par année
    totals: () => totalsFromParts({ remuneration: remuneration.value, indemnites: indemnites.value, dividendes: dividendes.value, remboursements: remboursements.value }),
  }
}

export async function refreshKpis() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    clearSheetsCache()                  // purge le cache localStorage
    const data = await loadKpisFromConfig({ force: true }) // force le refetch
    years.value = data.years || []
    remuneration.value = data.remuneration || []
    indemnites.value = data.indemnites || []
    dividendes.value = data.dividendes || []
    remboursements.value = data.remboursements || []
    loyer.value = data.loyer || []
  } catch (e) {
    console.error(e)
    error.value = e?.message || 'Erreur rechargement des données'
  } finally {
    loading.value = false
  }
}
