import { Array, Console, Effect, Stream, SubscriptionRef } from "effect"
import { Lens } from "effect-lens"

Effect.gen(function*() {
    // The ref is the data source
    const ref = yield* SubscriptionRef.make([12, 87, 69])

    // The lens acts as a proxy that allows reading, subscribing from and writing to that
    // data source with a similar API to Effect's SubscriptionRef
    const lens = Lens.fromSubscriptionRef(ref)
    //       ^ Lens.Lens<number[], never, never, never, never>

    const value = yield* Lens.get(lens)
    yield* Effect.forkScoped(Stream.runForEach(lens.changes, Console.log))
    yield* Lens.update(lens, Array.replace(1, 1664))
})

Effect.gen(function*() {

})