import { Array, type Cause, Chunk, Effect, Function, Iterable, Option, Pipeable, Predicate, type Result, type Schedule, Stream } from "effect"


export const SubscribableTypeId: unique symbol = Symbol.for("@effect-fc/Lens/v4/Subscribable")
export type SubscribableTypeId = typeof SubscribableTypeId

export interface Subscribable<in out A, in out E = never, in out R = never> extends Pipeable.Pipeable {
    readonly [SubscribableTypeId]: SubscribableTypeId
    readonly get: Effect.Effect<A, E, R>
    readonly changes: Stream.Stream<A, E, R>
}

export const isSubscribable = (u: unknown): u is Subscribable<unknown, unknown, unknown> => Predicate.hasProperty(u, SubscribableTypeId)


export const SubscribableImplTypeId: unique symbol = Symbol.for("@effect-fc/Lens/v4/SubscribableImpl")
export type SubscribableImplTypeId = typeof SubscribableImplTypeId

export declare namespace SubscribableImpl {
    export interface Source<in out A, in out E = never, in out R = never> {
        readonly get: Effect.Effect<A, E, R>
        readonly changes: Stream.Stream<A, E, R>
    }
}

export class SubscribableImpl<in out A, in out E = never, in out R = never>
extends Pipeable.Class implements Subscribable<A, E, R> {
    readonly [SubscribableTypeId]: SubscribableTypeId = SubscribableTypeId
    readonly [SubscribableImplTypeId]: SubscribableImplTypeId = SubscribableImplTypeId

    constructor(
        readonly source: SubscribableImpl.Source<A, E, R>,
    ) {
        super()
    }

    get get() { return this.source.get }
    get changes() { return this.source.changes }
}

export const isSubscribableImpl = (u: unknown): u is SubscribableImpl<unknown, unknown, unknown> => Predicate.hasProperty(u, SubscribableImplTypeId)

export const asSubscribableImpl = <A, E, R>(
    subscribable: Subscribable<A, E, R>
): SubscribableImpl<A, E, R> => {
    if (!isSubscribableImpl(subscribable))
        throw new Error("Not a 'SubscribableImpl'")
    return subscribable as SubscribableImpl<A, E, R>
}

export const make = <A, E, R>(
    source: SubscribableImpl.Source<A, E, R>
): Subscribable<A, E, R> => new SubscribableImpl(source)

export const unwrap = <A, E, R, E1, R1>(
    effect: Effect.Effect<Subscribable<A, E, R>, E1, R1>,
): Subscribable<A, E | E1, R | R1> => make({
    get: Effect.flatMap(effect, self => self.get),
    changes: Stream.unwrap(Effect.map(effect, self => self.changes)),
})


export const map: {
    <A, B>(f: (a: NoInfer<A>) => B): <E, R>(self: Subscribable<A, E, R>) => Subscribable<B, E, R>
    <A, E, R, B>(self: Subscribable<A, E, R>, f: (a: NoInfer<A>) => B): Subscribable<B, E, R>
} = Function.dual(2, <A, E, R, B>(self: Subscribable<A, E, R>, f: (a: NoInfer<A>) => B) => make({
    get get() { return Effect.map(self.get, f) },
    get changes() { return Stream.map(self.changes, f) },
}))

export const mapEffect: {
    <A, B, E2, R2>(f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>): <E, R>(self: Subscribable<A, E, R>) => Subscribable<B, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>): Subscribable<B, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.flatMap(self.get, f) },
    get changes() { return Stream.mapEffect(self.changes, f) },
}))

/** Maps over an `Option` value in the `Subscribable`. */
export const mapOption: {
    <A, B>(f: (a: A) => B): <E, R>(self: Subscribable<Option.Option<A>, E, R>) => Subscribable<Option.Option<B>, E, R>
    <A, B, E, R>(self: Subscribable<Option.Option<A>, E, R>, f: (a: A) => B): Subscribable<Option.Option<B>, E, R>
} = Function.dual(2, <A, B, E, R>(self: Subscribable<Option.Option<A>, E, R>, f: (a: A) => B) =>
    map(self, Option.map(f)),
)

/** Maps over an `Option` value in the `Subscribable` with an Effect. */
export const mapOptionEffect: {
    <A, B, E2, R2>(f: (a: A) => Effect.Effect<B, E2, R2>): <E, R>(self: Subscribable<Option.Option<A>, E, R>) => Subscribable<Option.Option<B>, E | E2, R | R2>
    <A, B, E, R, E2, R2>(self: Subscribable<Option.Option<A>, E, R>, f: (a: A) => Effect.Effect<B, E2, R2>): Subscribable<Option.Option<B>, E | E2, R | R2>
} = Function.dual(2, <A, B, E, R, E2, R2>(
    self: Subscribable<Option.Option<A>, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>,
) => mapEffect(self, Option.match({
    onSome: a => Effect.map(f(a), Option.some),
    onNone: () => Effect.succeed(Option.none()),
})))


/** Maps errors from both the current value and the stream of changes. */
export const mapError: {
    <E, E2>(f: (error: NoInfer<E>) => E2): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A, E2, R>
    <A, E, R, E2>(self: Subscribable<A, E, R>, f: (error: NoInfer<E>) => E2): Subscribable<A, E2, R>
} = Function.dual(2, <A, E, R, E2>(
    self: Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => E2,
) => make({
    get get() { return Effect.mapError(self.get, f) },
    get changes() { return Stream.mapError(self.changes, f) },
}))

/** Runs an effect when either the current value or the stream of changes fails. */
export const tapError: {
    <E, B, E2, R2>(f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>): Subscribable<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.tapError(self.get, f) },
    get changes() { return Stream.tapError(self.changes, f) },
}))

