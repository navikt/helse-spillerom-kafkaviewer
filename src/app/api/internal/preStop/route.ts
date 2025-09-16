import { logger } from '@navikt/next-logger'

export async function GET(req: Request): Promise<Response> {
    const text = await req.text()
    logger.info('Next.js server: received pre stop request, waiting for 10s before starting shutdown ' + text)
    await new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve()
        }, 10_000)
    })
    logger.info('Next.js server: starting shutdown')
    return Response.json({ message: 'ready for shutdown' })
}
