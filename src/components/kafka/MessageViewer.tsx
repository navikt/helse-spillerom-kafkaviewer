'use client'

import { useState } from 'react'
import { Heading, Skeleton, Table, ReadMore, Switch } from '@navikt/ds-react'
import { useTheme } from 'next-themes'
import JsonView from 'react18-json-view'
import 'react18-json-view/src/style.css'
import 'react18-json-view/src/dark.css'

import { KafkaMessage } from '@/utils/kafkaConsumer'

interface MessageViewerProps {
    message?: KafkaMessage
    isLoading: boolean
}

export const MessageViewer = ({ message, isLoading }: MessageViewerProps) => {
    const [isSmartView, setIsSmartView] = useState(true)
    const { theme } = useTheme()

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-1/3" />
                <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    if (!message) {
        return (
            <div className="flex h-64 items-center justify-center">
                <p className="text-gray-500">Velg en melding fra sidemenyen</p>
            </div>
        )
    }

    const formatTimestamp = (timestamp: string): string => {
        try {
            return new Date(parseInt(timestamp)).toLocaleString('nb-NO')
        } catch {
            return 'Ukjent tid'
        }
    }

    const formatJsonValue = (value: string | null): string => {
        if (!value) return 'null'
        try {
            const parsed = JSON.parse(value)
            return JSON.stringify(parsed, null, 2)
        } catch {
            return value
        }
    }

    const formatHeaders = (headers: Record<string, string | Buffer | undefined>): string => {
        return JSON.stringify(headers, null, 2)
    }

    const renderSmartView = (value: string | null) => {
        if (!value) return <div className="text-gray-500 italic">null</div>

        try {
            const parsed = JSON.parse(value)
            return (
                <div className="bg-gray-50 dark:bg-gray-800 rounded p-4">
                    <JsonView
                        src={parsed}
                        theme={theme === 'dark' ? 'winter-is-coming' : 'default'}
                        enableClipboard={false}
                        collapsed={false}
                        style={{
                            fontSize: '14px',
                            fontFamily: 'monospace',
                        }}
                    />
                </div>
            )
        } catch {
            return <div className="text-gray-500 italic">Ikke gyldig JSON</div>
        }
    }

    const renderRawView = (value: string | null) => {
        return <pre className="bg-gray-100 max-w-full overflow-auto rounded p-4 text-xs">{formatJsonValue(value)}</pre>
    }

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <ReadMore header="Metadata">
                    <Table size="small">
                        <Table.Body>
                            <Table.Row>
                                <Table.DataCell>
                                    <strong>Topic</strong>
                                </Table.DataCell>
                                <Table.DataCell>{message.topic}</Table.DataCell>
                            </Table.Row>
                            <Table.Row>
                                <Table.DataCell>
                                    <strong>Partition</strong>
                                </Table.DataCell>
                                <Table.DataCell>{message.partition}</Table.DataCell>
                            </Table.Row>
                            <Table.Row>
                                <Table.DataCell>
                                    <strong>Offset</strong>
                                </Table.DataCell>
                                <Table.DataCell>{message.offset}</Table.DataCell>
                            </Table.Row>
                            <Table.Row>
                                <Table.DataCell>
                                    <strong>Tidsstempel</strong>
                                </Table.DataCell>
                                <Table.DataCell>{formatTimestamp(message.timestamp)}</Table.DataCell>
                            </Table.Row>
                            <Table.Row>
                                <Table.DataCell>
                                    <strong>Key</strong>
                                </Table.DataCell>
                                <Table.DataCell>{message.key}</Table.DataCell>
                            </Table.Row>
                        </Table.Body>
                    </Table>
                </ReadMore>

                <ReadMore header="Headers">
                    <pre className="bg-gray-100 max-w-full overflow-auto rounded p-4 text-xs">
                        {formatHeaders(message.headers)}
                    </pre>
                </ReadMore>

                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <Heading level="2" size="medium">
                            Value
                        </Heading>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={isSmartView}
                                onChange={(e) => setIsSmartView(e.target.checked)}
                                size="small"
                            >
                                Smart visning
                            </Switch>
                        </div>
                    </div>
                    {isSmartView ? renderSmartView(message.value) : renderRawView(message.value)}
                </div>
            </div>
        </div>
    )
}
