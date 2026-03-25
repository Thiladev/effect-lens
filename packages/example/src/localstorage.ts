import { KeyValueStore } from "@effect/platform"
import { BrowserKeyValueStore, BrowserStream } from "@effect/platform-browser"
import { Effect, Option, Stream } from "effect"
import { Lens } from "effect-lens"


Effect.gen(function*() {
    // \/ Lens<Option.Option<string>, PlatformError, PlatformError, never, never>
    Effect.all([
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
})
