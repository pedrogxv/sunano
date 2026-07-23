// Base tier colors — single source of truth for the tierlist color system.
// GOAT=violet-600, SS=red-500, S=orange-500, A=amber-500, B=green-500, C=blue-500, L=gray-500.
export const TIER_BASE_COLORS = {
  GOAT: "#7C3AED",
  SS: "#EF4444",
  S: "#F97316",
  A: "#F59E0B",
  B: "#22C55E",
  C: "#3B82F6",
  L: "#6B7280",
} as const

export const TIER_THEMES = {
  GOAT: {
    accent: "from-violet-500 to-violet-700",
    textColor: "text-white",
  },
  SS: {
    accent: "from-red-400 to-red-600",
    textColor: "text-white",
  },
  S: {
    accent: "from-orange-400 to-orange-600",
    textColor: "text-[#141925]",
  },
  A: {
    accent: "from-amber-400 to-amber-600",
    textColor: "text-[#141925]",
  },
  B: {
    accent: "from-green-400 to-green-600",
    textColor: "text-[#141925]",
  },
  C: {
    accent: "from-blue-400 to-blue-600",
    textColor: "text-white",
  },
  L: {
    accent: "from-gray-400 to-gray-600",
    textColor: "text-white",
  },
} as const

export const TAG_COLUMN_COLORS = {
  competitive: "text-red-300",
  versatile: "text-cyan-300",
  value: "text-emerald-300",
  comfort: "text-amber-300",
  cheap: "text-green-300",
  expensive: "text-rose-300",
  light: "text-sky-300",
  heavy: "text-slate-300",
  unbalanced: "text-pink-300",
  dpi_deviation: "text-yellow-300",
  wobble_high: "text-fuchsia-300",
  wobble_low: "text-violet-300",
  scroll_hard: "text-stone-300",
  scroll_soft: "text-lime-300",
  trimode: "text-indigo-300",
  stable: "text-teal-300",
  unstable: "text-orange-300",
  "8_80": "text-blue-300",
} as const

export const VALUE_COLUMN_COLORS = {
  budget: "text-emerald-300",
  mid: "text-cyan-300",
  premium: "text-amber-300",
} as const

export const RECOMMENDED_COLUMN_COLORS = {
  top: "text-amber-300",
  strong: "text-cyan-300",
  niche: "text-slate-300",
} as const

