/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Improve production output
  output: 'standalone',
  // Enable image optimization
  images: {
    domains: [],
  },
  // Configure API routes
  api: {
    bodyParser: true,
    responseLimit: '8mb',
  }
}

module.exports = nextConfig 
