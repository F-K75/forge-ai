import { useEffect } from 'react'
import gsap from 'gsap'
import { animate, set as animeSet, stagger as animeStagger, type AnimationParams } from 'animejs'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import SplitType from 'split-type'

export const shouldReduceMotion = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const useGsapFrom = (targets: gsap.TweenTarget, vars: gsap.TweenVars, deps: unknown[] = []) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (reduceMotion) {
      gsap.set(targets, { ...vars, autoAlpha: 1 })
      return
    }
    gsap.from(targets, vars)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, ...deps])
}

export const useGsapTo = (targets: gsap.TweenTarget, vars: gsap.TweenVars, deps: unknown[] = []) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (reduceMotion) return
    gsap.to(targets, vars)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, ...deps])
}

export const useAnimeFrom = (selector: string, props: AnimationParams = {}) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (reduceMotion) return
    animeSet(selector, { opacity: 0, translateY: 20 })
    animate(selector, {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 600,
      ease: 'outExpo',
      ...props,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, reduceMotion])
}

export const useStaggerIn = (selector: string, staggerDelay: number = 60) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (reduceMotion) return
    animeSet(selector, { opacity: 0, translateY: 16, scale: 0.97 })
    animate(selector, {
      opacity: [0, 1],
      translateY: [16, 0],
      scale: [0.97, 1],
      duration: 500,
      delay: animeStagger(staggerDelay, { from: 'first' }),
      ease: 'outCubic',
    })
  }, [selector, staggerDelay, reduceMotion])
}

export const useCountUp = (ref: React.RefObject<HTMLSpanElement | null>, end: number, duration: number = 1200) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const node = ref.current
    if (!node) return

    const safeEnd = Number.isFinite(end) ? end : 0

    if (reduceMotion) {
      node.textContent = String(safeEnd)
      return
    }

    const obj = { val: 0 }
    let tween: ReturnType<typeof gsap.to> | undefined

    try {
      tween = gsap.to(obj, {
        val: safeEnd,
        duration: duration / 1000,
        ease: 'power2.out',
        onUpdate: () => {
          if (ref.current) ref.current.textContent = Math.round(obj.val).toLocaleString()
        },
      })
    } catch {
      node.textContent = String(safeEnd)
    }

    return () => {
      try { tween?.kill() } catch {}
      if (ref.current && ref.current.textContent !== String(safeEnd)) {
        ref.current.textContent = String(safeEnd)
      }
    }
  }, [ref, end, duration, reduceMotion])
}

export const useMagnetic = (ref: React.RefObject<HTMLElement | null>, strength: number = 0.3) => {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      gsap.to(el, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power2.out' })
    }
    const onLeave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' })
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [ref, strength])
}

export const useShake = (ref: React.RefObject<HTMLElement | null>) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduceMotion) return
    gsap.fromTo(el, { x: 0 }, { x: 8, duration: 0.08, repeat: 5, yoyo: true, ease: 'none' })
  }, [ref, reduceMotion])
}

export const useMarquee = (ref: React.RefObject<HTMLDivElement | null>, speed: number = 40) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduceMotion) return
    const content = el.querySelector('[data-marquee-content]')
    if (!content) return
    gsap.to(content, {
      x: () => -(content.scrollWidth / 2),
      duration: speed,
      ease: 'linear',
      repeat: -1,
    })
  }, [ref, speed, reduceMotion])
}

export const useTextReveal = (ref: React.RefObject<HTMLDivElement | null>) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      gsap.set(el, { autoAlpha: 1 })
      return
    }
    const lines = el.querySelectorAll('[data-reveal-line]')
    gsap.from(lines, {
      autoAlpha: 0,
      yPercent: 40,
      rotateX: -10,
      stagger: 0.08,
      duration: 0.7,
      ease: 'power3.out',
    })
  }, [ref, reduceMotion])
}

// Splits an element's text with SplitType (no manual markup required, unlike
// useTextReveal above) and staggers the pieces in with GSAP.
export const useSplitTextReveal = (
  ref: React.RefObject<HTMLElement | null>,
  options: { by?: 'chars' | 'words' | 'lines'; stagger?: number; delay?: number } = {}
) => {
  const reduceMotion = useReducedMotion()
  const { by = 'words', stagger = 0.03, delay = 0 } = options
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      gsap.set(el, { autoAlpha: 1 })
      return
    }
    const split = new SplitType(el, { types: by })
    const targets = split[by]
    if (!targets || targets.length === 0) {
      split.revert()
      return
    }
    gsap.set(targets, { autoAlpha: 0, yPercent: 100 })
    const tween = gsap.to(targets, {
      autoAlpha: 1,
      yPercent: 0,
      duration: 0.6,
      ease: 'power3.out',
      stagger,
      delay,
    })
    return () => {
      tween.kill()
      split.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, by, stagger, delay])
}

export const useParallax = (ref: React.RefObject<HTMLElement | null>, speed: number = 0.5) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduceMotion) return
    const onScroll = () => {
      const rect = el.getBoundingClientRect()
      const offset = rect.top * speed
      gsap.to(el, { y: offset, overwrite: 'auto', duration: 0.1 })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ref, speed, reduceMotion])
}

export const useGlowPulse = (ref: React.RefObject<HTMLElement | null>) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduceMotion) return
    gsap.to(el, {
      '--glow-opacity': 0.6,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })
  }, [ref, reduceMotion])
}

export const useProgressBar = (ref: React.RefObject<HTMLDivElement | null>, progress: number) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      el.style.width = `${progress}%`
      return
    }
    gsap.to(el, { width: `${progress}%`, duration: 0.6, ease: 'power2.out' })
  }, [ref, progress, reduceMotion])
}

export const useTooltip = (ref: React.RefObject<HTMLElement | null>, show: boolean) => {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      gsap.set(el, { autoAlpha: show ? 1 : 0 })
      return
    }
    gsap.to(el, {
      autoAlpha: show ? 1 : 0,
      scale: show ? 1 : 0.95,
      duration: 0.25,
      ease: 'power2.out',
    })
  }, [ref, show, reduceMotion])
}

export { motion, useReducedMotion }
export const motionVariants: Record<string, Variants> = {
  fadeUp: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  },
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.92 },
  },
  slideInLeft: {
    hidden: { opacity: 0, x: -32 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 32 },
  },
  slideInRight: {
    hidden: { opacity: 0, x: 32 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -32 },
  },
  staggerContainer: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    },
    exit: { opacity: 0, transition: { staggerChildren: 0.03, staggerDirection: -1 } },
  },
  staggerItem: {
    hidden: { opacity: 0, y: 16, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8 },
  },
  flipIn: {
    hidden: { opacity: 0, rotateX: -15, scale: 0.95 },
    visible: { opacity: 1, rotateX: 0, scale: 1 },
    exit: { opacity: 0, rotateX: 15, scale: 0.95 },
  },
}
