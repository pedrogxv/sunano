/**
 * Centralized Theme System - SunaUnder Reviewlist
 * Modern dark gaming theme inspired by Prydwen.gg
 */

export const THEME = {
  // Main Background Colors
  bg: {
    page: "bg-[#0a0b0e]",
    primary: "bg-[#0e1014]",
    secondary: "bg-[#13161b]",
    tertiary: "bg-[#181c22]",
    hover: "bg-[#1d222a]",
    elevated: "bg-[#212733]",
    glass: "bg-white/[0.03]",
    glassHover: "bg-white/[0.06]",
  },

  // Border Colors
  border: {
    default: "border-white/[0.06]",
    light: "border-white/[0.035]",
    hover: "border-white/[0.12]",
    accent: "border-cyan-500/30",
    accentHover: "border-cyan-400/50",
  },

  // Text Colors
  text: {
    primary: "text-slate-50",
    secondary: "text-slate-200",
    tertiary: "text-slate-300",
    muted: "text-slate-400",
    dimmed: "text-slate-500",
  },

  // Tier Colors (matching Prydwen style)
  tier: {
    goat: {
      bg: "bg-gradient-to-r from-red-500 to-red-600",
      text: "text-red-400",
      border: "border-red-500/40",
      badge: "bg-red-500/20 text-red-300 border-red-500/30",
    },
    ss: {
      bg: "bg-gradient-to-r from-orange-500 to-orange-600",
      text: "text-orange-400",
      border: "border-orange-500/40",
      badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    },
    s: {
      bg: "bg-gradient-to-r from-yellow-500 to-yellow-600",
      text: "text-yellow-400",
      border: "border-yellow-500/40",
      badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    },
    a: {
      bg: "bg-gradient-to-r from-emerald-500 to-emerald-600",
      text: "text-emerald-400",
      border: "border-emerald-500/40",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    b: {
      bg: "bg-gradient-to-r from-teal-500 to-teal-600",
      text: "text-teal-400",
      border: "border-teal-500/40",
      badge: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    },
    c: {
      bg: "bg-gradient-to-r from-blue-500 to-blue-600",
      text: "text-blue-400",
      border: "border-blue-500/40",
      badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
    l: {
      bg: "bg-gradient-to-r from-slate-500 to-slate-600",
      text: "text-slate-300",
      border: "border-slate-500/40",
      badge: "bg-slate-500/20 text-slate-200 border-slate-500/30",
    },
  },

  // Category Colors
  category: {
    performance: {
      bg: "bg-cyan-500/15",
      text: "text-cyan-300",
      border: "border-cyan-500/30",
    },
    value: {
      bg: "bg-emerald-500/15",
      text: "text-emerald-300",
      border: "border-emerald-500/30",
    },
    recommended: {
      bg: "bg-amber-500/15",
      text: "text-amber-300",
      border: "border-amber-500/30",
    },
  },

  // Accent Colors
  accent: {
    cyan: {
      bg: "bg-cyan-500/20",
      text: "text-cyan-300",
      border: "border-cyan-400/40",
    },
    amber: {
      bg: "bg-amber-500/20",
      text: "text-amber-300",
      border: "border-amber-400/40",
    },
    emerald: {
      bg: "bg-emerald-500/20",
      text: "text-emerald-300",
      border: "border-emerald-400/40",
    },
    red: {
      bg: "bg-red-500/15",
      text: "text-red-300",
      border: "border-red-500/30",
    },
    rose: {
      bg: "bg-rose-500/20",
      text: "text-rose-300",
      border: "border-rose-400/40",
    },
    blue: {
      bg: "bg-blue-500/20",
      text: "text-blue-300",
      border: "border-blue-400/40",
    },
    purple: {
      bg: "bg-purple-500/20",
      text: "text-purple-300",
      border: "border-purple-400/40",
    },
  },

  // Radius
  radius: {
    sm: "rounded-md",
    base: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    full: "rounded-full",
  },

  // Sidebar
  sidebar: {
    width: "w-64",
    collapsedWidth: "w-20",
  },

  // Layout
  layout: {
    mainPadding: "p-4 md:p-6",
    adminPadding: "p-4 md:p-6",
    contentMaxWidth: "max-w-7xl",
    adminMaxWidth: "max-w-7xl",
  },

  // Shadows
  shadow: {
    sm: "shadow-sm",
    base: "shadow-md",
    lg: "shadow-lg",
    xl: "shadow-xl",
    glow: "shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
    glowLarge: "shadow-[0_8px_40px_rgba(0,0,0,0.35)]",
    glowXL: "shadow-[0_16px_64px_rgba(0,0,0,0.5)]",
    cyan: "shadow-[0_0_20px_rgba(34,211,238,0.15)]",
  },

  // Transitions
  transition: {
    fast: "transition-all duration-150 ease-out",
    base: "transition-all duration-200 ease-out",
    slow: "transition-all duration-300 ease-out",
  },

  // Z-Index
  zIndex: {
    sidebar: "z-40",
    modal: "z-50",
    dropdown: "z-30",
    tooltip: "z-60",
  },
} as const

// Card styles helper
export const cardStyles = {
  base: `border ${THEME.border.default} ${THEME.bg.secondary} ${THEME.shadow.glow}`,
  hover: `hover:${THEME.border.hover} hover:${THEME.bg.hover} ${THEME.transition.base}`,
  interactive: `cursor-pointer border ${THEME.border.default} ${THEME.bg.secondary} ${THEME.shadow.glow} hover:border-cyan-500/30 hover:${THEME.bg.hover} ${THEME.transition.base}`,
  glass: `border ${THEME.border.default} ${THEME.bg.glass} backdrop-blur-sm`,
}

// Button styles helper
export const buttonStyles = {
  primary: "bg-cyan-600 text-white hover:bg-cyan-500",
  secondary: "bg-white/10 text-slate-100 hover:bg-white/15",
  outline: "border border-white/15 text-slate-100 hover:bg-white/5 hover:border-white/25",
  ghost: "text-slate-300 hover:bg-white/5 hover:text-slate-100",
  danger: "border border-red-500/30 text-red-300 hover:bg-red-500/10",
}

// Tier helper function
export function getTierStyle(tier: string) {
  switch (tier) {
    case "GOAT":
      return THEME.tier.goat
    case "SS":
      return THEME.tier.ss
    case "S":
      return THEME.tier.s
    case "A":
      return THEME.tier.a
    case "B":
      return THEME.tier.b
    case "C":
      return THEME.tier.c
    case "L":
      return THEME.tier.l
    default:
      return THEME.tier.c
  }
}
