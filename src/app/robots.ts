import type { MetadataRoute } from "next";

// Every page view can read the database, which is billed per row. Crawlers may
// index the plain pages, but not the open-ended query-string combinations
// (rankings filters, as-of dates, sorts, pages, profile tabs) or search.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "PerplexityBot",
  "Amazonbot",
  "meta-externalagent",
  "Applebot-Extended",
  "Diffbot",
  "ImagesiftBot",
  "omgili",
  "Timpibot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/*?", "/search", "/api/", "/auth/", "/admin", "/dashboard", "/settings", "/login", "/onboarding", "/members/"],
        crawlDelay: 10,
      },
    ],
  };
}
