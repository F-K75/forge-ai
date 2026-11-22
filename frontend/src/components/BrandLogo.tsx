import forgeLogo from "/forge.svg";

export interface BrandLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  bordered?: boolean;
  className?: string;
  withText?: boolean;
  text?: string;
  textClassName?: string;
  subtext?: string;
  animated?: boolean;
  badge?: string;
}

const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg" | "xl", { container: string; img: string }> = {
  xs: { container: "w-6 h-6 rounded-md", img: "w-3.5 h-3.5" },
  sm: { container: "w-7 h-7 rounded-md", img: "w-4 h-4" },
  md: { container: "w-8 h-8 rounded-lg", img: "w-5 h-5" },
  lg: { container: "w-10 h-10 rounded-lg", img: "w-6 h-6" },
  xl: { container: "w-12 h-12 rounded-xl", img: "w-7 h-7" },
};

export default function BrandLogo({
  size = "md",
  bordered = true,
  className = "",
  withText = false,
  text = "Forge AI",
  textClassName = "",
  subtext,
  badge,
}: BrandLogoProps) {
  const { container, img } = SIZE_CLASSES[size];

  const logo = (
    <div
      className={`relative ${container} flex items-center justify-center shrink-0 select-none bg-slate-900 dark:bg-slate-800 text-white transition-transform duration-fast ${
        bordered ? "border border-slate-800 dark:border-slate-700" : ""
      } ${className}`}
    >
      <img
        src={forgeLogo}
        alt="Forge AI"
        className={`${img} object-contain`}
        loading="eager"
      />
    </div>
  );

  if (!withText) {
    return logo;
  }

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {logo}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-2">
          <span
            className={`font-display font-semibold tracking-tight text-ink leading-none ${
              textClassName || "text-sm sm:text-base"
            }`}
          >
            {text}
          </span>
          {badge && (
            <span className="font-mono text-[10px] font-medium text-muted leading-none">
              {badge}
            </span>
          )}
        </div>
        {subtext && (
          <span className="mt-0.5 text-[11px] font-medium text-muted leading-none">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}
