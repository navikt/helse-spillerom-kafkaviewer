import { NextResponse } from 'next/server'
import { logger } from '@navikt/next-logger'

import { kafkaConsumer } from '@/utils/kafkaConsumer'

export async function GET(): Promise<NextResponse> {
    try {
        const status = kafkaConsumer.getStatus()
        const topics = kafkaConsumer.getTopics()

        return NextResponse.json({
            status: 'ok',
            consumer: {
                isRunning: status.isRunning,
                groupId: kafkaConsumer.groupId,
                availableTopics: topics,
                lastUpdated: status.lastUpdated,
                messageCount: status.messageCount,
                totalMessages: Object.values(status.messageCount).reduce((sum, count) => sum + count, 0),
            },
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        logger.error('Feil ved henting av Kafka status:', error)

        return NextResponse.json(
            {
                status: 'error',
                error: 'Feil ved henting av Kafka status',
                details: error instanceof Error ? error.message : 'Ukjent feil',
                timestamp: new Date().toISOString(),
            },
            { status: 500 },
        )
    }
}
