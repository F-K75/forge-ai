import { motionVariants } from './animations'

export const presets = {
  card: {
    variants: motionVariants.scaleIn,
    whileHover: { y: -4, scale: 1.01, transition: { type: 'spring', stiffness: 400, damping: 25 } },
    whileTap: { scale: 0.98 },
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  } as const,

  button: {
    whileHover: { scale: 1.03, transition: { type: 'spring', stiffness: 400, damping: 20 } },
    whileTap: { scale: 0.96 },
  } as const,

  listItem: {
    variants: motionVariants.staggerItem,
    transition: { type: 'spring', stiffness: 300, damping: 22 },
  } as const,

  modal: {
    variants: motionVariants.scaleIn,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  } as const,

  pageTransition: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
  } as const,

  sidebarItem: {
    whileHover: { x: 4, transition: { type: 'spring', stiffness: 400, damping: 20 } },
    whileTap: { scale: 0.98 },
  } as const,

  tab: {
    whileHover: { y: -2 },
    whileTap: { scale: 0.97 },
  } as const,

  input: {
    initial: { scaleX: 0.95, opacity: 0 },
    animate: { scaleX: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } },
    whileFocus: { scale: 1.01 },
  } as const,

  badge: {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 400, damping: 15 } },
  } as const,

  pipelineStep: {
    initial: { opacity: 0, y: 20, scale: 0.9 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  } as const,

  notification: {
    initial: { opacity: 0, x: 60, scale: 0.9 },
    animate: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } },
    exit: { opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.2 } },
  } as const,

  kanbanCard: {
    initial: { opacity: 0, y: 16, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    whileHover: { y: -3, scale: 1.01, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' },
    whileDrag: { scale: 1.04, rotation: 2, zIndex: 50 },
    transition: { type: 'spring', stiffness: 300, damping: 22 },
  } as const,

  chart: {
    initial: { opacity: 0, scaleY: 0.8, transformOrigin: 'bottom' },
    animate: { opacity: 1, scaleY: 1, transition: { duration: 0.6, ease: 'easeOut' } },
  } as const,

  skeleton: {
    initial: { opacity: 0.4 },
    animate: { opacity: 0.8, transition: { repeat: Infinity, repeatType: 'reverse', duration: 1.2, ease: 'easeInOut' } },
  } as const,

  toast: {
    initial: { opacity: 0, y: 40, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } },
    exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.15 } },
  } as const,

  deploy: {
    initial: { opacity: 0, scale: 0.8, rotate: -10 },
    animate: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  } as const,

  globe: {
    initial: { opacity: 0, scale: 0.8, rotateY: -30 },
    animate: { opacity: 1, scale: 1, rotateY: 0, transition: { duration: 1.2, ease: 'easeOut' } },
  } as const,
}

export type PresetName = keyof typeof presets
