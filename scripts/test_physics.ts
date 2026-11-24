// 物理模块与端到端仿真自检 (CPU 路径)
// 运行: node scripts/test_physics.ts
import { stack_reflectance } from "../src/physics/film.ts"
import { rms_from_psd, tis } from "../src/physics/haze.ts"
import { collect_haze, channel_solid_angle } from "../src/physics/collect.ts"
import { simulate_wafer, pod_curve } from "../src/engine/sim.ts"
import { seed_wafer, seed_recipes, seed_defect_templates } from "../src/data/seed.ts"
import { PRESET_MATERIALS } from "../src/data/materials.ts"
import { DEFAULT_SETTINGS } from "../src/libs/types.ts"

let fail = 0
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`)
}

// 1. 裸硅法向入射反射率 vs 菲涅尔公式
{
  const r = stack_reflectance(1, [], [4.15, 0.05], 0, 532)
  const fresnel = ((4.15 - 1) ** 2 + 0.05 ** 2) / ((4.15 + 1) ** 2 + 0.05 ** 2)
  check("bare_si_fresnel", Math.abs(r.rs - fresnel) / fresnel < 1e-6, `rs=${r.rs.toFixed(4)} fresnel=${fresnel.toFixed(4)}`)
}

// 2. 四分之一波 SiO2 减反: 反射率应显著低于裸硅 (SiO2 非 Si 的理想增透材料, 约 0.10)
{
  const d = 532 / (4 * 1.46)
  const r = stack_reflectance(1, [{ n: 1.46, k: 0, thicknessNm: d }], [4.15, 0.05], 0, 532)
  check("quarter_wave_ar", r.rs < 0.15 && r.rs > 0.05, `rs=${r.rs.toFixed(4)} @d=${d.toFixed(1)}nm (裸硅 0.374)`)
}

// 3. 半球积分雾度 vs TIS 公式, 同一量级
{
  const psd = { a: 2.5e-3, b: 0.8, c: 3.2 }
  const sigma = rms_from_psd(psd)
  const tisVal = tis(sigma, 532, 60)
  const hemi = collect_haze(psd, 532, 60, { enabled: true, polarMinDeg: 0, polarMaxDeg: 89, azimMinDeg: -180, azimMaxDeg: 180 }, 1.46, 48, 48)
  const ratio = hemi / tisVal
  check("haze_vs_tis", ratio > 0.1 && ratio < 10, `sigma=${sigma.toFixed(3)}nm tis=${tisVal.toExponential(2)} integ=${hemi.toExponential(2)} ratio=${ratio.toFixed(2)}`)
  check("solid_angle_hemi", Math.abs(channel_solid_angle({ enabled: true, polarMinDeg: 0, polarMaxDeg: 90, azimMinDeg: -180, azimMaxDeg: 180 }) - 2 * Math.PI) < 1e-9)
}

// 4. 端到端: 300mm 演示晶圆全流程仿真
{
  const wafer = seed_wafer()
  const recipe = seed_recipes()[0]
  const t0 = performance.now()
  const sim = await simulate_wafer(wafer, recipe, DEFAULT_SETTINGS, PRESET_MATERIALS)
  const elapsed = performance.now() - t0
  check("sim_count", sim.results.length === wafer.defects.length, `${sim.results.length} defects`)
  check("sim_finite", sim.results.every((r) => Number.isFinite(r.snrWide) && r.sigWide >= 0))
  check("sim_time_cpu", elapsed < 10000, `CPU 路径 ${elapsed.toFixed(0)}ms (验收 10s, GPU 更快)`)
  const scratches = sim.results.filter((r) => r.defect.type === "scratch")
  const particles = sim.results.filter((r) => r.defect.type === "particle")
  const median = (arr: number[]): number => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)]
  const medScratch = median(scratches.map((r) => r.sigWide))
  const medParticle = median(particles.map((r) => r.sigWide))
  const allScratchDetected = scratches.every((r) => r.snrWide >= DEFAULT_SETTINGS.snrThreshold)
  check("scratch_bright", allScratchDetected && medScratch > medParticle, `划痕中位=${medScratch.toExponential(2)} 颗粒中位=${medParticle.toExponential(2)} 全部检出=${allScratchDetected}`)
  const detected = sim.results.filter((r) => r.snrWide >= DEFAULT_SETTINGS.snrThreshold).length
  check("some_detected", detected > 0, `检出 ${detected}/${sim.results.length}, bg=${sim.bgWide.toExponential(2)}e-`)
}

// 5. POD 曲线单调趋势: 大颗粒检出率显著高于小颗粒
{
  const wafer = seed_wafer()
  const recipe = seed_recipes()[0]
  const tpl = seed_defect_templates()[0] // PSL
  const sizes = [30, 60, 100, 200, 400, 600]
  const pts = await pod_curve(tpl, recipe, DEFAULT_SETTINGS, PRESET_MATERIALS, wafer, sizes)
  const pods = pts.map((p) => p.pod)
  check("pod_trend", pods[5] > pods[0] && pods[5] > 0.9, `pod(30nm)=${pods[0].toFixed(3)} pod(600nm)=${pods[5].toFixed(3)}`)
  console.log(`  info: POD 曲线 = [${pods.map((p) => p.toFixed(2)).join(", ")}]`)
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`)
process.exit(fail === 0 ? 0 : 1)
