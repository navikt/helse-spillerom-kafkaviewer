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
        // Opprett ny consumer og admin for hver request
        const admin = this.kafka.admin()
        const consumer = this.kafka.consumer({ groupId: this.groupId })

        const messages: KafkaMessage[] = []

        try {
            // eslint-disable-next-line no-console
            console.log(`Starter konsument for topic ${topic}, ønsker ${maxMessages} meldinger`)

            // Koble til admin og consumer
            await Promise.all([admin.connect(), consumer.connect()])

            // Hent topic metadata og offsets
            const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
            const topicData = metadata.topics[0]

            if (!topicData) {
                throw new Error(`Topic '${topic}' ikke funnet`)
            }

            const offsets = await admin.fetchTopicOffsets(topic)
            // eslint-disable-next-line no-console
            console.log('Topic offsets:', offsets)

            // Beregn hvor vi skal starte lesing for å få de siste N meldingene
            const seekPositions: Array<{ topic: string; partition: number; offset: string }> = []

            for (const partitionOffset of offsets) {
                const { partition, high, low } = partitionOffset
                const totalMessages = parseInt(high) - parseInt(low)

                if (totalMessages > 0) {
                    // Beregn hvor mange meldinger vi vil ha fra denne partisjonen
                    const messagesFromPartition = Math.ceil(
                        maxMessages / offsets.filter((o) => parseInt(o.high) > parseInt(o.low)).length,
                    )
                    const startOffset = Math.max(parseInt(low), parseInt(high) - messagesFromPartition)

                    seekPositions.push({
                        topic,
                        partition,
                        offset: startOffset.toString(),
                    })

                    // eslint-disable-next-line no-console
                    console.log(
                        `Partition ${partition}: vil lese fra offset ${startOffset} til ${high} (${parseInt(high) - startOffset} meldinger)`,
                    )
                }
            }

            if (seekPositions.length === 0) {
                // eslint-disable-next-line no-console
                console.log('Ingen meldinger funnet i topic')
                return []
            }

            // Subscribe til topic
            await consumer.subscribe({ topic, fromBeginning: false })

            // Start consumer og vent på at den blir tildelt partisjoner
            let hasStarted = false
            const messagesPromise = new Promise<void>((resolve, reject) => {
                let hasResolved = false
                let messageCount = 0

                // Timeout for safety
                const timeout = setTimeout(() => {
                    if (!hasResolved) {
                        hasResolved = true
                        // eslint-disable-next-line no-console
                        console.log(`Timeout nådd. Hentet ${messages.length} meldinger`)
                        resolve()
                    }
                }, 1000)

                consumer
                    .run({
                        partitionsConsumedConcurrently: seekPositions.length,
                        eachMessage: async ({ partition, message }) => {
                            // Seek til riktig posisjon når vi starter (bare første gang per partisjon)
                            if (!hasStarted) {
                                hasStarted = true
                                // eslint-disable-next-line no-console
                                console.log('Consumer startet, setter seek-posisjoner...')

                                // Seek til riktige posisjoner
                                for (const seekPos of seekPositions) {
                                    await consumer.seek(seekPos)
                                    // eslint-disable-next-line no-console
                                    console.log(`Seeket til partition ${seekPos.partition}, offset ${seekPos.offset}`)
                                }
                            }

                            if (hasResolved || messageCount >= maxMessages) {
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
                                `Hentet melding ${messageCount}/${maxMessages} fra partition ${partition}, offset ${message.offset}`,
                            )

                            if (messageCount >= maxMessages && !hasResolved) {
                                hasResolved = true
                                clearTimeout(timeout)
                                resolve()
                            }
                        },
                    })
                    .catch((error) => {
                        // eslint-disable-next-line no-console
                        console.error('Consumer error:', error)
                        if (!hasResolved) {
                            hasResolved = true
                            clearTimeout(timeout)
                            reject(error)
                        }
                    })
            })

            await messagesPromise
        } finally {
            // Koble fra consumer og admin
            try {
                await Promise.all([consumer.disconnect(), admin.disconnect()])
                // eslint-disable-next-line no-console
                console.log('Consumer og admin frakoblet')
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Feil ved frakobling:', error)
            }
        }

        // Sorter etter timestamp (nyeste først) og returner
        messages.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
        const result = messages.slice(0, maxMessages)

        // eslint-disable-next-line no-console
        console.log(`Returnerer ${result.length} meldinger sortert etter timestamp`)

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
