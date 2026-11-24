// 多层膜特征矩阵法, 计算斜入射反射率
import { cadd, cdiv, cmul, csub, cabs2, type Cx } from "./complex.ts"

export interface FilmStackLayer {
  n: number
  k: number
  thicknessNm: number
}

export interface StackReflectance {
  rs: number
  rp: number
  // 顶层介质折射率, 散射计算的介质
  nTop: number
}

const ccos = (z: Cx): Cx => [
  Math.cos(z[0]) * Math.cosh(z[1]),
  -Math.sin(z[0]) * Math.sinh(z[1]),
]
const csin = (z: Cx): Cx => [
  Math.sin(z[0]) * Math.cosh(z[1]),
  Math.cos(z[0]) * Math.sinh(z[1]),
]
const csqrt = (z: Cx): Cx => {
  const r = Math.hypot(z[0], z[1])
  return [Math.sqrt((r + z[0]) / 2), Math.sign(z[1] || 1) * Math.sqrt((r - z[0]) / 2)]
}

// 单偏振下膜系振幅反射系数
const stack_r = (
  n0: Cx,
  layers: FilmStackLayer[],
  nSub: Cx,
  theta0: number,
  lambdaNm: number,
  pol: "s" | "p",
): Cx => {
  const sin0 = Math.sin(theta0)
  // 各层折射角: n0 sin0 = nj sinj => cosj = csqrt(1 - (n0 sin0 / nj)^2)
  const cosOf = (nj: Cx): Cx => {
    const s = cdiv(cmul(n0, [sin0, 0]), nj)
    return csqrt(csub([1, 0], cmul(s, s)))
  }
  const etaOf = (nj: Cx, cosj: Cx): Cx => (pol === "s" ? cmul(nj, cosj) : cdiv(nj, cosj))

  const eta0 = etaOf(n0, ccos([theta0, 0]) as Cx)
  const etaSub = etaOf(nSub, cosOf(nSub))

  // M = 连乘 [cos d, i sin d / eta; i eta sin d, cos d]
  let m11: Cx = [1, 0]
  let m12: Cx = [0, 0]
  let m21: Cx = [0, 0]
  let m22: Cx = [1, 0]
  for (const layer of layers) {
    const nj: Cx = [layer.n, layer.k]
    const cosj = cosOf(nj)
    const delta = cmul(cmul(nj, cosj), [(2 * Math.PI * layer.thicknessNm) / lambdaNm, 0])
    const cd = ccos(delta)
    const sd = csin(delta)
    const etaJ = etaOf(nj, cosj)
    const a = cd
    const b = cmul([0, 1], cdiv(sd, etaJ))
    const c = cmul([0, 1], cmul(etaJ, sd))
    const d = cd
    const n11 = cadd(cmul(m11, a), cmul(m12, c))
    const n12 = cadd(cmul(m11, b), cmul(m12, d))
    const n21 = cadd(cmul(m21, a), cmul(m22, c))
    const n22 = cadd(cmul(m21, b), cmul(m22, d))
    m11 = n11
    m12 = n12
    m21 = n21
    m22 = n22
  }
  const bCap = cadd(m11, cmul(m12, etaSub))
  const cCap = cadd(m21, cmul(m22, etaSub))
  return cdiv(csub(cmul(eta0, bCap), cCap), cadd(cmul(eta0, bCap), cCap))
}

export const stack_reflectance = (
  n0: number,
  layers: FilmStackLayer[],
  nSub: Cx,
  theta0Deg: number,
  lambdaNm: number,
): StackReflectance => {
  const theta0 = (theta0Deg * Math.PI) / 180
  const rs = cabs2(stack_r([n0, 0], layers, nSub, theta0, lambdaNm, "s"))
  const rp = cabs2(stack_r([n0, 0], layers, nSub, theta0, lambdaNm, "p"))
  const nTop = layers.length > 0 ? layers[0].n : nSub[0]
  return { rs, rp, nTop }
}
