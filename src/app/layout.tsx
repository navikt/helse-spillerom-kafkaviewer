import '@navikt/ds-tokens/darkside-css'
import '../styles/globals.css'
import type { Metadata } from 'next'
import React, { PropsWithChildren, ReactElement } from 'react'
import { Page } from '@navikt/ds-react'
import { logger } from '@navikt/next-logger'

import { Preload } from '@/app/preload'
import { Providers } from '@/app/providers'
// Initialiser Kafka consumer ved app-oppstart
import { kafkaConsumer } from '@/utils/kafkaConsumer'

export const metadata: Metadata = {
    title: 'Spillerom Kafka Viewer',
    icons: {
        icon: `/favicons/favicon-local.ico`,
    },
}

export default async function RootLayout({ children }: Readonly<PropsWithChildren>): Promise<ReactElement> {
    // Initialiser Kafka consumer kun i produksjon
    if (process.env.NODE_ENV !== 'development') {
        try {
            await kafkaConsumer.connect()
            logger.info('Kafka consumer initialisert ved app-oppstart')
        } catch (error) {
            logger.error('Feil ved initialisering av Kafka consumer:', error)
        }
    } else {
        logger.info('Lokal utvikling - hopper over Kafka consumer initialisering')
    }

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
