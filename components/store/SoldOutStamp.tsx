import { cn } from "@/lib/utils"

/**
 * Carimbo "Esgotado" inclinado sobre a foto, como anúncio vendido no Xianyu.
 * Fica por cima da imagem já dessaturada (quem usa aplica o `grayscale`): o
 * véu escurece o resto e o carimbo é a única mensagem ali. Card e galeria da
 * página do produto usam o mesmo, para o esgotado se ler igual nos dois.
 */
export function SoldOutStamp({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <span className={cn("pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-900/35", className)}>
      <span
        className={cn(
          "-rotate-[14deg] rounded-md border-2 border-white/75 font-display font-extrabold uppercase text-white/85 outline outline-1 outline-white/40",
          size === "lg"
            ? "px-7 py-2 text-2xl tracking-[0.3em] outline-offset-4 sm:text-3xl"
            : "px-4 py-1 text-[15px] tracking-[0.28em] outline-offset-[3px] @[15rem]:text-lg"
        )}
      >
        Esgotado
      </span>
    </span>
  )
}
