import Image from "next/image"

export function UserAvatar({
  name,
  avatarUrl,
  size = 8,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
}) {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const sizeClass = `size-${size}`

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size * 4}
        height={size * 4}
        className={`${sizeClass} shrink-0 rounded-full object-cover border border-border`}
      />
    )
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary`}>
      {initials}
    </div>
  )
}
