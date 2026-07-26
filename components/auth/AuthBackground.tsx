export function AuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 text-foreground/[0.06] dark:text-foreground/[0.16]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 40%, black 45%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 40%, black 45%, transparent 100%)",
        }}
      />
      <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18),transparent_70%)] blur-3xl motion-safe:animate-[auth-blob-drift-a_20s_ease-in-out_infinite]" />
      <div className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.18),transparent_70%)] blur-3xl motion-safe:animate-[auth-blob-drift-b_24s_ease-in-out_infinite]" />
    </div>
  )
}
