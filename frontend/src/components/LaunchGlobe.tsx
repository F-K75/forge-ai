import { useEffect, useRef, useState } from "react"
import createGlobe from "cobe"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"
import { presets } from "../lib/animationPresets"

const HUBS: [number, number][] = [
  [37.77, -122.41],
  [40.71, -74.0],
  [51.5, -0.12],
  [52.52, 13.4],
  [19.07, 72.87],
  [12.97, 77.59],
  [35.68, 139.69],
  [1.35, 103.82],
  [-23.55, -46.63],
  [-33.87, 151.21],
]

const MARKERS = HUBS.map((location, i) => ({
  location,
  size: i % 3 === 0 ? 0.035 : 0.022,
}))

const ARCS = [
  { from: HUBS[0], to: HUBS[2] },
  { from: HUBS[2], to: HUBS[5] },
  { from: HUBS[5], to: HUBS[6] },
  { from: HUBS[6], to: HUBS[9] },
  { from: HUBS[1], to: HUBS[8] },
  { from: HUBS[4], to: HUBS[3] },
]

const supportsWebGL = () => {
  try {
    const probe = document.createElement("canvas")
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"))
  } catch {
    return false
  }
}

export default function LaunchGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)
  const pointerStart = useRef<number | null>(null)
  const dragOffset = useRef(0)
  const dragBase = useRef(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!supportsWebGL()) {
      setFallback(true)
      return
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // Smaller screens render the globe at a smaller physical size and skew
    // toward lower-end hardware — a lighter map/pixel-ratio budget avoids
    // jank on exactly the devices most likely to struggle with it.
    const lightweight = window.innerWidth < 640 || (navigator.hardwareConcurrency ?? 8) <= 4
    const pixelRatio = lightweight ? 1.5 : 2
    let width = canvas.offsetWidth
    const onResize = () => {
      width = canvas.offsetWidth
      globe.update({ width: width * pixelRatio, height: width * pixelRatio })
    }

    const globe = createGlobe(canvas, {
      devicePixelRatio: pixelRatio,
      width: width * pixelRatio,
      height: width * pixelRatio,
      phi: 0,
      theta: 0.22,
      dark: 0,
      diffuse: 1.4,
      mapSamples: lightweight ? 10000 : 22000,
      mapBrightness: 2.8,
      mapBaseBrightness: 0.12,
      baseColor: [0.72, 0.74, 0.78],
      markerColor: [0.0, 0.44, 0.89],
      glowColor: [0.96, 0.96, 0.97],
      arcColor: [0.3, 0.55, 0.95],
      arcWidth: 0.45,
      arcHeight: 0.2,
      opacity: 0.92,
      markers: MARKERS,
      arcs: ARCS,
    })

    window.addEventListener("resize", onResize)

    let phi = 4.5
    let raf = 0
    const frame = () => {
      if (!reduced && pointerStart.current === null) phi += 0.0025
      globe.update({ phi: phi + dragOffset.current })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const fadeTimer = window.setTimeout(() => {
      canvas.style.opacity = "1"
    }, 80)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(fadeTimer)
      window.removeEventListener("resize", onResize)
      globe.destroy()
    }
  }, [])

  if (fallback) return <CssGlobe />

  return (
    <div
      aria-hidden="true"
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "min(108vh, 108vw)", height: "min(108vh, 108vw)" }}
    >
      <motion.div
        className="h-full w-full"
        initial={reduceMotion ? false : presets.globe.initial}
        animate={presets.globe.animate}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
          style={{ contain: "layout paint size", touchAction: "pan-y" }}
          onPointerDown={(e) => {
            pointerStart.current = e.clientX
            dragBase.current = dragOffset.current
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (pointerStart.current === null) return
            dragOffset.current = dragBase.current + (e.clientX - pointerStart.current) / 180
          }}
          onPointerUp={() => {
            pointerStart.current = null
          }}
          onPointerCancel={() => {
            pointerStart.current = null
          }}
        />
        {/* Soft center dip so FORGE stays readable without hiding the globe. */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(245,245,247,0.55)_0%,rgba(245,245,247,0.15)_40%,transparent_62%)]" />
        <div className="pointer-events-none absolute inset-[6%] rounded-full border border-black/[0.04]" />
      </motion.div>
    </div>
  )
}

function CssGlobe() {
  const parallels = [-60, -30, 0, 30, 60]
  const meridianCount = 8

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "min(108vh, 108vw)", height: "min(108vh, 108vw)" }}
    >
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_32%_28%,hsl(0_0%_16%),hsl(0_0%_4%)_72%)] border border-muted/30" />

      <div className="absolute inset-0 [transform-style:preserve-3d] animate-[spin-globe_50s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: meridianCount }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-muted/20"
            style={{ transform: `rotateY(${(i * 180) / meridianCount}deg)` }}
          />
        ))}
      </div>

      <div className="absolute inset-0">
        {parallels.map((deg) => {
          const scale = Math.cos((deg * Math.PI) / 180)
          const offset = 50 - scale * 50
          return (
            <div
              key={deg}
              className="absolute left-0 right-0 rounded-full border border-muted/15"
              style={{ top: `${offset}%`, height: `${scale * 100}%` }}
            />
          )
        })}
      </div>

      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-muted/25" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,hsl(0_0%_4%/0.55)_0%,transparent_45%,hsl(0_0%_4%)_88%)]" />
    </div>
  )
}
