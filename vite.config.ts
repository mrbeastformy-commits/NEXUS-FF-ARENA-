import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.webmanifest',
        includeAssets: ['admin-manifest.webmanifest'],
        manifest: {
          id: '/',
          name: 'NEXUS FF ARENA',
          short_name: 'NEXUS ARENA',
          description: 'Competitive Free Fire esports tournament arena, coin wallet, social hub, and live leaderboards.',
          theme_color: '#06070A',
          background_color: '#06070A',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['video/**', 'audio/**', 'sw-offline.js'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          importScripts: ['/sw-offline.js'],
          navigateFallbackDenylist: [/^\/admin/, /^\/api/, /^\/video/, /^\/audio/],
          runtimeCaching: [
            // Never cache sensitive endpoints (wallet, room credentials, admin actions)
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            // Never cache live Firestore documents (wallet balances, room creds, payment screenshots)
            {
              urlPattern: /^https:\/\/(firestore|firebase|identitytoolkit|securetoken|firebaseinstallations)\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'admin-manifest-cleanup',
        enforce: 'post',
        transformIndexHtml: {
          order: 'post',
          handler(html, ctx) {
            const target = ctx.filename || ctx.path || '';
            if (target.endsWith('admin.html') || target.startsWith('/admin')) {
              return html.replace(/<link rel="manifest" href="\/manifest\.webmanifest"\s*\/?>/g, '');
            }
            return html;
          },
        },
        closeBundle() {
          const distAdmin = path.resolve(__dirname, 'dist/admin.html');
          if (fs.existsSync(distAdmin)) {
            const raw = fs.readFileSync(distAdmin, 'utf-8');
            const cleaned = raw.replace(/<link rel="manifest" href="\/manifest\.webmanifest"\s*\/?>/g, '');
            if (cleaned !== raw) {
              fs.writeFileSync(distAdmin, cleaned, 'utf-8');
            }
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
