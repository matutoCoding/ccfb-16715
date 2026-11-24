// GPU 米氏表计算: 批量提交 case, 读回角分布
import { get_device } from "./device.ts"
import { MIE_WGSL } from "./mie_wgsl.ts"
import type { MieCase, MieTable } from "@/physics/mie_cpu.ts"

export const MIE_N_ANGLES = 181
const OUT_STRIDE = 2 + 2 * MIE_N_ANGLES
const CASE_FLOATS = 8

export const run_mie_gpu = async (cases: MieCase[]): Promise<MieTable[]> => {
  if (cases.length === 0) return []
  const device = await get_device()
  const module = device.createShaderModule({ code: MIE_WGSL })
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  })

  const caseData = new Float32Array(cases.length * CASE_FLOATS)
  cases.forEach((c, i) => {
    caseData.set([c.diameterNm, c.nRe, c.nIm, c.wavelengthNm, c.nMedium, 0, 0, 0], i * CASE_FLOATS)
  })
  const caseBuf = device.createBuffer({
    size: caseData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(caseBuf, 0, caseData)

  const outSize = cases.length * OUT_STRIDE * 4
  const outBuf = device.createBuffer({ size: outSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const readBuf = device.createBuffer({ size: outSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: caseBuf } },
      { binding: 1, resource: { buffer: outBuf } },
    ],
  })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.dispatchWorkgroups(Math.ceil(cases.length / 16))
  pass.end()
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, outSize)
  device.queue.submit([encoder.finish()])

  await readBuf.mapAsync(GPUMapMode.READ)
  const raw = new Float32Array(readBuf.getMappedRange()).slice()
  readBuf.unmap()
  caseBuf.destroy()
  outBuf.destroy()
  readBuf.destroy()

  const anglesDeg = Array.from({ length: MIE_N_ANGLES }, (_, j) => (180 * j) / (MIE_N_ANGLES - 1))
  return cases.map((c, i) => {
    const base = i * OUT_STRIDE
    const i1: number[] = []
    const i2: number[] = []
    for (let j = 0; j < MIE_N_ANGLES; j++) {
      i1.push(raw[base + 2 + 2 * j])
      i2.push(raw[base + 3 + 2 * j])
    }
    return {
      anglesDeg,
      i1,
      i2,
      qSca: raw[base],
      qExt: raw[base + 1],
      k: (2 * Math.PI * c.nMedium) / c.wavelengthNm,
    }
  })
}
