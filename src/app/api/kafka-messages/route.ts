import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@navikt/next-logger'

import { kafkaConsumer, KafkaMessage } from '@/utils/kafkaConsumer'

// Mock data for lokal utvikling
const mockMessages: KafkaMessage[] = [
    {
        key: 'd20d7e1544856b7491565cda46465c2ce98faf4683c89ad6d8a62d36a1828249',
        value: '{"id":"a020b592-fcc1-4c79-9e1b-2c7514c576e0","spilleromPersonId":"f53b7","fnr":"67838400539","opprettet":"2025-09-16T10:14:14.232091+02:00","opprettetAvNavIdent":"Z990676","opprettetAvNavn":"F_Z990676 E_Z990676","fom":"2025-07-07","tom":"2025-07-24","status":"UNDER_BEHANDLING","beslutterNavIdent":null,"skjæringstidspunkt":"2025-07-07","yrkesaktiviteter":[],"sykepengegrunnlag":null}',
        headers: {
            'outbox-id': '3',
            'outbox-opprettet': '2025-09-16T08:14:14.287369Z',
        },
        partition: 2,
        offset: '0',
        timestamp: '1758010465061',
        topic: 'speilvendt.spillerom-behandlinger',
    },
]

function isLocalDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now()

    try {
        const { searchParams } = new URL(request.url)
        const topic = searchParams.get('topic') || 'speilvendt.spillerom-behandlinger'
        const maxMessages = parseInt(searchParams.get('maxMessages') || '100')

        // Bruk mock data ved lokal utvikling
        if (isLocalDevelopment()) {
            logger.info('Bruker mock data for lokal utvikling')

            const endTime = Date.now()

            return NextResponse.json({
                topic,
                messageCount: mockMessages.length,
                messages: mockMessages.slice(0, maxMessages),
                consumerStatus: {
                    isRunning: true,
                    lastUpdated: new Date().toISOString(),
                    totalMessages: mockMessages.length,
                    availableTopics: ['speilvendt.spillerom-behandlinger'],
                },
                metadata: {
                    requestDuration: endTime - startTime,
                    timestamp: new Date().toISOString(),
                },
            })
        }

        // Hent meldinger fra singleton-instansen (produksjon)
        const messages = kafkaConsumer.getMessages(topic, maxMessages)
        const status = kafkaConsumer.getStatus()

        // Hent metadata hvis forespurt
        let metadata = null
        if (searchParams.get('includeMetadata') === 'true') {
            metadata = await kafkaConsumer.getTopicMetadata(topic)
        }

        const endTime = Date.now()

        return NextResponse.json({
            topic,
            messageCount: messages.length,
            messages,
            consumerStatus: {
                isRunning: status.isRunning,
                lastUpdated: status.lastUpdated[topic] || null,
                totalMessages: status.messageCount[topic] || 0,
                availableTopics: kafkaConsumer.getTopics(),
            },
            metadata: metadata
                ? {
                      ...metadata,
                      requestDuration: endTime - startTime,
                      consumerGroup: kafkaConsumer.groupId,
                      timestamp: new Date().toISOString(),
                  }
                : {
                      requestDuration: endTime - startTime,
                      timestamp: new Date().toISOString(),
                  },
        })
    } catch (error) {
        logger.error('Feil ved henting av Kafka meldinger:', error)

        return NextResponse.json(
            {
                error: 'Feil ved henting av Kafka meldinger',
                details: error instanceof Error ? error.message : 'Ukjent feil',
                metadata: {
                    requestDuration: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                },
            },
            { status: 500 },
        )
    }
}
