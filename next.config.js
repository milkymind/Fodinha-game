/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Improve production output
  output: 'standalone',
  // Enable image optimization
  images: {
    domains: [],
  },
  // Error handling
  onError(err) {
    console.error('Next.js build error:', err);
  },
}

module.exports = nextConfig 