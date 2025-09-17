import { useQuery } from '@tanstack/react-query'

export interface KafkaStatusResponse {
    status: string
    consumer: {
        isRunning: boolean
        groupId: string
        availableTopics: string[]
        lastUpdated: Record<string, string>
        messageCount: Record<string, number>
        totalMessages: number
    }
    timestamp: string
}

export function useKafkaStatus() {
    return useQuery<KafkaStatusResponse, Error>({
        queryKey: ['kafka-status'],
        queryFn: async () => {
            const response = await fetch('/api/kafka-status')
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.details || errorData.error || 'Failed to fetch Kafka status')
            }

            return response.json()
        },
        staleTime: 10 * 1000, // 10 sekunder
        refetchOnWindowFocus: true, // Refetch når vinduet får fokus
    })
}
