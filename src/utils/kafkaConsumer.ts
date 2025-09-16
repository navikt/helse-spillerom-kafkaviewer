import { Kafka, Consumer, EachMessagePayload } from 'kafkajs'

export interface KafkaMessage {
    key: string | null
    value: string | null
    headers: Record<string, string | Buffer | undefined>
    partition: number
    offset: string
    timestamp: string
}

export class KafkaConsumerService {
    private kafka: Kafka
    private consumer: Consumer | null = null

    constructor() {
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

        this.consumer = this.kafka.consumer({ groupId: 'spillerom-kafkaviewer-group' })
        await this.consumer.connect()
    }

    async disconnect(): Promise<void> {
        if (this.consumer) {
            await this.consumer.disconnect()
            this.consumer = null
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
            // Først sjekk om topicet eksisterer
            const admin = this.kafka.admin()
            await admin.connect()

            try {
                const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
                // eslint-disable-next-line no-console
                console.log(`Topic metadata for ${topic}:`, JSON.stringify(metadata, null, 2))
            } catch (metadataError) {
                // eslint-disable-next-line no-console
                console.error(`Feil ved henting av topic metadata for ${topic}:`, metadataError)
                throw new Error(`Topic '${topic}' eksisterer ikke eller er ikke tilgjengelig`)
            } finally {
                await admin.disconnect()
            }

            await this.consumer!.subscribe({ topic, fromBeginning: false })

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

                        if (messageCount >= maxMessages) {
                            await this.consumer!.stop()
                        }
                    },
                })
            }

            // Start reading messages
            run().catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Feil ved lesing av Kafka meldinger:', error)
                hasError = true
            })

            // Wait for messages to be collected or timeout
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    resolve()
                }, 15000) // 15 sekunder timeout

                const checkMessages = () => {
                    if (hasError || messageCount >= maxMessages || messages.length > 0) {
                        clearTimeout(timeout)
                        resolve()
                    } else {
                        setTimeout(checkMessages, 100)
                    }
                }

                checkMessages()
            })

            if (hasError) {
                throw new Error('Feil oppstod under lesing av meldinger')
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Feil i readMessagesFromTopic:', error)
            throw error
        }

        return messages
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
