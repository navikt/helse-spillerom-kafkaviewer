'use client'

import { useState } from 'react'
import { Heading, Button, TextField, Table, BodyShort, Loader, Alert } from '@navikt/ds-react'

import { KafkaMessage, TopicMetadata } from '@/utils/kafkaConsumer'

interface KafkaResponse {
    topic: string
    messageCount: number
    messages: KafkaMessage[]
    metadata?: TopicMetadata & {
        requestDuration: {
            total: number
            metadataFetch: number
            messageFetch: number
        }
        consumerGroup: string
        timestamp: string
    }
}

const Page = () => {
    const [messages, setMessages] = useState<KafkaMessage[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [topic, setTopic] = useState('speilvendt.spillerom-behandlinger')
    const [maxMessages, setMaxMessages] = useState(10)
    const [metadata, setMetadata] = useState<KafkaResponse['metadata'] | null>(null)

    const fetchMessages = async () => {
        setLoading(true)
        setError(null)
        setMetadata(null)
        try {
            const response = await fetch(
                `/api/kafka-messages?topic=${encodeURIComponent(topic)}&maxMessages=${maxMessages}`,
            )

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.details || errorData.error || 'Ukjent feil')
            }

            const data: KafkaResponse = await response.json()
            setMessages(data.messages)
            setMetadata(data.metadata || null)
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Feil ved henting av meldinger:', error)
            setError(error instanceof Error ? error.message : 'Ukjent feil')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 p-6">
            <Heading size="xlarge">Spillerom kafka viewer</Heading>

            <div className="flex items-end gap-4">
                <TextField label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-80" />
                <TextField
                    label="Maks antall meldinger"
                    type="number"
                    value={maxMessages.toString()}
                    onChange={(e) => setMaxMessages(parseInt(e.target.value) || 10)}
                    className="w-40"
                />
                <Button onClick={fetchMessages} loading={loading}>
                    Hent meldinger
                </Button>
            </div>

            {loading && <Loader size="medium" />}

            {error && (
                <Alert variant="error">
                    <BodyShort>{error}</BodyShort>
                </Alert>
            )}

            {metadata && (
                <div className="space-y-4">
                    <Heading size="medium">Topic-informasjon</Heading>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="space-y-2">
                            <BodyShort>
                                <strong>Partisjoner:</strong> {metadata.partitions.length}
                            </BodyShort>
                            <BodyShort>
                                <strong>Total meldinger i topic:</strong> {metadata.totalMessages}
                            </BodyShort>
                            <BodyShort>
                                <strong>Consumer group:</strong> {metadata.consumerGroup}
                            </BodyShort>
                            <BodyShort>
                                <strong>Tidsstempel:</strong> {new Date(metadata.timestamp).toLocaleString('nb-NO')}
                            </BodyShort>
                        </div>
                        <div className="space-y-2">
                            <BodyShort>
                                <strong>Responstid:</strong>
                            </BodyShort>
                            <BodyShort>• Total: {metadata.requestDuration.total}ms</BodyShort>
                            <BodyShort>• Metadata: {metadata.requestDuration.metadataFetch}ms</BodyShort>
                            <BodyShort>• Meldinger: {metadata.requestDuration.messageFetch}ms</BodyShort>
                        </div>
                    </div>

                    <div>
                        <Heading size="small">Partisjonsinfo</Heading>
                        <Table size="small">
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Partisjon</Table.HeaderCell>
                                    <Table.HeaderCell>Lav offset</Table.HeaderCell>
                                    <Table.HeaderCell>Høy offset</Table.HeaderCell>
                                    <Table.HeaderCell>Meldinger</Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {metadata.partitions.map((partition) => (
                                    <Table.Row key={partition.partition}>
                                        <Table.DataCell>{partition.partition}</Table.DataCell>
                                        <Table.DataCell>{partition.lowWatermark}</Table.DataCell>
                                        <Table.DataCell>{partition.highWatermark}</Table.DataCell>
                                        <Table.DataCell>{partition.messageCount}</Table.DataCell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                </div>
            )}

            {messages.length > 0 && (
                <div className="space-y-4">
                    <BodyShort>Fant {messages.length} meldinger</BodyShort>
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Key</Table.HeaderCell>
                                <Table.HeaderCell>Value</Table.HeaderCell>
                                <Table.HeaderCell>Headers</Table.HeaderCell>
                                <Table.HeaderCell>Partition</Table.HeaderCell>
                                <Table.HeaderCell>Offset</Table.HeaderCell>
                                <Table.HeaderCell>Tidsstempel</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {messages.map((message, index) => (
                                <Table.Row key={index}>
                                    <Table.DataCell>
                                        <pre className="bg-gray-100 max-w-xs overflow-auto rounded p-2 text-xs">
                                            {message.key || 'null'}
                                        </pre>
                                    </Table.DataCell>
                                    <Table.DataCell>
                                        <pre className="bg-gray-100 max-w-md overflow-auto rounded p-2 text-xs">
                                            {message.value || 'null'}
                                        </pre>
                                    </Table.DataCell>
                                    <Table.DataCell>
                                        <pre className="bg-gray-100 max-w-xs overflow-auto rounded p-2 text-xs">
                                            {JSON.stringify(message.headers, null, 2)}
                                        </pre>
                                    </Table.DataCell>
                                    <Table.DataCell>{message.partition}</Table.DataCell>
                                    <Table.DataCell>{message.offset}</Table.DataCell>
                                    <Table.DataCell>
                                        {new Date(parseInt(message.timestamp)).toLocaleString('nb-NO')}
                                    </Table.DataCell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}
        </div>
    )
}

export default Page
