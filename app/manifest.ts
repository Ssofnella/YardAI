import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yardline",
    short_name: "Yardline",
    description: "Gate, yard, and door board for a single warehouse.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#1f4a3e",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
