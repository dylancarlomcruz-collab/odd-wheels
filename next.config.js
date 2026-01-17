/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // If you later decide to use next/image with remote sources,
    // add domains here. We intentionally avoid hotlinking.
    remotePatterns: []
  }
};

module.exports = nextConfig;
