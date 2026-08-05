import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sunano | Tierlist de Periféricos",
    short_name: "Sunano",
    description: "A tierlist definitiva de periféricos gamers. Compare mouses, teclados, headsets e mais com filtros avancados e reviews detalhadas.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