const catch_: {
    <E, B, E2, R2>(f: (error: NoInfer<E>) => Subscribable<B, E2, R2>): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, f: (error: NoInfer<E>) => Subscribable<B, E2, R2>): Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => Subscribable<B, E2, R2>,
) => make({
    get get() { return Effect.catch(self.get, error => f(error).get) },
    get changes() { return Stream.catch(self.changes, error => f(error).changes) },
}))

/** Recovers from typed errors with another `Subscribable`. */
export { catch_ as catch }

/** Recovers from all failure causes with another `Subscribable`. */
export const catchCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable<B, E2, R2>): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable<B, E2, R2>): Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable<B, E2, R2>,
) => make({
    get get() { return Effect.catchCause(self.get, cause => f(cause).get) },
    get changes() { return Stream.catchCause(self.changes, cause => f(cause).changes) },
}))

/** Runs an effect when either channel fails, exposing the complete failure cause. */
export const tapCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): Subscribable<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.tapCause(self.get, f) },
    get changes() { return Stream.tapCause(self.changes, f) },
}))

/** Falls back to another `Subscribable` when either channel fails. */
export const orElse: {
    <B, E2, R2>(that: () => Subscribable<B, E2, R2>): <A, E, R>(self: Subscribable<A, E, R>) => Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable<A, E, R>, that: () => Subscribable<B, E2, R2>): Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable<A, E, R>,
    that: () => Subscribable<B, E2, R2>,
) => catch_(self, that))

/** Replaces typed errors from either channel with a lazily evaluated value. */
export const orElseSucceed: {
    <B>(value: () => B): <A, E, R>(self: Subscribable<A, E, R>) => Subscribable<A | B, never, R>
    <A, E, R, B>(self: Subscribable<A, E, R>, value: () => B): Subscribable<A | B, never, R>
} = Function.dual(2, <A, E, R, B>(self: Subscribable<A, E, R>, value: () => B) => make({
    get get() { return Effect.orElseSucceed(self.get, value) },
    get changes() { return Stream.orElseSucceed(self.changes, value) },
}))

/** Retries failures from both channels according to the supplied schedule. */
export const retry: {
    <E, X, E2, R2>(policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>): <A, R>(self: Subscribable<A, E, R>) => Subscribable<A, E | E2, R | R2>
    <A, E, R, X, E2, R2>(self: Subscribable<A, E, R>, policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>): Subscribable<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, X, E2, R2>(
    self: Subscribable<A, E, R>,
    policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>,
) => make({
    get get() { return Effect.retry(self.get, policy) },
    get changes() { return Stream.retry(self.changes, policy) },
}))

/** Converts typed failures from both channels into `Result` values. */
export const result = <A, E, R>(
    self: Subscribable<A, E, R>,
): Subscribable<Result.Result<A, E>, never, R> => make({
    get get() { return Effect.result(self.get) },
    get changes() { return Stream.result(self.changes) },
})


/** Narrows the focus to a field of an object. */
export const focusObjectOn: {
    <A extends object, K extends keyof A>(key: K): <E, R>(self: Subscribable<A, E, R>) => Subscribable<A[K], E, R>
    <A extends object, K extends keyof A, E, R>(self: Subscribable<A, E, R>, key: K): Subscribable<A[K], E, R>
} = Function.dual(2, <A extends object, K extends keyof A, E, R>(self: Subscribable<A, E, R>, key: K) =>
    map(self, a => a[key]),
)

/** Narrows the focus to an indexed element of an array. */
export const focusArrayAt: {
    <A extends readonly any[]>(index: number): <E, R>(self: Subscribable<A, E, R>) => Subscribable<A[number], E | Cause.NoSuchElementError, R>
    <A extends readonly any[], E, R>(self: Subscribable<A, E, R>, index: number): Subscribable<A[number], E | Cause.NoSuchElementError, R>
} = Function.dual(2, <A extends readonly any[], E, R>(self: Subscribable<A, E, R>, index: number) =>
    mapEffect(self, a => Effect.fromOption(Array.get(a, index))),
)

export const focusArrayLength = <A extends readonly any[], E, R>(
    self: Subscribable<A, E, R>,
): Subscribable<number, E, R> => map(self, Array.length)

/** Narrows the focus to an indexed element of a readonly tuple. */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], I extends number>(index: I): <E, R>(self: Subscribable<T, E, R>) => Subscribable<T[I], E, R>
    <T extends readonly [any, ...any[]], I extends number, E, R>(self: Subscribable<T, E, R>, index: I): Subscribable<T[I], E, R>
} = Function.dual(2, <T extends readonly [any, ...any[]], I extends number, E, R>(self: Subscribable<T, E, R>, index: I) =>
    map(self, Array.getUnsafe(index)),
)

/** Narrows the focus to an indexed element of `Chunk`. */
export const focusChunkAt: {
    <A>(index: number): <E, R>(self: Subscribable<Chunk.Chunk<A>, E, R>) => Subscribable<A, E | Cause.NoSuchElementError, R>
    <A, E, R>(self: Subscribable<Chunk.Chunk<A>, E, R>, index: number): Subscribable<A, E | Cause.NoSuchElementError, R>
} = Function.dual(2, <A, E, R>(self: Subscribable<Chunk.Chunk<A>, E, R>, index: number) =>
    mapEffect(self, chunk => Effect.fromOption(Chunk.get(chunk, index))),
)

export const focusChunkSize = <A, E, R>(
    self: Subscribable<Chunk.Chunk<A>, E, R>,
): Subscribable<number, E, R> => map(self, Chunk.size)

export const focusIterableSize = <A extends Iterable<any>, E, R>(
    self: Subscribable<A, E, R>,
): Subscribable<number, E, R> => map(self, Iterable.size)
