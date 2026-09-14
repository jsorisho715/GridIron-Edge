import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode } from "react";
import css from "../styles.css?url";
import custom from "../gridiron.css?url";
import meta from "../app-meta.json";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: meta.og_title },
      { name: "description", content: meta.og_description },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: meta.theme_color },
      { property: "og:title", content: meta.og_title },
      { property: "og:description", content: meta.og_description },
      { property: "og:image", content: meta.og_image_url },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: css },
      { rel: "stylesheet", href: custom },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;550;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: meta.favicon_url },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: Shell,
  component: Root,
  notFoundComponent: () => (
    <main className="ge-empty">
      <h1>Page not found</h1>
      <p>Return to your Gridiron Edge workspace.</p>
      <a className="ge-button" href="/app">
        Open workspace
      </a>
    </main>
  ),
  errorComponent: () => (
    <main className="ge-empty">
      <h1>Unable to open this page</h1>
      <p>Reload the workspace to try again.</p>
      <a className="ge-button" href="/app">
        Reload workspace
      </a>
    </main>
  ),
});
function Shell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
