// 全局状态: 从 IndexedDB 加载, 变更即回写
import { reactive } from "vue"
import { db, STORES } from "@/libs/db.ts"
import { DEFAULT_SETTINGS, type DefectTemplate, type Material, type Recipe, type SimSettings, type Wafer } from "@/libs/types.ts"
import { PRESET_MATERIALS } from "@/data/materials.ts"
import { seed_defect_templates, seed_recipes, seed_wafer } from "@/data/seed.ts"

interface State {
  ready: boolean
  materials: Material[]
  wafers: Wafer[]
  defectLib: DefectTemplate[]
  recipes: Recipe[]
  settings: SimSettings
}

const state = reactive<State>({
  ready: false,
  materials: [],
  wafers: [],
  defectLib: [],
  recipes: [],
  settings: { ...DEFAULT_SETTINGS },
})

export const use_state = () => state

export const init_store = async (): Promise<void> => {
  const [materials, wafers, defectLib, recipes, settingsRow] = await Promise.all([
    db.getAll<Material>(STORES.materials),
    db.getAll<Wafer>(STORES.wafers),
    db.getAll<DefectTemplate>(STORES.defectLib),
    db.getAll<Recipe>(STORES.recipes),
    db.get<SimSettings & { id: string }>(STORES.settings, "main"),
  ])
  state.materials = materials
  state.wafers = wafers
  state.defectLib = defectLib
  state.recipes = recipes
  state.settings = settingsRow ? { ...DEFAULT_SETTINGS, ...settingsRow } : { ...DEFAULT_SETTINGS }

  if (state.materials.length === 0) await seed_all()
  state.ready = true
}

export const seed_all = async (): Promise<void> => {
  state.materials = PRESET_MATERIALS.map((m) => ({ ...m }))
  state.defectLib = seed_defect_templates()
  state.recipes = seed_recipes()
  state.wafers = [seed_wafer()]
  await Promise.all([
    db.clear(STORES.materials),
    db.clear(STORES.wafers),
    db.clear(STORES.defectLib),
    db.clear(STORES.recipes),
  ])
  await Promise.all([
    ...state.materials.map((m) => db.put(STORES.materials, m)),
    ...state.wafers.map((w) => db.put(STORES.wafers, w)),
    ...state.defectLib.map((d) => db.put(STORES.defectLib, d)),
    ...state.recipes.map((r) => db.put(STORES.recipes, r)),
  ])
}

export const save_wafer = async (w: Wafer): Promise<void> => {
  w.updatedAt = Date.now()
  const i = state.wafers.findIndex((x) => x.id === w.id)
  if (i >= 0) state.wafers[i] = w
  else state.wafers.push(w)
  await db.put(STORES.wafers, w)
}

export const delete_wafer = async (id: string): Promise<void> => {
  state.wafers = state.wafers.filter((w) => w.id !== id)
  await db.del(STORES.wafers, id)
}

export const save_defect_template = async (d: DefectTemplate): Promise<void> => {
  const i = state.defectLib.findIndex((x) => x.id === d.id)
  if (i >= 0) state.defectLib[i] = d
  else state.defectLib.push(d)
  await db.put(STORES.defectLib, d)
}

export const delete_defect_template = async (id: string): Promise<void> => {
  state.defectLib = state.defectLib.filter((d) => d.id !== id)
  await db.del(STORES.defectLib, id)
}

export const save_recipe = async (r: Recipe): Promise<void> => {
  r.updatedAt = Date.now()
  const i = state.recipes.findIndex((x) => x.id === r.id)
  if (i >= 0) state.recipes[i] = r
  else state.recipes.push(r)
  await db.put(STORES.recipes, r)
}

export const delete_recipe = async (id: string): Promise<void> => {
  state.recipes = state.recipes.filter((r) => r.id !== id)
  await db.del(STORES.recipes, id)
}

export const save_material = async (m: Material): Promise<void> => {
  const i = state.materials.findIndex((x) => x.id === m.id)
  if (i >= 0) state.materials[i] = m
  else state.materials.push(m)
  await db.put(STORES.materials, m)
}

export const save_settings = async (s: SimSettings): Promise<void> => {
  state.settings = { ...s }
  await db.put(STORES.settings, { id: "main", ...state.settings })
}
