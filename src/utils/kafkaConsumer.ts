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
            const startTime = Date.now()
            // eslint-disable-next-line no-console
            console.log(`Starter consumer for topic ${topic}, maxMessages: ${maxMessages}`)
            
            // Koble til consumer
            await consumer.connect()
            // eslint-disable-next-line no-console
            console.log(`Consumer tilkoblet i ${Date.now() - startTime}ms`)

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

            // Subscribe til topic - hent alle meldinger, sorter og ta siste N
            const subscribeStart = Date.now()
            await consumer.subscribe({ topic, fromBeginning: true })
            // eslint-disable-next-line no-console
            console.log(`Subscribe ferdig i ${Date.now() - subscribeStart}ms`)

            // Hent offset-info for å beregne antall meldinger
            const admin2 = this.kafka.admin()
            await admin2.connect()
            let totalMessagesInTopic = 0
            
            try {
                const offsets = await admin2.fetchTopicOffsets(topic)
                totalMessagesInTopic = offsets.reduce(
                    (sum, o) => sum + parseInt(o.high) - parseInt(o.low), 
                    0
                )
                
                // eslint-disable-next-line no-console
                console.log(`Total meldinger i topic: ${totalMessagesInTopic}`)
            } finally {
                await admin2.disconnect()
            }
            
            // Optimaliser basert på antall meldinger i topic
            let shouldReadAll = totalMessagesInTopic <= maxMessages * 2 // Hvis topic er liten, les alt
            let timeoutMs = 2000 // Standard timeout
            
            if (shouldReadAll) {
                // Les alle meldinger hvis topic er liten
                timeoutMs = Math.min(1000 + totalMessagesInTopic * 100, 3000)
                // eslint-disable-next-line no-console
                console.log(`Topic har ${totalMessagesInTopic} meldinger - leser alle meldinger (timeout: ${timeoutMs}ms)`)
            } else {
                // For store topics, bruk kortere timeout og stopp tidligere
                timeoutMs = 2000
                // eslint-disable-next-line no-console
                console.log(`Topic har ${totalMessagesInTopic} meldinger - leser så mange som mulig på ${timeoutMs}ms, sorterer og tar siste ${maxMessages}`)
            }

            // Samle meldinger med smart timeout
            const messageCollectionStart = Date.now()
            await new Promise<void>((resolve, reject) => {
                let hasResolved = false
                
                const timeout = setTimeout(() => {
                    if (!hasResolved) {
                        hasResolved = true
                        // eslint-disable-next-line no-console
                        console.log(`Timeout nådd (${timeoutMs}ms). Hentet ${messages.length} meldinger`)
                        resolve()
                    }
                }, timeoutMs)

                consumer
                    .run({
                        partitionsConsumedConcurrently: Math.min(topicMetadata.partitions.length, 5),
                        eachMessage: async ({ partition, message }) => {
                            if (hasResolved) {
                                return
                            }
                            
                            // For små topics, les alle. For store topics, stopp ved maxMessages
                            if (!shouldReadAll && messageCount >= maxMessages) {
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
                                `Lastet melding ${messageCount}${shouldReadAll ? `/${totalMessagesInTopic}` : `/${maxMessages}`} fra partition ${partition}, offset ${message.offset}`,
                            )

                            // For store topics, stopp når vi har maxMessages
                            if (!shouldReadAll && messageCount >= maxMessages && !hasResolved) {
                                hasResolved = true
                                clearTimeout(timeout)
                                resolve()
                            }
                            
                            // For små topics, stopp når vi har lest alt
                            if (shouldReadAll && messageCount >= totalMessagesInTopic && !hasResolved) {
                                hasResolved = true
                                clearTimeout(timeout)
                                resolve()
                            }
                        },
                    })
                    .catch((error) => {
                        // eslint-disable-next-line no-console
                        console.error('Feil ved lesing av Kafka meldinger:', error)
                        if (!hasResolved) {
                            hasResolved = true
                            clearTimeout(timeout)
                            reject(error)
                        }
                    })
            })
            
            // eslint-disable-next-line no-console
            console.log(`Message collection ferdig i ${Date.now() - messageCollectionStart}ms, hentet ${messages.length} meldinger`)
        } finally {
            // Koble fra consumer
            const disconnectStart = Date.now()
            try {
                await consumer.disconnect()
                // eslint-disable-next-line no-console
                console.log(`Consumer frakoblet i ${Date.now() - disconnectStart}ms`)
            } catch (disconnectError) {
                // eslint-disable-next-line no-console
                console.log('Feil ved frakobling av consumer:', disconnectError)
            }
        }

        // eslint-disable-next-line no-console
        console.log(`Hentet totalt ${messages.length} meldinger`)
        
        // Sorter meldinger etter timestamp (nyeste først) 
        messages.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
        
        // Returner de siste N meldingene
        const result = messages.slice(0, maxMessages)
        
        // eslint-disable-next-line no-console
        console.log(`Returnerer ${result.length} meldinger (siste ${maxMessages} etter sortering)`)

        return result
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
