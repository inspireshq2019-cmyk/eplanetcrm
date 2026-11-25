import type { NextConfig } from "next";

// Which websites may show the CRM's public enquiry forms inside their pages. Every other CRM page refuses to be framed.
const EMBED_ORIGINS = (process.env.EMBED_ORIGINS ||
  "https://eplanetintl.com https://*.eplanetintl.com https://eplanetintl.online https://*.eplanetintl.online").replace(/,/g, " ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/((?!f/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/f/:slug", headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' ${EMBED_ORIGINS}` }] },
    ];
  },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A CRM shows live, per-user data on every page, so pages render on each request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
