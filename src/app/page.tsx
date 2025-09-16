'use client'

import { useState } from 'react'
import { Heading, Button, TextField, Table, BodyShort, Loader } from '@navikt/ds-react'

import { KafkaMessage } from '@/utils/kafkaConsumer'

interface KafkaResponse {
    topic: string
    messageCount: number
    messages: KafkaMessage[]
}

const Page = () => {
    const [messages, setMessages] = useState<KafkaMessage[]>([])
    const [loading, setLoading] = useState(false)
    const [topic, setTopic] = useState('spleiselaget.spillerom-behandlinger')
    const [maxMessages, setMaxMessages] = useState(10)

    const fetchMessages = async () => {
        setLoading(true)
        try {
            const response = await fetch(
                `/api/kafka-messages?topic=${encodeURIComponent(topic)}&maxMessages=${maxMessages}`,
            )
            const data: KafkaResponse = await response.json()
            setMessages(data.messages)
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Feil ved henting av meldinger:', error)
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
