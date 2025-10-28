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
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
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