/** @type {import('next').NextConfig} */
const nextConfig = {
  // The API routes read prompt/knowledge files from disk at runtime, so keep them
  // on the Node.js runtime (not edge) and bundle the source markdown/txt assets.
  outputFileTracingIncludes: {
    "/api/**": [
      "./COLD_EMAIL_KNOWLEDGE_BASE.md",
      "./content/**/*",
    ],
  },
  // pdf-parse bundles pdfjs-dist, which breaks when webpack tries to bundle it
  // for the server ("Object.defineProperty called on non-object") — load both
  // natively via require at runtime instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
