"use client"

import Image from "next/image"
import Link from "next/link"
import { ImageIcon, Quote } from "lucide-react"
import { AuraIcon } from "@/components/ui/AuraIcon"

import { AuthorAvatarLink, AuthorNameLink, authorFrom } from "@/components/profile/AuthorLink"
import { CommentBody } from "@/components/comments/CommentBody"
import type { ForumTopComment } from "@/lib/server/repositories/forum-repository"

/**
 * Preview do comentário com mais aura de um post, no rodapé do card da
 * listagem — o "melhor pedaço da discussão" aparece sem precisar abrir o
 * post, estilo citação destacada.
 *
 * O texto já chega truncado do banco (`body_preview`, `left(body, 200)`; ver
 * `get_forum_posts_comment_summary`), então aqui não há corte adicional além
 * do `line-clamp-2` visual. Como o preview pode cortar no meio de uma marca
 * de formatação (`**negrito` sem fechar), `CommentBody` renderiza o resto
 * como texto puro — degrada bem, não quebra.
 *
 * Comentário com mídia mostra uma miniatura quadrada ao lado do texto — GIF
 * do KLIPY vive no mesmo `image_urls` das imagens, então os dois caem aqui;
 * `unoptimized` mantém o GIF animado, igual ao `ImageLightbox`. Só a primeira
 * imagem vem do banco (as demais viram um "+N" sobre a miniatura), e clicar
 * leva ao post, onde o comentário aparece inteiro com lightbox.
 *
 * O link do bloco é uma camada `absolute inset-0` atrás do conteúdo, e NÃO um
 * `<Link>` envolvendo tudo: avatar e nome do autor já são âncoras (Mini
 * Perfil), e `<a>` dentro de `<a>` é HTML inválido — quebra a hidratação.
 * Mesmo padrão que o `PostCard` usa para o card inteiro.
 */
export function TopCommentPreview({ comment, postSlug }: { comment: ForumTopComment; postSlug: string }) {
  return (
    <div className="group/tc relative z-10 mt-3 overflow-hidden rounded-lg border border-border/60 bg-muted/30 p-2.5 pl-3 pointer-events-auto transition-colors hover:border-orange-500/40 hover:bg-orange-500/[0.04]">
      <Link
        href={`/forum/${postSlug}#comments`}
        aria-label={`Ver comentário em destaque de ${comment.author_display_name}`}
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-0 z-0 rounded-lg"
      />

      {/* Barrinha lateral de citação — vira laranja no hover, amarrando o
          bloco à aura que fez esse comentário ser o destaque. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-0.5 bg-border transition-colors group-hover/tc:bg-orange-500/60"
      />

      {/* Camada de conteúdo acima do link de fundo, com os cliques desligados
          para o link receber — reabertos só no avatar/nome do autor. */}
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Quote className="size-3 shrink-0 text-orange-500/70" fill="currentColor" strokeWidth={0} />
          <span className="font-medium text-orange-500/90">Destaque dos comentários</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-orange-500">
            <AuraIcon size="sm" tone="inherit" />
            {comment.aura_count}
          </span>
        </div>

        <div className="mt-1.5 flex items-start gap-2">
          <AuthorAvatarLink
            author={authorFrom(comment)}
            avatarUrl={comment.author_avatar_url}
            size="xs"
            onClick={(event) => event.stopPropagation()}
            className="pointer-events-auto mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <AuthorNameLink
              author={authorFrom(comment)}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto text-xs font-semibold"
            />
            {/* Links escritos DENTRO do texto do comentário ficam inertes: são
                âncoras aninhadas na camada do link de fundo, e no preview
                truncado a URL pode nem estar completa. */}
            {comment.preview.trim() ? (
              <div className="line-clamp-2 text-xs text-muted-foreground [&_a]:pointer-events-none">
                <CommentBody body={comment.preview} />
              </div>
            ) : (
              // Comentário só de mídia: sem esta legenda a linha do autor
              // ficaria órfã ao lado de uma miniatura sem explicação.
              <span className="inline-flex items-center gap-1 text-xs italic text-muted-foreground/80">
                <ImageIcon className="size-3" />
                {comment.image_count > 1 ? `${comment.image_count} imagens` : "Enviou uma imagem"}
              </span>
            )}
          </div>

          {comment.image_url && (
            <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
              <Image
                src={comment.image_url}
                alt=""
                fill
                sizes="48px"
                unoptimized
                className="object-cover"
              />
              {comment.image_count > 1 && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] font-semibold leading-4 text-white">
                  +{comment.image_count - 1}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
