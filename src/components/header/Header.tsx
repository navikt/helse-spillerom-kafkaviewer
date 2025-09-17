'use client'

import React, { ReactElement, useEffect, useState } from 'react'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { InternalHeader, Spacer } from '@navikt/ds-react'
import { InternalHeaderTitle, InternalHeaderButton } from '@navikt/ds-react/InternalHeader'
import { SunIcon, MoonIcon } from '@navikt/aksel-icons'
import { useTheme } from 'next-themes'

export function Header(): ReactElement {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const isDark = theme === 'dark'
    const pathname = usePathname()

    useEffect(() => {
        setMounted(true)
    }, [])

    // Prevent hydration mismatch by not rendering theme-dependent content until mounted
    const renderThemeButton = () => {
        if (!mounted) {
            // Render a placeholder with consistent attributes during SSR
            return (
                <InternalHeaderButton as="button" onClick={() => {}} aria-label="Bytt tema" title="Bytt tema">
                    <MoonIcon aria-hidden fontSize="1.5rem" />
                </InternalHeaderButton>
            )
        }

        return (
            <InternalHeaderButton
                as="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label={isDark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}
                title={isDark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}
            >
                {isDark ? <SunIcon aria-hidden fontSize="1.5rem" /> : <MoonIcon aria-hidden fontSize="1.5rem" />}
            </InternalHeaderButton>
        )
    }

    return (
        <InternalHeader className="h-14">
            <InternalHeaderTitle
                as={NextLink}
                href="/"
                className={pathname === '/' ? 'bg-ax-bg-accent-moderate-pressed' : ''}
            >
                Spillerom Kafka Viewer
            </InternalHeaderTitle>
            <InternalHeaderButton
                as={NextLink}
                href="/kafkastatus"
                className={pathname === '/kafkastatus' ? 'bg-ax-bg-accent-moderate-pressed' : ''}
            >
                Consumer Status
            </InternalHeaderButton>
            <Spacer />
            {renderThemeButton()}
        </InternalHeader>
    )
}
