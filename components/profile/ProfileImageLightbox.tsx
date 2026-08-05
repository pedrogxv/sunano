"use client"

import { useState } from "react"
import Image from "next/image"
import { X } from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ProfileImageLightboxProps {
  src: string
  alt: string
  unoptimized?: boolean
  /** Envolve a mídia (banner ou avatar) que deve ficar clicável. */
  children: React.ReactNode
  triggerClassName?: string
}

/**
 * Torna a capa ou o avatar do perfil clicáveis, abrindo a imagem em tamanho
 * grande num modal. Mesma ideia do lightbox de imagens do fórum, mas sem o
 * zoom 2x — aqui a imagem já é a própria foto de perfil/capa, não um anexo de
 * post onde faz sentido examinar detalhe.
 *
 * O overlay padrão do Dialog (`bg-black/10`) já fecha ao clicar fora, mas é
 * sutil demais aqui — o usuário não percebe que pode clicar fora nem que há
 * como fechar. Escurecemos o fundo, deixamos toda a área fora da imagem com
 * `cursor-zoom-out` e adicionamos um botão de fechar grande e visível, em vez
 * de depender só do X pequeno padrão do Dialog.
 */
export function ProfileImageLightbox({
  src,
  alt,
  unoptimized,
  children,
  triggerClassName,
}: ProfileImageLightboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("group/lightbox-trigger block cursor-zoom-in", triggerClassName)}
          aria-label={`Ampliar ${alt}`}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="cursor-zoom-out bg-black/80" />
        <DialogContent
          showCloseButton={false}
          className="flex max-w-3xl cursor-zoom-out items-center justify-center overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <DialogClose
            className="absolute top-3 right-3 z-10 flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </DialogClose>
          <Image
            src={src}
            alt={alt}
            width={1200}
            height={1200}
            unoptimized={unoptimized}
            onClick={(event) => event.stopPropagation()}
            className="h-auto max-h-[85vh] w-auto cursor-default rounded-lg object-contain"
          />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
