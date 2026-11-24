// 仿真引擎: 剂量 -> 收集截面 -> 信号/背景 -> SNR -> 检出率
import type { Material, Recipe, SimSettings, Wafer, WaferDefect, DefectTemplate } from "@/libs/types.ts"
import { mie_table, type MieCase, type MieTable } from "@/physics/mie_cpu.ts"
import { run_mie_gpu } from "@/gpu/mie_gpu.ts"
import { gpu_available } from "@/gpu/device.ts"
import { stack_reflectance } from "@/physics/film.ts"
import { collect_cross_section, collect_haze, scratch_cross_section, scratch_collected } from "@/physics/collect.ts"

const H_C = 1.98644586e-25 // h*c, J*m

// 照明剂量, 光子/nm^2
export const dose_per_nm2 = (s: SimSettings, wavelengthNm: number): number => {
  const energyJ = s.powerMw * 1e-3 * s.dwellUs * 1e-6
  const photonJ = H_C / (wavelengthNm * 1e-9)
  const areaNm2 = (s.spotUm * 1000) ** 2
  return (energyJ / photonJ) / areaNm2
}

// erf 近似 (Abramowitz-Stegun 7.1.26)
export const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return x >= 0 ? y : -y
}

export const snr_to_pod = (snr: number, threshold: number): number =>
  0.5 * (1 + erf((snr - threshold) / (0.5 * Math.SQRT2)))

export const compute_snr = (sigE: number, bgE: number, readNoise: number): number =>
  sigE / Math.sqrt(sigE + bgE + readNoise * readNoise)

// ---- 米氏表缓存 (GPU 优先, 不可用时回退 CPU) ----
const tableCache = new Map<string, MieTable>()

export const clear_mie_cache = (): void => tableCache.clear()

const case_key = (c: MieCase): string =>
  [c.diameterNm.toFixed(1), c.nRe.toFixed(4), c.nIm.toFixed(4), c.wavelengthNm.toFixed(1), c.nMedium.toFixed(4)].join("|")

export const get_mie_tables = async (cases: MieCase[]): Promise<Map<string, MieTable>> => {
  // 按 key 去重, 避免几千个缺陷重复建表
  const uniq = new Map<string, MieCase>()
  for (const c of cases) {
    const k = case_key(c)
    if (!tableCache.has(k)) uniq.set(k, c)
  }
  const missing = [...uniq.values()]
  if (missing.length > 0) {
    let tables: MieTable[]
    if (gpu_available()) {
      try {
        tables = await run_mie_gpu(missing)
      } catch {
        tables = missing.map((c) => mie_table(c))
      }
    } else {
      tables = missing.map((c) => mie_table(c))
    }
    missing.forEach((c, i) => tableCache.set(case_key(c), tables[i]))
  }
  return new Map(cases.map((c) => [case_key(c), tableCache.get(case_key(c))!]))
}

export const mie_case_of = (
  defect: Pick<WaferDefect, "type" | "materialId" | "diameterNm">,
  mats: Map<string, Material>,
  wavelengthNm: number,
  nTop: number,
): MieCase => {
  const mat = mats.get(defect.materialId)
  const n = mat ? mat.n : 1.5
  const k = mat ? mat.k : 0
  // 坑: 顶层膜介质中的空洞; 颗粒/残留: 空气中的材料球
  const medium = defect.type === "pit" ? nTop : 1.0
  const nRe = defect.type === "pit" ? 1.0 : n
  const nIm = defect.type === "pit" ? 0 : k
  return { diameterNm: defect.diameterNm, nRe, nIm, wavelengthNm, nMedium: medium }
}

export interface DefectResult {
  defect: WaferDefect
  sigNarrow: number // 电子
  sigWide: number
  snrNarrow: number
  snrWide: number
}

export interface WaferSimResult {
  results: DefectResult[]
  bgNarrow: number // 每光斑背景电子
  bgWide: number
  dose: number
  reflectance: { rs: number; rp: number }
  elapsedMs: number
}

