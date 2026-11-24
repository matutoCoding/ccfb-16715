// 收集通道立体角积分与缺陷收集截面
import type { CollectChannel, Polarization, PsdAbc } from "@/libs/types.ts"
import { brdf } from "./haze.ts"
import type { MieTable } from "./mie_cpu.ts"

const DEG = Math.PI / 180

// 散射角: 入射方向极角 ti 方位 0, 散射方向 (ts, ps)
export const scatter_angle_deg = (tiDeg: number, tsDeg: number, psDeg: number): number => {
  const ti = tiDeg * DEG
  const ts = tsDeg * DEG
  const ps = psDeg * DEG
  const c = Math.cos(ti) * Math.cos(ts) + Math.sin(ti) * Math.sin(ts) * Math.cos(ps)
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG
}

export const channel_solid_angle = (ch: CollectChannel): number => {
  const az = ((ch.azimMaxDeg - ch.azimMinDeg) * DEG)
  return az * (Math.cos(ch.polarMinDeg * DEG) - Math.cos(ch.polarMaxDeg * DEG))
}

// 角度分布表线性插值, 返回 i1/i2
export const interp_i = (table: MieTable, angleDeg: number): [number, number] => {
  const n = table.anglesDeg.length
  const pos = (angleDeg / 180) * (n - 1)
  const i0 = Math.min(n - 2, Math.max(0, Math.floor(pos)))
  const t = Math.min(1, Math.max(0, pos - i0))
  return [
    table.i1[i0] * (1 - t) + table.i1[i0 + 1] * t,
    table.i2[i0] * (1 - t) + table.i2[i0 + 1] * t,
  ]
}

// 米氏表在通道立体角内积分 -> 收集截面 nm^2
export const collect_cross_section = (
  table: MieTable,
  ch: CollectChannel,
  incidenceDeg: number,
  pol: Polarization,
  nT = 24,
  nP = 24,
): number => {
  const k2 = table.k * table.k
  const dT = (ch.polarMaxDeg - ch.polarMinDeg) / nT
  const dP = (ch.azimMaxDeg - ch.azimMinDeg) / nP
  let acc = 0
  for (let it = 0; it < nT; it++) {
    const ts = ch.polarMinDeg + (it + 0.5) * dT
    const sinT = Math.sin(ts * DEG)
    for (let ip = 0; ip < nP; ip++) {
      const ps = ch.azimMinDeg + (ip + 0.5) * dP
      const theta = scatter_angle_deg(incidenceDeg, ts, ps)
      const [i1, i2] = interp_i(table, theta)
      // dC/dΩ = i/k^2, s 偏振对应 i1, p 偏振对应 i2
      const iPol = pol === "s" ? i1 : pol === "p" ? i2 : (i1 + i2) / 2
      acc += (iPol / k2) * sinT * dT * DEG * dP * DEG
    }
  }
  return acc
}

// 雾度: BRDF 在通道立体角内积分 -> 单位面积散射份额 (1/sr * sr)
export const collect_haze = (
  psd: PsdAbc,
  lambdaNm: number,
  incidenceDeg: number,
  ch: CollectChannel,
  nTop: number,
  nT = 24,
  nP = 24,
): number => {
  const dT = (ch.polarMaxDeg - ch.polarMinDeg) / nT
  const dP = (ch.azimMaxDeg - ch.azimMinDeg) / nP
  let acc = 0
  for (let it = 0; it < nT; it++) {
    const ts = ch.polarMinDeg + (it + 0.5) * dT
    const sinT = Math.sin(ts * DEG)
    for (let ip = 0; ip < nP; ip++) {
      const ps = ch.azimMinDeg + (ip + 0.5) * dP
      acc += brdf(psd, lambdaNm, incidenceDeg, { thetaSDeg: ts, phiSDeg: ps }, nTop) * sinT * dT * DEG * dP * DEG
    }
  }
  return acc
}

// 划痕沟槽工程模型: 总散射截面 nm^2, 角分布近似半球均匀
// sigma = C * L * w * (w/lambda) * (d/lambda) * |m^2 - 1|^2
export const scratch_cross_section = (
  lengthNm: number,
  widthNm: number,
  depthNm: number,
  lambdaNm: number,
  nContrast: number,
): number => {
  const c = 0.02
  const contrast = (nContrast * nContrast - 1) ** 2
  return c * lengthNm * widthNm * (widthNm / lambdaNm) * (depthNm / lambdaNm) * contrast
}

// 划痕收集截面: 半球均匀假设
export const scratch_collected = (
  sigmaTotal: number,
  ch: CollectChannel,
): number => sigmaTotal * (channel_solid_angle(ch) / (2 * Math.PI))
