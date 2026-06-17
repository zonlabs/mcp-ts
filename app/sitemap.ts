import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/url";

const PUBLIC_ROUTES = [
  "",
  "/mcp",
  "/registry",
  "/gateway",
  "/publish",
  "/faq",
  "/privacy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl().replace(/\/$/, "");
  const now = new Date();

  return PUBLIC_ROUTES.map((route, index) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: index === 0 ? 1 : 0.7,
  }));
}
