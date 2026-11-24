// 表面粗糙度 -> PSD -> 雾度 (Rayleigh-Rice 矢量微扰的标量近似)
import type { PsdAbc } from "@/libs/types.ts"

// ABC 模型 PSD, f 单位 1/um, 返回 um^4 (nm^2*um^2 = 1e-6 um^4)
export const psd_abc_um4 = (psd: PsdAbc, fInvUm: number): number => {
  const bf2 = (psd.b * fInvUm) ** 2
  return (psd.a * 1e-6) / Math.pow(1 + bf2, psd.c / 2)
}

// RMS 粗糙度, 数值积分 sigma^2 = 2 pi ∫ PSD(f) f df, 返回 nm
export const rms_from_psd = (psd: PsdAbc, fMinInvUm = 1e-3, fMaxInvUm = 1e3): number => {
  const n = 2000
  const dLog = (Math.log(fMaxInvUm) - Math.log(fMinInvUm)) / n
  let acc = 0
  for (let i = 0; i < n; i++) {
    const f = Math.exp(Math.log(fMinInvUm) + (i + 0.5) * dLog)
    // sigma^2 = 2π∫PSD f df, PSD 单位 um^4 -> um^2
    acc += 2 * Math.PI * psd_abc_um4(psd, f) * f * f * dLog
  }
  return Math.sqrt(acc) * 1000 // um -> nm
}

// 总积分散射 TIS = (4 pi sigma cos(theta_i) / lambda)^2
export const tis = (sigmaNm: number, lambdaNm: number, thetaIDeg: number): number => {
  const c = Math.cos((thetaIDeg * Math.PI) / 180)
  return ((4 * Math.PI * sigmaNm * c) / lambdaNm) ** 2
}

export interface ScatterDir {
  thetaSDeg: number
  phiSDeg: number
}

// 单次 BRDF (1/sr), 标量近似: BRDF = 16 pi^2 / lambda^4 * cos ti * cos ts * Q * PSD(fx, fy)
export const brdf = (
  psd: PsdAbc,
  lambdaNm: number,
  thetaIDeg: number,
  dir: ScatterDir,
  nTop: number,
): number => {
  const lamUm = lambdaNm / 1000
  const ti = (thetaIDeg * Math.PI) / 180
  const ts = (dir.thetaSDeg * Math.PI) / 180
  const fx = (Math.sin(ts) * Math.cos((dir.phiSDeg * Math.PI) / 180) - Math.sin(ti)) / lamUm
  const fy = (Math.sin(ts) * Math.sin((dir.phiSDeg * Math.PI) / 180)) / lamUm
  const f = Math.hypot(fx, fy)
  const q = (nTop * nTop - 1) ** 2 // 标量光学因子近似
  return (
    ((16 * Math.PI * Math.PI) / lamUm ** 4) *
    Math.cos(ti) *
    Math.cos(ts) *
    q *
    psd_abc_um4(psd, f)
  )
}
