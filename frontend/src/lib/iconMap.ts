import {
  TrendingUp, Store, ShieldCheck, Sparkles, Boxes, Code2, Compass,
  Palette, Plug, Users, Activity, CreditCard, Zap, type LucideIcon,
} from "lucide-react";

export const ICONS = {
  "trending-up":  TrendingUp,
  "store":        Store,
  "shield-check": ShieldCheck,
  "sparkles":     Sparkles,
  "boxes":        Boxes,
  "code":         Code2,
  "compass":      Compass,
  "palette":      Palette,
  "plug":         Plug,
  "users":        Users,
  "activity":     Activity,
  "credit-card":  CreditCard,
  "zap":          Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const getIcon = (name: string): LucideIcon => ICONS[name as IconName] ?? Sparkles;
