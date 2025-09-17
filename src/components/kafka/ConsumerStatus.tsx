'use client'

import { Alert, BodyShort, Heading } from '@navikt/ds-react'

import { useKafkaStatus } from '@/hooks/queries/useKafkaStatus'

export const ConsumerStatus = () => {
    const { data: status, isLoading, error } = useKafkaStatus()

    if (isLoading) {
        return (
            <Alert variant="info">
                <BodyShort>Laster consumer status...</BodyShort>
            </Alert>
        )
    }

    if (error) {
        return (
            <Alert variant="error">
                <BodyShort>Feil ved henting av consumer status: {error.message}</BodyShort>
            </Alert>
        )
    }

    if (!status) {
        return (
            <Alert variant="warning">
                <BodyShort>Ingen consumer status tilgjengelig</BodyShort>
            </Alert>
        )
    }

    const { consumer } = status

    return (
        <div className="space-y-4">
            <Heading level="2" size="medium">
                Consumer status
            </Heading>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                </div>
                <div className="space-y-2">
                    <BodyShort>
                        <strong>Tilgjengelige topics:</strong> {consumer.availableTopics.join(', ')}
                    </BodyShort>
                    {Object.keys(consumer.messageCount).length > 0 && (
                        <div>
                            <BodyShort className="font-medium">Meldinger per topic:</BodyShort>
                            {Object.entries(consumer.messageCount).map(([topic, count]) => (
                                <BodyShort key={topic} className="ml-4 text-sm">
                                    • {topic}: {count} meldinger
                                </BodyShort>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
