"use client"

import { motion } from "framer-motion"

/**
 * Versão compacta do AuthBackground só pro cartão do modal (sem os previews
 * de card do site, que não cabem num Dialog pequeno) — mantém a mesma dupla
 * de blobs ciano/violeta pra continuidade visual com /login e /register.
 */
export function AuthModalGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-xl">
      <motion.div
        className="absolute -top-16 -left-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.28),transparent_70%)] blur-2xl"
        animate={{ x: [0, 18, 0], y: [0, 12, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-20 -right-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.28),transparent_70%)] blur-2xl"
        animate={{ x: [0, -18, 0], y: [0, -12, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <div
        className="absolute inset-0 text-foreground/[0.05] dark:text-foreground/[0.12]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 100% 70% at 50% 0%, black 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 100% 70% at 50% 0%, black 40%, transparent 100%)",
        }}
      />
    </div>
  )
}
