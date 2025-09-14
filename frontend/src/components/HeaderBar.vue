<template>
  <header class="topbar">
    <div class="container topbar-inner">
      <div class="brand">KPIs Dashboard</div>
      <div class="spacer"></div>
      <div class="actions">
        <div class="avatar" v-if="user?.picture" :title="user?.name || 'Profil'">
          <img :src="user.picture" alt="avatar" />
        </div>
        <div class="avatar" v-else title="Profil">👤</div>
        <button class="logout" aria-label="Se déconnecter" @click="$emit('logout')">Se déconnecter</button>
      </div>
    </div>
  </header>
  
</template>

<script setup>
defineProps({ user: { type: Object, default: null } })
</script>

<style scoped>
.topbar{ position: relative; z-index: 100; }
.topbar-inner{ display:flex; align-items:center; gap:12px; padding: 10px 20px; max-width: 1040px; margin:0 auto; }
.brand{ color: var(--muted); font-weight: 700; }
.spacer{ flex:1 }
.actions{ display:flex; align-items:center; gap:10px }
.avatar{ width:32px; height:32px; border-radius:999px; display:grid; place-items:center; font-weight:800; background: var(--accent); color:#001018; overflow:hidden }
.avatar img{ width:100%; height:100%; object-fit:cover }
.logout{ background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; border-radius:10px; padding:6px 10px; cursor:pointer; }
.logout:hover{ background:rgba(255,255,255,0.14) }
</style>
