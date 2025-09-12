import { ref, computed } from 'vue'

const storageKey = 'auth.google'
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const user = ref(null)
const credential = ref('')
const authError = ref('')
const canUseGoogle = ref(false)

// Load from storage
try {
  const raw = localStorage.getItem(storageKey)
  if (raw) {
    const obj = JSON.parse(raw)
    user.value = obj.user || null
    credential.value = obj.credential || ''
  }
} catch {}

export const isAuthenticated = computed(() => !!user.value)

function decodeJwt(jwt){
  try {
    const payload = jwt.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch { return {} }
}

async function waitForGoogle(maxMs = 5000){
  const start = Date.now()
  while (!window.google){
    await new Promise(r => setTimeout(r, 100))
    if (Date.now() - start > maxMs) break
  }
  return !!window.google
}

export async function initGoogle({ onSuccess } = {}){
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const ok = await waitForGoogle()
  if (!ok || !clientId) { canUseGoogle.value = false; return }
  window.google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',              // évite les contraintes FedCM en dev
    use_fedcm_for_prompt: true,    // opt-in vers FedCM (migration future)
    callback: async (resp) => {
      try {
        authError.value = ''
        credential.value = resp.credential
        // Verify with backend and set session
        const r = await fetch(`${backendUrl}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ credential: credential.value })
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err?.error || 'Authentification refusée')
        }
        const data = await r.json()
        user.value = data.user || null
        try{ localStorage.setItem(storageKey, JSON.stringify({ user: user.value, credential: credential.value })) } catch {}
        if (onSuccess) onSuccess(user.value)
      } catch (e) {
        credential.value = ''
        user.value = null
        authError.value = e?.message || "Ce compte n'est pas autorisé à accéder au dashboard."
        try { localStorage.removeItem(storageKey) } catch {}
      }
    },
  })
  canUseGoogle.value = true
}

export async function fetchMe(){
  try {
    const r = await fetch(`${backendUrl}/auth/me`, { credentials: 'include' })
    if (!r.ok) return null
    const data = await r.json().catch(() => null)
    if (data?.user) {
      user.value = data.user
      try { localStorage.setItem(storageKey, JSON.stringify({ user: user.value, credential: credential.value })) } catch {}
      return user.value
    }
  } catch {}
  return null
}

export async function renderGoogleButton(el){
  if (!el) return
  const ok = await waitForGoogle()
  if (!ok) return
  window.google.accounts.id.renderButton(el, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    logo_alignment: 'left',
    width: 260,
  })
  // Pas de prompt() automatique pour éviter les warnings FedCM; l'action vient du clic bouton.
}

export async function tryInteractiveLogin(){
  // Utilisé par un bouton custom en fallback
  try{
    authError.value = ''
    await initGoogle({})
    if (!canUseGoogle.value) {
      throw new Error("Connexion Google indisponible sur cette origine.")
    }
    // Si la lib est dispo mais le bouton GIS n'a pas été rendu,
    // on tente un prompt; si FedCM désactivé, cela n'ouvrira peut-être rien.
    if (window.google?.accounts?.id?.prompt) {
      window.google.accounts.id.prompt() // la réponse passera dans le callback initialize
    } else {
      throw new Error("Bibliothèque Google non chargée")
    }
  } catch(e){
    authError.value = e?.message || 'Impossible de démarrer la connexion Google.'
  }
}

export function signOut(){
  credential.value = ''
  user.value = null
  try { localStorage.removeItem(storageKey) } catch {}
  // fire-and-forget backend logout to clear session
  try { fetch(`${backendUrl}/auth/logout`, { method:'POST', credentials:'include' }) } catch {}
}

export function useAuth(){
  return { user, credential, isAuthenticated, authError, canUseGoogle, initGoogle, renderGoogleButton, tryInteractiveLogin, fetchMe, signOut }
}
