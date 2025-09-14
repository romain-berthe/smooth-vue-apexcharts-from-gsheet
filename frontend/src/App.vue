<!--
  Page principale de l'appli.
  - Grille en 3 lignes: Header • Contenu • Footer
  - Le contenu contient 2 cartes: titre/navigation et graphique
  - La hauteur du graphique est calculée dynamiquement pour éviter tout scroll
-->
<template>
  <div class="viewport">
    <HeaderBar v-if="isAuthenticated" :user="user" :isAuthenticated="isAuthenticated" @logout="logout" />
    <div class="main" :class="{ 'align-top': isAuthenticated }" ref="mainRef">
      <!-- Background particles applied to the whole main container -->
      <LoginParticles id="bg-stars" :options="particlesOptions" />
      <!-- Authenticated: stack + charts -->
      <div v-if="isAuthenticated" class="stack" ref="stackRef">
        <div class="card" ref="titleRef">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="flex:1; text-align:center;">
              <h1 style="margin-bottom:4px;">{{ current.title }}</h1>
            </div>
          </div>
          <div class="chip-scroller" ref="chipsRowRef">
            <TransitionGroup name="chips" tag="div" class="chip-track">
              <div v-for="(c,i) in chips" :key="c.key" class="chip" :class="{active: i===idx}" @click="selectIdx(i)">
                {{ c.title || 'Vide' }}
              </div>
            </TransitionGroup>
          </div>
        </div>
        <div class="card chart" ref="chartCardRef">
          <component :is="current.component" :height="chartHeight" />
        </div>
      </div>
      <!-- Not authenticated: only the login card centered -->
      <div v-else class="login-host">
        <LoginCard />
      </div>
    </div>
    <div class="footer muted" ref="footerRef">Tous droits réservés © 2025 - Made with ❤️</div>

    <button v-if="isAuthenticated" class="nav-arrow left" @click="prevChart" aria-label="Précédent">◀</button>
    <button v-if="isAuthenticated" class="nav-arrow right" @click="nextChart" aria-label="Suivant">▶</button>
  </div>
</template>

<script setup>
// Vue 3 <script setup>: composition APIs and components
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import HeaderBar from './components/HeaderBar.vue'
import LoginCard from './components/LoginCard.vue'
import StackedChart from './components/StackedChart.vue'
import ChargesChart from './components/ChargesChart.vue'
import FeesDetailChart from './components/FeesDetailChart.vue'
import ProjectionChart from './components/ProjectionChart.vue'
import { useAuth } from './auth/useAuth'
import LoginParticles from './components/LoginParticles.vue'

// Définition des "pages" (composants graphiques) disponibles
const charts = [
  { key: 'charges', title: "Charges d'exploitation", component: ChargesChart },
  { key: 'stack', title: 'Rémunération RBE', component: StackedChart },
  { key: 'fees', title: "Frais généraux", component: FeesDetailChart },
  { key: 'projection', title: 'Projection Holding', component: ProjectionChart },
]
// Index du graphique courant (défaut: Charges d'exploitation)
const idx = ref(0)
// Pointeurs dérivés
const current = computed(() => charts[idx.value] || {})
// Chips: afficher toutes les pages, puce active = idx courant
const chips = computed(() => charts.map((c, i) => ({ key: `c-${i}`, title: c.title })))

// Auth
const { user, isAuthenticated, fetchMe, signOut } = useAuth()
function logout(){ signOut() }

// Charts navigation
function prevChart(){ idx.value = (idx.value - 1 + charts.length) % charts.length }
function nextChart(){ idx.value = (idx.value + 1) % charts.length }
function selectIdx(i){ idx.value = i }

// Center the active chip within the chips row
const chipsRowRef = ref(null)
async function centerActiveChip(){
  await nextTick()
  const row = chipsRowRef.value // scroller DOM
  if (!row || !row.querySelectorAll) return
  const chipsEls = row.querySelectorAll('.chip')
  const container = row
  // Si pas d'overflow, laisser centré via CSS
  if (container.scrollWidth <= container.clientWidth) {
    container.scrollLeft = 0
    return
  }
  // Centrer l'ensemble du contenu dans le viewport (milieu du scroll)
  const target = Math.max(0, Math.round((container.scrollWidth - container.clientWidth)/2))
  container.scrollTo({ left: target, behavior: 'smooth' })
}

