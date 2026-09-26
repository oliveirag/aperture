import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge off the sidebar footer during demos and screenshots.
  devIndicators: false,
  // Company logos from Finnhub profiles.
  images: {
    remotePatterns: [new URL("https://static2.finnhub.io/file/publicdatany/finnhubimage/**")],
  },
};

export default nextConfig;
