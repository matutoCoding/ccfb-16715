<script setup lang="ts">
// 晶圆与膜层: 衬底 + 多层膜 + PSD 粗糙度录入
import { computed, ref } from "vue"
import { use_state, save_wafer, delete_wafer, save_material } from "@/state/store.ts"
import { uid, fmt_num } from "@/libs/index.ts"
import { DEFECT_TYPE_NAMES, type Material, type Wafer } from "@/libs/types.ts"
import { rms_from_psd, tis } from "@/physics/haze.ts"
import { seed_wafer } from "@/data/seed.ts"

const state = use_state()
const selectedId = ref("")

const wafer = computed(() => state.wafers.find((w) => w.id === selectedId.value) ?? state.wafers[0])

const sigmaNm = computed(() => (wafer.value ? rms_from_psd(wafer.value.roughness) : 0))
const tisVal = computed(() => (wafer.value ? tis(sigmaNm.value, 532, 60) : 0))

const defectSummary = computed(() => {
  if (!wafer.value) return []
  const counts = new Map<string, number>()
  for (const d of wafer.value.defects) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  return [...counts.entries()].map(([type, n]) => ({ name: DEFECT_TYPE_NAMES[type as keyof typeof DEFECT_TYPE_NAMES], n }))
})

const select = (id: string): void => {
  selectedId.value = id
}

const update = (patch: Partial<Wafer>): void => {
  if (!wafer.value) return
  void save_wafer({ ...wafer.value, ...patch })
}

