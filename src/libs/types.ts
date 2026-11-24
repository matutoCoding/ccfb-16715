// 全局数据类型定义

export interface Material {
  id: string
  name: string
  n: number // 折射率实部
  k: number // 消光系数
  builtin?: boolean
}

export interface FilmLayer {
  materialId: string
  thicknessNm: number
}

// 表面粗糙度 PSD,ABC 模型(K-correlation): PSD(f) = A / (1 + (B f)^2)^(C/2)
export interface PsdAbc {
  a: number // 幅值, nm^2 * um^2
  b: number // 相关长度, um
  c: number // 幂指数
}

export interface Wafer {
  id: string
  name: string
  diameterMm: number
  substrateMaterialId: string
  layers: FilmLayer[]
  roughness: PsdAbc
  defects: WaferDefect[]
  createdAt: number
  updatedAt: number
}

export type DefectType = "particle" | "pit" | "scratch" | "residue"

// 缺陷库模板
export interface DefectTemplate {
  id: string
  name: string
  type: DefectType
  materialId: string // 颗粒/坑/残留用; 划痕为沟槽材料对比度
  diameterNm: number // 颗粒/坑/残留等效直径
  widthNm: number // 划痕宽
  depthNm: number // 划痕深
  lengthNm: number // 划痕长
  createdAt: number
}

// 撒到晶圆上的缺陷实例
export interface WaferDefect {
  templateId: string
  type: DefectType
  materialId: string
  diameterNm: number
  widthNm: number
  depthNm: number
  lengthNm: number
  xMm: number // 晶圆坐标, 圆心为原点
  yMm: number
  angleDeg: number // 划痕走向
}

export type Polarization = "s" | "p" | "u"

// 收集通道: 极角范围(相对法线) + 方位角范围(相对入射面)
export interface CollectChannel {
  enabled: boolean
  polarMinDeg: number
  polarMaxDeg: number
  azimMinDeg: number
  azimMaxDeg: number
}

export interface Recipe {
  id: string
  name: string
  wavelengthNm: number
  incidenceDeg: number // 入射极角, 相对法线
  azimuthDeg: number // 入射方位角
  polarization: Polarization
  narrow: CollectChannel
  wide: CollectChannel
  createdAt: number
  updatedAt: number
}

export interface SimSettings {
  powerMw: number // 激光功率
  spotUm: number // 照明光斑边长(方形)
  dwellUs: number // 单点驻留时间
  readNoise: number // 读出噪声, 电子
  snrThreshold: number // 检出阈值
  imageSize: number // 晶圆图分辨率
  quantumEff: number // 探测器量子效率 0..1
}

export const DEFAULT_SETTINGS: SimSettings = {
  powerMw: 50,
  spotUm: 30,
  dwellUs: 10,
  readNoise: 5,
  snrThreshold: 5,
  imageSize: 1024,
  quantumEff: 0.8,
}

export const DEFECT_TYPE_NAMES: Record<DefectType, string> = {
  particle: "颗粒",
  pit: "坑",
  scratch: "划痕",
  residue: "残留",
}

// 图表序列
export interface ChartSeries {
  name: string
  color: string
  points: { x: number; y: number }[]
}

// 晶圆图缺陷标注
export interface MapDefect {
  x: number // 像素坐标
  y: number
  label: string
}
