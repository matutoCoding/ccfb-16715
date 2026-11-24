<script setup lang="ts">
import { onMounted, ref } from "vue"
import { use_route, navigate, type RouteKey } from "@/router.ts"
import { init_store, use_state } from "@/state/store.ts"
import wafer_page from "@/pages/wafer_page.vue"
import defects_page from "@/pages/defects_page.vue"
import recipe_page from "@/pages/recipe_page.vue"
import imaging_page from "@/pages/imaging_page.vue"
import analysis_page from "@/pages/analysis_page.vue"
import settings_page from "@/pages/settings_page.vue"

const route = use_route()
const state = use_state()
const loadError = ref("")

onMounted(async () => {
  try {
    await init_store()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
})

const pages = {
  wafer: wafer_page,
  defects: defects_page,
  recipe: recipe_page,
  imaging: imaging_page,
  analysis: analysis_page,
  settings: settings_page,
}

const nav: { key: RouteKey; name: string; icon: string }[] = [
  { key: "wafer", name: "晶圆与膜层", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18M3 12h18" },
  { key: "defects", name: "缺陷库", icon: "M12 8v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" },
  { key: "recipe", name: "光路配方", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { key: "imaging", name: "散射成像", icon: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" },
  { key: "analysis", name: "检出分析", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { key: "settings", name: "设置", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5-3a7.5 7.5 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.6 7.6 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6a7.7 7.7 0 0 1 0-2.4l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 2-1.2l.4-2.6h4l.4 2.6a7.6 7.6 0 0 1 2 1.2l2.4-1 2 3.4-2 1.6c.07.4.1.8.1 1.2Z" },
]
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <aside class="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
      <div class="border-b border-line px-4 py-4">
        <div class="text-[15px] font-semibold">暗场散射检测</div>
        <div class="mt-1 text-sm text-dim">缺陷检测配方仿真系统</div>
      </div>
      <nav class="flex-1 overflow-y-auto p-2">
        <button
          v-for="item in nav"
          :key="item.key"
          class="mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors"
          :class="route === item.key ? 'bg-elev text-accent' : 'text-dim hover:bg-elev hover:text-text'"
          @click="navigate(item.key)"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path :d="item.icon" />
          </svg>
          {{ item.name }}
        </button>
      </nav>
      <div class="border-t border-line px-4 py-3 text-sm text-dim">WebGPU 计算着色器加速</div>
    </aside>
    <main class="flex-1 overflow-y-auto p-6">
      <div v-if="loadError" class="card p-6 text-danger">数据加载失败: {{ loadError }}</div>
      <div v-else-if="!state.ready" class="flex h-full items-center justify-center text-dim">加载中...</div>
      <component v-else :is="pages[route]" />
    </main>
  </div>
</template>
