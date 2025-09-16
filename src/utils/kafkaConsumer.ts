import { Kafka, Consumer, EachMessagePayload } from 'kafkajs'

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
        if (this.consumer) {
            return
        }

        this.consumer = this.kafka.consumer({ groupId: this.groupId })
        await this.consumer.connect()
    }

    async disconnect(): Promise<void> {
        if (this.consumer) {
            await this.consumer.disconnect()
            this.consumer = null
        }
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
        if (!this.consumer) {
            await this.connect()
        }

        const messages: KafkaMessage[] = []
        let messageCount = 0
        let hasError = false

        try {
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

            // Start fra slutten for å få nyeste meldinger
            await this.consumer!.subscribe({ topic, fromBeginning: true })

            // Sett offset til slutten først, deretter les bakover for å få nyeste meldinger
            const assignment = topicMetadata.partitions.map((p) => ({
                topic,
                partition: p.partitionId,
            }))

            // Få offsets for alle partisjoner
            const admin2 = this.kafka.admin()
            await admin2.connect()

            try {
                const offsets = await admin2.fetchTopicOffsets(topic)

                // Start consumer og sett offset for hver partisjon
                for (const a of assignment) {
                    const partitionOffset = offsets.find((o) => o.partition === a.partition)
                    // Start fra max(high - maxMessages, low) for å få siste N meldinger
                    const high = parseInt(partitionOffset?.high || '0')
                    const low = parseInt(partitionOffset?.low || '0')
                    const startOffset = Math.max(high - Math.ceil(maxMessages / assignment.length), low)

                    await this.consumer!.seek({
                        topic: a.topic,
                        partition: a.partition,
                        offset: startOffset.toString(),
                    })
                }
            } finally {
                await admin2.disconnect()
            }

            const run = async (): Promise<void> => {
                await this.consumer!.run({
                    eachMessage: async ({ partition, message }: EachMessagePayload) => {
                        if (messageCount >= maxMessages) {
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
                            await this.consumer!.stop()
                        }
                    },
                })
            }

            // Start reading messages
            const runPromise = run().catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Feil ved lesing av Kafka meldinger:', error)
                hasError = true
            })

            // Wait for messages to be collected or timeout
            await Promise.race([
                runPromise,
                new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        // eslint-disable-next-line no-console
                        console.log(`Timeout nådd. Hentet ${messages.length} meldinger`)
                        resolve()
                    }, 15000) // 15 sekunder timeout

                    const checkMessages = () => {
                        if (hasError || messageCount >= maxMessages) {
                            clearTimeout(timeout)
                            resolve()
                        } else {
                            setTimeout(checkMessages, 100)
                        }
                    }

                    checkMessages()
                }),
            ])

            if (hasError) {
                throw new Error('Feil oppstod under lesing av meldinger')
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Feil i readMessagesFromTopic:', error)
            throw error
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
