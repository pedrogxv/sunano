import { cn } from "@/lib/utils"

interface SunanoIconProps {
  className?: string
}

export function SunanoIcon({ className }: SunanoIconProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-9 shrink-0", className)}
      aria-label="Sunano"
    >
      {/* Background */}
      <rect width="36" height="36" rx="8" fill="#0f0f0f" />

      {/* Crest feathers — signature cockatoo feature */}
      <path d="M11 16 Q9 9 12 2 Q14 9 12 16 Z" fill="white" fillOpacity={0.45} />
      <path d="M14.5 15 Q13 7 16 1 Q18 8 15.5 16 Z" fill="white" fillOpacity={0.9} />
      <path d="M18 16 Q18 9 21 5 Q20.5 10 19 17 Z" fill="white" fillOpacity={0.6} />

      {/* Head */}
      <circle cx="14" cy="24" r="9.5" fill="white" />

      {/* Beak */}
      <path d="M22 22 L27 23.5 L22.5 26 Z" fill="#e0ccaa" />

      {/* Eye */}
      <circle cx="17" cy="22" r="3" fill="#111111" />
      {/* Eye highlight */}
      <circle cx="18" cy="21" r="1.1" fill="white" />
    </svg>
  )
}

interface SunanoLogoProps {
  showText?: boolean
  subtitle?: string
  className?: string
}

export function SunanoLogo({
  showText = false,
  subtitle = "Tierlist",
  className,
}: SunanoLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SunanoIcon />
      {showText && (
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">Sunano</span>
          <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            {subtitle}
          </span>
        </div>
      )}
    </div>
  )
}
