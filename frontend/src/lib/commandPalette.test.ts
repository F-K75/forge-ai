import { describe, expect, it } from "vitest"
import { filterPaletteItems, type PaletteItem } from "./commandPalette"

const item = (id: string, label: string, section: string, keywords: string[] = []): PaletteItem => ({
  id,
  label,
  section,
  keywords,
  run: () => {},
})

const items = [
  item("cap-proj", "Projects", "Capabilities", ["projects.manage", "repos"]),
  item("cap-bill", "Billing and credits", "Capabilities", ["account"]),
  item("ses-1", "Chart revenue by region", "Sessions"),
  item("win-tile", "Tile windows", "Windows", ["arrange", "grid"]),
]

describe("filterPaletteItems", () => {
  it("returns everything for an empty query", () => {
    expect(filterPaletteItems(items, " ")).toHaveLength(items.length)
  })
  it("ranks label prefixes first and matches keywords", () => {
    expect(filterPaletteItems(items, "proj")[0]!.id).toBe("cap-proj")
    expect(filterPaletteItems(items, "arrange").map((i) => i.id)).toEqual(["win-tile"])
    expect(filterPaletteItems(items, "revenue").map((i) => i.id)).toEqual(["ses-1"])
    expect(filterPaletteItems(items, "zzz")).toEqual([])
  })
})
