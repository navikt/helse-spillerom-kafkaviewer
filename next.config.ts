import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX,
    serverExternalPackages: ['@navikt/next-logger'],
    experimental: {
        optimizePackageImports: ['@navikt/ds-react', '@navikt/aksel-icons'],
    },
    eslint: {
        dirs: ['src'],
        ignoreDuringBuilds: true,
    },
}

export default nextConfig
