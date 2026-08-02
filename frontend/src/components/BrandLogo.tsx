import { motion } from "motion/react";
import forgeLogo from "/forge.svg";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  bordered?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

export default function BrandLogo({ size = "md", bordered = false, className = "" }: BrandLogoProps) {
  return (
    <motion.div
      whileHover={{ rotate: 90 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`${SIZE_CLASSES[size]} flex items-center justify-center ${bordered ? `border border-land-ink rounded-md` : ""} ${className}`}
    >
      <img src={forgeLogo} alt="Forge" className={SIZE_CLASSES[size]} />
    </motion.div>
  );
}
