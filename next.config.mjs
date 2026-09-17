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
    ],
  },
  async redirects() {
    return [
      // Tasaciones pasó a llamarse ACM (Análisis Comparativo de Mercado).
      { source: '/director/tasaciones', destination: '/director/acm', permanent: true },
      // Marketing IA dejó de ser una página con solapas (12/9/2026): cada solapa es una
      // página. La dirección vieja lleva a la primera. Va acá y no en un page.tsx con
      // redirect() porque en desarrollo ese redirect hacía saltar un error de hooks del
      // router de Next al cargar la dirección vieja.
      { source: '/director/marketing-ia', destination: '/director/marketing-ia/crear-anuncio', permanent: false },
      { source: '/asesor/marketing-ia', destination: '/asesor/marketing-ia/crear-anuncio', permanent: false },
      { source: '/asesor/tasaciones', destination: '/asesor/acm', permanent: true },
    ];
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
              // Los dos ultimos son los proveedores de baldosas del mapa del Buscador IA.
              // Sin ellos el navegador bloquea CADA imagen del fondo y el mapa se ve gris,
              // aunque la capa este bien montada y las peticiones sean validas.
              "img-src 'self' blob: data: https://*.supabase.co https://*.tokkobroker.com https://*.googleusercontent.com https://*.mailerlite.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://api.maptiler.com; " +
              "font-src 'self' data: https://fonts.gstatic.com https://assets.mailerlite.com; " +
              // Audios y videos del chat de WhatsApp (viven en Storage). Sin esta línea caen en
              // default-src 'self' y el navegador bloquea el reproductor: "Error" en cada audio.
              // blob: es la vista previa del archivo que el asesor está mandando.
              "media-src 'self' blob: https://*.supabase.co; " +
              // api.maptiler.com esta aca ademas de en img-src porque el mapa le pregunta
              // por el estado HTTP con fetch (a fetch lo gobierna connect-src): con clave
              // invalida MapTiler devuelve un 403 con una imagen valida adentro, y mirando
              // solo la imagen es imposible darse cuenta de que la clave no sirve.
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://api.mailerlite.com https://*.mailerlite.com https://api.maptiler.com; " +
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
