<script setup lang="ts">
// 检出分析: POD 曲线 + 配方对比 + 报告导出
import { computed, ref } from "vue"
import { use_state } from "@/state/store.ts"
import { download_text, fmt_num, fmt_time, dayjs } from "@/libs/index.ts"
import { DEFECT_TYPE_NAMES, type DefectTemplate, type Recipe } from "@/libs/types.ts"
import { pod_curve, type PodPoint } from "@/engine/sim.ts"
import line_chart from "@/components/line_chart.vue"
import type { ChartSeries } from "@/libs/types.ts"

const state = use_state()

const waferId = ref("")
const wafer = computed(() => state.wafers.find((w) => w.id === waferId.value) ?? state.wafers[0])

const COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#f87171", "#e879f9"]

// ---- 单配方 POD 曲线 ----
const mainRecipeId = ref("")
const mainRecipe = computed(() => state.recipes.find((r) => r.id === mainRecipeId.value) ?? state.recipes[0])
const podResults = ref<Map<string, PodPoint[]>>(new Map())
const analyzing = ref(false)

const size_sweep = (t: DefectTemplate): number[] => {
  const n = 22
  const [lo, hi] = t.type === "scratch" ? [50, 1000] : [30, 600]
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)))
}

const run_analysis = async (): Promise<void> => {
  if (!wafer.value || !mainRecipe.value) return
  analyzing.value = true
  const map = new Map<string, PodPoint[]>()
  for (const tpl of state.defectLib) {
    map.set(tpl.id, await pod_curve(tpl, mainRecipe.value, state.settings, [...state.materials], wafer.value, size_sweep(tpl)))
  }
  podResults.value = map
  analyzing.value = false
}

const podSeries = computed<ChartSeries[]>(() =>
  state.defectLib
    .filter((t) => podResults.value.has(t.id))
    .map((t, i) => ({
      name: `${t.name} (${DEFECT_TYPE_NAMES[t.type]})`,
      color: COLORS[i % COLORS.length],
      points: (podResults.value.get(t.id) ?? []).map((p) => ({ x: p.sizeNm, y: p.pod })),
    })),
)

// D50: POD=50% 对应的尺寸
const d50_of = (pts: PodPoint[]): number => {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1].pod < 0.5 && pts[i].pod >= 0.5) {
      const t = (0.5 - pts[i - 1].pod) / (pts[i].pod - pts[i - 1].pod)
      return pts[i - 1].sizeNm + t * (pts[i].sizeNm - pts[i - 1].sizeNm)
    }
  }
  return NaN
}

// ---- 配方对比 ----
const compareIds = ref<string[]>([])
const compareTemplateId = ref("")
const compareResults = ref<Map<string, PodPoint[]>>(new Map())
const comparing = ref(false)

const toggle_compare = (id: string): void => {
  if (compareIds.value.includes(id)) compareIds.value = compareIds.value.filter((x) => x !== id)
  else if (compareIds.value.length < 3) compareIds.value = [...compareIds.value, id]
}

const compareTemplate = computed(
  () => state.defectLib.find((t) => t.id === compareTemplateId.value) ?? state.defectLib[0],
)

const run_compare = async (): Promise<void> => {
  if (!wafer.value || !compareTemplate.value || compareIds.value.length === 0) return
  comparing.value = true
  const map = new Map<string, PodPoint[]>()
  for (const rid of compareIds.value) {
    const r = state.recipes.find((x) => x.id === rid)
    if (!r) continue
    map.set(rid, await pod_curve(compareTemplate.value, r, state.settings, [...state.materials], wafer.value, size_sweep(compareTemplate.value)))
  }
  compareResults.value = map
  comparing.value = false
}

const compareSeries = computed<ChartSeries[]>(() =>
  compareIds.value
    .filter((id) => compareResults.value.has(id))
    .map((id, i) => {
      const r = state.recipes.find((x) => x.id === id)
      return {
        name: r ? r.name : id,
        color: COLORS[i % COLORS.length],
        points: (compareResults.value.get(id) ?? []).map((p) => ({ x: p.sizeNm, y: p.pod })),
      }
    }),
)

