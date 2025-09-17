'use client'

import { Button, Skeleton } from '@navikt/ds-react'
import { ChevronLeftIcon, ChevronRightIcon } from '@navikt/aksel-icons'

import { KafkaMessage } from '@/utils/kafkaConsumer'

interface SidemenyProps {
    messages: KafkaMessage[]
    onMessageClick: (message: KafkaMessage) => void
    activeMessage?: KafkaMessage
    isCollapsed: boolean
    onToggleCollapse: () => void
    isLoading: boolean
}

const formatMessagePreview = (message: KafkaMessage): string => {
    try {
        const parsed = JSON.parse(message.value || '{}')
        // Prøv å finne et meningsfullt felt for preview
        if (parsed.fnr) return `FNR: ${parsed.fnr}`
        if (parsed.id) return `ID: ${parsed.id}`
        if (parsed.status) return `Status: ${parsed.status}`
        if (parsed.spilleromPersonId) return `Person: ${parsed.spilleromPersonId}`
        return `Offset: ${message.offset}`
    } catch {
        return `Offset: ${message.offset}`
    }
}

const formatTimestamp = (timestamp: string): string => {
    try {
        return new Date(parseInt(timestamp)).toLocaleString('nb-NO', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    } catch {
        return 'Ukjent tid'
    }
}

export const Sidemeny = ({
    messages,
    onMessageClick,
    activeMessage,
    isCollapsed,
    onToggleCollapse,
    isLoading,
}: SidemenyProps) => {
    return (
        <div
            className={`bg-gray-50 border-gray-200 sticky top-0 h-screen overflow-y-auto border-r transition-all duration-300 ${
                isCollapsed ? 'w-12' : 'w-80'
            }`}
        >
            <div className="border-gray-200 flex items-center justify-between border-b p-4">
                {!isCollapsed && <h2 className="text-gray-900 text-lg font-semibold">Kafka meldinger</h2>}
                <Button
                    variant="tertiary"
                    size="small"
                    onClick={onToggleCollapse}
                    className="ml-auto"
                    aria-label={isCollapsed ? 'Vis sidemeny' : 'Skjul sidemeny'}
                >
                    {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                </Button>
            </div>

            {!isCollapsed && (
                <nav className="space-y-1 p-4">
                    {isLoading ? (
                        // Skeleton loading
                        Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="bg-white rounded-md border p-3">
                                <Skeleton className="mb-2 h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        ))
                    ) : messages.length === 0 ? (
                        <div className="text-gray-500 py-8 text-center">Ingen meldinger funnet</div>
                    ) : (
                        messages.map((message) => {
                            const isActive =
                                activeMessage?.offset === message.offset &&
                                activeMessage?.partition === message.partition
                            const preview = formatMessagePreview(message)
                            const timestamp = formatTimestamp(message.timestamp)

                            return (
                                <Button
                                    key={`${message.partition}-${message.offset}`}
                                    variant={isActive ? 'primary' : 'tertiary'}
                                    size="small"
                                    className={`h-auto w-full justify-start px-3 py-3 text-left ${
                                        isActive ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100 text-gray-900'
                                    }`}
                                    onClick={() => onMessageClick(message)}
                                >
                                    <div className="flex w-full flex-col items-start">
                                        <span className="w-full truncate text-sm leading-tight font-medium">
                                            {preview}
                                        </span>
                                        <span
                                            className={`mt-1 text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}
                                        >
                                            {timestamp}
                                        </span>
                                    </div>
                                </Button>
                            )
                        })
                    )}
                </nav>
            )}
        </div>
    )
}
