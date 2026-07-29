import { VideosFeedContent } from "@/components/videos/videos-feed-content"

export const revalidate = 300

export default async function AdminVideosPage() {
  return <VideosFeedContent />
}
