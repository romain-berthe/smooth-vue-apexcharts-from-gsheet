<template>
  <div :id="id" class="particles-bg"></div>
  <!-- tsParticles will attach a canvas inside this div -->
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { tsParticles } from '@tsparticles/engine'
import { loadSlim } from '@tsparticles/slim'
import { loadStarsPreset } from '@tsparticles/preset-stars'

const props = defineProps({
  id: { type: String, default: 'login-bg' },
  options: { type: Object, default: () => ({}) },
})

let container = null

onMounted(async () => {
  try {
    // Load v3 engine + stars preset
    await loadSlim(tsParticles)
    await loadStarsPreset(tsParticles)
    // Use v3 signature: load({ id, options })
    container = await tsParticles.load({ id: props.id, options: props.options })
    // expose for debug (dev only)
    if (import.meta.env && import.meta.env.DEV) {
      window.__tsp_container = container
      // eslint-disable-next-line no-console
      console.log('[particles] container created, particles=', container?.particles?.count)
    }
    // ensure starts
    container?.play?.()
    // eslint-disable-next-line no-console
    console.log('[particles] programmatic load ok:', container?.id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[particles] programmatic init error', e)
  }
})

onBeforeUnmount(() => {
  try { container?.destroy?.() } catch {}
})
</script>

<style scoped>
.particles-bg{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
/* DEBUG: visualize area; comment out after validation */
/* .particles-bg{ outline: 1px dashed rgba(96,165,250,.35) } */
</style>
