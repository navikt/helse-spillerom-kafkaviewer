'use client'

import { Alert, BodyShort } from '@navikt/ds-react'
import { useEffect, useState } from 'react'

import { MessageViewer } from '@/components/kafka/MessageViewer'
import { Sidemeny } from '@/components/kafka/Sidemeny'
import { useKafkaMessages } from '@/hooks/queries/useKafkaMessages'
import { KafkaMessage } from '@/utils/kafkaConsumer'

const Page = () => {
    const [activeMessage, setActiveMessage] = useState<KafkaMessage | undefined>()
    const [isSidemenyCollapsed, setIsSidemenyCollapsed] = useState(false)

    // Hent Kafka meldinger med React Query
    const { data: kafkaData, isLoading, error } = useKafkaMessages('speilvendt.spillerom-behandlinger', 20, true)

    // Sett første melding som aktiv når data lastes
    useEffect(() => {
        if (kafkaData?.messages && kafkaData.messages.length > 0 && !activeMessage) {
            setActiveMessage(kafkaData.messages[0])
        }
    }, [kafkaData, activeMessage])

    const handleMessageClick = (message: KafkaMessage) => {
        setActiveMessage(message)
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
                    {error && (
                        <Alert variant="error">
                            <BodyShort>Feil ved henting av Kafka meldinger: {error.message}</BodyShort>
                        </Alert>
                    )}

                    <MessageViewer message={activeMessage} isLoading={isLoading} />
                </div>
            </div>
        </div>
    )
}

export default Page