// 推荐: 平均 POD 最高, 并列取 D50 更小者
const recommended = computed(() => {
  let best = ""
  let bestScore = -1
  let bestD50 = Infinity
  for (const id of compareIds.value) {
    const pts = compareResults.value.get(id)
    if (!pts) continue
    const avg = pts.reduce((s, p) => s + p.pod, 0) / pts.length
    const d50 = d50_of(pts)
    const d50v = Number.isNaN(d50) ? Infinity : d50
    if (avg > bestScore + 1e-9 || (Math.abs(avg - bestScore) <= 1e-9 && d50v < bestD50)) {
      best = id
      bestScore = avg
      bestD50 = d50v
    }
  }
  return best ? { id: best, score: bestScore, d50: bestD50 } : null
})

const recipe_name = (id: string): string => state.recipes.find((r) => r.id === id)?.name ?? id

// ---- 导出 ----
const export_recipes = (): void => {
  const ids = compareIds.value.length > 0 ? compareIds.value : state.recipes.map((r) => r.id)
  const list = state.recipes.filter((r) => ids.includes(r.id))
  download_text(`recipes_${dayjs().format("YYYYMMDD_HHmmss")}.json`, JSON.stringify(list, null, 2), "application/json")
}

const export_report = (): void => {
  if (!wafer.value) return
  const lines: string[] = [
    `# 暗场检测配方检出能力报告`,
    ``,
    `- 生成时间: ${fmt_time(Date.now())}`,
    `- 晶圆: ${wafer.value.name} (${wafer.value.diameterMm}mm, ${wafer.value.defects.length} 缺陷)`,
    `- 膜层: ${wafer.value.layers.map((l) => `${l.materialId} ${l.thicknessNm}nm`).join(" / ") || "无"}`,
    `- 仿真设置: 功率 ${state.settings.powerMw}mW, 光斑 ${state.settings.spotUm}µm, 驻留 ${state.settings.dwellUs}µs, SNR 阈值 ${state.settings.snrThreshold}`,
    ``,
    `## 各配方检出能力 (D50, nm)`,
    ``,
    `| 配方 | 波长 | 入射角 | 偏振 | ${state.defectLib.map((t) => t.name).join(" | ")} |`,
    `|---|---|---|---|${state.defectLib.map(() => "---").join("|")}|`,
  ]
  const recipes: Recipe[] = compareIds.value.length > 0
    ? state.recipes.filter((r) => compareIds.value.includes(r.id))
    : state.recipes
  for (const r of recipes) {
    const cells = state.defectLib.map((t) => {
      const key = `${r.id}:${t.id}`
      const pts = reportCurves.value.get(key)
      if (!pts) return "-"
      const d50 = d50_of(pts)
      return Number.isNaN(d50) ? ">上限" : fmt_num(d50)
    })
    lines.push(`| ${r.name} | ${r.wavelengthNm}nm | ${r.incidenceDeg}° | ${r.polarization} | ${cells.join(" | ")} |`)
  }
  if (recommended.value) {
    lines.push(``, `## 推荐配方`, ``, `**${recipe_name(recommended.value.id)}** (平均检出率 ${(recommended.value.score * 100).toFixed(1)}%, D50 ${Number.isFinite(recommended.value.d50) ? fmt_num(recommended.value.d50) + "nm" : "-"}, 缺陷模板: ${compareTemplate.value?.name})`)
  }
  download_text(`detection_report_${dayjs().format("YYYYMMDD_HHmmss")}.md`, lines.join("\n"), "text/markdown")
}

// 报告用: 所有配方 × 模板曲线
const reportCurves = ref<Map<string, PodPoint[]>>(new Map())
const building_report = ref(false)
const build_report = async (): Promise<void> => {
  if (!wafer.value) return
  building_report.value = true
  const map = new Map<string, PodPoint[]>()
  const recipes = compareIds.value.length > 0 ? state.recipes.filter((r) => compareIds.value.includes(r.id)) : state.recipes
  for (const r of recipes) {
    for (const t of state.defectLib) {
      map.set(`${r.id}:${t.id}`, await pod_curve(t, r, state.settings, [...state.materials], wafer.value, size_sweep(t)))
    }
  }
  reportCurves.value = map
  building_report.value = false
  export_report()
}
</script>

