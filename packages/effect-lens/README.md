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
