import { describe, expect, test } from "bun:test"
import { Chunk, Effect, SubscriptionRef } from "effect"
import * as Subscribable from "./Subscribable.js"


describe("Subscribable", () => {
    test("focusArrayLength reads the current array length and reflects updates", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([1, 2, 3]),
                parent => {
                    const sizeSub = Subscribable.focusArrayLength(parent)
                    return Effect.flatMap(
                        sizeSub.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, [1, 2, 3, 4, 5]),
                            () => Effect.map(sizeSub.get, next => [initial, next] as const),
                        ),
                    )
                },
            ),
        )

        expect(result).toEqual([3, 5])
    })

    test("focusChunkSize reads the current chunk size and reflects updates", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(Chunk.make(1, 2) as Chunk.Chunk<number>),
                parent => {
                    const sizeSub = Subscribable.focusChunkSize(parent)
                    return Effect.flatMap(
                        sizeSub.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, Chunk.make(1, 2, 3, 4)),
                            () => Effect.map(sizeSub.get, next => [initial, next] as const),
                        ),
                    )
                },
            ),
        )

        expect(result).toEqual([2, 4])
    })

    test("focusIterableSize also works for array values", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([1, 2, 3]),
                parent => {
                    const sizeSub = Subscribable.focusIterableSize(parent)
                    return Effect.flatMap(
                        sizeSub.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, [1, 2, 3, 4, 5]),
                            () => Effect.map(sizeSub.get, next => [initial, next] as const),
                        ),
                    )
                },
            ),
        )

        expect(result).toEqual([3, 5])
    })
})
