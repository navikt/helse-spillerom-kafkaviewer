import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@navikt/next-logger'

import { kafkaConsumer } from '@/utils/kafkaConsumer'

export async function GET(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now()

    try {
        const { searchParams } = new URL(request.url)
        const topic = searchParams.get('topic') || 'speilvendt.spillerom-behandlinger'
        const maxMessages = parseInt(searchParams.get('maxMessages') || '100')

        // Hent meldinger fra singleton-instansen
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
