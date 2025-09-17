import { useQuery } from '@tanstack/react-query'

import { KafkaMessage } from '@/utils/kafkaConsumer'

export interface KafkaResponse {
    topic: string
    messageCount: number
    messages: KafkaMessage[]
    consumerStatus: {
        isRunning: boolean
        lastUpdated: string | null
        totalMessages: number
        availableTopics: string[]
    }
    metadata: {
        requestDuration: number
        timestamp: string
        consumerGroup?: string
        partitions?: Array<{
            partition: number
            highWatermark: string
            lowWatermark: string
            messageCount: number
        }>
        totalMessages?: number
    }
}

export function useKafkaMessages(topic: string, maxMessages: number = 10, includeMetadata: boolean = false) {
    return useQuery<KafkaResponse, Error>({
        queryKey: ['kafka-messages', topic, maxMessages, includeMetadata],
        queryFn: async () => {
            const params = new URLSearchParams({
                topic,
                maxMessages: maxMessages.toString(),
                ...(includeMetadata && { includeMetadata: 'true' }),
            })

            const response = await fetch(`/api/kafka-messages?${params}`)
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.details || errorData.error || 'Failed to fetch Kafka messages')
            }

            return response.json()
        },
        staleTime: 30 * 1000, // 30 sekunder
        refetchOnWindowFocus: true, // Refetch når vinduet får fokus
    })
}
