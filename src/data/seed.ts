// 种子数据: 演示晶圆(300mm, 几千个缺陷) + 缺陷库模板 + 示例配方
import type { DefectTemplate, Recipe, Wafer, WaferDefect } from "@/libs/types.ts"

// 确定性伪随机, 保证每次播种一致
const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const seed_defect_templates = (): DefectTemplate[] => [
  { id: "tpl-psl", name: "PSL 标准球", type: "particle", materialId: "psl", diameterNm: 100, widthNm: 0, depthNm: 0, lengthNm: 0, createdAt: Date.now() },
  { id: "tpl-sio2", name: "SiO2 颗粒", type: "particle", materialId: "sio2", diameterNm: 150, widthNm: 0, depthNm: 0, lengthNm: 0, createdAt: Date.now() },
  { id: "tpl-metal", name: "金属颗粒 (W)", type: "particle", materialId: "w", diameterNm: 120, widthNm: 0, depthNm: 0, lengthNm: 0, createdAt: Date.now() },
  { id: "tpl-pit", name: "晶体坑 COP", type: "pit", materialId: "void", diameterNm: 80, widthNm: 0, depthNm: 0, lengthNm: 0, createdAt: Date.now() },
  { id: "tpl-scratch", name: "抛光划痕", type: "scratch", materialId: "sio2", diameterNm: 0, widthNm: 200, depthNm: 20, lengthNm: 1e6, createdAt: Date.now() },
  { id: "tpl-residue", name: "有机残留", type: "residue", materialId: "org", diameterNm: 300, widthNm: 0, depthNm: 0, lengthNm: 0, createdAt: Date.now() },
]

export const seed_recipes = (): Recipe[] => [
  {
    id: "rcp-oblique-p",
    name: "斜入射 P 偏振 宽角",
    wavelengthNm: 532,
    incidenceDeg: 65,
    azimuthDeg: 0,
    polarization: "p",
    narrow: { enabled: true, polarMinDeg: 20, polarMaxDeg: 40, azimMinDeg: -60, azimMaxDeg: 60 },
    wide: { enabled: true, polarMinDeg: 40, polarMaxDeg: 75, azimMinDeg: -90, azimMaxDeg: 90 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "rcp-normal-s",
    name: "近法向 S 偏振 窄角",
    wavelengthNm: 405,
    incidenceDeg: 15,
    azimuthDeg: 0,
    polarization: "s",
    narrow: { enabled: true, polarMinDeg: 25, polarMaxDeg: 45, azimMinDeg: -45, azimMaxDeg: 45 },
    wide: { enabled: false, polarMinDeg: 45, polarMaxDeg: 70, azimMinDeg: -90, azimMaxDeg: 90 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "rcp-grazing-u",
    name: "掠入射 非偏振 双通道",
    wavelengthNm: 355,
    incidenceDeg: 75,
    azimuthDeg: 30,
    polarization: "u",
    narrow: { enabled: true, polarMinDeg: 15, polarMaxDeg: 35, azimMinDeg: -50, azimMaxDeg: 50 },
    wide: { enabled: true, polarMinDeg: 35, polarMaxDeg: 80, azimMinDeg: -120, azimMaxDeg: 120 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

// 生成 300mm 演示晶圆: ~3000 颗粒(对数正态尺寸) + 坑/残留 + 划痕
export const seed_wafer = (): Wafer => {
  const rand = mulberry32(20261125)
  const radiusMm = 150
  const defects: WaferDefect[] = []

  const place = (): [number, number] => {
    const r = radiusMm * Math.sqrt(rand()) * 0.98
    const a = rand() * 2 * Math.PI
    return [r * Math.cos(a), r * Math.sin(a)]
  }

  // 对数正态粒径: 中位 90nm, sigma 0.45
  const lognormal = (median: number, sigma: number): number => {
    const u1 = Math.max(rand(), 1e-9)
    const u2 = rand()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return median * Math.exp(sigma * z)
  }

  const pushParticle = (templateId: string, materialId: string, diameterNm: number): void => {
    const [x, y] = place()
    defects.push({ templateId, type: "particle", materialId, diameterNm, widthNm: 0, depthNm: 0, lengthNm: 0, xMm: x, yMm: y, angleDeg: 0 })
  }

  for (let i = 0; i < 2200; i++) pushParticle("tpl-psl", "psl", lognormal(90, 0.45))
  for (let i = 0; i < 600; i++) pushParticle("tpl-sio2", "sio2", lognormal(140, 0.4))
  for (let i = 0; i < 250; i++) pushParticle("tpl-metal", "w", lognormal(110, 0.35))

  for (let i = 0; i < 120; i++) {
    const [x, y] = place()
    defects.push({ templateId: "tpl-pit", type: "pit", materialId: "void", diameterNm: lognormal(75, 0.3), widthNm: 0, depthNm: 0, lengthNm: 0, xMm: x, yMm: y, angleDeg: 0 })
  }
  for (let i = 0; i < 150; i++) {
    const [x, y] = place()
    defects.push({ templateId: "tpl-residue", type: "residue", materialId: "org", diameterNm: lognormal(280, 0.35), widthNm: 0, depthNm: 0, lengthNm: 0, xMm: x, yMm: y, angleDeg: 0 })
  }
  for (let i = 0; i < 8; i++) {
    const [x, y] = place()
    defects.push({
      templateId: "tpl-scratch",
      type: "scratch",
      materialId: "sio2",
      diameterNm: 0,
      widthNm: 150 + rand() * 200,
      depthNm: 10 + rand() * 30,
      lengthNm: (2 + rand() * 15) * 1e6,
      xMm: x,
      yMm: y,
      angleDeg: rand() * 180,
    })
  }

  return {
    id: "wafer-demo-300",
    name: "W300-DEMO 演示晶圆",
    diameterMm: 300,
    substrateMaterialId: "si",
    layers: [
      { materialId: "sio2", thicknessNm: 100 },
      { materialId: "si3n4", thicknessNm: 50 },
    ],
    roughness: { a: 2.5e-3, b: 0.8, c: 3.2 },
    defects,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
