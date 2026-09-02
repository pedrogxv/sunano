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

// Texto das etiquetas de tier: branco no modo claro, preto no modo escuro —
// mesma cor pra todos os tiers, só invertendo por tema (em vez de por tier).
const TIER_LABEL_TEXT_COLOR = "text-white dark:text-[#141925]"

export const TIER_THEMES = {
  GOAT: {
    accent: "from-violet-500 to-violet-700",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  SS: {
    accent: "from-red-400 to-red-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  S: {
    accent: "from-orange-400 to-orange-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  A: {
    accent: "from-amber-400 to-amber-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  B: {
    accent: "from-green-400 to-green-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  C: {
    accent: "from-blue-400 to-blue-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
  L: {
    accent: "from-gray-400 to-gray-600",
    textColor: TIER_LABEL_TEXT_COLOR,
  },
} as const

export const TAG_COLUMN_COLORS = {
  competitive: "text-violet-300",
  versatile: "text-red-300",
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

// Cores das faixas de preço da aba "Custo Benefício" — espectro dourado (mais caro) até
// azul/índigo (mais barato), deliberadamente distinto da paleta de tier (violeta/vermelho/
// laranja/âmbar/verde/azul/cinza) pra não passar a impressão de que faixa de preço é
// qualidade. GOLPE quebra o espectro com vermelho/cinza-escuro — alerta, não faixa normal.
export const PRICE_BAND_THEMES = {
  "1000": { accent: "from-yellow-400 to-yellow-600", textColor: TIER_LABEL_TEXT_COLOR },
  "750": { accent: "from-emerald-400 to-emerald-600", textColor: TIER_LABEL_TEXT_COLOR },
  "500": { accent: "from-teal-400 to-teal-600", textColor: TIER_LABEL_TEXT_COLOR },
  "300": { accent: "from-cyan-400 to-cyan-600", textColor: TIER_LABEL_TEXT_COLOR },
  "200": { accent: "from-sky-400 to-sky-600", textColor: TIER_LABEL_TEXT_COLOR },
  "100": { accent: "from-indigo-400 to-indigo-600", textColor: TIER_LABEL_TEXT_COLOR },
  golpe: { accent: "from-red-700 to-zinc-900", textColor: "text-white" },
} as const

export const CARD_PRICE_BAND_STYLES = {
  "1000": {
    bg: "bg-black", text: "text-white", accent: "bg-[#EAB308]", ring: "ring-[#EAB308]/45",
    border: "border-[#EAB308]/25", borderHover: "hover:border-[#EAB308]",
    glow: "shadow-[0_0_12px_rgba(234,179,8,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(234,179,8,0.85),0_0_28px_6px_rgba(234,179,8,0.6),0_0_60px_16px_rgba(234,179,8,0.35)]",
  },
  "750": {
    bg: "bg-black", text: "text-white", accent: "bg-[#10B981]", ring: "ring-[#10B981]/45",
    border: "border-[#10B981]/25", borderHover: "hover:border-[#10B981]",
    glow: "shadow-[0_0_12px_rgba(16,185,129,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(16,185,129,0.85),0_0_28px_6px_rgba(16,185,129,0.6),0_0_60px_16px_rgba(16,185,129,0.35)]",
  },
  "500": {
    bg: "bg-black", text: "text-white", accent: "bg-[#14B8A6]", ring: "ring-[#14B8A6]/45",
    border: "border-[#14B8A6]/25", borderHover: "hover:border-[#14B8A6]",
    glow: "shadow-[0_0_12px_rgba(20,184,166,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(20,184,166,0.85),0_0_28px_6px_rgba(20,184,166,0.6),0_0_60px_16px_rgba(20,184,166,0.35)]",
  },
  "300": {
    bg: "bg-black", text: "text-white", accent: "bg-[#06B6D4]", ring: "ring-[#06B6D4]/45",
    border: "border-[#06B6D4]/25", borderHover: "hover:border-[#06B6D4]",
    glow: "shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(6,182,212,0.85),0_0_28px_6px_rgba(6,182,212,0.6),0_0_60px_16px_rgba(6,182,212,0.35)]",
  },
  "200": {
    bg: "bg-black", text: "text-white", accent: "bg-[#0EA5E9]", ring: "ring-[#0EA5E9]/45",
    border: "border-[#0EA5E9]/25", borderHover: "hover:border-[#0EA5E9]",
    glow: "shadow-[0_0_12px_rgba(14,165,233,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(14,165,233,0.85),0_0_28px_6px_rgba(14,165,233,0.6),0_0_60px_16px_rgba(14,165,233,0.35)]",
  },
  "100": {
    bg: "bg-black", text: "text-white", accent: "bg-[#6366F1]", ring: "ring-[#6366F1]/45",
    border: "border-[#6366F1]/25", borderHover: "hover:border-[#6366F1]",
    glow: "shadow-[0_0_12px_rgba(99,102,241,0.15)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(99,102,241,0.85),0_0_28px_6px_rgba(99,102,241,0.6),0_0_60px_16px_rgba(99,102,241,0.35)]",
  },
  golpe: {
    bg: "bg-zinc-900", text: "text-white", accent: "bg-[#DC2626]", ring: "ring-[#DC2626]/60",
    border: "border-[#DC2626]/50", borderHover: "hover:border-[#DC2626]",
    glow: "shadow-[0_0_14px_rgba(220,38,38,0.3)]",
    glowHover: "hover:shadow-[0_0_10px_2px_rgba(220,38,38,0.95),0_0_28px_6px_rgba(220,38,38,0.7),0_0_60px_16px_rgba(220,38,38,0.4)]",
  },
} as const

export const RECOMMENDED_COLUMN_COLORS = {
  top: "text-amber-300",
  strong: "text-cyan-300",
  niche: "text-slate-300",
} as const

export const CARD_TAG_STYLES = {
  competitive: { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30", dot: "bg-violet-400" },
  versatile:  { bg: "bg-red-500/15",   text: "text-red-300",     border: "border-red-500/30",     dot: "bg-red-400" },
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
  raro:            { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  fibra_carbono:   { bg: "bg-neutral-500/15", text: "text-neutral-300", border: "border-neutral-500/30", dot: "bg-neutral-400" },
  control:         { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  speed:           { bg: "bg-yellow-500/15",  text: "text-yellow-300",  border: "border-yellow-500/30",  dot: "bg-yellow-400" },
  silicone:        { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  ia:              { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  white_label:     { bg: "bg-gray-500/15",    text: "text-gray-300",    border: "border-gray-500/30",    dot: "bg-gray-400" },
  ips:             { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  va:              { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  tn:              { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  oled:            { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  miniled:         { bg: "bg-yellow-500/15",  text: "text-yellow-300",  border: "border-yellow-500/30",  dot: "bg-yellow-400" },
  fhd:             { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-500/30",   dot: "bg-slate-400" },
  qhd:             { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  "4k":            { bg: "bg-purple-500/15",  text: "text-purple-300",  border: "border-purple-500/30",  dot: "bg-purple-400" },
  headphone:       { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/30",    dot: "bg-rose-400" },
  wired:           { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  wireless:        { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  padrao_atx:        { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-500/30",   dot: "bg-slate-400" },
  full_modular:      { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30",  dot: "bg-violet-400" },
  semi_modular:      { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  white_noise:       { bg: "bg-zinc-500/15",    text: "text-zinc-300",    border: "border-zinc-500/30",    dot: "bg-zinc-400" },
  bom_ripple:        { bg: "bg-green-500/15",   text: "text-green-300",   border: "border-green-500/30",   dot: "bg-green-400" },
  ripple_ruim:       { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  fonte_instavel:    { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/30",    dot: "bg-rose-400" },
  "80_plus":         { bg: "bg-yellow-500/15",  text: "text-yellow-300",  border: "border-yellow-500/30",  dot: "bg-yellow-400" },
  selo_cybenetics:   { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  capacitor_japones: { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  v_shaped:          { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  u_shaped:          { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  neutro:            { bg: "bg-slate-500/15",   text: "text-slate-300",   border: "border-slate-500/30",   dot: "bg-slate-400" },
  neutro_quente:     { bg: "bg-stone-500/15",   text: "text-stone-300",   border: "border-stone-500/30",   dot: "bg-stone-400" },
  quente:            { bg: "bg-rose-500/15",    text: "text-rose-300",    border: "border-rose-500/30",    dot: "bg-rose-400" },
  escuro:            { bg: "bg-zinc-500/15",    text: "text-zinc-300",    border: "border-zinc-500/30",    dot: "bg-zinc-400" },
  basshead:          { bg: "bg-purple-500/15",  text: "text-purple-300",  border: "border-purple-500/30",  dot: "bg-purple-400" },
  vocal_forward:     { bg: "bg-pink-500/15",    text: "text-pink-300",    border: "border-pink-500/30",    dot: "bg-pink-400" },
  harman:            { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  ief_neutral:       { bg: "bg-blue-500/15",    text: "text-blue-300",    border: "border-blue-500/30",    dot: "bg-blue-400" },
  jm_1:              { bg: "bg-sky-500/15",     text: "text-sky-300",     border: "border-sky-500/30",     dot: "bg-sky-400" },
  sub_bass_focus:    { bg: "bg-violet-500/15",  text: "text-violet-300",  border: "border-violet-500/30",  dot: "bg-violet-400" },
  mid_bass_focus:    { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", border: "border-fuchsia-500/30", dot: "bg-fuchsia-400" },
  punchy:            { bg: "bg-red-500/15",     text: "text-red-300",     border: "border-red-500/30",     dot: "bg-red-400" },
  smooth:            { bg: "bg-teal-500/15",    text: "text-teal-300",    border: "border-teal-500/30",    dot: "bg-teal-400" },
  arejado:           { bg: "bg-cyan-500/15",    text: "text-cyan-300",    border: "border-cyan-500/30",    dot: "bg-cyan-400" },
  sibilante:         { bg: "bg-yellow-500/15",  text: "text-yellow-300",  border: "border-yellow-500/30",  dot: "bg-yellow-400" },
  detalhado:         { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  palco_amplo:       { bg: "bg-lime-500/15",    text: "text-lime-300",    border: "border-lime-500/30",    dot: "bg-lime-400" },
  boa_separacao:     { bg: "bg-green-500/15",   text: "text-green-300",   border: "border-green-500/30",   dot: "bg-green-400" },
  metal:             { bg: "bg-neutral-500/15", text: "text-neutral-300", border: "border-neutral-500/30", dot: "bg-neutral-400" },
  resina:            { bg: "bg-sky-500/15",     text: "text-sky-300",     border: "border-sky-500/30",     dot: "bg-sky-400" },
  plastico:          { bg: "bg-gray-500/15",    text: "text-gray-300",    border: "border-gray-500/30",    dot: "bg-gray-400" },
  shell_pequeno:     { bg: "bg-teal-500/15",    text: "text-teal-300",    border: "border-teal-500/30",    dot: "bg-teal-400" },
  shell_grande:      { bg: "bg-orange-500/15",  text: "text-orange-300",  border: "border-orange-500/30",  dot: "bg-orange-400" },
  deep_fit:          { bg: "bg-indigo-500/15",  text: "text-indigo-300",  border: "border-indigo-500/30",  dot: "bg-indigo-400" },
  boa_isolacao:      { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  driver_flex:       { bg: "bg-amber-500/15",   text: "text-amber-300",   border: "border-amber-500/30",   dot: "bg-amber-400" },
  planar:            { bg: "bg-purple-500/15",  text: "text-purple-300",  border: "border-purple-500/30",  dot: "bg-purple-400" },
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
