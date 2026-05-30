// import { KeyValueStore } from "@effect/platform"
// import { BrowserKeyValueStore, BrowserStream } from "@effect/platform-browser"
// import { Effect, Option, Stream } from "effect"
// import { Lens } from "effect-lens"


// Effect.gen(function*() {
//     // \/ Lens<Option.Option<string>, PlatformError, PlatformError, never, never>
//     const lens = Effect.all([
//         KeyValueStore.KeyValueStore,
//         Effect.succeed("someKey"),
//         Effect.makeSemaphore(1),
//     ]).pipe(
//         Effect.map(([kv, key, semaphore]) => Lens.make({
//             get: kv.get(key),

//             changes: kv.get(key).pipe(
//                 Effect.map(Stream.make),
//                 Effect.map(a => Stream.concat(
//                     a,
//                     BrowserStream.fromEventListenerWindow("storage").pipe(
//                         Stream.filter(event => event.key === key),
//                         Stream.map(event => Option.fromNullable(event.newValue)),
//                     ),
//                 )),
//                 Stream.unwrap,
//             ),

//             commit: a => Option.isSome(a)
//                 ? kv.set(key, a.value)
//                 : kv.remove(key),

//             lock: Effect.succeed(semaphore.withPermits(1)),
//         })),

//         Effect.provide(BrowserKeyValueStore.layerLocalStorage),
//         Lens.unwrap,
//     )

//     console.log(yield* Lens.get(lens))
// })