<template>
  <div class="space-y-6">
    <div class="card p-4">
      <div class="mb-4 flex flex-wrap items-end gap-4">
        <div class="w-56">
          <label class="label">晶圆</label>
          <select class="select" v-model="waferId">
            <option v-for="w in state.wafers" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </div>
        <div class="w-56">
          <label class="label">配方</label>
          <select class="select" v-model="mainRecipeId">
            <option v-for="r in state.recipes" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="analyzing || !wafer" @click="run_analysis">
          {{ analyzing ? "计算中..." : "运行检出分析" }}
        </button>
      </div>
      <div v-if="podSeries.length > 0">
        <line_chart :series="podSeries" x-label="缺陷尺寸 (nm, 划痕为宽度)" y-label="检出率 POD" :y-min="0" :y-max="1" :height="340" />
        <div class="card mt-4 overflow-hidden">
          <table class="table">
            <thead><tr><th>缺陷模板</th><th>类型</th><th>D50 (nm)</th><th>300nm 处 POD</th></tr></thead>
            <tbody>
              <tr v-for="t in state.defectLib" :key="t.id">
                <td>{{ t.name }}</td>
                <td><span class="tag">{{ DEFECT_TYPE_NAMES[t.type] }}</span></td>
                <td class="text-accent">{{ (() => { const d = d50_of(podResults.get(t.id) ?? []); return Number.isNaN(d) ? ">上限" : fmt_num(d) })() }}</td>
                <td>{{ (() => { const pts = podResults.get(t.id) ?? []; const p = pts.reduce((a, b) => Math.abs(b.sizeNm - 300) < Math.abs(a.sizeNm - 300) ? b : a, pts[0]); return p ? (p.pod * 100).toFixed(1) + "%" : "-" })() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="py-8 text-center text-sm text-dim">选择晶圆和配方后运行分析, 输出各缺陷类型的检出率-尺寸曲线</div>
    </div>

    <div class="card p-4">
      <h3 class="mb-4 text-sm font-semibold">配方对比 (最多 3 套)</h3>
      <div class="mb-4 flex flex-wrap items-end gap-4">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="r in state.recipes"
            :key="r.id"
            class="btn"
            :class="compareIds.includes(r.id) ? 'btn-primary' : ''"
            @click="toggle_compare(r.id)"
          >{{ r.name }}</button>
        </div>
        <div class="w-56">
          <label class="label">对比缺陷模板</label>
          <select class="select" v-model="compareTemplateId">
            <option v-for="t in state.defectLib" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="comparing || compareIds.length === 0" @click="run_compare">
          {{ comparing ? "计算中..." : "开始对比" }}
        </button>
      </div>
      <div v-if="compareSeries.length > 0">
        <line_chart :series="compareSeries" x-label="缺陷尺寸 (nm)" y-label="检出率 POD" :y-min="0" :y-max="1" :height="300" />
        <div v-if="recommended" class="mt-4 rounded-md border border-accent-dim bg-elev p-4 text-sm">
          推荐配方: <span class="font-semibold text-accent">{{ recipe_name(recommended.id) }}</span>
          <span class="ml-3 text-dim">平均检出率 {{ (recommended.score * 100).toFixed(1) }}%</span>
          <span class="ml-3 text-dim">D50 {{ Number.isFinite(recommended.d50) ? fmt_num(recommended.d50) + " nm" : ">上限" }}</span>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <h3 class="mb-4 text-sm font-semibold">导出</h3>
      <div class="flex gap-3">
        <button class="btn" @click="export_recipes">导出配方参数 (JSON)</button>
        <button class="btn" :disabled="building_report" @click="build_report">
          {{ building_report ? "生成中..." : "导出检出能力报告 (Markdown)" }}
        </button>
      </div>
      <div class="mt-2 text-sm text-dim">报告范围: {{ compareIds.length > 0 ? "已勾选的对比配方" : "全部配方" }} × 全部缺陷模板</div>
    </div>
  </div>
</template>
