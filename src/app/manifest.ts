import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PropCo — Property Management",
    short_name: "PropCo",
    description: "Manage properties, rent, repairs and payouts.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#16302b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
