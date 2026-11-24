// GPU vs CPU 米氏结果校验, 验收标准: 相对误差 < 1%
import { mie_table, type MieCase } from "@/physics/mie_cpu.ts"
import { run_mie_gpu } from "@/gpu/mie_gpu.ts"

export interface ValidationCaseResult {
  label: string
  maxRelErr: number
  qScaCpu: number
  qScaGpu: number
  qScaRelErr: number
}

export interface ValidationReport {
  ok: boolean
  maxRelErr: number
  cases: ValidationCaseResult[]
  elapsedMs: number
}

const VALIDATION_CASES: { label: string; c: MieCase }[] = [
  { label: "PSL 60nm @405", c: { diameterNm: 60, nRe: 1.59, nIm: 0, wavelengthNm: 405, nMedium: 1 } },
  { label: "PSL 200nm @532", c: { diameterNm: 200, nRe: 1.59, nIm: 0, wavelengthNm: 532, nMedium: 1 } },
  { label: "SiO2 500nm @532", c: { diameterNm: 500, nRe: 1.46, nIm: 0, wavelengthNm: 532, nMedium: 1 } },
  { label: "W 150nm @532 (吸收)", c: { diameterNm: 150, nRe: 3.4, nIm: 2.7, wavelengthNm: 532, nMedium: 1 } },
  { label: "空洞 300nm 介质1.46", c: { diameterNm: 300, nRe: 1.0, nIm: 0, wavelengthNm: 532, nMedium: 1.46 } },
  { label: "SiO2 2um @355", c: { diameterNm: 2000, nRe: 1.46, nIm: 0, wavelengthNm: 355, nMedium: 1 } },
]

export const validate_mie = async (): Promise<ValidationReport> => {
  const t0 = performance.now()
  const gpuTables = await run_mie_gpu(VALIDATION_CASES.map((v) => v.c))
  const cases: ValidationCaseResult[] = VALIDATION_CASES.map((v, i) => {
    const cpu = mie_table(v.c)
    const gpu = gpuTables[i]
    // 相对误差: 以该 case 最大强度为基准, 避免角分布零点处除零
    let maxI = 0
    for (let j = 0; j < cpu.i1.length; j++) {
      maxI = Math.max(maxI, cpu.i1[j], cpu.i2[j])
    }
    const floor = maxI * 1e-9
    let maxRel = 0
    for (let j = 0; j < cpu.i1.length; j++) {
      const e1 = Math.abs(gpu.i1[j] - cpu.i1[j]) / Math.max(cpu.i1[j], floor)
      const e2 = Math.abs(gpu.i2[j] - cpu.i2[j]) / Math.max(cpu.i2[j], floor)
      maxRel = Math.max(maxRel, e1, e2)
    }
    const qScaRelErr = Math.abs(gpu.qSca - cpu.qSca) / Math.max(cpu.qSca, 1e-30)
    return { label: v.label, maxRelErr: maxRel, qScaCpu: cpu.qSca, qScaGpu: gpu.qSca, qScaRelErr }
  })
  const maxRelErr = Math.max(...cases.map((c) => Math.max(c.maxRelErr, c.qScaRelErr)))
  return { ok: maxRelErr < 0.01, maxRelErr, cases, elapsedMs: performance.now() - t0 }
}
