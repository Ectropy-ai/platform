/** @type {import('next').NextConfig} */
const nextConfig = {
  // Developer portal uses swagger-ui-react which requires full Node.js runtime
  // ENTERPRISE: Fully dynamic application - no static optimization
  reactStrictMode: true,
  swcMinify: true,
  // CRITICAL: Skip build-time page generation to prevent swagger-ui-react SSR conflicts
  // swagger-ui-react dependencies import next/document which breaks App Router prerendering
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  eslint: {
    // Disable ESLint during build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Skip type checking during build (we'll run it separately)
    ignoreBuildErrors: true,
  },
  // ENTERPRISE: Configure page generation to skip static optimization
  experimental: {
    // Disable automatic static optimization for ALL pages
    isrMemoryCacheSize: 0,
  },
  webpack: (config, { isServer }) => {
    // Fix for swagger-ui-react
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Prevent swagger-ui from being included in server bundle
    if (isServer) {
      config.externals = [...(config.externals || []), 'swagger-ui-react'];
    }

    return config;
  },
};

module.exports = nextConfig;
