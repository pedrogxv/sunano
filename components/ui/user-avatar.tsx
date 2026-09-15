import Image from "next/image"
import { UserX } from "lucide-react"

export function UserAvatar({
  name,
  avatarUrl,
  size = 8,
  /** Conta que existiu e foi removida — treinamento visual padrão (fundo vermelho + ícone), em vez do avatar/iniciais normais. */
  removed = false,
  /** Anel na cor do VIP — mesmo tratamento do perfil/Mini Perfil, aplicado aqui pra reconhecer VIP no fórum antes de ler o selo ao lado do nome. */
  isVip = false,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  removed?: boolean
  isVip?: boolean
}) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const sizeClass = `size-${size}`
  const vipRingClass = isVip ? "ring-2 ring-[var(--vip-accent-soft)] ring-offset-1 ring-offset-background" : ""

  if (removed) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/15 text-destructive`}
        title="Usuário removido"
      >
        <UserX className="size-[55%]" strokeWidth={2} />
      </div>
    )
  }

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size * 4}
        height={size * 4}
        unoptimized
        className={`${sizeClass} ${vipRingClass} shrink-0 rounded-full object-cover border border-border`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} ${vipRingClass} flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary`}
    >
      {initials}
    </div>
  )
}
