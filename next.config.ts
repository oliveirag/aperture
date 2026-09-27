import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge off the sidebar footer during demos and screenshots.
  devIndicators: false,
  // Tesseract starts its OCR worker from a file path at runtime, which bundling would break.
  serverExternalPackages: ["tesseract.js"],
  // Company logos from Finnhub profiles.
  images: {
    remotePatterns: [new URL("https://static2.finnhub.io/file/publicdatany/finnhubimage/**")],
  },
};

export default nextConfig;