const new_wafer = (): void => {
  const w: Wafer = {
    id: uid(),
    name: "新晶圆",
    diameterMm: 300,
    substrateMaterialId: "si",
    layers: [{ materialId: "sio2", thicknessNm: 100 }],
    roughness: { a: 2e-3, b: 1, c: 3 },
    defects: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  void save_wafer(w)
  selectedId.value = w.id
}

const add_layer = (): void => {
  if (!wafer.value) return
  update({ layers: [...wafer.value.layers, { materialId: "sio2", thicknessNm: 50 }] })
}

const set_layer = (i: number, field: "materialId" | "thicknessNm", v: string): void => {
  if (!wafer.value) return
  const layers = wafer.value.layers.map((l, j) =>
    j === i ? { ...l, [field]: field === "thicknessNm" ? Number(v) : v } : l,
  )
  update({ layers })
}

const remove_layer = (i: number): void => {
  if (!wafer.value) return
  update({ layers: wafer.value.layers.filter((_, j) => j !== i) })
}

const regen_defects = (): void => {
  if (!wafer.value) return
  const seeded = seed_wafer()
  update({ defects: seeded.defects })
}

// 自定义材料
const newMat = ref({ name: "", n: 1.5, k: 0 })
const add_material = (): void => {
  if (!newMat.value.name) return
  const m: Material = { id: uid(), name: newMat.value.name, n: newMat.value.n, k: newMat.value.k }
  void save_material(m)
  newMat.value = { name: "", n: 1.5, k: 0 }
}

const materials = computed(() => state.materials)
</script>

<template>
  <div v-if="wafer" class="flex gap-6">
    <div class="w-56 shrink-0">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">晶圆列表</h2>
        <button class="btn" @click="new_wafer">新建</button>
      </div>
      <div
        v-for="w in state.wafers"
        :key="w.id"
        class="card mb-2 cursor-pointer p-3 transition-colors"
        :class="w.id === wafer.id ? 'border-accent' : 'hover:border-accent-dim'"
        @click="select(w.id)"
      >
        <div class="text-sm font-medium">{{ w.name }}</div>
        <div class="mt-1 text-sm text-dim">{{ w.diameterMm }}mm · {{ w.defects.length }} 缺陷</div>
      </div>
      <button v-if="state.wafers.length > 1" class="btn btn-danger mt-2 w-full" @click="delete_wafer(wafer.id)">删除当前晶圆</button>
    </div>

    <div class="min-w-0 flex-1">
      <div class="card mb-4 p-4">
        <h3 class="mb-4 text-sm font-semibold">基本信息</h3>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="label">名称</label>
            <input class="input" :value="wafer.name" @change="update({ name: ($event.target as HTMLInputElement).value })" />
          </div>
          <div>
            <label class="label">直径 (mm)</label>
            <input class="input" type="number" :value="wafer.diameterMm" @change="update({ diameterMm: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div>
            <label class="label">衬底材料</label>
            <select class="select" :value="wafer.substrateMaterialId" @change="update({ substrateMaterialId: ($event.target as HTMLSelectElement).value })">
              <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }} (n={{ m.n }})</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card mb-4 p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold">膜层结构 (自上而下)</h3>
          <button class="btn" @click="add_layer">加一层</button>
        </div>
        <table class="table">
          <thead>
            <tr><th>#</th><th>材料</th><th>厚度 (nm)</th><th>n / k</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in wafer.layers" :key="i">
              <td class="text-dim">{{ i + 1 }}</td>
              <td>
                <select class="select" :value="l.materialId" @change="set_layer(i, 'materialId', ($event.target as HTMLSelectElement).value)">
                  <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </td>
              <td>
                <input class="input" type="number" min="0" :value="l.thicknessNm" @change="set_layer(i, 'thicknessNm', ($event.target as HTMLInputElement).value)" />
              </td>
              <td class="text-dim">
                {{ (materials.find((m) => m.id === l.materialId)?.n ?? "-") }} / {{ (materials.find((m) => m.id === l.materialId)?.k ?? "-") }}
              </td>
              <td><button class="btn btn-danger" @click="remove_layer(i)">移除</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card mb-4 p-4">
        <h3 class="mb-4 text-sm font-semibold">表面粗糙度 (PSD, ABC 模型)</h3>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="label">A 幅值 (nm²·µm²)</label>
            <input class="input" type="number" step="any" :value="wafer.roughness.a" @change="update({ roughness: { ...wafer.roughness, a: Number(($event.target as HTMLInputElement).value) } })" />
          </div>
          <div>
            <label class="label">B 相关长度 (µm)</label>
            <input class="input" type="number" step="any" :value="wafer.roughness.b" @change="update({ roughness: { ...wafer.roughness, b: Number(($event.target as HTMLInputElement).value) } })" />
          </div>
          <div>
            <label class="label">C 幂指数</label>
            <input class="input" type="number" step="any" :value="wafer.roughness.c" @change="update({ roughness: { ...wafer.roughness, c: Number(($event.target as HTMLInputElement).value) } })" />
          </div>
        </div>
        <div class="mt-4 flex gap-6 text-sm">
          <span class="text-dim">RMS 粗糙度 σ: <span class="text-accent">{{ fmt_num(sigmaNm) }} nm</span></span>
          <span class="text-dim">TIS @532nm/60°: <span class="text-accent">{{ fmt_num(tisVal) }}</span></span>
        </div>
      </div>

      <div class="card p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold">缺陷分布</h3>
          <button class="btn" @click="regen_defects">重新生成缺陷分布</button>
        </div>
        <div class="flex flex-wrap gap-3">
          <span v-for="s in defectSummary" :key="s.name" class="tag">{{ s.name }} × {{ s.n }}</span>
          <span v-if="wafer.defects.length === 0" class="text-sm text-dim">暂无缺陷, 点击右侧按钮生成演示分布</span>
        </div>
      </div>

      <div class="card mt-4 p-4">
        <h3 class="mb-4 text-sm font-semibold">自定义材料</h3>
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label class="label">名称</label>
            <input class="input" v-model="newMat.name" placeholder="如 HfO2" />
          </div>
          <div class="w-28">
            <label class="label">n</label>
            <input class="input" type="number" step="any" v-model.number="newMat.n" />
          </div>
          <div class="w-28">
            <label class="label">k</label>
            <input class="input" type="number" step="any" v-model.number="newMat.k" />
          </div>
          <button class="btn btn-primary" @click="add_material">添加</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <span v-for="m in materials" :key="m.id" class="tag">{{ m.name }} n={{ m.n }} k={{ m.k }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
