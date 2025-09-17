'use client'

import { Heading, Skeleton, Table, ReadMore } from '@navikt/ds-react'

import { KafkaMessage } from '@/utils/kafkaConsumer'

interface MessageViewerProps {
    message?: KafkaMessage
    isLoading: boolean
}

export const MessageViewer = ({ message, isLoading }: MessageViewerProps) => {
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
                                <Table.DataCell>
                                    <pre className="bg-gray-100 max-w-md overflow-auto rounded p-2 text-xs">
                                        {message.key || 'null'}
                                    </pre>
                                </Table.DataCell>
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
                    <Heading level="2" size="medium">
                        Value
                    </Heading>
                    <pre className="bg-gray-100 max-w-full overflow-auto rounded p-4 text-xs">
                        {formatJsonValue(message.value)}
                    </pre>
                </div>
            </div>
        </div>
    )
}
