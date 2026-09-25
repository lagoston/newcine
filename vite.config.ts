import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['assets/*.{png,svg,ico}'],
      manifest: {
        name: 'CineOracle',
        short_name: 'CineOracle',
        description: 'Your personal movie companion. Discover, rate, and build your ultimate movie collection.',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/assets/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/assets/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Library',
            url: '/library',
            description: 'View your movie library'
          },
          {
            name: 'Oracle',
            url: '/oracle',
            description: 'Get movie predictions'
          }
        ]
      },
      workbox: {
        // Imagens .webp (cartas dos oráculos, molduras, banners — 148 arquivos,
        // ~4 MB) saíram do pré-cache: antes eram TODAS baixadas no primeiro
        // acesso, mesmo as que o usuário nunca veria. Agora entram no cache
        // só quando aparecem na tela (regra "app-images" abaixo). O chunk
        // do xlsx (~320 KB, usado só na importação do IMDb) também fica de
        // fora e é baixado apenas se a importação for aberta.
        globPatterns: ['**/*.{js,css,html,ico,png,woff2}'],
        globIgnores: ['**/xlsx-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.webp'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 dias
              }
            }
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 20 // 20 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/functions\/v1\/tmdb-proxy.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
    target: 'esnext',
    minify: 'terser',
    cssMinify: true,
    reportCompressedSize: false,
    assetsDir: 'assets',
    copyPublicDir: true,
  },
  server: {
    headers: {
      'Cache-Control': 'public, max-age=31536000',
    },
    historyApiFallback: true,
  },
  preview: {
    historyApiFallback: true,
  },
  publicDir: 'public',
});