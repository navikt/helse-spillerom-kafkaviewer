import { Kafka, Consumer } from 'kafkajs'

export interface KafkaMessage {
    key: string | null
    value: string | null
    headers: Record<string, string | Buffer | undefined>
    partition: number
    offset: string
    timestamp: string
}

export interface TopicMetadata {
    partitions: PartitionMetadata[]
    totalMessages: number
}

export interface PartitionMetadata {
    partition: number
    highWatermark: string
    lowWatermark: string
    messageCount: number
}

export class KafkaConsumerService {
    private kafka: Kafka
    private consumer: Consumer | null = null
    public readonly groupId: string

    constructor() {
        // Lag en unik consumer group for hver request for å unngå offset-konflikter
        this.groupId = `spillerom-kafkaviewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        this.kafka = new Kafka({
            clientId: 'spillerom-kafkaviewer',
            brokers: process.env.KAFKA_BROKERS!.split(','),
            ssl: {
                rejectUnauthorized: true,
                ca: [process.env.KAFKA_CA!],
                key: process.env.KAFKA_PRIVATE_KEY!,
                cert: process.env.KAFKA_CERTIFICATE!,
            },
            // Legg til retry og timeout konfigurasjon
            retry: {
                initialRetryTime: 100,
                retries: 8,
            },
            requestTimeout: 30000,
            connectionTimeout: 3000,
        })
    }

    async connect(): Promise<void> {
        // Denne metoden brukes ikke lenger - consumer opprettes per request
    }

    async disconnect(): Promise<void> {
        // Denne metoden brukes ikke lenger - consumer opprettes per request
    }

    async getTopicMetadata(topic: string): Promise<TopicMetadata> {
        const admin = this.kafka.admin()
        await admin.connect()

        try {
            const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
            const topicMetadata = metadata.topics[0]

            if (!topicMetadata) {
                throw new Error(`Topic '${topic}' ikke funnet`)
            }

            const partitions: PartitionMetadata[] = []
            let totalMessages = 0

            // Hent offsetinformasjon for alle partisjoner
            for (const partition of topicMetadata.partitions) {
                const partitionId = partition.partitionId

                // Hent high og low watermarks
                const offsets = await admin.fetchTopicOffsets(topic)
                const partitionOffset = offsets.find((o) => o.partition === partitionId)

                if (partitionOffset) {
                    const messageCount = parseInt(partitionOffset.high) - parseInt(partitionOffset.low)
                    totalMessages += messageCount

                    partitions.push({
                        partition: partitionId,
                        highWatermark: partitionOffset.high,
                        lowWatermark: partitionOffset.low,
                        messageCount,
                    })
                }
            }

            return {
                partitions,
                totalMessages,
            }
        } finally {
            await admin.disconnect()
        }
    }

    async readMessagesFromTopic(topic: string, maxMessages: number = 100): Promise<KafkaMessage[]> {
        // Opprett ny consumer for hver request for å unngå tilstandsproblemer
        const consumer = this.kafka.consumer({ groupId: this.groupId })

        const messages: KafkaMessage[] = []
        let messageCount = 0

        try {
            // Koble til consumer
            await consumer.connect()

            // Hent metadata for å sjekke topic og partisjoner
            const admin = this.kafka.admin()
            await admin.connect()

            let topicMetadata
            try {
                const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
                topicMetadata = metadata.topics[0]

                if (!topicMetadata) {
                    throw new Error(`Topic '${topic}' ikke funnet`)
                }

                // eslint-disable-next-line no-console
                console.log(`Topic metadata for ${topic}:`, JSON.stringify(topicMetadata, null, 2))
            } finally {
                await admin.disconnect()
            }

            // Subscribe til topic
            await consumer.subscribe({ topic, fromBeginning: true })

            // Samle meldinger med timeout
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    // eslint-disable-next-line no-console
                    console.log(`Timeout nådd. Hentet ${messages.length} meldinger`)
                    resolve()
                }, 10000) // 10 sekunder timeout

                consumer
                    .run({
                        partitionsConsumedConcurrently: Math.min(topicMetadata.partitions.length, 5),
                        eachMessage: async ({ partition, message }) => {
                            if (messageCount >= maxMessages) {
                                clearTimeout(timeout)
                                resolve()
                                return
                            }

                            const kafkaMessage: KafkaMessage = {
                                key: message.key?.toString() || null,
                                value: message.value?.toString() || null,
                                headers: this.parseHeaders(message.headers),
                                partition,
                                offset: message.offset,
                                timestamp: message.timestamp,
                            }

                            messages.push(kafkaMessage)
                            messageCount++

                            // eslint-disable-next-line no-console
                            console.log(
                                `Lastet melding ${messageCount}/${maxMessages} fra partition ${partition}, offset ${message.offset}`,
                            )

                            if (messageCount >= maxMessages) {
                                clearTimeout(timeout)
                                resolve()
                            }
                        },
                    })
                    .catch((error) => {
                        // eslint-disable-next-line no-console
                        console.error('Feil ved lesing av Kafka meldinger:', error)
                        clearTimeout(timeout)
                        reject(error)
                    })
            })
        } finally {
            // Koble fra consumer
            try {
                await consumer.disconnect()
            } catch (disconnectError) {
                // eslint-disable-next-line no-console
                console.log('Feil ved frakobling av consumer:', disconnectError)
            }
        }

        // Sorter meldinger etter timestamp (nyeste først)
        messages.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))

        return messages.slice(0, maxMessages)
    }

    private parseHeaders(headers: Record<string, unknown> | undefined): Record<string, string | Buffer | undefined> {
        const parsedHeaders: Record<string, string | Buffer | undefined> = {}

        if (!headers) {
            return parsedHeaders
        }

        for (const [key, value] of Object.entries(headers)) {
            if (value) {
                // Prøv å parse som string, fallback til Buffer
                try {
                    if (Buffer.isBuffer(value)) {
                        parsedHeaders[key] = value.toString()
                    } else if (typeof value === 'string') {
                        parsedHeaders[key] = value
                    } else if (Array.isArray(value)) {
                        parsedHeaders[key] = value.map((v) => (Buffer.isBuffer(v) ? v.toString() : v)).join(', ')
                    } else {
                        parsedHeaders[key] = String(value)
                    }
                } catch {
                    parsedHeaders[key] = String(value)
                }
            } else {
                parsedHeaders[key] = undefined
            }
        }

        return parsedHeaders
    }
}
