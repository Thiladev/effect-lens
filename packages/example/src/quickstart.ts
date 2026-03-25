import { KeyValueStore } from "@effect/platform"
import { Array, Console, DateTime, Effect, Stream, SubscriptionRef } from "effect"
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
    interface User {
        readonly name: string
        readonly age: DateTime.Utc
    }

    // The state of your app
    const ref = yield* SubscriptionRef.make<{
        readonly users: readonly User[]
    }>({
        users: [
            { name: "Jean Dupont", age: yield* DateTime.make("03/25/1969") },
            { name: "Juan Joya Borja", age: yield* DateTime.make("04/05/1956") },
            { name: "Benzemonstre", age: yield* DateTime.make("06/12/2000") },
        ]
    })

    //                \/ Lens<User, NoSuchElementException, NoSuchElementException, never, never>
    const jeanDupontLens = ref.pipe(
        Lens.fromSubscriptionRef,  // Creates a lens that proxies the ref
        Lens.focusField("users"),  // Creates a focused lens that points to the user field
        Lens.focusArrayAt(0),      // Creates a focused lens that points to the first entry of the user array
    )
    // Reading or writing from this lense can fail with NoSuchElementException
    // This is because of Lens.focusArrayAt(0), as reading and writing to an array can be an unsafe operation

    const jeanDupont = yield* Lens.get(jeanDupontLens)

    yield* Lens.set(
        // You can focus even further down
        Lens.focusField(jeanDupontLens, "age"),
        yield* DateTime.make("03/25/1970"),
    )
    // Mutations with the parent state are performed immutably by default
    // unless you use a specific mutable transform such as 'focusMutableField'
})
