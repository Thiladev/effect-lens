<p align="center">
  <img src="https://github.com/Thiladev/effect-lens/blob/master/packages/effect-lens/logo-square.svg" alt="Effect Lens — the layered Effect mark under a magnifying lens highlighting code" width="220">
</p>

<h1 align="center">Effect Lens</h1>

<p align="center">
  A Lens type for <a href="https://effect.website/">Effect</a> to easily manage nested state.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/effect-lens"><img alt="npm version" src="https://img.shields.io/npm/v/effect-lens?style=flat-square&color=6e56cf"></a>
  <a href="https://www.npmjs.com/package/effect-lens"><img alt="monthly downloads" src="https://img.shields.io/npm/dm/effect-lens?style=flat-square&color=24b8c8"></a>
  <a href="https://github.com/Thiladev/effect-lens/blob/main/LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/effect-lens?style=flat-square&color=8b7bff"></a>
  <a href="https://effect.website/"><img alt="Effect 3" src="https://img.shields.io/badge/Effect-3.21+-b9f27c?style=flat-square&labelColor=263238"></a>
</p>

> **⚠️ Effect v3:** This version is built for Effect v3. For Effect v4, use the [beta release](https://www.npmjs.com/package/effect-lens/v/beta).

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
    RR,  // Requirements for reading
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
- `fromRef` (returns an effect because it creates an internal lock)

#### Manually
You can also create Lenses manually using `make` by providing:
- `get`: an effect that reads the current value,
- `changes`: a stream of value changes,
- `commit`: an effectful write primitive,
- `lock`: an effect that produces the lock used to serialize writes and preserve atomicity.

You can get pretty creative! Here's an example of a Lens that points to a specific key of the browser `LocalStorage`:
```typescript
//      \/ Lens<Option.Option<string>, PlatformError, PlatformError, never, never>
const lens = Effect.all([
    KeyValueStore.KeyValueStore,
    Effect.succeed("someKey"),
    Effect.makeSemaphore(1),
]).pipe(
    Effect.map(([kv, key, semaphore]) => Lens.make({
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

        commit: a => Option.isSome(a)
            ? kv.set(key, a.value)
            : kv.remove(key),

        lock: Effect.succeed(semaphore.withPermits(1)),
    })),

    Effect.provide(BrowserKeyValueStore.layerLocalStorage),
    Lens.unwrap,
)
```

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
| `focusOption` | Focuses to the value inside an `Option`. Wraps writes back into `Option.some` | Immutable | Reading or writing fails with `NoSuchElementException` when the parent option is `None` |

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

#### Low-level derived lenses
For advanced cases, you can derive a Lens manually using `derive`. This is the primitive used by the built-in transforms.

A derived Lens describes how to transform three parent channels:
- `resolve`: reads the parent and returns the focused value plus a `commit` function to rebuild the parent,
- `mapStream`: transforms the parent `changes` stream,
- `mapLock`: transforms the parent write lock.

Most custom focusing logic should use `map` or `mapEffect`, but `derive` is useful when you need full control over read, stream, lock, and write-back behavior.

```typescript
declare const lens: Lens.Lens<User, never, never, never, never>

const nameLens = lens.pipe(
    Lens.derive({
        resolve: parent => Effect.map(
            parent,
            resolved => ({
                value: resolved.value.name,
                commit: next => resolved.commit(
                    Effect.map(next, name => ({
                        ...resolved.value,
                        name,
                    })),
                ),
            }),
        ),

        mapStream: Stream.map(user => user.name),

        // This derived Lens does not add lock behavior, so it reuses the parent lock.
        mapLock: identity,
    }),
)
```


### Subscribable

Effect's `Subscribable` is a read-only, reactive view of a value: it lets you read the current value and observe subsequent changes. Every `Lens` implements both `Subscribable` and `Readable`, which you can use as constraints to allow some parts of your app to only read and subscribe to the Lenses you provide them:
```typescript
const ref = yield* SubscriptionRef.make<{
    readonly users: readonly User[]
}>({ users: [] })

const logUserCount = (users: Subscribable.Subscribable<readonly User[]>) =>
    Effect.gen(function*() {
        const userCount = Subscribable.focusArrayLength(users)
        yield* Console.log(`There are ${yield* userCount.get} users`)
        yield* Stream.runForEach(
            userCount.changes,
            count => Console.log(`There are now ${count} users`),
        )
    })

const usersLens = ref.pipe(
    Lens.fromSubscriptionRef,
    Lens.focusObjectOn("users"),
)
yield* Effect.forkScoped(logUserCount(usersLens))
```

#### Focusing
Subscribables can be focused in the same way as Lenses. This library re-exports Effect's `Subscribable` module and adds value and error transforms, plus recovery (`catchAll`, `catchAllCause`, `orElse`, `orElseSucceed`, and `retry`):
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
| `focusArrayLength` | Focuses to the length of an array |
| `focusTupleAt` | Focuses to an indexed entry of a tuple |
| `focusChunkAt` | Focuses to an indexed entry of a `Chunk` |
| `focusChunkSize` | Focuses to the size of a `Chunk` |
| `focusIterableSize` | Focuses to the size of an iterable |


## Todo

This library is already ready to use! However, there is always more to do...
- Provide an API reference
- Add new adapters for various data source types
- Add new focus transforms
