import { motion } from "motion/react";
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
  xs: { container: "w-6 h-6", img: "w-4 h-4" },
  sm: { container: "w-8 h-8", img: "w-5 h-5" },
  md: { container: "w-9 h-9", img: "w-6 h-6" },
  lg: { container: "w-11 h-11 sm:w-12 sm:h-12", img: "w-7 h-7 sm:w-8 sm:h-8" },
  xl: { container: "w-14 h-14 sm:w-16 sm:h-16", img: "w-9 h-9 sm:w-10 sm:h-10" },
};

export default function BrandLogo({
  size = "md",
  bordered = true,
  className = "",
  withText = false,
  text = "FORGE AI",
  textClassName = "",
  subtext,
  animated = true,
  badge,
}: BrandLogoProps) {
  const { container, img } = SIZE_CLASSES[size];

  const logo = (
    <motion.div
      whileHover={animated ? { scale: 1.05 } : undefined}
      whileTap={animated ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`relative ${container} flex items-center justify-center shrink-0 select-none bg-black text-white ${
        bordered ? "border border-black dark:border-white/30" : ""
      } ${className}`}
    >
      {/* Corner bracket lines to match launch page theme */}
      <span className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[#FF5522]" />
      <span className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-[#FF5522]" />
      <span className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-[#FF5522]" />
      <span className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-[#FF5522]" />

      <img
        src={forgeLogo}
        alt="Forge AI"
        className={`${img} object-contain`}
        loading="eager"
      />
    </motion.div>
  );

  if (!withText) {
    return logo;
  }

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {logo}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-mono font-black tracking-wider uppercase text-black dark:text-white leading-none ${
              textClassName || "text-sm sm:text-base"
            }`}
          >
            {text}
          </span>
          {badge && (
            <span className="px-1.5 py-0.2 bg-[#FF5522] text-black font-mono font-black text-[9px] uppercase border border-black dark:border-white/30 leading-none">
              {badge}
            </span>
          )}
        </div>
        {subtext && (
          <span className="text-[10px] font-mono font-bold tracking-widest text-black/70 dark:text-white/70 uppercase mt-0.5 leading-none">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}


