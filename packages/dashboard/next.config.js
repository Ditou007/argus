/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared pure formatter ships as TypeScript source; let Next transpile it.
  transpilePackages: ["@argus/render"],
};

module.exports = nextConfig;
