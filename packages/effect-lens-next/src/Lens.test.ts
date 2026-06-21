import { describe, expect, test } from "bun:test"
import { Chunk, Context, Effect, Fiber, identity, Option, Ref, Result, Stream, SubscriptionRef, SynchronizedRef } from "effect"
import * as Lens from "./Lens.js"


describe("Lens", () => {
    class Offset extends Context.Service<Offset, { readonly value: number }>()("Offset") {}

    test("mapErrorRead transforms read errors", async () => {
        const lens = Lens.mapErrorRead(
            Lens.make<number, "read", never, never, never>({
                get: Effect.fail("read" as const),
                changes: Stream.fail("read" as const),
                commit: () => Effect.void,
                lock: Effect.succeed(identity),
            }),
            error => `mapped:${ error }`,
        )

        const result = await Effect.runPromise(Effect.result(Lens.get(lens)))

        expect(result).toEqual(Result.fail("mapped:read"))
    })

    test("mapErrorWrite transforms modify errors", async () => {
        const lens = Lens.mapErrorWrite(
            Lens.make<number, never, "write", never, never>({
                get: Effect.succeed(1),
                changes: Stream.make(1),
                commit: () => Effect.fail("write" as const),
                lock: Effect.succeed(identity),
            }),
            () => "mapped-write",
        )

        const result = await Effect.runPromise(Effect.result(Lens.set(lens, 2)))

        expect(result).toEqual(Result.fail("mapped-write"))
    })

    test("mapError transforms read and modify errors", async () => {
        const lens = Lens.mapError(
            Lens.make<number, "read", "write", never, never>({
                get: Effect.fail("read" as const),
                changes: Stream.fail("read" as const),
                commit: () => Effect.fail("write" as const),
                lock: Effect.succeed(identity),
            }),
            () => "mapped",
        )

        const result = await Effect.runPromise(Effect.all([
            Effect.result(Lens.get(lens)),
            Effect.result(Lens.set(lens, 1)),
        ] as const))

        expect(result[0]).toEqual(Result.fail("mapped"))
        expect(result[1]).toEqual(Result.fail("mapped"))
    })

    test("tapErrorRead runs an effect on read failures", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(0),
                counter => {
                    const lens = Lens.tapErrorRead(
                        Lens.make<number, "read", never, never, never>({
                            get: Effect.fail("read" as const),
                            changes: Stream.fail("read" as const),
                            commit: () => Effect.void,
                            lock: Effect.succeed(identity),
                        }),
                        () => SubscriptionRef.modify(counter, n => [void 0, n + 1] as const),
                    )
                    return Effect.flatMap(
                        Effect.result(Lens.get(lens)),
                        () => SubscriptionRef.get(counter),
                    )
                },
            ),
        )

        expect(result).toBe(1)
    })

    test("tapErrorWrite runs an effect on modify failures", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(0),
                counter => {
                    const lens = Lens.tapErrorWrite(
                        Lens.make<number, never, "write", never, never>({
                            get: Effect.succeed(1),
                            changes: Stream.make(1),
                            commit: () => Effect.fail("write" as const),
                            lock: Effect.succeed(identity),
                        }),
                        () => SubscriptionRef.modify(counter, n => [void 0, n + 1] as const),
                    )
                    return Effect.flatMap(
                        Effect.result(Lens.set(lens, 2)),
                        () => SubscriptionRef.get(counter),
                    )
                },
            ),
        )

        expect(result).toBe(1)
    })

    test("mapOption transforms Some values and preserves None", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make<Option.Option<number>>(Option.some(42)),
                parent => {
                    const lens = Lens.mapOption(
                        Lens.fromSubscriptionRef(parent),
                        n => n * 2,
                        (_n, doubled) => doubled / 2,
                    )
                    return Effect.flatMap(
                        Lens.get(lens),
                        value => Effect.flatMap(
                            Lens.set(lens, Option.some(100)),
                            () => Effect.map(SubscriptionRef.get(parent), parentValue => [value, parentValue] as const),
                        ),
                    )
                },
            ),
        )

        expect(result[0]).toEqual(Option.some(84)) // 42 * 2
        expect(result[1]).toEqual(Option.some(50)) // 100 / 2
    })

    test("mapOptionEffect transforms Some values with effects", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make<Option.Option<number>>(Option.some(42)),
                parent => {
                    const lens = Lens.mapOptionEffect(
                        Lens.fromSubscriptionRef(parent),
                        n => Effect.succeed(n * 2),
                        (_n, doubled) => Effect.succeed(doubled / 2),
                    )
                    return Effect.flatMap(
                        Lens.get(lens),
                        value => Effect.flatMap(
                            Lens.set(lens, Option.some(100)),
                            () => Effect.map(SubscriptionRef.get(parent), parentValue => [value, parentValue] as const),
                        ),
                    )
                },
            ),
        )

        expect(result[0]).toEqual(Option.some(84)) // 42 * 2
        expect(result[1]).toEqual(Option.some(50)) // 100 / 2
    })

    test("provideContext supplies a service to get and modify", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(10),
                parent => {
                    const lens = Lens.provideContext(
                        Lens.mapEffect(
                            Lens.fromSubscriptionRef(parent),
                            n => Effect.map(Offset, ({ value }) => n + value),
                            (_n, next) => Effect.map(Offset, ({ value }) => next - value),
                        ),
                        Context.make(Offset, { value: 5 }),
                    )

                    return Effect.flatMap(
                        Lens.get(lens),
                        value => Effect.flatMap(
                            Lens.set(lens, 30),
                            () => Effect.map(SubscriptionRef.get(parent), parentValue => [value, parentValue] as const),
                        ),
                    )
                },
            ),
        )

        expect(result[0]).toBe(15)
        expect(result[1]).toBe(25)
    })

    test("Ref and SynchronizedRef adapters read and update their sources", async () => {
        const result = await Effect.runPromise(Effect.gen(function*() {
            const ref = yield* Ref.make(1)
            const refLens = yield* Lens.fromRef(ref)
            yield* Lens.update(refLens, n => n + 1)

            const synchronizedRef = yield* SynchronizedRef.make(10)
            const synchronizedLens = Lens.fromSynchronizedRef(synchronizedRef)
            yield* Lens.updateEffect(synchronizedLens, n => Effect.succeed(n + 5))

            return [yield* Ref.get(ref), yield* SynchronizedRef.get(synchronizedRef)] as const
        }))

        expect(result).toEqual([2, 15])
    })

    test("modifyEffect updates are atomic under concurrency", async () => {
        const iterations = 100

        const result = await Effect.runPromise(Effect.flatMap(
            SubscriptionRef.make({ count: 0 }),
            parent => {
                const countLens = Lens.focusObjectOn(Lens.fromSubscriptionRef(parent), "count")

                return Effect.flatMap(
                    Effect.forEach(
                        Array.from({ length: iterations }),
                        () => Lens.updateEffect(
                            countLens,
                            count => Effect.as(Effect.yieldNow, count + 1),
                        ),
                        { concurrency: "unbounded", discard: true },
                    ),
                    () => SubscriptionRef.get(parent),
                )
            },
        ))

        expect(result.count).toBe(iterations)
    })

    test("unwrap delegates reads, writes, and locking to the inner lens", async () => {
        const iterations = 100

        const result = await Effect.runPromise(Effect.flatMap(
            SubscriptionRef.make(0),
            parent => {
                const lens = Lens.unwrap(Effect.succeed(Lens.fromSubscriptionRef(parent)))

                return Effect.flatMap(
                    Effect.forEach(
                        Array.from({ length: iterations }),
                        () => Lens.updateEffect(
                            lens,
                            count => Effect.as(Effect.yieldNow, count + 1),
                        ),
                        { concurrency: "unbounded", discard: true },
                    ),
                    () => Effect.all([Lens.get(lens), SubscriptionRef.get(parent)] as const),
                )
            },
        ))

        expect(result).toEqual([iterations, iterations])
    })

    test("focusObjectOn focuses a nested property without touching other fields", async () => {
        const [initialCount, updatedState] = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make({ count: 1, label: "original" }),
                parent => {
                    const countLens = Lens.focusObjectOn(Lens.fromSubscriptionRef(parent), "count")
                    return Effect.flatMap(
                        Lens.get(countLens),
                        count => Effect.flatMap(
                            Lens.set(countLens, count + 5),
                            () => Effect.map(SubscriptionRef.get(parent), state => [count, state] as const),
                        ),
                    )
                },
            ),
        )

        expect(initialCount).toBe(1)
        expect(updatedState).toEqual({ count: 6, label: "original" })
    })

    test("focusObjectOnWritable preserves the root identity when mutating in place", async () => {
        const original = { detail: "keep" }
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(original),
                parent => {
                    const detailLens = Lens.focusObjectOnWritable(Lens.fromSubscriptionRef(parent), "detail")
                    return Effect.flatMap(
                        Lens.set(detailLens, "mutated"),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(updated).toBe(original)
        expect(updated.detail).toBe("mutated")
    })

    test("focusArrayAt updates the selected index", async () => {
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make([10, 20, 30]),
                parent => {
                    const elementLens = Lens.focusArrayAt(Lens.fromSubscriptionRef(parent), 1)
                    return Effect.flatMap(
                        Lens.update(elementLens, value => value + 5),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(updated).toEqual([10, 25, 30])
    })

    test("focusMutableArrayAt mutates the array reference in place", async () => {
        const original = ["foo", "bar"]
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(original),
                parent => {
                    const elementLens = Lens.focusMutableArrayAt(Lens.fromSubscriptionRef(parent), 0)
                    return Effect.flatMap(
                        Lens.set(elementLens, "baz"),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(updated).toBe(original)
        expect(updated).toEqual(["baz", "bar"])
    })

    test("focusTupleAt updates the selected tuple index immutably", async () => {
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make<readonly [string, string, string]>(["a", "b", "c"]),
                parent => {
                    const elementLens = Lens.focusTupleAt(Lens.fromSubscriptionRef(parent), 1)
                    return Effect.flatMap(
                        Lens.set(elementLens, "updated"),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(updated).toEqual(["a", "updated", "c"])
    })

    test("focusMutableTupleAt mutates the tuple reference in place", async () => {
        const original: [string, string] = ["foo", "bar"]
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(original),
                parent => {
                    const elementLens = Lens.focusMutableTupleAt(Lens.fromSubscriptionRef(parent), 0)
                    return Effect.flatMap(
                        Lens.set(elementLens, "baz"),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(updated).toBe(original)
        expect(updated).toEqual(["baz", "bar"])
    })

    test("focusChunkAt replaces the focused chunk element", async () => {
        const updated = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make(Chunk.make(1, 2, 3) as Chunk.Chunk<number>),
                parent => {
                    const elementLens = Lens.focusChunkAt(Lens.fromSubscriptionRef(parent), 2)
                    return Effect.flatMap(
                        Lens.set(elementLens, 99),
                        () => SubscriptionRef.get(parent),
                    )
                },
            ),
        )

        expect(Chunk.toReadonlyArray(updated)).toEqual([1, 2, 99])
    })

    test("focusOption reads and writes the inner Some value", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make<Option.Option<number>>(Option.some(42)),
                parent => {
                    const lens = Lens.focusOption(Lens.fromSubscriptionRef(parent))
                    return Effect.flatMap(
                        Lens.get(lens),
                        value => Effect.flatMap(
                            Lens.set(lens, 100),
                            () => Effect.map(SubscriptionRef.get(parent), parentValue => [value, parentValue] as const),
                        ),
                    )
                },
            ),
        )

        expect(result[0]).toBe(42)
        expect(result[1]).toEqual(Option.some(100))
    })

    test("focusOption fails when the parent option is None", async () => {
        const result = await Effect.runPromise(
            Effect.flatMap(
                SubscriptionRef.make<Option.Option<number>>(Option.none()),
                parent => {
                    const lens = Lens.focusOption(Lens.fromSubscriptionRef(parent))
                    return Effect.all([
                        Effect.result(Lens.get(lens)),
                        Effect.result(Lens.set(lens, 100)),
                        SubscriptionRef.get(parent),
                    ] as const)
                },
            ),
        )

        expect(result[0]._tag).toBe("Failure")
        expect(result[1]._tag).toBe("Failure")
        expect(result[2]).toEqual(Option.none())
    })

    test("modify and modifyEffect atomically update and return a result", async () => {
        const result = await Effect.runPromise(Effect.gen(function*() {
            const parent = yield* SubscriptionRef.make(1)
            const lens = Lens.fromSubscriptionRef(parent)
            const previous = yield* Lens.modify(lens, n => [`value:${ n }`, n + 1] as const)
            const doubled = yield* lens.pipe(Lens.modifyEffect(n => Effect.succeed([n * 2, n + 2] as const)))
            const current = yield* SubscriptionRef.get(parent)
            return [previous, doubled, current] as const
        }))

        expect(result).toEqual(["value:1", 4, 4])
    })

    test("conditional synchronous operations preserve values on None", async () => {
        const result = await Effect.runPromise(Effect.gen(function*() {
            const parent = yield* SubscriptionRef.make(1)
            const lens = Lens.fromSubscriptionRef(parent)
            const fallback = yield* Lens.modifySome(lens, () => ["fallback", Option.none()] as const)
            const modified = yield* lens.pipe(Lens.modifySome(n => {
                n satisfies number
                return [`value:${ n }`, Option.some(n + 1)] as const
            }))
            const previous = yield* lens.pipe(Lens.getAndUpdateSome(n => {
                n satisfies number
                return Option.some(n + 1)
            }))
            yield* Lens.updateSome(lens, () => Option.none())
            yield* lens.pipe(Lens.updateSome(n => {
                n satisfies number
                return Option.some(n + 1)
            }))
            const current = yield* Lens.updateSomeAndGet(lens, () => Option.none())
            const updated = yield* lens.pipe(Lens.updateSomeAndGet(n => {
                n satisfies number
                return Option.some(n + 1)
            }))
            return [fallback, modified, previous, current, updated, yield* SubscriptionRef.get(parent)] as const
        }))

        expect(result).toEqual(["fallback", "value:1", 2, 4, 5, 5])
    })

    test("conditional effectful operations preserve values on None", async () => {
        const result = await Effect.runPromise(Effect.gen(function*() {
            const parent = yield* SubscriptionRef.make(10)
            const lens = Lens.fromSubscriptionRef(parent)
            const modifyNone: Effect.Effect<string> = Lens.modifySomeEffect(
                lens,
                () => Effect.succeed(["fallback", Option.none()] as const),
            )
            const fallback = yield* modifyNone
            const modify: Effect.Effect<string> = lens.pipe(Lens.modifySomeEffect(
                n => {
                    n satisfies number
                    return Effect.succeed([`value:${ n }`, Option.some(n + 1)] as const)
                },
            ))
            const modified = yield* modify
            const getAndUpdate: Effect.Effect<number> = lens.pipe(Lens.getAndUpdateSomeEffect(n => {
                n satisfies number
                return Effect.succeed(Option.some(n + 1))
            }))
            const getAndUpdateNone: Effect.Effect<number> = lens.pipe(Lens.getAndUpdateSomeEffect(() => Effect.succeed(Option.none())))
            const updateNone: Effect.Effect<void> = lens.pipe(Lens.updateSomeEffect(() => Effect.succeed(Option.none())))
            const update: Effect.Effect<void> = lens.pipe(Lens.updateSomeEffect(n => {
                n satisfies number
                return Effect.succeed(Option.some(n + 1))
            }))
            const previous = yield* getAndUpdate
            const unchanged = yield* getAndUpdateNone
            yield* updateNone
            yield* update
            const updateAndGetNone: Effect.Effect<number> = lens.pipe(Lens.updateSomeAndGetEffect(() => Effect.succeed(Option.none())))
            const current = yield* updateAndGetNone
            const updated = yield* lens.pipe(Lens.updateSomeAndGetEffect(n => {
                n satisfies number
                return Effect.succeed(Option.some(n + 1))
            }))
            return [fallback, modified, previous, unchanged, current, updated, yield* SubscriptionRef.get(parent)] as const
        }))

        expect(result).toEqual(["fallback", "value:10", 11, 12, 13, 14, 14])
    })

    test("conditional updates do not publish when the next value is None", async () => {
        const events = await Effect.runPromise(Effect.gen(function*() {
            const parent = yield* SubscriptionRef.make(0)
            const lens = Lens.fromSubscriptionRef(parent)
            const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(lens.changes, 2)))

            yield* Effect.yieldNow
            yield* Lens.updateSome(lens, () => Option.none())
            yield* Lens.updateSome(lens, n => Option.some(n + 1))

            return yield* Fiber.join(fiber)
        }))

        expect(events).toEqual([0, 1])
    })

    // test("changes stream emits updates when lens mutates state", async () => {
    //     const events = await Effect.runPromise(
    //         Effect.flatMap(
    //             SubscriptionRef.make({ count: 0 }),
    //             parent => {
    //                 const lens = Lens.mapField(Lens.fromSubscriptionRef(parent), "count")
    //                 return Effect.fork(Stream.runCollect(Stream.take(lens.changes, 2))).pipe(
    //                     Effect.tap(Lens.set(lens, 1)),
    //                     Effect.tap(Lens.set(lens, 1)),
    //                     Effect.andThen(Fiber.join),
    //                     Effect.map(Chunk.toReadonlyArray),
    //                 )
    //             },
    //         ),
    //     )

    //     expect(events).toEqual([1, 2])
    // })

    // test("mapped changes stream can derive transformed values", async () => {
    //     const derived = await Effect.runPromise(
    //         Effect.flatMap(
    //             SubscriptionRef.make({ count: 10 }),
    //             parent => {
    //                 const lens = Lens.mapField(Lens.fromSubscriptionRef(parent), "count")
    //                 const transformed = Stream.map(lens.changes, count => `count:${ count }`)
    //                 return Effect.scoped(() => Effect.flatMap(
    //                     Effect.forkScoped(Stream.runCollect(Stream.take(transformed, 1))),
    //                     fiber => Effect.flatMap(
    //                         Lens.set(lens, 42),
    //                         () => Effect.join(fiber),
    //                     ),
    //                 ))
    //             },
    //         ),
    //     )

    //     expect(derived).toEqual(["count:42"])
    // })
})
