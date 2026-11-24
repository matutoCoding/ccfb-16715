// 内置材料库 (折射率为工作波段代表值)
import type { Material } from "@/libs/types.ts"

export const PRESET_MATERIALS: Material[] = [
  { id: "si", name: "Si 硅", n: 4.15, k: 0.05, builtin: true },
  { id: "sio2", name: "SiO2 氧化硅", n: 1.46, k: 0, builtin: true },
  { id: "si3n4", name: "Si3N4 氮化硅", n: 2.02, k: 0, builtin: true },
  { id: "psl", name: "PSL 聚苯乙烯球", n: 1.59, k: 0, builtin: true },
  { id: "w", name: "W 钨", n: 3.4, k: 2.7, builtin: true },
  { id: "al", name: "Al 铝", n: 0.94, k: 6.4, builtin: true },
  { id: "cu", name: "Cu 铜", n: 1.1, k: 2.6, builtin: true },
  { id: "pr", name: "光刻胶", n: 1.62, k: 0.01, builtin: true },
  { id: "org", name: "有机残留", n: 1.5, k: 0.02, builtin: true },
  { id: "void", name: "空气/空洞", n: 1.0, k: 0, builtin: true },
]
