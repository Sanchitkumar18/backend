/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow <img> from the backend uploads host without next/image config.
  images: { unoptimized: true },
};

module.exports = nextConfig;
