import { describe, expect, test } from "bun:test"
import { Chunk, Effect, Option, SubscriptionRef } from "effect"
import * as Lens from "./Lens.js"


describe("Lens", () => {
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
                            () => Effect.map(parent.get, parentValue => [value, parentValue] as const),
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
                            () => Effect.map(parent.get, parentValue => [value, parentValue] as const),
                        ),
                    )
                },
            ),
        )

        expect(result[0]).toEqual(Option.some(84)) // 42 * 2
        expect(result[1]).toEqual(Option.some(50)) // 100 / 2
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
                            () => Effect.map(parent.get, state => [count, state] as const),
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
                        () => parent.get,
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
                        () => parent.get,
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
                        () => parent.get,
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
                        () => parent.get,
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
                        () => parent.get,
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
                        () => parent.get,
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
                            () => Effect.map(parent.get, parentValue => [value, parentValue] as const),
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
                        Effect.either(Lens.get(lens)),
                        Effect.either(Lens.set(lens, 100)),
                        parent.get,
                    ] as const)
                },
            ),
        )

        expect(result[0]._tag).toBe("Left")
        expect(result[1]._tag).toBe("Left")
        expect(result[2]).toEqual(Option.none())
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
