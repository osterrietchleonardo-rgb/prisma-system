/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.tokkobroker.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.roomix.ai',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: 
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://assets.mailerlite.com https://static.mailerlite.com; " +
              "style-src 'self' 'unsafe-inline' https://assets.mailerlite.com https://static.mailerlite.com; " +
              "img-src 'self' blob: data: https://*.supabase.co https://*.tokkobroker.com https://*.googleusercontent.com https://*.mailerlite.com https://cdn.roomix.ai; " +
              "font-src 'self' data: https://fonts.gstatic.com https://assets.mailerlite.com; " +
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://api.mailerlite.com https://*.mailerlite.com; " +
              "frame-src 'self' https://accounts.google.com https://*.mailerlite.com; " +
              "object-src 'none'; " +
              "base-uri 'self';"
          },
        ],
      },
    ];
  },
};

export default nextConfig;
