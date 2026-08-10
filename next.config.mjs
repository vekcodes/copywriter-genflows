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
};

export default nextConfig;
