import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating "N" dev-tools indicator; compile/runtime errors
  // still surface as overlays.
  devIndicators: false,

  async headers() {
    return [
      {
        // Only the portfolio may frame the mini mat. localhost:4321 is the
        // portfolio's Astro dev server. Applies to /embed alone, so every
        // other page's headers are unchanged.
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://matthewthien.com https://www.matthewthien.com http://localhost:4321",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
