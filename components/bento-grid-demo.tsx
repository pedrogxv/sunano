import React from "react"
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid"
import { getPeripheralIcon } from "@/lib/peripheral-icons"

export type BentoBlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  created_at: string
  peripheral?: {
    name: string
    brand: string
  } | null
}

interface BentoGridDemoProps {
  posts: BentoBlogPost[]
}

const Skeleton = ({ coverImageUrl }: { coverImageUrl: string | null }) => (
  <div className="relative flex h-full min-h-[6rem] w-full overflow-hidden rounded-xl border border-border bg-card">
    {coverImageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImageUrl}
        alt="Preview"
        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover/bento:scale-105"
      />
    ) : (
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),linear-gradient(135deg,var(--card),var(--background))]" />
    )}
    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
  </div>
)

function BlogPreview({ post }: { post: BentoBlogPost }) {
  return (
    <Skeleton coverImageUrl={post.cover_image_url} />
  )
}

export function BentoGridDemo({ posts }: BentoGridDemoProps) {
  const items = posts.slice(0, 7).map((post) => {
    const IconComponent = getPeripheralIcon(post.peripheral?.name)
    return {
      title: post.title,
      description: post.excerpt ?? post.peripheral?.name ?? "Artigo publicado no blog",
      header: <BlogPreview post={post} />,
      icon: IconComponent ? <IconComponent className="h-4 w-4 text-primary" /> : null,
    }
  })

  return (
    <BentoGrid className="mx-auto max-w-6xl">
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={item.header}
          icon={item.icon}
          href={`/blog/${posts[i].slug}`}
          className={i === 3 || i === 6 ? "md:col-span-2" : i === 0 ? "md:col-span-2 md:row-span-2" : ""}
        />
      ))}
    </BentoGrid>
  )
}

export default BentoGridDemo
