export function raise(error: Error | string): never {
    if (typeof error === 'string') {
        throw new Error(error)
    } else {
        throw error
    }
}

export function notNull<T>(value: T): value is NonNullable<T> {
    return value != null
}

export type Nullable<T> = {
    [P in keyof T]: T[P] | null
}

export type Maybe<T> = T | null
