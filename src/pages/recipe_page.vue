<script setup lang="ts">
// 光路配方: 入射角/方位角/偏振/波长 + 窄角/宽角收集通道
import { computed, ref } from "vue"
import { use_state, save_recipe, delete_recipe } from "@/state/store.ts"
import { uid, fmt_time } from "@/libs/index.ts"
import type { CollectChannel, Recipe } from "@/libs/types.ts"
import { channel_solid_angle } from "@/physics/collect.ts"

const state = use_state()
const selectedId = ref("")

const recipe = computed(() => state.recipes.find((r) => r.id === selectedId.value) ?? state.recipes[0])

const select = (id: string): void => {
  selectedId.value = id
}

const update = (patch: Partial<Recipe>): void => {
  if (!recipe.value) return
  void save_recipe({ ...recipe.value, ...patch })
}

const update_channel = (key: "narrow" | "wide", patch: Partial<CollectChannel>): void => {
  if (!recipe.value) return
  update({ [key]: { ...recipe.value[key], ...patch } })
}

const new_recipe = (): void => {
  const r: Recipe = {
    id: uid(),
    name: "新配方",
    wavelengthNm: 532,
    incidenceDeg: 60,
    azimuthDeg: 0,
    polarization: "p",
    narrow: { enabled: true, polarMinDeg: 20, polarMaxDeg: 40, azimMinDeg: -60, azimMaxDeg: 60 },
    wide: { enabled: true, polarMinDeg: 40, polarMaxDeg: 75, azimMinDeg: -90, azimMaxDeg: 90 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  void save_recipe(r)
  selectedId.value = r.id
}

const duplicate = (): void => {
  if (!recipe.value) return
  const r = { ...recipe.value, id: uid(), name: `${recipe.value.name} 副本`, createdAt: Date.now() }
  void save_recipe(r)
  selectedId.value = r.id
}

const polName: Record<string, string> = { s: "S 偏振 (TE)", p: "P 偏振 (TM)", u: "非偏振" }
</script>

<template>
  <div v-if="recipe" class="flex gap-6">
    <div class="w-64 shrink-0">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">配方列表</h2>
        <button class="btn" @click="new_recipe">新建</button>
      </div>
      <div
        v-for="r in state.recipes"
        :key="r.id"
        class="card mb-2 cursor-pointer p-3 transition-colors"
        :class="r.id === recipe.id ? 'border-accent' : 'hover:border-accent-dim'"
        @click="select(r.id)"
      >
        <div class="text-sm font-medium">{{ r.name }}</div>
        <div class="mt-1 text-sm text-dim">{{ r.wavelengthNm }}nm · θi {{ r.incidenceDeg }}° · {{ polName[r.polarization] }}</div>
        <div class="mt-1 text-sm text-dim">更新 {{ fmt_time(r.updatedAt) }}</div>
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <div class="card mb-4 p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold">照明条件</h3>
          <div class="flex gap-2">
            <button class="btn" @click="duplicate">复制配方</button>
            <button class="btn btn-danger" @click="delete_recipe(recipe.id)">删除</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="label">配方名称</label>
            <input class="input" :value="recipe.name" @change="update({ name: ($event.target as HTMLInputElement).value })" />
          </div>
          <div>
            <label class="label">波长 (nm)</label>
            <input class="input" type="number" :value="recipe.wavelengthNm" @change="update({ wavelengthNm: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div>
            <label class="label">偏振</label>
            <select class="select" :value="recipe.polarization" @change="update({ polarization: ($event.target as HTMLSelectElement).value as Recipe['polarization'] })">
              <option value="s">S 偏振 (TE)</option>
              <option value="p">P 偏振 (TM)</option>
              <option value="u">非偏振</option>
            </select>
          </div>
          <div>
            <label class="label">入射角 θi (°, 相对法线)</label>
            <input class="input" type="range" min="0" max="85" step="1" :value="recipe.incidenceDeg" @input="update({ incidenceDeg: Number(($event.target as HTMLInputElement).value) })" />
            <div class="mt-1 text-sm text-accent">{{ recipe.incidenceDeg }}°</div>
          </div>
          <div>
            <label class="label">方位角 φi (°)</label>
            <input class="input" type="range" min="0" max="360" step="5" :value="recipe.azimuthDeg" @input="update({ azimuthDeg: Number(($event.target as HTMLInputElement).value) })" />
            <div class="mt-1 text-sm text-accent">{{ recipe.azimuthDeg }}°</div>
          </div>
        </div>
      </div>

      <div v-for="key in (['narrow', 'wide'] as const)" :key="key" class="card mb-4 p-4">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-sm font-semibold">{{ key === 'narrow' ? '窄角收集通道' : '宽角收集通道' }}</h3>
          <label class="flex items-center gap-2 text-sm text-dim">
            <input type="checkbox" :checked="recipe[key].enabled" @change="update_channel(key, { enabled: ($event.target as HTMLInputElement).checked })" />
            启用
          </label>
        </div>
        <div v-if="recipe[key].enabled" class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">极角范围 (°): {{ recipe[key].polarMinDeg }} ~ {{ recipe[key].polarMaxDeg }}</label>
            <div class="flex items-center gap-2">
              <input class="input" type="number" min="0" max="90" :value="recipe[key].polarMinDeg" @change="update_channel(key, { polarMinDeg: Number(($event.target as HTMLInputElement).value) })" />
              <span class="text-dim">~</span>
              <input class="input" type="number" min="0" max="90" :value="recipe[key].polarMaxDeg" @change="update_channel(key, { polarMaxDeg: Number(($event.target as HTMLInputElement).value) })" />
            </div>
          </div>
          <div>
            <label class="label">方位角范围 (°): {{ recipe[key].azimMinDeg }} ~ {{ recipe[key].azimMaxDeg }}</label>
            <div class="flex items-center gap-2">
              <input class="input" type="number" min="-180" max="180" :value="recipe[key].azimMinDeg" @change="update_channel(key, { azimMinDeg: Number(($event.target as HTMLInputElement).value) })" />
              <span class="text-dim">~</span>
              <input class="input" type="number" min="-180" max="180" :value="recipe[key].azimMaxDeg" @change="update_channel(key, { azimMaxDeg: Number(($event.target as HTMLInputElement).value) })" />
            </div>
          </div>
          <div class="col-span-2 text-sm text-dim">
            收集立体角: <span class="text-accent">{{ channel_solid_angle(recipe[key]).toFixed(3) }} sr</span>
            <span class="ml-4">占半球 {{ (100 * channel_solid_angle(recipe[key]) / (2 * Math.PI)).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
