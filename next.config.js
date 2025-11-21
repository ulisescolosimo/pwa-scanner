/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['html5-qrcode'],
  },
}

module.exports = nextConfig

