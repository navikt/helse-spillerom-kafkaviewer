declare module 'next-themes' {
    import { ReactNode } from 'react'
    export interface ThemeProviderProps {
        children: ReactNode
        attribute?: string
        enableSystem?: boolean
        defaultTheme?: string
        disableTransitionOnChange?: boolean
    }
    export const ThemeProvider: (props: ThemeProviderProps) => JSX.Element
    export function useTheme(): { theme?: string; setTheme: (theme: string) => void }
}
