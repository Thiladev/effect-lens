import { describe, expect, test } from "bun:test"
import { Chunk, Effect, Sink, Stream, SubscriptionRef } from "effect"
import * as Lens from "./Lens.js"
import * as View from "./View.js"


describe("View", () => {
    test("mapError transforms errors from get and changes", async () => {
        const source = View.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const mapped = source.pipe(View.mapError((error: string) => `mapped:${error}`))

        const result = await Effect.runPromise(Effect.gen(function*() {
            const getError = yield* Effect.flip(mapped.get)
            const changesError = yield* Effect.flip(Stream.runDrain(mapped.changes))
            return [getError, changesError]
        }))

        expect(result).toEqual(["mapped:get", "mapped:changes"])
    })

    test("tapError observes errors from get and changes", async () => {
        const observed: Array<string> = []
        const source = View.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const tapped = View.tapError(source, error => Effect.sync(() => observed.push(error)))

        await Effect.runPromise(Effect.gen(function*() {
            yield* Effect.flip(tapped.get)
            yield* Effect.flip(Stream.runDrain(tapped.changes))
        }))

        expect(observed).toEqual(["get", "changes"])
    })

    test("catch recovers get and changes with the corresponding fallback channel", async () => {
        const source = View.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const recovered = source.pipe(View.catch(() => View.make({
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
        const source = View.make({
            get: Effect.fail("get"),
            changes: Stream.fail("changes"),
        })
        const recovered = View.orElseSucceed(source, () => "fallback")

        const result = await Effect.runPromise(Effect.gen(function*() {
            const current = yield* recovered.get
            const changes = yield* Stream.runCollect(recovered.changes)
            return [current, Array.from(changes)]
        }))

        expect(result).toEqual(["fallback", ["fallback"]])
    })

    test("zipLatestAll combines current values and change streams", async () => {
        const zipped = View.zipLatestAll(
            View.make({
                get: Effect.succeed(1),
                changes: Stream.succeed(2),
            }),
            View.make({
                get: Effect.succeed("one"),
                changes: Stream.succeed("two"),
            }),
        )

        const result = await Effect.runPromise(Effect.all([
            zipped.get,
            Stream.runCollect(zipped.changes),
        ]))

        expect([result[0], Array.from(result[1])]).toEqual([
            [1, "one"],
            [[2, "two"]],
        ])
    })

    test("run consumes changes through a sink and returns its result", async () => {
        const source = View.make({
            get: Effect.succeed(0),
            changes: Stream.make(1, 2, 3),
        })

        const result = await Effect.runPromise(source.pipe(View.run(Sink.sum)))

        expect(result).toBe(6)
    })

    test("run can pipe a view into a lens", async () => {
        const result = await Effect.runPromise(Effect.gen(function*() {
            const target = yield* SubscriptionRef.make(0)
            const source = View.make({
                get: Effect.succeed(0),
                changes: Stream.make(1, 2, 3),
            })

            yield* source.pipe(View.run(Lens.toSink(Lens.fromSubscriptionRef(target))))

            return yield* SubscriptionRef.get(target)
        }))

        expect(result).toBe(3)
    })

    test("focusArrayLength reads the current array length and reflects updates", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([1, 2, 3]),
                parent => {
                    const sizeView = View.focusArrayLength(Lens.fromSubscriptionRef(parent))
                    return Effect.flatMap(
                        sizeView.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, [1, 2, 3, 4, 5]),
                            () => Effect.map(sizeView.get, next => [initial, next] as const),
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
                    const sizeView = View.focusChunkSize(Lens.fromSubscriptionRef(parent))
                    return Effect.flatMap(
                        sizeView.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, Chunk.make(1, 2, 3, 4)),
                            () => Effect.map(sizeView.get, next => [initial, next] as const),
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
                    const sizeView = View.focusIterableSize(Lens.fromSubscriptionRef(parent))
                    return Effect.flatMap(
                        sizeView.get,
                        initial => Effect.flatMap(
                            SubscriptionRef.set(parent, [1, 2, 3, 4, 5]),
                            () => Effect.map(sizeView.get, next => [initial, next] as const),
                        ),
                    )
                },
            ),
        )

        expect(result).toEqual([3, 5])
    })
})
