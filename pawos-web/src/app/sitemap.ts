import type { MetadataRoute } from "next";
import { FEATURES } from "../lib/featuresContent";
import { DOCS } from "../lib/docsContent";
import { RUNTIMES } from "../lib/runtimesContent";
import { ARTICLES } from "../lib/articlesContent";
import { LEGAL_DOCS } from "../lib/legalContent";

const SITE_URL = "https://pawos.app";

const STATIC_ROUTES = [
  "",
  "/features",
  "/pricing",
  "/enterprise",
  "/download",
  "/docs",
  "/docs/autonomous-ticket-resolution",
  "/knowledge-base",
  "/blog",
  "/changelog",
  "/faq",
  "/roadmap",
  "/trust",
  "/status",
  "/security",
  "/support",
  "/support/contact",
  "/support/sales",
  "/legal",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const dynamicRoutes = [
    ...FEATURES.map((f) => `/features/${f.slug}`),
    ...DOCS.map((d) => `/docs/${d.slug}`),
    ...RUNTIMES.map((r) => `/docs/runtimes/${r.slug}`),
    ...ARTICLES.map((a) => `/blog/${a.slug}`),
    ...LEGAL_DOCS.map((l) => `/legal/${l.slug}`),
  ];

  return [...STATIC_ROUTES, ...dynamicRoutes].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
