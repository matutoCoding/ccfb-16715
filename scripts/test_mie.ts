// CPU 米氏级数实现自检: 瑞利极限 / 消光悖论 / 无吸收时 Qext==Qsca
// 运行: node scripts/test_mie.ts
import { mie_table } from "../src/physics/mie_cpu.ts"

let fail = 0
const check = (name: string, got: number, want: number, tol: number): void => {
  const rel = Math.abs(got - want) / Math.max(Math.abs(want), 1e-30)
  const ok = rel <= tol
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got=${got.toPrecision(6)} want=${want.toPrecision(6)} rel=${rel.toExponential(2)}`)
}

// 1. 瑞利极限: x 很小时 Qsca -> (8/3) x^4 |(m^2-1)/(m^2+2)|^2
{
  const lam = 532
  const d = 2 // nm, x = pi*d/lam ~ 0.0118
  const m = 1.5
  const t = mie_table({ diameterNm: d, nRe: m, nIm: 0, wavelengthNm: lam, nMedium: 1 })
  const x = (Math.PI * d) / lam
  const ray = (8 / 3) * x ** 4 * ((m * m - 1) / (m * m + 2)) ** 2
  check("rayleigh_qsca", t.qSca, ray, 1e-3)
  check("lossless_albedo_small", t.qExt, t.qSca, 1e-6)
}

// 2. 无吸收大球: Qext -> 2 (消光悖论, 收敛慢取 3% 容差)
{
  const t = mie_table({ diameterNm: 50000, nRe: 1.33, nIm: 0, wavelengthNm: 532, nMedium: 1 })
  check("extinction_paradox", t.qExt, 2, 0.03)
  check("lossless_albedo_large", t.qExt, t.qSca, 1e-4)
}

// 3. 中等尺寸无吸收: Qext == Qsca
{
  const t = mie_table({ diameterNm: 500, nRe: 1.45, nIm: 0, wavelengthNm: 532, nMedium: 1 })
  check("lossless_albedo_mid", t.qExt, t.qSca, 1e-8)
  console.log(`  info: x=${((Math.PI * 500) / 532).toFixed(2)} qSca=${t.qSca.toFixed(4)}`)
}

// 4. 吸收球: Qext > Qsca, 且均为正有限
{
  const t = mie_table({ diameterNm: 300, nRe: 3.2, nIm: 1.5, wavelengthNm: 532, nMedium: 1 })
  const ok = t.qExt > t.qSca && t.qSca > 0 && Number.isFinite(t.qExt)
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"} absorbing: qExt=${t.qExt.toFixed(4)} qSca=${t.qSca.toFixed(4)}`)
}

// 5. 介质中球 (坑模型: 空气泡在 SiO2 中, m<1)
{
  const t = mie_table({ diameterNm: 100, nRe: 1.0, nIm: 0, wavelengthNm: 532, nMedium: 1.46 })
  const ok = Number.isFinite(t.qSca) && t.qSca > 0 && Math.abs(t.qExt - t.qSca) / t.qExt < 1e-6
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"} void_in_medium: qSca=${t.qSca.toExponential(3)}`)
}

// 6. 角分布无 NaN, 前向远大于后向(大球)
{
  const t = mie_table({ diameterNm: 2000, nRe: 1.45, nIm: 0, wavelengthNm: 532, nMedium: 1 })
  const nan = t.i1.some((v) => !Number.isFinite(v)) || t.i2.some((v) => !Number.isFinite(v))
  const fwd = (t.i1[0] + t.i2[0]) / 2
  const bwd = (t.i1[180] + t.i2[180]) / 2
  const ok = !nan && fwd > 100 * bwd
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"} angular: fwd=${fwd.toExponential(3)} bwd=${bwd.toExponential(3)}`)
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`)
process.exit(fail === 0 ? 0 : 1)
