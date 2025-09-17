'use client'

import { Heading, Alert, BodyShort, Table } from '@navikt/ds-react'

import { useKafkaStatus } from '@/hooks/queries/useKafkaStatus'

const KafkaStatusPage = () => {
    const { data: status, isLoading, error } = useKafkaStatus()

    if (isLoading) {
        return (
            <div className="space-y-6 p-6">
                <Heading size="xlarge">Kafka Consumer Status</Heading>
                <div className="space-y-4">
                    <div className="bg-gray-200 h-4 w-1/3 animate-pulse rounded"></div>
                    <div className="bg-gray-200 h-32 w-full animate-pulse rounded"></div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-6 p-6">
                <Heading size="xlarge">Kafka Consumer Status</Heading>
                <Alert variant="error">
                    <BodyShort>Feil ved henting av consumer status: {error.message}</BodyShort>
                </Alert>
            </div>
        )
    }

    if (!status) {
        return (
            <div className="space-y-6 p-6">
                <Heading size="xlarge">Kafka Consumer Status</Heading>
                <Alert variant="warning">
                    <BodyShort>Ingen consumer status tilgjengelig</BodyShort>
                </Alert>
            </div>
        )
    }

    const { consumer } = status

    return (
        <div className="space-y-6 p-6">
            <Heading size="xlarge">Kafka Consumer Status</Heading>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <div>
                        <Heading level="2" size="medium">
                            Generell status
                        </Heading>
                        <div className="space-y-2">
                            <BodyShort>
                                <strong>Status:</strong> {consumer.isRunning ? '🟢 Kjører' : '🔴 Stoppet'}
                            </BodyShort>
                            <BodyShort>
                                <strong>Consumer group:</strong> {consumer.groupId}
                            </BodyShort>
                            <BodyShort>
                                <strong>Total meldinger:</strong> {consumer.totalMessages}
                            </BodyShort>
                            <BodyShort>
                                <strong>Sist oppdatert:</strong> {new Date(status.timestamp).toLocaleString('nb-NO')}
                            </BodyShort>
                        </div>
                    </div>

                    <div>
                        <Heading level="2" size="medium">
                            Tilgjengelige topics
                        </Heading>
                        <div className="space-y-1">
                            {consumer.availableTopics.length > 0 ? (
                                consumer.availableTopics.map((topic) => (
                                    <BodyShort key={topic} className="text-sm">
                                        • {topic}
                                    </BodyShort>
                                ))
                            ) : (
                                <BodyShort className="text-gray-500">Ingen topics tilgjengelig</BodyShort>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    <Heading level="2" size="medium">
                        Meldinger per topic
                    </Heading>
                    {Object.keys(consumer.messageCount).length > 0 ? (
                        <Table size="small">
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Topic</Table.HeaderCell>
                                    <Table.HeaderCell>Antall meldinger</Table.HeaderCell>
                                    <Table.HeaderCell>Sist oppdatert</Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {Object.entries(consumer.messageCount).map(([topic, count]) => (
                                    <Table.Row key={topic}>
                                        <Table.DataCell>{topic}</Table.DataCell>
                                        <Table.DataCell>{count}</Table.DataCell>
                                        <Table.DataCell>
                                            {consumer.lastUpdated[topic]
                                                ? new Date(consumer.lastUpdated[topic]).toLocaleString('nb-NO')
                                                : 'Ikke oppdatert'}
                                        </Table.DataCell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    ) : (
                        <BodyShort className="text-gray-500">Ingen meldinger tilgjengelig</BodyShort>
                    )}
                </div>
            </div>
        </div>
    )
}

export default KafkaStatusPage
