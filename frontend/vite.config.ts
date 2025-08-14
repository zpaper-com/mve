import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { UserConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'
  const isProd = mode === 'production'

  const config: UserConfig = {
    plugins: [
      react({
        // Enable Fast Refresh for development
        fastRefresh: isDev,
        // JSX runtime optimization
        jsxRuntime: 'automatic',
      }),
    ],
    
    // Resolve configuration
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@services': resolve(__dirname, 'src/services'),
        '@hooks': resolve(__dirname, 'src/hooks'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@types': resolve(__dirname, 'src/types'),
        '@store': resolve(__dirname, 'src/store'),
        '@theme': resolve(__dirname, 'src/theme'),
        '@config': resolve(__dirname, 'src/config'),
      },
    },
    
    // Development server configuration
    server: {
      port: 50004,
      host: true, // Needed for Docker
      cors: true,
      open: isDev,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'mvepdf.sparks.zpaper.com',
        '.zpaper.com',
        '.sparks.zpaper.com'
      ],
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    
    // Preview server configuration
    preview: {
      port: 50004,
      host: true,
      cors: true,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'mvepdf.sparks.zpaper.com',
        '.zpaper.com',
        '.sparks.zpaper.com'
      ],
    },
    
    // Dependency optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled',
        'pdfjs-dist',
        'zustand',
        '@tanstack/react-query',
        'react-hook-form',
        'zod',
        'axios',
      ],
      exclude: ['@auth0/auth0-react'],
    },
    
    // Build configuration
    build: {
      target: 'es2018',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isProd ? false : 'inline',
      minify: isProd ? 'esbuild' : false,
      
      // Rollup options
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunks for better caching
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
            query: ['@tanstack/react-query'],
            pdf: ['pdfjs-dist'],
            auth: ['@auth0/auth0-react'],
          },
          // Asset naming for better caching
          chunkFileNames: isProd
            ? 'assets/js/[name].[hash].js'
            : 'assets/js/[name].js',
          entryFileNames: isProd
            ? 'assets/js/[name].[hash].js'
            : 'assets/js/[name].js',
          assetFileNames: isProd
            ? 'assets/[ext]/[name].[hash].[ext]'
            : 'assets/[ext]/[name].[ext]',
        },
      },
      
      // Chunk size warnings
      chunkSizeWarningLimit: 1000,
      
      // CSS code splitting
      cssCodeSplit: true,
      
      // Compression and optimization
      reportCompressedSize: isProd,
      emptyOutDir: true,
    },
    
    // CSS configuration
    css: {
      devSourcemap: isDev,
      modules: {
        localsConvention: 'camelCase',
      },
    },
    
    // Environment variables
    define: {
      // This ensures that PDF.js can find its worker
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    
    // Asset handling
    assetsInclude: ['**/*.pdf', '**/*.woff', '**/*.woff2'],
    
    // TypeScript configuration
    esbuild: {
      target: 'es2018',
      jsx: 'automatic',
      jsxDev: isDev,
    },
  }

  return config
})
