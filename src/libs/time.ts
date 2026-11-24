import dayjs from "dayjs"

export { dayjs }

export const fmt_time = (ts: number): string => dayjs(ts).format("YYYY-MM-DD HH:mm:ss")