// Dynamic height calculation for the chart card (between header and footer)
const titleRef = ref(null)
const stackRef = ref(null)
const chartCardRef = ref(null)
const footerRef = ref(null)
const mainRef = ref(null)
const chartHeight = ref(420)
function recomputeHeight(){
  // Available height = window height - header - footer
  const vh = window.innerHeight || 800
  const headerH = isAuthenticated.value ? (document.querySelector('.topbar')?.offsetHeight || 64) : 0
  const footerH = 48 // footer fixe
  // No bottom margin: the chart card should touch the footer
  const safeBottom = 0
  const available = Math.max(300, vh - headerH - footerH - safeBottom)
  // Constrain the stack container to the available height for proper centering
  if (stackRef.value) {
    stackRef.value.style.height = `${available}px`
  }
  // Read computed styles to subtract paddings/gaps/borders
  const stackEl = stackRef.value
  const stackStyles = stackEl ? getComputedStyle(stackEl) : null
  const paddingTop = stackStyles ? parseFloat(stackStyles.paddingTop) || 0 : 20
  const paddingBottom = stackStyles ? parseFloat(stackStyles.paddingBottom) || 0 : 20
  const gap = stackStyles ? parseFloat(stackStyles.rowGap || stackStyles.gap) || 0 : 16
  const titleH = titleRef.value?.offsetHeight || 96
  const chartEl = chartCardRef.value
  const chartStyles = chartEl ? getComputedStyle(chartEl) : null
  const chartPadTop = chartStyles ? parseFloat(chartStyles.paddingTop) || 0 : 18
  const chartPadBottom = chartStyles ? parseFloat(chartStyles.paddingBottom) || 0 : 18
  const chartBorderTop = chartStyles ? parseFloat(chartStyles.borderTopWidth) || 0 : 1
  const chartBorderBottom = chartStyles ? parseFloat(chartStyles.borderBottomWidth) || 0 : 1
  const reserved = paddingTop + paddingBottom + gap + titleH + chartPadTop + chartPadBottom + chartBorderTop + chartBorderBottom
  // hauteur exacte disponible pour la carte (sans limite haute)
  const h = Math.max(240, Math.floor(available - reserved))
  // On n'écrit que si la valeur change réellement pour éviter les boucles
  if (h !== chartHeight.value) chartHeight.value = h
}
let resizeTimer = null
function onResize(){
  // Debounce de l'événement resize pour éviter les rafales
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => { recomputeHeight() }, 120)
}
// Keyboard navigation (arrow keys) on charts page
function onKeydown(e){
  if (!isAuthenticated.value) return
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''
  if (tag === 'input' || tag === 'textarea') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevChart() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextChart() }
}
// Do not call /auth/me when not authenticated (avoid early 401).
// After login, sync the session server-side in the background.
onMounted(async () => { await nextTick(); recomputeHeight(); centerActiveChip(); window.addEventListener('resize', onResize); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => { if (resizeTimer) clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKeydown) })

// Recompute layout when the current chart changes (title height may vary)
watch(() => idx.value, async () => { await nextTick(); recomputeHeight(); centerActiveChip() })
// Recompute layout when switching from login -> charts
watch(() => isAuthenticated.value, async (v) => {
  if (v) {
    // Après connexion, afficher d'abord "Charges d'exploitation"
    idx.value = 0
    // Synchronise le profil depuis la session serveur sans bloquer l'UI
    fetchMe().catch(() => {})
    await nextTick();
    recomputeHeight();
    centerActiveChip();
  }
})

// tsParticles options — preset "stars" (starry sky). Interactivity kept as-is.
const particlesOptions = {
  background: { color: { value: 'transparent' } },
  fullScreen: { enable: false },
  fpsLimit: 60,
  preset: 'stars',
  interactivity: {
    events: { onHover: { enable: true, mode: 'repulse' }, resize: true },
    modes: { repulse: { distance: 100, duration: 0.4 } },
  },
  detectRetina: true,
}

// Events now handled inside LoginParticles component
</script>

<style scoped>
.main{ position: relative; overflow: hidden }
.chip{border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:999px; color:#cbd5e1; cursor:pointer;}
.chip.active{background: var(--accent); color:#001018; border-color: transparent; font-weight: 800;}
.chip-scroller{ display:flex; justify-content:center; margin-top:10px; overflow:auto; padding: 2px; -webkit-overflow-scrolling: touch;
  mask-image: linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent);
}
.chip-track{ display:flex; gap:10px; width:max-content; }
.chips-enter-active, .chips-leave-active{transition: opacity .2s ease}
.chips-enter-from, .chips-leave-to{opacity:0}
.chips-leave-active{position:absolute; left:50%; transform:translateX(-50%)}

/* Login host should fill available height so footer stays at bottom */
.login-host{ display:grid; place-items:center; width:100%; height: calc(100vh - 48px); }
.login-host{ position:relative; overflow:hidden }
.login-host > *{ position:relative; z-index:1 }

/* Login host centers the login card without outer card; ensure footer sticks to bottom */
.login-host{ display:grid; place-items:center; padding:24px; }

/* canvas particles en fond */
.particles-bg{ position:absolute; inset:0; z-index:0; width:100%; height:100%; pointer-events:none }
/* DEBUG (désactivé): visualiser la surface du canvas */
/* .particles-bg canvas{ outline: 1px dashed rgba(96,165,250,.4) } */

/* Ensure charts content sits above the background */
.stack{ position: relative }
.stack > *{ position: relative; z-index: 1 }
</style>
