import React, { useState } from "react";
import { ArrowUpRight, Code, MessageSquare, Pencil, Sparkles, Zap, Bot, Star, LucideIcon } from "lucide-react";

interface KeycapData {
  id: string;
  char: string;
  label?: string;
  color: string;
  textColor?: string;
  icon?: LucideIcon;
  rotate?: string;
  size?: "sm" | "md" | "lg";
}

const DEFAULT_KEYS: KeycapData[] = [
  { id: "o1", char: "O", color: "bg-[#FF7A3D] text-white", rotate: "-rotate-6" },
  { id: "v", char: "V", color: "bg-[#8B5CF6] text-white", rotate: "rotate-3" },
  { id: "e", char: "E", color: "bg-[#C4B5FD] text-neutral-900", rotate: "-rotate-3" },
  { id: "r", char: "R", color: "bg-[#10B981] text-white", rotate: "rotate-6" },
  { id: "f", char: "F", color: "bg-[#06B6D4] text-white", rotate: "-rotate-2" },
  { id: "l", char: "L", color: "bg-[#FBBF24] text-neutral-900", rotate: "rotate-4" },
  { id: "o2", char: "O", color: "bg-[#FF7A3D] text-white", rotate: "-rotate-4" },
  { id: "w", char: "W", color: "bg-[#F472B6] text-white", rotate: "rotate-8" },
  { id: "code", char: "</>", color: "bg-white text-neutral-900", icon: Code, rotate: "-rotate-12", size: "md" },
  { id: "chat", char: "...", color: "bg-white text-neutral-900", icon: MessageSquare, rotate: "rotate-8", size: "sm" },
  { id: "pencil", char: "draw", color: "bg-white text-neutral-900", icon: Pencil, rotate: "-rotate-8", size: "sm" },
  { id: "bot", char: "AI", color: "bg-[#3B82F6] text-white", icon: Bot, rotate: "rotate-6", size: "sm" },
];

export function SuiKeycapVisual({
  title = "OVERFLOW",
  onKeyClick,
}: {
  title?: string;
  onKeyClick?: (key: string) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [keyBubble, setKeyBubble] = useState<string | null>("Sprint 04 active");

  const handleClick = (key: KeycapData) => {
    setActiveKey(key.id);
    setKeyBubble(`${key.char} key pressed: ${key.label || "Swarm Agent Ready"}`);
    onKeyClick?.(key.char);
    setTimeout(() => setActiveKey(null), 250);
  };

  return (
    <div className="relative w-full h-full min-h-[260px] sm:min-h-[300px] flex items-center justify-center select-none overflow-visible py-4">
      {/* Subtle graph paper grid overlay for the visual surface */}
      <div 
        className="absolute inset-0 rounded-2xl opacity-60 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "18px 18px",
        }}
        aria-hidden="true"
      />

      {/* Scattered Organic Background Shapes */}
      <div className="absolute top-3 left-6 text-neutral-400/40 pointer-events-none" aria-hidden="true">
        <Star size={22} className="rotate-12" />
      </div>
      <div className="absolute bottom-5 right-8 text-neutral-400/40 pointer-events-none" aria-hidden="true">
        <Sparkles size={26} className="-rotate-12" />
      </div>

      {/* Interactive Speech Bubble */}
      {keyBubble && (
        <div className="absolute -top-3 sm:top-0 right-4 sm:right-12 z-30 bg-white border-2 border-neutral-900 px-3.5 py-1.5 rounded-2xl shadow-[3px_3px_0px_#1a1a1a] text-xs font-bold text-neutral-900 flex items-center gap-1.5 animate-bounce">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>{keyBubble}</span>
        </div>
      )}

      {/* Main Chunky Keycaps Cluster */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5 max-w-md p-2">
        {DEFAULT_KEYS.map((k) => {
          const isPressed = activeKey === k.id;
          const Icon = k.icon;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => handleClick(k)}
              className={`
                group relative flex flex-col items-center justify-center font-black tracking-tight cursor-pointer
                border-2 border-neutral-900 rounded-xl sm:rounded-2xl
                transition-all duration-100 transform
                ${k.color}
                ${k.rotate || ""}
                ${isPressed 
                  ? "translate-y-1.5 shadow-[0_1px_0_#1a1a1a]" 
                  : "shadow-[0_6px_0_#1a1a1a] hover:-translate-y-0.5 hover:shadow-[0_8px_0_#1a1a1a]"
                }
                ${k.size === "sm" 
                  ? "w-10 h-10 sm:w-12 sm:h-12 text-sm" 
                  : k.size === "md"
                  ? "w-12 h-12 sm:w-16 sm:h-14 text-base"
                  : "w-11 h-11 sm:w-14 sm:h-14 text-base sm:text-xl"
                }
              `}
              title={`Key ${k.char}`}
            >
              {/* Convex Top Highlight Line */}
              <span className="absolute top-1 inset-x-1.5 h-1 bg-white/30 rounded-full pointer-events-none" />

              {Icon ? (
                <Icon size={k.size === "sm" ? 16 : 20} strokeWidth={2.4} />
              ) : (
                <span className="font-extrabold">{k.char}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Illustrated White OS Mouse Cursor Pointer */}
      <div 
        className="absolute top-[28%] left-[22%] sm:left-[24%] z-20 pointer-events-none drop-shadow-[2px_3px_0_rgba(0,0,0,0.8)] transition-transform duration-300 hover:scale-110"
        aria-hidden="true"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M3 3L10.5 21L13.8 13.8L21 10.5L3 3Z" 
            fill="white" 
            stroke="#1A1A1A" 
            strokeWidth="2" 
            strokeLinejoin="round" 
          />
        </svg>
      </div>

      {/* Illustrated White Hand Pointer Cursor */}
      <div 
        className="absolute bottom-[22%] right-[22%] sm:right-[26%] z-20 pointer-events-none drop-shadow-[2px_3px_0_rgba(0,0,0,0.8)]"
        aria-hidden="true"
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M9 11V4.5C9 3.67 9.67 3 10.5 3C11.33 3 12 3.67 12 4.5V10.5M12 8.5C12 7.67 12.67 7 13.5 7C14.33 7 15 7.67 15 8.5V11M15 10C15 9.17 15.67 8.5 16.5 8.5C17.33 8.5 18 9.17 18 10V14C18 17.87 14.87 21 11 21C8.24 21 5.86 19.38 4.79 17.06L3.33 13.55C3.06 12.9 3.39 12.16 4.04 11.89C4.69 11.62 5.43 11.95 5.7 12.6L7 15.5V5.5C7 4.67 7.67 4 8.5 4C9.33 4 10 4.67 10 5.5V11" 
            fill="white" 
            stroke="#1A1A1A" 
            strokeWidth="1.8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </svg>
      </div>
    </div>
  );
}