export const CARD_TAG_STYLES = {
  competitive: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", dot: "bg-red-400" },
  versatile:  { bg: "bg-cyan-500/15",  text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  value:      { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  comfort:    { bg: "bg-amber-500/15",  text: "text-amber-300",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  cheap:      { bg: "bg-green-500/15",  text: "text-green-300",   border: "border-green-500/30",   dot: "bg-green-400" },
  expensive:  { bg: "bg-rose-500/15",   text: "text-rose-300",    border: "border-rose-500/30",    dot: "bg-rose-400" },
  light:      { bg: "bg-sky-500/15",    text: "text-sky-300",     border: "border-sky-500/30",     dot: "bg-sky-400" },
  heavy:      { bg: "bg-slate-500/15",  text: "text-slate-300",   border: "border-slate-500/30",   dot: "bg-slate-400" },
  unbalanced: { bg: "bg-pink-500/15",   text: "text-pink-300",    border: "border-pink-500/30",    dot: "bg-pink-400" },
  dpi_deviation: { bg: "bg-yellow-500/15", text: "text-yellow-300", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  wobble_high:{ bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  wobble_low: { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30",  dot: "bg-violet-400" },
  scroll_hard:{ bg: "bg-stone-500/15",   text: "text-stone-300",   border: "border-stone-500/30",   dot: "bg-stone-400" },
  scroll_soft:{ bg: "bg-lime-500/15",    text: "text-lime-300",    border: "border-lime-500/30",    dot: "bg-lime-400" },
  trimode:    { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  stable:     { bg: "bg-teal-500/15",   text: "text-teal-300",    border: "border-teal-500/30",    dot: "bg-teal-400" },
  unstable:   { bg: "bg-orange-500/15", text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  "8_80":          { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  poron:           { bg: "bg-gray-500/15",    text: "text-gray-300",    border: "border-gray-500/30",    dot: "bg-gray-400" },
  borracha:        { bg: "bg-zinc-500/15",    text: "text-zinc-300",    border: "border-zinc-500/30",    dot: "bg-zinc-400" },
  grosso:          { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  fino:            { bg: "bg-purple-500/15",  text: "text-purple-300",  border: "border-purple-500/30",  dot: "bg-purple-400" },
  rapido:          { bg: "bg-green-500/15",   text: "text-green-300",   border: "border-green-500/30",   dot: "bg-green-400" },
  devagar:         { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-500/30",   dot: "bg-slate-400" },
  hibrido:         { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  aspero:          { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  liso:            { bg: "bg-sky-500/15",     text: "text-sky-300",     border: "border-sky-500/30",     dot: "bg-sky-400" },
  mug:             { bg: "bg-lime-500/15",    text: "text-lime-300",    border: "border-lime-500/30",    dot: "bg-lime-400" },
  macio:           { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/30",    dot: "bg-pink-400" },
  afetado_umidade: { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  ultrapassado:    { bg: "bg-stone-500/15",   text: "text-stone-300",   border: "border-stone-500/30",   dot: "bg-stone-400" },
  magnetico:       { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30",  dot: "bg-violet-400" },
} as const

// Rating scale colors (0–6) — single source of truth shared by the peripheral
// create/edit form and the tierlist tooltip so the rating colors never drift.
// Index = rating value.
export const RATING_LEVEL_COLORS = [
  { bg: "bg-red-800 text-white",    bar: "bg-red-800",    text: "text-red-400" },    // 0 — super vermelho
  { bg: "bg-red-600 text-white",    bar: "bg-red-600",    text: "text-red-400" },    // 1 — vermelho forte
  { bg: "bg-yellow-400 text-black", bar: "bg-yellow-400", text: "text-yellow-300" }, // 2 — amarelo alerta
  { bg: "bg-zinc-400 text-black",   bar: "bg-zinc-400",   text: "text-zinc-300" },   // 3 — cinza
  { bg: "bg-green-600 text-white",  bar: "bg-green-600",  text: "text-green-400" },  // 4 — verde
  { bg: "bg-sky-500 text-white",    bar: "bg-sky-500",    text: "text-sky-400" },    // 5 — azul
  { bg: "bg-purple-600 text-white", bar: "bg-purple-600", text: "text-purple-400" }, // 6 — roxo
] as const

export const CARD_TIER_STYLES = {
  GOAT: {
    // Roxo mais vibrante e glow mais intenso que os demais tiers — o GOAT
    // precisa se destacar claramente no card, não só na etiqueta da tier.
    bg: "bg-black", text: "text-white", accent: "bg-[#8B5CF6]", ring: "ring-[#8B5CF6]/50",
    border: "border-[#8B5CF6]/30",
    borderHover: "hover:border-[#8B5CF6]",
    glow: "shadow-[0_0_16px_rgba(139,92,246,0.22)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.85),0_0_28px_6px_rgba(139,92,246,0.6),0_0_60px_16px_rgba(139,92,246,0.35)]",
  },
  SS: {
    bg: "bg-black", text: "text-white", accent: "bg-[#EF4444]", ring: "ring-[#EF4444]/45",
    border: "border-[#EF4444]/25",
    borderHover: "hover:border-[#EF4444]",
    glow: "shadow-[0_0_12px_rgba(239,68,68,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(239,68,68,0.85),0_0_28px_6px_rgba(239,68,68,0.6),0_0_60px_16px_rgba(239,68,68,0.35)]",
  },
  S: {
    bg: "bg-black", text: "text-white", accent: "bg-[#F97316]", ring: "ring-[#F97316]/45",
    border: "border-[#F97316]/25",
    borderHover: "hover:border-[#F97316]",
    glow: "shadow-[0_0_12px_rgba(249,115,22,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(249,115,22,0.85),0_0_28px_6px_rgba(249,115,22,0.6),0_0_60px_16px_rgba(249,115,22,0.35)]",
  },
  A: {
    bg: "bg-black", text: "text-white", accent: "bg-[#F59E0B]", ring: "ring-[#F59E0B]/45",
    border: "border-[#F59E0B]/25",
    borderHover: "hover:border-[#F59E0B]",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(245,158,11,0.85),0_0_28px_6px_rgba(245,158,11,0.6),0_0_60px_16px_rgba(245,158,11,0.35)]",
  },
  B: {
    bg: "bg-black", text: "text-white", accent: "bg-[#22C55E]", ring: "ring-[#22C55E]/45",
    border: "border-[#22C55E]/25",
    borderHover: "hover:border-[#22C55E]",
    glow: "shadow-[0_0_12px_rgba(34,197,94,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(34,197,94,0.85),0_0_28px_6px_rgba(34,197,94,0.6),0_0_60px_16px_rgba(34,197,94,0.35)]",
  },
  C: {
    bg: "bg-black", text: "text-white", accent: "bg-[#3B82F6]", ring: "ring-[#3B82F6]/45",
    border: "border-[#3B82F6]/25",
    borderHover: "hover:border-[#3B82F6]",
    glow: "shadow-[0_0_12px_rgba(59,130,246,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(59,130,246,0.85),0_0_28px_6px_rgba(59,130,246,0.6),0_0_60px_16px_rgba(59,130,246,0.35)]",
  },
  L: {
    bg: "bg-black", text: "text-white", accent: "bg-[#6B7280]", ring: "ring-[#6B7280]/35",
    border: "border-[#6B7280]/25",
    borderHover: "hover:border-[#6B7280]",
    glow: "shadow-[0_0_10px_rgba(107,114,128,0.12)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(107,114,128,0.75),0_0_28px_6px_rgba(107,114,128,0.5),0_0_60px_16px_rgba(107,114,128,0.3)]",
  },
} as const
