<script setup lang="ts">
// 设置: 仿真参数 + GPU 信息 + 米氏校验 + 数据管理
import { ref } from "vue"
import { use_state, save_settings, seed_all } from "@/state/store.ts"
import { gpu_available, get_adapter_info } from "@/gpu/device.ts"
import { validate_mie, type ValidationReport } from "@/engine/validation.ts"
import { clear_mie_cache } from "@/engine/sim.ts"
import type { SimSettings } from "@/libs/types.ts"

const state = use_state()

const update = (patch: Partial<SimSettings>): void => {
  void save_settings({ ...state.settings, ...patch })
}

const validation = ref<ValidationReport | null>(null)
const validating = ref(false)
const validationError = ref("")

const run_validation = async (): Promise<void> => {
  validating.value = true
  validationError.value = ""
  try {
    validation.value = await validate_mie()
  } catch (e) {
    validationError.value = e instanceof Error ? e.message : String(e)
  } finally {
    validating.value = false
  }
}

const reseeding = ref(false)
const reseed = async (): Promise<void> => {
  reseeding.value = true
  clear_mie_cache()
  await seed_all()
  reseeding.value = false
}

const adapter = get_adapter_info()
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="card p-4">
      <h3 class="mb-4 text-sm font-semibold">仿真参数</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label">激光功率 (mW)</label>
          <input class="input" type="number" :value="state.settings.powerMw" @change="update({ powerMw: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">照明光斑边长 (µm)</label>
          <input class="input" type="number" :value="state.settings.spotUm" @change="update({ spotUm: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">单点驻留时间 (µs)</label>
          <input class="input" type="number" :value="state.settings.dwellUs" @change="update({ dwellUs: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">探测器量子效率 (0~1)</label>
          <input class="input" type="number" step="0.05" min="0" max="1" :value="state.settings.quantumEff" @change="update({ quantumEff: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">读出噪声 (e⁻)</label>
          <input class="input" type="number" :value="state.settings.readNoise" @change="update({ readNoise: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">SNR 检出阈值</label>
          <input class="input" type="number" :value="state.settings.snrThreshold" @change="update({ snrThreshold: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="label">晶圆图分辨率</label>
          <select class="select" :value="state.settings.imageSize" @change="update({ imageSize: Number(($event.target as HTMLSelectElement).value) })">
            <option :value="512">512 × 512</option>
            <option :value="1024">1024 × 1024</option>
            <option :value="2048">2048 × 2048</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-sm font-semibold">米氏散射 GPU 校验</h3>
        <button class="btn btn-primary" :disabled="validating || !gpu_available()" @click="run_validation">
          {{ validating ? "校验中..." : "运行 GPU vs 解析级数校验" }}
        </button>
      </div>
      <div class="mb-3 text-sm text-dim">
        WebGPU: <span :class="gpu_available() ? 'text-ok' : 'text-danger'">{{ gpu_available() ? "可用" : "不可用" }}</span>
        <span v-if="adapter" class="ml-3">{{ adapter.vendor }} {{ adapter.architecture }}</span>
      </div>
      <div v-if="validationError" class="text-sm text-danger">{{ validationError }}</div>
      <template v-if="validation">
        <div class="mb-3 text-sm">
          验收标准相对误差 &lt; 1%:
          <span :class="validation.ok ? 'text-ok' : 'text-danger'" class="font-semibold">
            {{ validation.ok ? "通过" : "未通过" }} (最大相对误差 {{ (validation.maxRelErr * 100).toExponential(2) }}%, 耗时 {{ validation.elapsedMs.toFixed(0) }}ms)
          </span>
        </div>
        <table class="table">
          <thead><tr><th>用例</th><th>Qsca (CPU)</th><th>Qsca (GPU)</th><th>角分布最大相对误差</th></tr></thead>
          <tbody>
            <tr v-for="c in validation.cases" :key="c.label">
              <td>{{ c.label }}</td>
              <td class="text-dim">{{ c.qScaCpu.toPrecision(5) }}</td>
              <td class="text-dim">{{ c.qScaGpu.toPrecision(5) }}</td>
              <td :class="c.maxRelErr < 0.01 ? 'text-ok' : 'text-danger'">{{ (c.maxRelErr * 100).toExponential(2) }}%</td>
            </tr>
          </tbody>
        </table>
      </template>
      <div v-else class="text-sm text-dim">点击运行, 用 6 组典型 (尺寸, 材料, 波长) 组合对比 GPU 计算着色器与 CPU 解析级数结果</div>
    </div>

    <div class="card p-4">
      <h3 class="mb-4 text-sm font-semibold">数据管理</h3>
      <div class="flex items-center gap-4">
        <button class="btn btn-danger" :disabled="reseeding" @click="reseed">
          {{ reseeding ? "重置中..." : "重置并重新生成演示数据" }}
        </button>
        <span class="text-sm text-dim">清空 IndexedDB 中的晶圆/缺陷库/配方, 重新播种 300mm 演示晶圆</span>
      </div>
    </div>
  </div>
</template>
