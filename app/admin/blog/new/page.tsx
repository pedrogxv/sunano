import { Suspense } from "react"

import { BlogPostForm } from "../form"

export default function NewBlogPostPage() {
  return (
    <Suspense fallback={null}>
      <BlogPostForm />
    </Suspense>
  )
}
