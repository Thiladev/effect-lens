# Effect Lens

A Lens type for [Effect](https://effect.website/) to easily manage nested state.

A proper documentation is currently being written. In the meantime, you can take a look at the quickstart below and at the `packages/example` directory.

## Peer dependencies
- `effect` 3.21+


## Quickstart

A Lens is an effectful abstraction for focusing on (i.e., getting, subscribing to, setting, or modifying) a specific part of a larger immutable data structure, without losing the surrounding context.

Picture it as a proxy to a separate data source with a similar API to Effect's `SubscriptionRef`, that can point to
a nested part of a data structure (I.E.: a `SubscriptionRef` holds an array of numbers, a Lens can proxy that array
or the number at a specific index).

What makes a Lens effectful is the fact that the proxy logic uses effects, which means reading from or writing to a
Lens can fail or have requirements:
```typescript
Lens<
    A,   // Type of the value the lens is focused on
    ER,  // Errors that can happen when reading
    EW,  // Errors that can happen when writing
    RE,  // Requirements for reading
    RW   // Requirements for writing
>
```


### Creating a Lens

#### From an exisiting type
We provide a few helpers to create Lenses from some Effect types:
```typescript
// The ref is the data source
const ref = yield* SubscriptionRef.make([12, 87, 69])

// The lens acts as a proxy that allows reading, subscribing from and writing to that
// data source with a similar API to Effect's SubscriptionRef
const lens = Lens.fromSubscriptionRef(ref)
//       ^ Lens.Lens<number[], never, never, never, never>

const value = yield* Lens.get(lens)
yield* Effect.forkScoped(Stream.runForEach(lens.changes, Console.log))
yield* Lens.update(lens, Array.replace(1, 1664))
```

Currently available:
- `fromSubscriptionRef`
- `fromSynchronizedRef` (note: since `SynchronizedRef` is not reactive (does not produces a stream of value changes), the resulting Lens' `changes` stream will only emit the current value of the lens when evaluated, and nothing else)

More to come!

#### Manually
You can also create Lenses manually using `make` by providing a getter, a stream of changes and either a `set` or `modify` function depending on your needs.

You can get pretty creative! Here's an example of a Lens that points to a specific key of the browser `LocalStorage`:
```typescript
//      \/ Lens<Option.Option<string>, PlatformError, PlatformError, never, never>
const lens = Effect.all([
    KeyValueStore.KeyValueStore,
    Effect.succeed("someKey"),
]).pipe(
    Effect.map(([kv, key]) => Lens.make({
        get: kv.get(key),

        changes: kv.get(key).pipe(
            Effect.map(Stream.make),
            Effect.map(a => Stream.concat(
                a,
                BrowserStream.fromEventListenerWindow("storage").pipe(
                    Stream.filter(event => event.key === key),
                    Stream.map(event => Option.fromNullable(event.newValue)),
                ),
            )),
            Stream.unwrap,
        ),

        set: a => Option.isSome(a)
            ? kv.set(key, a.value)
            : kv.remove(key),
    })),

    Effect.provide(BrowserKeyValueStore.layerLocalStorage),
    Lens.unwrap,
)
```

Note: while Lens supports asynchronous effects for the proxy logic, we would recommend keeping them synchronous to preserve atomicity.


### Focusing

Lenses can focus on a nested part of the data type they point to.

What does this mean? Let's say you have a Lens with this signature:
```typescript
Lens<{ readonly a: string, readonly b: number }, never, never, never, never>
```

*Focusing this Lens on `a`* means deriving a new Lens that points to the `a` field of the struct the current Lens points to, resulting in a:
```typescript
Lens<string, never, never, never, never>
```

Focuses Lenses work just the same as a Lens that points directly to a data source and can be read, subscribed to or written to.

Writing to them will properly update parent Lenses or data sources. Such updates can be performed in both a mutable or an immutable manner depending on your choice.

This is a very powerful pattern as it enables you to keep your state in some shared data store while allowing you to pass specific parts of that state to some parts of your application. Very useful for frontend development!

#### Using built-in transforms
We provide a few helpers to create focused Lenses:
```typescript
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
    Lens.focusField("users"),  // Creates a focused lens that points to the users field
    Lens.focusArrayAt(0),      // Creates a focused lens that points to the first entry of the user array
)
// Reading or writing from this lense can fail with NoSuchElementException
// This is because of Lens.focusArrayAt(0), as reading and writing to an array is an unsafe operation

const jeanDupont = yield* Lens.get(jeanDupontLens)

yield* Lens.set(
    // You can focus even further down
    Lens.focusField(jeanDupontLens, "age"),
    yield* DateTime.make("03/25/1970"),
)
// Mutations with the parent state are performed immutably by default
// unless you use a specific mutable transform such as 'focusMutableField'
```

Currently available:
