<script setup lang="ts">
// 散射成像: 整片晶圆暗场图, GPU 计算着色器成像
import { computed, ref } from "vue"
import { use_state } from "@/state/store.ts"
import { fmt_num } from "@/libs/index.ts"
import { DEFECT_TYPE_NAMES } from "@/libs/types.ts"
import { simulate_wafer, type WaferSimResult } from "@/engine/sim.ts"
import { render_wafer_image, type WaferImage } from "@/gpu/imaging_gpu.ts"
import { gpu_available } from "@/gpu/device.ts"
import { get_mie_tables, mie_case_of } from "@/engine/sim.ts"
import wafer_map from "@/components/wafer_map.vue"
import line_chart from "@/components/line_chart.vue"
import type { MapDefect } from "@/libs/types.ts"

const state = use_state()

const waferId = ref("")
const recipeId = ref("")
const channel = ref<"narrow" | "wide">("wide")
const running = ref(false)
const error = ref("")
const image = ref<WaferImage | null>(null)
const sim = ref<WaferSimResult | null>(null)
const gpuMs = ref(0)
const selected = ref(-1)
const mapRef = ref<InstanceType<typeof wafer_map>>()

const wafer = computed(() => state.wafers.find((w) => w.id === waferId.value) ?? state.wafers[0])
const recipe = computed(() => state.recipes.find((r) => r.id === recipeId.value) ?? state.recipes[0])

const sig_of = (i: number): number => {
  const r = sim.value!.results[i]
  return channel.value === "narrow" ? r.sigNarrow : r.sigWide
}
const snr_of = (i: number): number => {
  const r = sim.value!.results[i]
  return channel.value === "narrow" ? r.snrNarrow : r.snrWide
}

const markers = computed<MapDefect[]>(() => {
  if (!sim.value || !image.value || !wafer.value) return []
  const size = image.value.width
  const R = wafer.value.diameterMm / 2
  return sim.value.results.map((r) => ({
    x: ((r.defect.xMm + R) / (2 * R)) * size,
    y: ((r.defect.yMm + R) / (2 * R)) * size,
    label: DEFECT_TYPE_NAMES[r.defect.type],
  }))
})

const detectedCount = computed(() => {
  if (!sim.value) return 0
  const thr = state.settings.snrThreshold
  return sim.value.results.filter((_, i) => snr_of(i) >= thr).length
})

const run = async (): Promise<void> => {
  if (!wafer.value || !recipe.value) return
  running.value = true
  error.value = ""
  selected.value = -1
  try {
    const result = await simulate_wafer(wafer.value, recipe.value, state.settings, [...state.materials])
    sim.value = result
    const size = state.settings.imageSize
    const R = wafer.value.diameterMm / 2
    const bg = channel.value === "narrow" ? result.bgNarrow : result.bgWide
    const defs = result.results.map((r) => ({
      x: ((r.defect.xMm + R) / (2 * R)) * size,
      y: ((r.defect.yMm + R) / (2 * R)) * size,
      sig: channel.value === "narrow" ? r.sigNarrow : r.sigWide,
    }))
    const t0 = performance.now()
    image.value = await render_wafer_image(defs, size, bg, 12345)
    gpuMs.value = performance.now() - t0
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    running.value = false
  }
}

// 选中缺陷的角分布曲线
const angularCurve = ref<{ name: string; color: string; points: { x: number; y: number }[] }[]>([])

const pick = async (i: number): Promise<void> => {
  selected.value = i
  angularCurve.value = []
  if (!sim.value || !wafer.value || !recipe.value) return
  const d = sim.value.results[i].defect
  if (d.type === "scratch") return
  const topId = wafer.value.layers.length > 0 ? wafer.value.layers[0].materialId : wafer.value.substrateMaterialId
  const nTop = state.materials.find((m) => m.id === topId)?.n ?? 1.5
  const c = mie_case_of(d, new Map(state.materials.map((m) => [m.id, m])), recipe.value.wavelengthNm, nTop)
  const tables = await get_mie_tables([c])
  const t = [...tables.values()][0]
  angularCurve.value = [
    { name: "i1 (S)", color: "#22d3ee", points: t.anglesDeg.map((a, j) => ({ x: a, y: t.i1[j] })) },
    { name: "i2 (P)", color: "#f59e0b", points: t.anglesDeg.map((a, j) => ({ x: a, y: t.i2[j] })) },
  ]
}

const selectedDefect = computed(() => (selected.value >= 0 && sim.value ? sim.value.results[selected.value] : null))
</script>

<template>
  <div class="flex h-full gap-6">
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="card mb-4 flex flex-wrap items-end gap-4 p-4">
        <div class="w-56">
          <label class="label">晶圆</label>
          <select class="select" v-model="waferId">
            <option v-for="w in state.wafers" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </div>
        <div class="w-56">
          <label class="label">光路配方</label>
          <select class="select" v-model="recipeId">
            <option v-for="r in state.recipes" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <div class="w-36">
          <label class="label">收集通道</label>
          <select class="select" v-model="channel">
            <option value="narrow">窄角</option>
            <option value="wide">宽角</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="running || !wafer || !recipe" @click="run">
          {{ running ? "仿真中..." : "运行成像仿真" }}
        </button>
        <span v-if="!gpu_available()" class="text-sm text-warn">WebGPU 不可用, 米氏计算回退 CPU</span>
      </div>

      <div v-if="error" class="card mb-4 p-4 text-danger">{{ error }}</div>

      <div class="card relative min-h-0 flex-1 overflow-hidden">
        <wafer_map v-if="image" ref="mapRef" :image="image" :markers="markers" :selected="selected" @pick="pick" />
        <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-dim">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" />
          </svg>
          <div class="text-sm">选择晶圆和配方, 运行成像仿真</div>
          <div class="text-sm">暗场图中缺陷为亮点, 背景为膜层雾度底噪</div>
        </div>
        <div v-if="sim" class="absolute left-3 top-3 rounded-md bg-bg/80 px-3 py-2 text-sm text-dim backdrop-blur">
          <div>缺陷 {{ sim.results.length }} 个 · 检出 {{ detectedCount }} 个 (SNR≥{{ state.settings.snrThreshold }})</div>
          <div>物理计算 {{ sim.elapsedMs.toFixed(0) }}ms · GPU 成像 {{ gpuMs.toFixed(0) }}ms · 背景 {{ fmt_num(channel === 'narrow' ? sim.bgNarrow : sim.bgWide) }} e⁻</div>
        </div>
      </div>
    </div>

    <div v-if="selectedDefect" class="card w-80 shrink-0 self-start p-4">
      <h3 class="mb-3 text-sm font-semibold">缺陷详情</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-dim">类型</span><span class="tag tag-accent">{{ DEFECT_TYPE_NAMES[selectedDefect.defect.type] }}</span></div>
        <div class="flex justify-between"><span class="text-dim">位置</span><span>({{ selectedDefect.defect.xMm.toFixed(1) }}, {{ selectedDefect.defect.yMm.toFixed(1) }}) mm</span></div>
        <div v-if="selectedDefect.defect.type !== 'scratch'" class="flex justify-between"><span class="text-dim">直径</span><span>{{ selectedDefect.defect.diameterNm.toFixed(0) }} nm</span></div>
        <template v-else>
          <div class="flex justify-between"><span class="text-dim">长×宽×深</span><span>{{ (selectedDefect.defect.lengthNm / 1e6).toFixed(1) }}mm × {{ selectedDefect.defect.widthNm.toFixed(0) }}nm × {{ selectedDefect.defect.depthNm.toFixed(0) }}nm</span></div>
        </template>
        <div class="flex justify-between"><span class="text-dim">信号</span><span class="text-accent">{{ fmt_num(sig_of(selected)) }} e⁻</span></div>
        <div class="flex justify-between"><span class="text-dim">SNR</span><span class="text-accent">{{ fmt_num(snr_of(selected)) }}</span></div>
        <div class="flex justify-between">
          <span class="text-dim">判定</span>
          <span :class="snr_of(selected) >= state.settings.snrThreshold ? 'text-ok' : 'text-danger'">
            {{ snr_of(selected) >= state.settings.snrThreshold ? "可检出" : "低于阈值" }}
          </span>
        </div>
      </div>
      <div v-if="angularCurve.length > 0" class="mt-4">
        <div class="mb-2 text-sm text-dim">米氏角分布 (强度函数)</div>
        <line_chart :series="angularCurve" x-label="散射角 (°)" y-label="i(θ)" :log-y="true" :height="200" />
      </div>
    </div>
  </div>
</template>
