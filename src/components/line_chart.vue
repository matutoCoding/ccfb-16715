<script setup lang="ts">
// 轻量 SVG 多序列折线图
import { computed } from "vue"
import type { ChartSeries } from "@/libs/types.ts"

const props = withDefaults(
  defineProps<{
    series: ChartSeries[]
    xLabel: string
    yLabel: string
    logY?: boolean
    yMin?: number
    yMax?: number
    height?: number
  }>(),
  { logY: false, yMin: undefined, yMax: undefined, height: 320 },
)

const W = 720
const PAD = { l: 56, r: 16, t: 16, b: 40 }

const allX = computed(() => props.series.flatMap((s) => s.points.map((p) => p.x)))
const allY = computed(() => props.series.flatMap((s) => s.points.map((p) => p.y)))

const xLo = computed(() => Math.min(...allX.value, 0))
const xHi = computed(() => Math.max(...allX.value, 1))

const yLo = computed(() => {
  if (props.yMin !== undefined) return props.yMin
  const v = Math.min(...allY.value.filter((y) => !props.logY || y > 0))
  return props.logY ? Math.max(v, 1e-12) : Math.min(v, 0)
})
const yHi = computed(() => {
  if (props.yMax !== undefined) return props.yMax
  return Math.max(...allY.value, 1e-12)
})

const tx = (x: number): number =>
  PAD.l + ((x - xLo.value) / (xHi.value - xLo.value || 1)) * (W - PAD.l - PAD.r)

const ty = (y: number): number => {
  const h = props.height - PAD.t - PAD.b
  if (props.logY) {
    const lo = Math.log10(Math.max(yLo.value, 1e-12))
    const hi = Math.log10(Math.max(yHi.value, 1e-11))
    return PAD.t + (1 - (Math.log10(Math.max(y, 1e-12)) - lo) / (hi - lo || 1)) * h
  }
  return PAD.t + (1 - (y - yLo.value) / (yHi.value - yLo.value || 1)) * h
}

const path_of = (s: ChartSeries): string =>
  s.points.map((p, i) => `${i === 0 ? "M" : "L"}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join("")

const xTicks = computed(() => {
  const n = 6
  return Array.from({ length: n + 1 }, (_, i) => xLo.value + ((xHi.value - xLo.value) * i) / n)
})

const yTicks = computed(() => {
  if (props.logY) {
    const lo = Math.floor(Math.log10(Math.max(yLo.value, 1e-12)))
    const hi = Math.ceil(Math.log10(Math.max(yHi.value, 1e-11)))
    return Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i))
  }
  const n = 5
  return Array.from({ length: n + 1 }, (_, i) => yLo.value + ((yHi.value - yLo.value) * i) / n)
})

const fmt_tick = (v: number): string => {
  if (v === 0) return "0"
  const a = Math.abs(v)
  if (a >= 1e4 || a < 1e-2) return v.toExponential(0)
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2)
}
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${height}`" class="w-full" :style="{ height: `${height}px` }">
      <line :x1="PAD.l" :y1="height - PAD.b" :x2="W - PAD.r" :y2="height - PAD.b" stroke="#232c38" />
      <line :x1="PAD.l" :y1="PAD.t" :x2="PAD.l" :y2="height - PAD.b" stroke="#232c38" />
      <g v-for="t in xTicks" :key="'x' + t">
        <line :x1="tx(t)" :y1="height - PAD.b" :x2="tx(t)" :y2="height - PAD.b + 4" stroke="#232c38" />
        <text :x="tx(t)" :y="height - PAD.b + 16" fill="#8b98a9" font-size="11" text-anchor="middle">{{ fmt_tick(t) }}</text>
      </g>
      <g v-for="t in yTicks" :key="'y' + t">
        <line :x1="PAD.l - 4" :y1="ty(t)" :x2="PAD.l" :y2="ty(t)" stroke="#232c38" />
        <line :x1="PAD.l" :y1="ty(t)" :x2="W - PAD.r" :y2="ty(t)" stroke="#1a212b" stroke-dasharray="2,4" />
        <text :x="PAD.l - 8" :y="ty(t) + 4" fill="#8b98a9" font-size="11" text-anchor="end">{{ fmt_tick(t) }}</text>
      </g>
      <text :x="(PAD.l + W - PAD.r) / 2" :y="height - 6" fill="#8b98a9" font-size="12" text-anchor="middle">{{ xLabel }}</text>
      <text :x="14" :y="(PAD.t + height - PAD.b) / 2" fill="#8b98a9" font-size="12" text-anchor="middle" :transform="`rotate(-90 14 ${(PAD.t + height - PAD.b) / 2})`">{{ yLabel }}</text>
      <path v-for="s in series" :key="s.name" :d="path_of(s)" fill="none" :stroke="s.color" stroke-width="1.8" />
    </svg>
    <div class="mt-2 flex flex-wrap gap-4 px-2">
      <div v-for="s in series" :key="s.name" class="flex items-center gap-2 text-sm text-dim">
        <span class="inline-block h-0.5 w-5" :style="{ background: s.color }"></span>{{ s.name }}
      </div>
    </div>
  </div>
</template>
