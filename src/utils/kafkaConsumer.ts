import { Kafka, Consumer, EachMessagePayload } from 'kafkajs'
import { nextleton } from 'nextleton'
import { logger } from '@navikt/next-logger'

export interface KafkaMessage {
    key: string | null
    value: string | null
    headers: Record<string, string | Buffer | undefined>
    partition: number
    offset: string
    timestamp: string
    topic: string
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

interface KafkaStore {
    messages: Map<string, KafkaMessage[]> // topic -> meldinger
    isRunning: boolean
    lastUpdated: Record<string, string> // topic -> timestamp
}

class KafkaConsumerSingleton {
    private kafka: Kafka
    private consumer: Consumer | null = null
    private store: KafkaStore = {
        messages: new Map(),
        isRunning: false,
        lastUpdated: {},
    }
    public readonly groupId: string
    private readonly MAX_MESSAGES_PER_TOPIC = 10000 // Begrens minnebruk

    constructor() {
        // Fast consumer group for konsistent oppførsel
        this.groupId = 'spillerom-kafkaviewer-singleton'

        this.kafka = new Kafka({
            clientId: 'spillerom-kafkaviewer-singleton',
            brokers: process.env.KAFKA_BROKERS!.split(','),
            ssl: {
                rejectUnauthorized: true,
                ca: [process.env.KAFKA_CA!],
                key: process.env.KAFKA_PRIVATE_KEY!,
                cert: process.env.KAFKA_CERTIFICATE!,
            },
            retry: {
                initialRetryTime: 100,
                retries: 8,
            },
            requestTimeout: 30000,
            connectionTimeout: 3000,
        })
    }

    async startPolling(topics: string[] = ['speilvendt.spillerom-behandlinger']): Promise<void> {
        if (this.store.isRunning) {
            logger.info('Kafka consumer kjører allerede')
            return
        }

        try {
            logger.info('Starter Kafka consumer singleton...')
            this.store.isRunning = true

            // Opprett consumer
            this.consumer = this.kafka.consumer({
                groupId: this.groupId,
                sessionTimeout: 30000,
                rebalanceTimeout: 60000,
                heartbeatInterval: 3000,
                maxWaitTimeInMs: 5000,
            })

            await this.consumer.connect()
            logger.info('Kafka consumer tilkoblet')

            // Subscribe til alle topics
            for (const topic of topics) {
                await this.consumer.subscribe({ topic, fromBeginning: true })
                this.store.messages.set(topic, [])
                logger.info(`Subscribet til topic: ${topic}`)
            }

            // Les historikk først
            await this.loadHistoricMessages(topics)

            // Start kontinuerlig polling
            await this.consumer.run({
                partitionsConsumedConcurrently: 10,
                eachMessage: async (payload: EachMessagePayload) => {
                    await this.handleMessage(payload)
                },
            })

            logger.info('Kafka consumer startet og poller kontinuerlig')
        } catch (error) {
            logger.error('Feil ved oppstart av Kafka consumer:', error)
            this.store.isRunning = false
            throw error
        }
    }

    private async loadHistoricMessages(topics: string[]): Promise<void> {
        logger.info('Laster historiske meldinger...')

        for (const topic of topics) {
            try {
                const admin = this.kafka.admin()
                await admin.connect()

                const offsets = await admin.fetchTopicOffsets(topic)
                logger.info(`Laster historikk for ${topic}`, { offsets })

                await admin.disconnect()

                // Sett tidsstempel for når vi starter
                this.store.lastUpdated[topic] = new Date().toISOString()
            } catch (error) {
                logger.error(`Feil ved lasting av historikk for ${topic}:`, error)
            }
        }
    }

    private async handleMessage(payload: EachMessagePayload): Promise<void> {
        const { topic, partition, message } = payload

        try {
            const kafkaMessage: KafkaMessage = {
                key: message.key?.toString() || null,
                value: message.value?.toString() || null,
                headers: this.parseHeaders(message.headers),
                partition,
                offset: message.offset,
                timestamp: message.timestamp,
                topic,
            }

            // Legg til melding i store
            const topicMessages = this.store.messages.get(topic) || []
            topicMessages.unshift(kafkaMessage) // Nyeste først

            // Begrens antall meldinger per topic
            if (topicMessages.length > this.MAX_MESSAGES_PER_TOPIC) {
                topicMessages.splice(this.MAX_MESSAGES_PER_TOPIC)
            }

            this.store.messages.set(topic, topicMessages)
            this.store.lastUpdated[topic] = new Date().toISOString()

            logger.debug(`Håndterte melding fra ${topic}, partition ${partition}, offset ${message.offset}`)
        } catch (error) {
            logger.error('Feil ved håndtering av melding:', error)
        }
    }

    async connect(): Promise<void> {
        // Bakoverkompatibilitet - start polling hvis ikke allerede gjort
        if (!this.store.isRunning) {
            await this.startPolling()
        }
    }

    async disconnect(): Promise<void> {
        if (this.consumer) {
            await this.consumer.disconnect()
            this.consumer = null
        }
        this.store.isRunning = false
        logger.info('Kafka consumer disconnected')
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

    getMessages(topic: string, maxMessages: number = 100): KafkaMessage[] {
        const topicMessages = this.store.messages.get(topic) || []
        return topicMessages.slice(0, maxMessages)
    }

    getTopics(): string[] {
        return Array.from(this.store.messages.keys())
    }

    getStatus(): { isRunning: boolean; lastUpdated: Record<string, string>; messageCount: Record<string, number> } {
        const messageCount: Record<string, number> = {}
        for (const [topic, messages] of this.store.messages) {
            messageCount[topic] = messages.length
        }

        return {
            isRunning: this.store.isRunning,
            lastUpdated: { ...this.store.lastUpdated },
            messageCount,
        }
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

// Opprett og eksporter singleton instance med nextleton
export const kafkaConsumer = nextleton('kafkaConsumer', () => {
    const instance = new KafkaConsumerSingleton()

    // Start polling når instansen opprettes
    if (typeof window === 'undefined') {
        // Kun på server-side
        instance.startPolling().catch((error) => logger.error('Feil ved oppstart av Kafka consumer:', error))
    }

    return instance
})

// Eksporter klasse for type-kompatibilitet
export class KafkaConsumerService extends KafkaConsumerSingleton {
    constructor() {
        super()
        logger.warn('KafkaConsumerService er deprecated. Bruk kafkaConsumer singleton i stedet.')
    }
}
