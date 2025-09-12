import { createApp } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import Particles from '@tsparticles/vue3'
import { loadSlim } from '@tsparticles/slim'
import { loadStarsPreset } from '@tsparticles/preset-stars'
import App from './App.vue'
import './style.css'

if (import.meta.env.DEV) console.log('[app] boot: registering plugins')
createApp(App)
  .use(VueApexCharts)
  .use(Particles, {
    init: async (engine) => {
      if (import.meta.env.DEV) console.log('[particles] init hook called')
      await loadSlim(engine)
      await loadStarsPreset(engine)
      window.__tsp_engine = engine
      if (import.meta.env.DEV) console.log('[particles] slim+stars preset loaded')
    },
  })
  .mount('#app')
