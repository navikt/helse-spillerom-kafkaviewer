'use client'

import { useState, useEffect } from 'react'
import { Heading, Button, TextField, Alert, BodyShort } from '@navikt/ds-react'

import { KafkaMessage } from '@/utils/kafkaConsumer'
import { useKafkaMessages } from '@/hooks/queries/useKafkaMessages'
import { Sidemeny } from '@/components/kafka/Sidemeny'
import { MessageViewer } from '@/components/kafka/MessageViewer'
import { ConsumerStatus } from '@/components/kafka/ConsumerStatus'

const Page = () => {
    const [topic, setTopic] = useState('speilvendt.spillerom-behandlinger')
    const [maxMessages, setMaxMessages] = useState(10)
    const [activeMessage, setActiveMessage] = useState<KafkaMessage | undefined>()
    const [isSidemenyCollapsed, setIsSidemenyCollapsed] = useState(false)

    // Hent Kafka meldinger med React Query
    const { data: kafkaData, isLoading, error, refetch } = useKafkaMessages(topic, maxMessages, true)

    // Sett første melding som aktiv når data lastes
    useEffect(() => {
        if (kafkaData?.messages && kafkaData.messages.length > 0 && !activeMessage) {
            setActiveMessage(kafkaData.messages[0])
        }
    }, [kafkaData, activeMessage])

    const handleMessageClick = (message: KafkaMessage) => {
        setActiveMessage(message)
    }

    const handleRefresh = () => {
        refetch()
    }

    return (
        <div className="flex h-screen">
            {/* Sidemeny */}
            <Sidemeny
                messages={kafkaData?.messages || []}
                onMessageClick={handleMessageClick}
                activeMessage={activeMessage}
                isCollapsed={isSidemenyCollapsed}
                onToggleCollapse={() => setIsSidemenyCollapsed(!isSidemenyCollapsed)}
                isLoading={isLoading}
            />

            {/* Hovedinnhold */}
            <div className="flex-1 overflow-y-auto">
                <div className="space-y-6 p-6">
                    <div className="flex items-center justify-between">
                        <Heading size="xlarge">Spillerom Kafka Viewer</Heading>
                        <div className="flex items-center gap-4">
                            <TextField
                                label="Topic"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                className="w-60"
                            />
                            <TextField
                                label="Antall meldinger"
                                type="number"
                                value={maxMessages.toString()}
                                onChange={(e) => setMaxMessages(parseInt(e.target.value) || 10)}
                                className="w-32"
                            />
                            <Button onClick={handleRefresh} loading={isLoading}>
                                Oppdater
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="error">
                            <BodyShort>Feil ved henting av Kafka meldinger: {error.message}</BodyShort>
                        </Alert>
                    )}

                    <ConsumerStatus />

                    <MessageViewer message={activeMessage} isLoading={isLoading} />
                </div>
            </div>
        </div>
    )
}

export default Page