export const simulate_wafer = async (
  wafer: Wafer,
  recipe: Recipe,
  settings: SimSettings,
  materials: Material[],
): Promise<WaferSimResult> => {
  const t0 = performance.now()
  const mats = new Map(materials.map((m) => [m.id, m]))
  const sub = mats.get(wafer.substrateMaterialId)
  const layers = wafer.layers.map((l) => {
    const m = mats.get(l.materialId)
    return { n: m ? m.n : 1.5, k: m ? m.k : 0, thicknessNm: l.thicknessNm }
  })
  const stack = stack_reflectance(
    1.0,
    layers,
    [sub ? sub.n : 4.15, sub ? sub.k : 0.05],
    recipe.incidenceDeg,
    recipe.wavelengthNm,
  )
  const nTop = stack.nTop

  // 米氏类缺陷建表
  const mieDefects = wafer.defects.filter((d) => d.type !== "scratch")
  const cases = mieDefects.map((d) => mie_case_of(d, mats, recipe.wavelengthNm, nTop))
  const tables = await get_mie_tables(cases)

  const dose = dose_per_nm2(settings, recipe.wavelengthNm)
  const spotNm2 = (settings.spotUm * 1000) ** 2
  const qe = settings.quantumEff

  const hazeNarrow = collect_haze(wafer.roughness, recipe.wavelengthNm, recipe.incidenceDeg, recipe.narrow, nTop)
  const hazeWide = collect_haze(wafer.roughness, recipe.wavelengthNm, recipe.incidenceDeg, recipe.wide, nTop)
  const bgNarrow = dose * hazeNarrow * spotNm2 * qe
  const bgWide = dose * hazeWide * spotNm2 * qe

  const results: DefectResult[] = wafer.defects.map((d) => {
    let sigN = 0
    let sigW = 0
    if (d.type === "scratch") {
      const sigma = scratch_cross_section(d.lengthNm, d.widthNm, d.depthNm, recipe.wavelengthNm, nTop)
      sigN = dose * scratch_collected(sigma, recipe.narrow) * qe
      sigW = dose * scratch_collected(sigma, recipe.wide) * qe
    } else {
      const table = tables.get(case_key(mie_case_of(d, mats, recipe.wavelengthNm, nTop)))!
      const csN = collect_cross_section(table, recipe.narrow, recipe.incidenceDeg, recipe.polarization)
      const csW = collect_cross_section(table, recipe.wide, recipe.incidenceDeg, recipe.polarization)
      sigN = dose * csN * qe
      sigW = dose * csW * qe
    }
    return {
      defect: d,
      sigNarrow: sigN,
      sigWide: sigW,
      snrNarrow: compute_snr(sigN, bgNarrow, settings.readNoise),
      snrWide: compute_snr(sigW, bgWide, settings.readNoise),
    }
  })

  return {
    results,
    bgNarrow,
    bgWide,
    dose,
    reflectance: { rs: stack.rs, rp: stack.rp },
    elapsedMs: performance.now() - t0,
  }
}

export interface PodPoint {
  sizeNm: number
  snr: number
  pod: number
}

// 检出率曲线: 米氏类按直径扫, 划痕按宽度扫
export const pod_curve = async (
  template: DefectTemplate,
  recipe: Recipe,
  settings: SimSettings,
  materials: Material[],
  wafer: Wafer,
  sizesNm: number[],
): Promise<PodPoint[]> => {
  const mats = new Map(materials.map((m) => [m.id, m]))
  const sub = mats.get(wafer.substrateMaterialId)
  const layers = wafer.layers.map((l) => {
    const m = mats.get(l.materialId)
    return { n: m ? m.n : 1.5, k: m ? m.k : 0, thicknessNm: l.thicknessNm }
  })
  const stack = stack_reflectance(1.0, layers, [sub ? sub.n : 4.15, sub ? sub.k : 0.05], recipe.incidenceDeg, recipe.wavelengthNm)
  const nTop = stack.nTop
  const dose = dose_per_nm2(settings, recipe.wavelengthNm)
  const spotNm2 = (settings.spotUm * 1000) ** 2
  const qe = settings.quantumEff

  const ch = recipe.wide.enabled ? recipe.wide : recipe.narrow
  const haze = collect_haze(wafer.roughness, recipe.wavelengthNm, recipe.incidenceDeg, ch, nTop)
  const bg = dose * haze * spotNm2 * qe

  if (template.type === "scratch") {
    return sizesNm.map((w) => {
      const sigma = scratch_cross_section(template.lengthNm, w, template.depthNm, recipe.wavelengthNm, nTop)
      const sig = dose * scratch_collected(sigma, ch) * qe
      const snr = compute_snr(sig, bg, settings.readNoise)
      return { sizeNm: w, snr, pod: snr_to_pod(snr, settings.snrThreshold) }
    })
  }

  const probe: WaferDefect = {
    templateId: template.id,
    type: template.type,
    materialId: template.materialId,
    diameterNm: 0,
    widthNm: 0,
    depthNm: 0,
    lengthNm: 0,
    xMm: 0,
    yMm: 0,
    angleDeg: 0,
  }
  const cases = sizesNm.map((d) => mie_case_of({ ...probe, diameterNm: d }, mats, recipe.wavelengthNm, nTop))
  const tables = await get_mie_tables(cases)
  return sizesNm.map((d, i) => {
    const table = tables.get(case_key(cases[i]))!
    const cs = collect_cross_section(table, ch, recipe.incidenceDeg, recipe.polarization)
    const sig = dose * cs * qe
    const snr = compute_snr(sig, bg, settings.readNoise)
    return { sizeNm: d, snr, pod: snr_to_pod(snr, settings.snrThreshold) }
  })
}
