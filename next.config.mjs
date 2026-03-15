/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let x402 packages use real Node.js fetch instead of Next.js 14's patched version
  serverExternalPackages: ['@x402/core', '@x402/evm', '@x402/fetch'],
};

export default nextConfig;
