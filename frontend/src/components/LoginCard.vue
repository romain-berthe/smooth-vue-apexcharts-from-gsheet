<template>
  <div class="login-wrap">
    <div class="card login-card">
      <h2>Connexion</h2>
      <p class="muted" style="margin-top:4px">Accédez à votre dashboard avec Google</p>
      <div ref="btnRef" class="google-btn"></div>
      <button
        v-if="!canUseGoogle"
        class="fallback-btn"
        @click="onFallbackClick"
        title="Se connecter avec Google"
      >
        Se connecter avec Google
      </button>
      <div v-if="authError" class="error">{{ authError }}</div>

      <div v-if="debug" class="debug">
        <div><b>Origin:</b> {{ origin }}</div>
        <div><b>ClientID:</b> {{ clientIdMasked }}</div>
        <div><b>Backend:</b> {{ backendUrl }}</div>
        <div><b>canUseGoogle:</b> {{ String(canUseGoogle) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../auth/useAuth'

const { initGoogle, renderGoogleButton, tryInteractiveLogin, authError, canUseGoogle } = useAuth()
const debug = ref(new URLSearchParams(window.location.search).get('debug') === '1')
const origin = window.location.origin
const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const clientIdMasked = clientId ? clientId.slice(0, 8) + '…' : '(absent)'
const btnRef = ref(null)
onMounted(async () => {
  // S'assurer que l'init est terminée avant le rendu du bouton
  await initGoogle({})
  if (canUseGoogle.value) {
    await renderGoogleButton(btnRef.value)
  }
})

function onFallbackClick(){
  tryInteractiveLogin()
}
</script>

<style scoped>
.login-wrap{ display:grid; place-items:center; min-height: 100%; width:100%; }
.login-card{ max-width:520px; text-align:center }
.google-btn{ display:grid; place-items:center; margin-top:18px }
.fallback-btn{
  margin-top: 18px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.04);
  color: #fff;
  cursor: pointer;
}
.error{ margin-top:12px; color:#fecaca; background: rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); border-radius:10px; padding:8px 10px; }
.debug{ margin-top:14px; font-size:12px; opacity:0.7; text-align:left; display:inline-block }
</style>
