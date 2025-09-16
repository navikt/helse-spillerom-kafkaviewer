import { NextRequest, NextResponse } from 'next/server'

import { KafkaConsumerService } from '@/utils/kafkaConsumer'

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url)
        const topic = searchParams.get('topic') || 'speilvendt.spillerom-behandlinger'
        const maxMessages = parseInt(searchParams.get('maxMessages') || '100')

        const consumerService = new KafkaConsumerService()

        try {
            const messages = await consumerService.readMessagesFromTopic(topic, maxMessages)

            return NextResponse.json({
                topic,
                messageCount: messages.length,
                messages,
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
            },
            { status: 500 },
        )
    }
}
