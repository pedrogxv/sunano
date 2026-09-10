"use client"

import { MediaViewer, type MediaViewerItem } from "@/components/ui/media-viewer"

/**
 * Uma mídia do perfil (capa ou foto). Alias do item genérico do
 * `MediaViewer` — o perfil sempre preenche `label` ("Capa"/"Foto"), que é o
 * que faz o visualizador usar abas de texto em vez de miniaturas.
 */
export type ProfileLightboxItem = MediaViewerItem

interface ProfileImageLightboxProps {
  /**
   * Capa e foto do perfil, na ordem das abas. As duas entram juntas mesmo
   * quando o clique veio de uma só: quem abriu a capa quase sempre quer ver a
   * foto em seguida, e voltar pro perfil só pra clicar no outro elemento era o
   * pior pedaço da experiência antiga.
   */
  items: ProfileLightboxItem[]
  /** Índice de `items` que o clique neste gatilho deve abrir. */
  index: number
  /** Envolve a mídia (banner ou avatar) que deve ficar clicável. */
  children: React.ReactNode
  triggerClassName?: string
  /** Canto onde a lupa do hover aparece sobre o gatilho. */
  hintPosition?: "center" | "corner"
}

/**
 * Capa e foto do perfil no visualizador compartilhado (`MediaViewer`).
 *
 * Continua existindo como componente próprio porque `Banner` e
 * `AvatarQuadrado` têm um detalhe que é só deles: os dois são irmãos e
 * precisam abrir a **mesma** lista de duas mídias, cada um no seu índice (ver
 * `lib/profile-media-items.ts`).
 */
export function ProfileImageLightbox({
  items,
  index,
  children,
  triggerClassName,
  hintPosition = "corner",
}: ProfileImageLightboxProps) {
  return (
    <MediaViewer
      items={items}
      index={index}
      triggerClassName={triggerClassName}
      hintPosition={hintPosition}
    >
      {children}
    </MediaViewer>
  )
}
