/** Recharts drawing for the catalog `Chart` (lazy chunk; colours from lib/theme COLORS). */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { COLORS, HUE_CYCLE } from "../../../lib/theme"

export interface ChartCanvasProps {
  kind: string
  data: Record<string, unknown>[]
  x: string
  series: { key: string; label?: string }[]
}

const PALETTE = [COLORS.accent, ...HUE_CYCLE]
const axis = { stroke: COLORS.faint, fontSize: 11, tickLine: false, axisLine: false }
const tooltip = {
  contentStyle: { background: COLORS.panelAlt, border: `1px solid ${COLORS.hairline}`, borderRadius: 10, fontSize: 12 },
  labelStyle: { color: COLORS.muted },
  itemStyle: { color: COLORS.ink },
}

export default function ChartCanvas({ kind, data, x, series }: ChartCanvasProps) {
  const color = (i: number) => PALETTE[i % PALETTE.length]
  const grid = <CartesianGrid stroke={COLORS.hairline} vertical={false} />
  const legend = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: COLORS.muted }} /> : null

  let chart
  switch (kind) {
    case "line":
      chart = (
        <LineChart data={data}>
          {grid}
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} />
          <Tooltip {...tooltip} />
          {legend}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={color(i)} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      )
      break
    case "area":
      chart = (
        <AreaChart data={data}>
          {grid}
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} />
          <Tooltip {...tooltip} />
          {legend}
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={color(i)} fill={color(i)} fillOpacity={0.15} />
          ))}
        </AreaChart>
      )
      break
    case "pie": {
      const s = series[0]
      chart = (
        <PieChart>
          <Tooltip {...tooltip} />
          <Pie data={data} dataKey={s?.key ?? "value"} nameKey={x} innerRadius="55%" outerRadius="80%" stroke={COLORS.base}>
            {data.map((_, i) => (
              <Cell key={i} fill={color(i)} />
            ))}
          </Pie>
        </PieChart>
      )
      break
    }
    case "scatter":
      chart = (
        <ScatterChart>
          {grid}
          <XAxis dataKey={x} type="number" {...axis} />
          <YAxis dataKey={series[0]?.key} type="number" {...axis} />
          <Tooltip {...tooltip} />
          <Scatter data={data} fill={color(0)} name={series[0]?.label ?? series[0]?.key} />
        </ScatterChart>
      )
      break
    default:
      chart = (
        <BarChart data={data}>
          {grid}
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} />
          <Tooltip {...tooltip} cursor={{ fill: COLORS.hairline }} />
          {legend}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={color(i)} radius={[6, 6, 0, 0]} />
          ))}
        </BarChart>
      )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}
