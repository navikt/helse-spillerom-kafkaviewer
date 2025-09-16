import { NextRequest, NextResponse } from 'next/server'

import { KafkaConsumerService } from '@/utils/kafkaConsumer'

export async function GET(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now()

    try {
        const { searchParams } = new URL(request.url)
        const topic = searchParams.get('topic') || 'speilvendt.spillerom-behandlinger'
        const maxMessages = parseInt(searchParams.get('maxMessages') || '100')

        const consumerService = new KafkaConsumerService()

        try {
            // Hent metadata først for debugging
            const metadata = await consumerService.getTopicMetadata(topic)
            const metadataTime = Date.now()

            // Deretter hent meldinger
            const messages = await consumerService.readMessagesFromTopic(topic, maxMessages)
            const endTime = Date.now()

            return NextResponse.json({
                topic,
                messageCount: messages.length,
                messages,
                metadata: {
                    ...metadata,
                    requestDuration: {
                        total: endTime - startTime,
                        metadataFetch: metadataTime - startTime,
                        messageFetch: endTime - metadataTime,
                    },
                    consumerGroup: consumerService.groupId,
                    timestamp: new Date().toISOString(),
                },
            })
        } finally {
            await consumerService.disconnect()
        }
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Feil ved henting av Kafka meldinger:', error)

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
