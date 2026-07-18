import type { TooltipProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"

interface ChartTooltipProps
  extends Omit<TooltipProps<ValueType, NameType>, "formatter" | "labelFormatter"> {
  formatter?: (value: number, name: string) => [string, string]
  labelFormatter?: (label: string) => string
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-faint">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((entry) => {
        const [value, name] = formatter
          ? formatter(Number(entry.value), String(entry.name))
          : [String(entry.value), String(entry.name)]
        return (
          <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-ink">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            {name}: <span className="font-mono">{value}</span>
          </p>
        )
      })}
    </div>
  )
}
