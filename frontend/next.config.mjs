/**
 * Cabeçalhos de segurança do app.
 *
 * O CSP não mora aqui: ele leva um nonce novo a cada requisição, e só o
 * `proxy.js` tem a requisição na mão. Ficam os cabeçalhos fixos.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Nada disto é usado pelo app; negar de saída evita que um script
          // injetado peça em nome dele.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
