import '@navikt/ds-tokens/darkside-css'
import '../styles/globals.css'
import type { Metadata } from 'next'
import React, { PropsWithChildren, ReactElement } from 'react'
import { Page } from '@navikt/ds-react'

import { Preload } from '@/app/preload'
import { Providers } from '@/app/providers'

export const metadata: Metadata = {
    title: 'Spillerom kodeverk',
    icons: {
        icon: `/favicons/favicon-local.ico`,
    },
}

export default async function RootLayout({ children }: Readonly<PropsWithChildren>): Promise<ReactElement> {
    return (
        <html lang="nb" suppressHydrationWarning>
            <Preload />
            <body>
                <Providers>
                    <Page contentBlockPadding="none">{children}</Page>
                </Providers>
            </body>
        </html>
    )
}
