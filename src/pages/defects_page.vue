<script setup lang="ts">
// 缺陷库: 颗粒/坑/划痕/残留模板管理
import { computed, ref } from "vue"
import { use_state, save_defect_template, delete_defect_template } from "@/state/store.ts"
import { uid } from "@/libs/index.ts"
import { DEFECT_TYPE_NAMES, type DefectTemplate, type DefectType } from "@/libs/types.ts"

const state = use_state()
const materials = computed(() => state.materials)

const blank = (): DefectTemplate => ({
  id: "",
  name: "",
  type: "particle",
  materialId: "psl",
  diameterNm: 100,
  widthNm: 200,
  depthNm: 20,
  lengthNm: 1e6,
  createdAt: 0,
})

const editing = ref<DefectTemplate | null>(null)

const start_new = (): void => {
  editing.value = blank()
}

const start_edit = (d: DefectTemplate): void => {
  editing.value = { ...d }
}

const save = (): void => {
  if (!editing.value || !editing.value.name) return
  const d = editing.value
  void save_defect_template({ ...d, id: d.id || uid(), createdAt: d.createdAt || Date.now() })
  editing.value = null
}

const typeHint: Record<DefectType, string> = {
  particle: "球形颗粒, 按直径和材料走米氏散射",
  pit: "表面坑, 按顶层膜介质中的空洞球处理",
  scratch: "长条沟槽, 按长度/宽度/深度的工程模型",
  residue: "薄层残留, 按等效直径的米氏散射",
}
</script>

<template>
  <div class="flex gap-6">
    <div class="min-w-0 flex-1">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-semibold">缺陷库</h2>
        <button class="btn btn-primary" @click="start_new">新建缺陷类型</button>
      </div>
      <div class="card overflow-hidden">
        <table class="table">
          <thead>
            <tr><th>名称</th><th>类型</th><th>材料</th><th>尺寸参数</th><th class="w-40"></th></tr>
          </thead>
          <tbody>
            <tr v-for="d in state.defectLib" :key="d.id">
              <td class="font-medium">{{ d.name }}</td>
              <td><span class="tag tag-accent">{{ DEFECT_TYPE_NAMES[d.type] }}</span></td>
              <td class="text-dim">{{ materials.find((m) => m.id === d.materialId)?.name ?? d.materialId }}</td>
              <td class="text-dim">
                <template v-if="d.type === 'scratch'">长 {{ d.lengthNm / 1e6 }}mm · 宽 {{ d.widthNm }}nm · 深 {{ d.depthNm }}nm</template>
                <template v-else>直径 {{ d.diameterNm }}nm</template>
              </td>
              <td>
                <div class="flex gap-2">
                  <button class="btn" @click="start_edit(d)">编辑</button>
                  <button class="btn btn-danger" @click="delete_defect_template(d.id)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="editing" class="card w-80 shrink-0 self-start p-4">
      <h3 class="mb-4 text-sm font-semibold">{{ editing.id ? "编辑缺陷" : "新建缺陷" }}</h3>
      <div class="mb-3">
        <label class="label">名称</label>
        <input class="input" v-model="editing.name" placeholder="如 PSL 标准球" />
      </div>
      <div class="mb-3">
        <label class="label">类型</label>
        <select class="select" v-model="editing.type">
          <option v-for="(name, t) in DEFECT_TYPE_NAMES" :key="t" :value="t">{{ name }}</option>
        </select>
        <div class="mt-1 text-sm text-dim">{{ typeHint[editing.type] }}</div>
      </div>
      <div class="mb-3">
        <label class="label">材料</label>
        <select class="select" v-model="editing.materialId">
          <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }} (n={{ m.n }}, k={{ m.k }})</option>
        </select>
      </div>
      <template v-if="editing.type === 'scratch'">
        <div class="mb-3">
          <label class="label">长度 (mm)</label>
          <input class="input" type="number" step="any" :value="editing.lengthNm / 1e6" @input="editing!.lengthNm = Number(($event.target as HTMLInputElement).value) * 1e6" />
        </div>
        <div class="mb-3">
          <label class="label">宽度 (nm)</label>
          <input class="input" type="number" v-model.number="editing.widthNm" />
        </div>
        <div class="mb-3">
          <label class="label">深度 (nm)</label>
          <input class="input" type="number" v-model.number="editing.depthNm" />
        </div>
      </template>
      <div v-else class="mb-3">
        <label class="label">等效直径 (nm)</label>
        <input class="input" type="number" v-model.number="editing.diameterNm" />
      </div>
      <div class="mt-4 flex gap-2">
        <button class="btn btn-primary flex-1" :disabled="!editing.name" @click="save">保存</button>
        <button class="btn" @click="editing = null">取消</button>
      </div>
    </div>
  </div>
</template>
