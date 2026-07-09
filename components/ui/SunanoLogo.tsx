import { cn } from "@/lib/utils"

interface SunanoIconProps {
  className?: string
}

export function SunanoIcon({ className }: SunanoIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/mascot/Logo-Sunano_calo-contorno.png"
      alt="Sunano"
      className={cn("size-9 shrink-0 object-contain", className)}
    />
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
