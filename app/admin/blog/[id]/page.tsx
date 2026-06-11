import { Suspense } from "react"

import { BlogPostForm } from "../form"

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <BlogPostForm postId={id} />
    </Suspense>
  )
}
