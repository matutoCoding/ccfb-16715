<script setup lang="ts">
// 晶圆暗场图画布: 对数色调映射 + 缩放/平移/点选缺陷
import { onMounted, ref, watch } from "vue"
import type { WaferImage } from "@/gpu/imaging_gpu.ts"
import type { MapDefect } from "@/libs/types.ts"

const props = defineProps<{
  image: WaferImage | null
  markers?: MapDefect[]
  selected?: number
}>()

const emit = defineEmits<{ pick: [index: number] }>()

const canvasRef = ref<HTMLCanvasElement>()
const view = ref({ scale: 1, ox: 0, oy: 0 })
let offscreen: HTMLCanvasElement | null = null
let dragging = false
let lastX = 0
let lastY = 0
let moved = 0

// 对数色调映射: 背景深灰蓝 -> 亮缺陷青白
const tone_map = (img: WaferImage): HTMLCanvasElement => {
  const c = document.createElement("canvas")
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext("2d")!
  const out = ctx.createImageData(img.width, img.height)
  let vmax = 1
  for (let i = 0; i < img.pixels.length; i++) vmax = Math.max(vmax, img.pixels[i])
  const lmax = Math.log10(1 + vmax)
  for (let i = 0; i < img.pixels.length; i++) {
    const t = Math.log10(1 + img.pixels[i]) / lmax
    const u = t * t * (3 - 2 * t) // smoothstep 拉开层次
    out.data[i * 4] = 8 + u * 220
    out.data[i * 4 + 1] = 14 + u * 235
    out.data[i * 4 + 2] = 22 + u * 233
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return c
}

const draw = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext("2d")!
  const { width, height } = canvas
  ctx.fillStyle = "#0b0f14"
  ctx.fillRect(0, 0, width, height)
  if (!offscreen) return
  const { scale, ox, oy } = view.value
  const size = Math.min(width, height) * scale
  const cx = width / 2 + ox
  const cy = height / 2 + oy
  ctx.imageSmoothingEnabled = scale < 2
  ctx.drawImage(offscreen, cx - size / 2, cy - size / 2, size, size)
  // 晶圆边缘
  ctx.strokeStyle = "#2b3644"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.stroke()
  // 放大时标注缺陷
  if (scale > 2.5 && props.markers) {
    const px = size / (offscreen.width || 1)
    props.markers.forEach((m, i) => {
      const mx = cx - size / 2 + m.x * px
      const my = cy - size / 2 + m.y * px
      ctx.strokeStyle = i === props.selected ? "#22d3ee" : "rgba(139,152,169,0.6)"
      ctx.lineWidth = i === props.selected ? 2 : 1
      ctx.beginPath()
      ctx.arc(mx, my, i === props.selected ? 8 : 5, 0, Math.PI * 2)
      ctx.stroke()
    })
  }
}

const rebuild = (): void => {
  offscreen = props.image ? tone_map(props.image) : null
  draw()
}

onMounted(() => {
  const canvas = canvasRef.value!
  const fit = (): void => {
    const parent = canvas.parentElement!
    canvas.width = parent.clientWidth
    canvas.height = parent.clientHeight
    draw()
  }
  fit()
  new ResizeObserver(fit).observe(canvas.parentElement!)
  rebuild()
})

watch(() => props.image, rebuild)
watch(() => [props.markers, props.selected], draw, { deep: true })

const on_wheel = (e: WheelEvent): void => {
  const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
  view.value.scale = Math.min(40, Math.max(1, view.value.scale * factor))
  draw()
}

const on_down = (e: MouseEvent): void => {
  dragging = true
  moved = 0
  lastX = e.clientX
  lastY = e.clientY
}

const on_move = (e: MouseEvent): void => {
  if (!dragging) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  moved += Math.abs(dx) + Math.abs(dy)
  view.value.ox += dx
  view.value.oy += dy
  lastX = e.clientX
  lastY = e.clientY
  draw()
}

const on_up = (e: MouseEvent): void => {
  dragging = false
  if (moved > 4 || !props.markers || !offscreen) return
  // 点选: 找最近 marker
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const { scale, ox, oy } = view.value
  const size = Math.min(canvas.width, canvas.height) * scale
  const cx = canvas.width / 2 + ox
  const cy = canvas.height / 2 + oy
  const px = size / offscreen.width
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  let best = -1
  let bestD = 20 // 像素命中半径
  props.markers.forEach((m, i) => {
    const dx = cx - size / 2 + m.x * px - mx
    const dy = cy - size / 2 + m.y * px - my
    const d = Math.hypot(dx, dy)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (best >= 0) emit("pick", best)
}

const reset_view = (): void => {
  view.value = { scale: 1, ox: 0, oy: 0 }
  draw()
}

defineExpose({ reset_view })
</script>

<template>
  <div class="relative h-full w-full">
    <canvas
      ref="canvasRef"
      class="h-full w-full cursor-crosshair"
      @wheel.prevent="on_wheel"
      @mousedown="on_down"
      @mousemove="on_move"
      @mouseup="on_up"
      @mouseleave="dragging = false"
    ></canvas>
    <button class="btn absolute right-3 top-3" @click="reset_view">复位视图</button>
  </div>
</template>
