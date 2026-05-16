/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Type-checking still runs and gates the build; ESLint is not configured.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['microsoft-cognitiveservices-speech-sdk'],
  },
};

module.exports = nextConfig;
