import { NextResponse } from 'next/server'

export function GET(): NextResponse<Record<string, string>> {
    return NextResponse.json({ ping: 'pong' })
}
