import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  // /cdn/tickets/* keeps the contract URL shape; a dynamic route serves
  // runtime-generated PDFs (next start manifests public/ at boot).
  async rewrites() {
    return [{ source: '/cdn/tickets/:ref', destination: '/api/v1/tickets/:ref' }];
  },
};

export default nextConfig;
