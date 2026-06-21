import { describe, expect, test } from "bun:test"
import { Chunk, Effect, Stream, SubscriptionRef } from "effect"
import * as Lens from "./Lens.js"
import * as Subscribable from "./Subscribable.js"


describe("Subscribable", () => {
    test("mapError transforms errors from get and changes", async () => {
        const source = Subscribable.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const mapped = source.pipe(Subscribable.mapError((error: string) => `mapped:${error}`))

        const result = await Effect.runPromise(Effect.gen(function*() {
            const getError = yield* Effect.flip(mapped.get)
            const changesError = yield* Effect.flip(Stream.runDrain(mapped.changes))
            return [getError, changesError]
        }))

        expect(result).toEqual(["mapped:get", "mapped:changes"])
    })

    test("tapError observes errors from get and changes", async () => {
        const observed: Array<string> = []
        const source = Subscribable.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const tapped = Subscribable.tapError(source, error => Effect.sync(() => observed.push(error)))

        await Effect.runPromise(Effect.gen(function*() {
            yield* Effect.flip(tapped.get)
            yield* Effect.flip(Stream.runDrain(tapped.changes))
        }))

        expect(observed).toEqual(["get", "changes"])
    })

    test("catch recovers get and changes with the corresponding fallback channel", async () => {
        const source = Subscribable.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const recovered = source.pipe(Subscribable.catch(() => Subscribable.make({
            get: Effect.succeed("fallback-get"),
            changes: Stream.succeed("fallback-changes"),
        })))

        const result = await Effect.runPromise(Effect.gen(function*() {
            const current = yield* recovered.get
            const changes = yield* Stream.runCollect(recovered.changes)
            return [current, Array.from(changes)]
        }))

        expect(result).toEqual(["fallback-get", ["fallback-changes"]])
    })

    test("orElseSucceed recovers errors from get and changes", async () => {
        const source = Subscribable.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const recovered = Subscribable.orElseSucceed(source, () => "fallback")

        const result = await Effect.runPromise(Effect.gen(function*() {
            const current = yield* recovered.get
            const changes = yield* Stream.runCollect(recovered.changes)
            return [current, Array.from(changes)]
        }))

        expect(result).toEqual(["fallback", ["fallback"]])
    })

    test("focusArrayLength reads the current array length and reflects updates", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([1, 2, 3]),
                parent => {
                    const sizeSub = Subscribable.focusArrayLength(Lens.fromSubscriptionRef(parent))
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
                    const sizeSub = Subscribable.focusChunkSize(Lens.fromSubscriptionRef(parent))
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
                    const sizeSub = Subscribable.focusIterableSize(Lens.fromSubscriptionRef(parent))
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
