// 米氏散射解析级数参考实现 (Bohren & Huffman 4.5 节)
// 均匀球在均匀介质中的散射, 作为 GPU 计算着色器的对照基准
import { cadd, cdiv, cmul, cscale, csub, cabs2, type Cx } from "./complex.ts"

export interface MieCase {
  diameterNm: number
  nRe: number // 颗粒折射率实部
  nIm: number // 颗粒折射率虚部(吸收)
  wavelengthNm: number
  nMedium: number // 周围介质折射率(实数)
}

export interface MieTable {
  anglesDeg: number[]
  i1: number[] // 垂直偏振强度函数 |S1|^2
  i2: number[] // 平行偏振强度函数 |S2|^2
  qSca: number
  qExt: number
  k: number // 介质中波数, 1/nm
}

const MAX_N = 512

// 截断项数, Wiscombe 判据
const n_terms = (x: number): number => Math.min(MAX_N - 2, Math.round(x + 4 * Math.cbrt(x) + 2))

// 计算给定角度余弦 mu 处的 S1, S2
const mie_s12 = (x: number, m: Cx, mu: number, an: Cx[], bn: Cx[], nstop: number): [Cx, Cx] => {
  let s1: Cx = [0, 0]
  let s2: Cx = [0, 0]
  let piPrev = 0
  let piCur = 1
  for (let n = 1; n <= nstop; n++) {
    const piN = piCur
    const tauN = n * mu * piN - (n + 1) * piPrev
    const w = (2 * n + 1) / (n * (n + 1))
    s1 = cadd(s1, cscale(cadd(cmul(an[n], [piN, 0]), cmul(bn[n], [tauN, 0])), w))
    s2 = cadd(s2, cscale(cadd(cmul(an[n], [tauN, 0]), cmul(bn[n], [piN, 0])), w))
    const piNext = ((2 * n + 1) * mu * piN - (n + 1) * piPrev) / n
    piPrev = piN
    piCur = piNext
  }
  return [s1, s2]
}

// 米氏系数 an, bn, 对数导数用向下递推
export const mie_coeffs = (x: number, m: Cx): { an: Cx[]; bn: Cx[]; nstop: number } => {
  const nstop = n_terms(x)
  const mx: Cx = cmul(m, [x, 0])
  const an: Cx[] = new Array(nstop + 1)
  const bn: Cx[] = new Array(nstop + 1)

  // D_n(mx) 向下递推, 起点取更高阶保证收敛
  const nStart = nstop + 15
  const d: Cx[] = new Array(nStart + 1)
  d[nStart] = [0, 0]
  for (let n = nStart; n >= 1; n--) {
    const nOverMx = cdiv([n, 0], mx)
    const denom = cadd(d[n], nOverMx)
    d[n - 1] = csub(nOverMx, cdiv([1, 0], denom))
  }

  // psi_n(x), chi_n(x) 向上递推
  const psi: number[] = new Array(nstop + 1)
  const chi: number[] = new Array(nstop + 1)
  let psiPrev = Math.cos(x) // psi_{-1}
  let psiCur = Math.sin(x) // psi_0
  let chiPrev = -Math.sin(x) // chi_{-1}
  let chiCur = Math.cos(x) // chi_0
  psi[0] = psiCur
  chi[0] = chiCur
  for (let n = 1; n <= nstop; n++) {
    const psiNext = ((2 * n - 1) / x) * psiCur - psiPrev
    const chiNext = ((2 * n - 1) / x) * chiCur - chiPrev
    psi[n] = psiNext
    chi[n] = chiNext
    psiPrev = psiCur
    psiCur = psiNext
    chiPrev = chiCur
    chiCur = chiNext
  }

  const mInv = cdiv([1, 0], m)
  for (let n = 1; n <= nstop; n++) {
    const psiN = psi[n]
    const psiNm1 = psi[n - 1]
    const xiN: Cx = [psi[n], -chi[n]]
    const xiNm1: Cx = [psi[n - 1], -chi[n - 1]]
    const nOverX = n / x
    // an = [(Dn/m + n/x) psi_n - psi_{n-1}] / [(Dn/m + n/x) xi_n - xi_{n-1}]
    const tA = cadd(cmul(d[n], mInv), [nOverX, 0])
    an[n] = cdiv(csub(cscale(tA, psiN), [psiNm1, 0]), csub(cmul(tA, xiN), xiNm1))
    // bn = [(m Dn + n/x) psi_n - psi_{n-1}] / [(m Dn + n/x) xi_n - xi_{n-1}]
    const tB = cadd(cmul(m, d[n]), [nOverX, 0])
    bn[n] = cdiv(csub(cscale(tB, psiN), [psiNm1, 0]), csub(cmul(tB, xiN), xiNm1))
  }
  return { an, bn, nstop }
}

// 计算角分布表, angles 均匀覆盖 [0, 180]
export const mie_table = (mc: MieCase, nAngles = 181): MieTable => {
  const k = (2 * Math.PI * mc.nMedium) / mc.wavelengthNm
  const x = (k * mc.diameterNm) / 2
  const m: Cx = [mc.nRe / mc.nMedium, mc.nIm / mc.nMedium]
  const { an, bn, nstop } = mie_coeffs(x, m)

  const anglesDeg: number[] = []
  const i1: number[] = []
  const i2: number[] = []
  for (let i = 0; i < nAngles; i++) {
    const deg = (180 * i) / (nAngles - 1)
    const mu = Math.cos((deg * Math.PI) / 180)
    const [s1, s2] = mie_s12(x, m, mu, an, bn, nstop)
    anglesDeg.push(deg)
    i1.push(cabs2(s1))
    i2.push(cabs2(s2))
  }

  let qSca = 0
  let qExt = 0
  for (let n = 1; n <= nstop; n++) {
    qSca += (2 * n + 1) * (cabs2(an[n]) + cabs2(bn[n]))
    qExt += (2 * n + 1) * (an[n][0] + bn[n][0])
  }
  qSca = (2 / (x * x)) * qSca
  qExt = (2 / (x * x)) * qExt
  return { anglesDeg, i1, i2, qSca, qExt, k }
}
