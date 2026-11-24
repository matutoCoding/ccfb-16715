// 极简 hash 路由
import { ref, computed } from "vue"

export type RouteKey = "wafer" | "defects" | "recipe" | "imaging" | "analysis" | "settings"

const parse = (): RouteKey => {
  const h = location.hash.replace(/^#\/?/, "")
  const keys: RouteKey[] = ["wafer", "defects", "recipe", "imaging", "analysis", "settings"]
  return (keys as string[]).includes(h) ? (h as RouteKey) : "wafer"
}

const current = ref<RouteKey>(parse())

window.addEventListener("hashchange", () => {
  current.value = parse()
})

export const use_route = () => computed(() => current.value)
export const navigate = (key: RouteKey): void => {
  location.hash = `#/${key}`
}
