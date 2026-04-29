# Effect Lens

A Lens type for [Effect](https://effect.website/) to easily manage nested state.

## Install
```
npm install effect-lens
yarn add effect-lens
bun add effect-lens
```

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

#### From an existing type
We provide a few helpers to create Lenses from some Effect types:
```typescript
// The ref is the data source
const ref = yield* SubscriptionRef.make([12, 87, 69])

// The lens acts as a proxy that allows reading, subscribing to and writing to that
// data source with a similar API to Effect's SubscriptionRef
const lens = Lens.fromSubscriptionRef(ref)
//       ^ Lens.Lens<number[], never, never, never, never>

const value = yield* Lens.get(lens)
yield* Effect.forkScoped(Stream.runForEach(lens.changes, Console.log))
yield* Lens.update(lens, Array.replace(1, 1664))
```

Currently available:
- `fromSubscriptionRef`
- `fromSynchronizedRef` (note: since `SynchronizedRef` is not reactive (does not produce a stream of value changes), the resulting Lens' `changes` stream will only emit the current value of the lens when evaluated, and nothing else)

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

Focused Lenses work just the same as a Lens that points directly to a data source and can be read, subscribed to or written to.

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
    Lens.fromSubscriptionRef,     // Creates a lens that proxies the ref
    Lens.focusObjectOn("users"),  // Creates a focused lens that points to the users field
    Lens.focusArrayAt(0),         // Creates a focused lens that points to the first entry of the user array
)
// Reading or writing from this lens can fail with NoSuchElementException
// This is because of Lens.focusArrayAt(0), as reading and writing to an array is an unsafe operation

const jeanDupont = yield* Lens.get(jeanDupontLens)

yield* Lens.set(
    // You can focus even further down
    Lens.focusObjectOn(jeanDupontLens, "age"),
    yield* DateTime.make("03/25/1970"),
)
// Mutations with the parent state are performed immutably by default
// unless you use a specific mutable transform such as 'focusObjectOnWritable'
```

Currently available:
| Name | Description | Parent state mutation behavior | Notes |
| - | - | - | - |
| `focusObjectOn` | Focuses to a field of an object. Replaces the parent object immutably when writing to the focused field | Immutable | |
| `focusObjectOnWritable` | Focuses to a writable field of an object. Mutates the parent object in place via the writable field | Mutable | Type-safe: will not allow you to mutate `readonly` fields |
| `focusArrayAt` | Focuses to an indexed entry of an array. Replaces the parent array immutably when writing to the focused index | Immutable | |
| `focusMutableArrayAt` | Focuses to an indexed entry of an array. Mutates the parent array in place at the focused index | Mutable | Type-safe: will not allow you to mutate `readonly` arrays |
| `focusTupleAt` | Focuses to an indexed entry of a readonly tuple. Replaces the parent tuple immutably when writing to the focused index | Immutable | |
| `focusMutableTupleAt` | Focuses to an indexed entry of a mutable tuple. Mutates the parent tuple in place at the focused index | Mutable | Type-safe: will not allow you to mutate `readonly` tuples |
| `focusChunkAt` | Focuses to an indexed entry of a `Chunk`. Replaces the parent `Chunk` immutably when writing to the focused element | Immutable | |

Also more to come!

#### Manually
You can create focused Lenses by composing them manually using `map`, `mapEffect` and `unwrap`:
```typescript
const ref = yield* SubscriptionRef.make<readonly User[]>([
    { name: "Jean Dupont", age: yield* DateTime.make("03/25/1969") },
    { name: "Juan Joya Borja", age: yield* DateTime.make("04/05/1956") },
    { name: "Benzemonstre", age: yield* DateTime.make("06/12/2000") },
])

//                  \/ Lens<User, NoSuchElementException, NoSuchElementException, never, never>
const benzemonstreLens = ref.pipe(
    Lens.fromSubscriptionRef,

    // Manually focus
    Lens.mapEffect(
        // Getter:
        Array.get(2),
        // Setter:
        (a, b) => Array.replaceOption(a, 2, b),
    //   ^ The current Lens value (readonly User[])
    //      ^ The new focused value to push (User)
    ),
)
// Both Array.get and Array.replaceOption return an Option
// When evaluated by the lens, Option<A> becomes Effect<A, NoSuchElementException>
// As you can see, this is automatically tracked by the Lens type
```


### Subscribable

Lens implements both Effect's `Subscribable` and `Readable`, which you can use as a constraint to allow some parts of your app to only read and subscribe to the Lenses you provide them:
```typescript
const ref = yield* SubscriptionRef.make<{
    readonly users: readonly User[]
}>({ users: [...] })

const someFunctionThatShouldOnlyHaveReadonlyAccessToTheState = (
    usersSub: Subscribable.Subscribable<readonly User[], never, never>
) => Effect.gen(function*() {
    // Do whatever
    const usersCountSub = Subscribable.map(usersSub, a => a.length)
    const users = yield* usersSub.get
    yield* Effect.forkScoped(Stream.runForEach(usersSub.changes, ...))
})

const lens = ref.pipe(
    Lens.fromSubscriptionRef,
    Lens.focusObjectOn("users"),
)
yield* someFunctionThatShouldOnlyHaveReadonlyAccessToTheState(lens)
```

#### Focusing
This library re-exports Effect's `Subscribable` module and adds a few transforms to narrow the focus of `Subscribable`'s, same as Lenses:
```typescript
import { Subscribable } from "effect-lens"

declare const sub: Subscribable.Subscribable<readonly { name: string }[], never, never>

//         \/ Subscribable.Subscribable<string, NoSuchElementException, never>
const nameSub = sub.pipe(
    Subscribable.focusArrayAt(1),
    Subscribable.focusObjectOn("name"),
)
```

Currently available:
| Name | Description |
| - | - |
| `focusObjectOn` | Focuses to the field of an object |
| `focusArrayAt` | Focuses to an indexed entry of an array |
| `focusTupleAt` | Focuses to an indexed entry of a tuple |
| `focusChunkAt` | Focuses to an indexed entry of a `Chunk` |


## Todo

This library is already ready to use! However, there is always more to do...
- Finish those docs
- Provide an API reference
- Add new adapters for various data source types
- Add new focus transforms
- Provide a preview version for Effect 4 beta
