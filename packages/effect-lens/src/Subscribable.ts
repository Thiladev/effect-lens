import { Array, type Cause, Chunk, Effect, type Either, Function, Iterable, Option, type Schedule, Stream, Subscribable } from "effect"
import type { NoSuchElementException } from "effect/Cause"


export * from "effect/Subscribable"


/**
 * Maps over an `Option` value in the `Subscribable`.
 */
export const mapOption: {
    <A, B>(
        f: (a: A) => B,
    ): <E, R>(self: Subscribable.Subscribable<Option.Option<A>, E, R>) => Subscribable.Subscribable<Option.Option<B>, E, R>
    <A, B, E, R>(
        self: Subscribable.Subscribable<Option.Option<A>, E, R>,
        f: (a: A) => B,
    ): Subscribable.Subscribable<Option.Option<B>, E, R>
} = Function.dual(2, <A, B, E, R>(
    self: Subscribable.Subscribable<Option.Option<A>, E, R>,
    f: (a: A) => B,
): Subscribable.Subscribable<Option.Option<B>, E, R> => Subscribable.map(self, Option.map(f)))

/**
 * Maps over an `Option` value in the `Subscribable` with an Effect.
 */
export const mapOptionEffect: {
    <A, B, E2>(
        f: (a: A) => Effect.Effect<B, E2>,
    ): <E, R>(self: Subscribable.Subscribable<Option.Option<A>, E, R>) => Subscribable.Subscribable<Option.Option<B>, E | E2, R>
    <A, B, E, E2, R>(
        self: Subscribable.Subscribable<Option.Option<A>, E, R>,
        f: (a: A) => Effect.Effect<B, E2, R>,
    ): Subscribable.Subscribable<Option.Option<B>, E | E2, R>
} = Function.dual(2, <A, B, E, E2, R>(
    self: Subscribable.Subscribable<Option.Option<A>, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R>,
): Subscribable.Subscribable<Option.Option<B>, E | E2, R> => Subscribable.mapEffect(self, Option.match({
    onSome: a => Effect.map(f(a), Option.some),
    onNone: () => Effect.succeed(Option.none()),
})))


/**
 * Maps errors from both the current value and the stream of changes.
 */
export const mapError: {
    <E, E2>(
        f: (error: NoInfer<E>) => E2,
    ): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A, E2, R>
    <A, E, R, E2>(
        self: Subscribable.Subscribable<A, E, R>,
        f: (error: NoInfer<E>) => E2,
    ): Subscribable.Subscribable<A, E2, R>
} = Function.dual(2, <A, E, R, E2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => E2,
): Subscribable.Subscribable<A, E2, R> => Subscribable.make({
    get get() { return Effect.mapError(self.get, f) },
    get changes() { return Stream.mapError(self.changes, f) },
}))

/** Maps complete failure causes from both channels. */
export const mapErrorCause: {
    <E, E2>(f: (cause: Cause.Cause<NoInfer<E>>) => Cause.Cause<E2>): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A, E2, R>
    <A, E, R, E2>(self: Subscribable.Subscribable<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Cause.Cause<E2>): Subscribable.Subscribable<A, E2, R>
} = Function.dual(2, <A, E, R, E2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Cause.Cause<E2>,
): Subscribable.Subscribable<A, E2, R> => Subscribable.make({
    get get() { return Effect.mapErrorCause(self.get, f) },
    get changes() { return Stream.mapErrorCause(self.changes, f) },
}))

/**
 * Runs an effect when either the current value or the stream of changes fails.
 */
export const tapError: {
    <E, B, E2, R2>(
        f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>,
    ): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(
        self: Subscribable.Subscribable<A, E, R>,
        f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>,
    ): Subscribable.Subscribable<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>,
): Subscribable.Subscribable<A, E | E2, R | R2> => Subscribable.make({
    get get() { return Effect.tapError(self.get, f) },
    get changes() { return Stream.tapError(self.changes, f) },
}))

/** Recovers from typed errors with another `Subscribable`. */
export const catchAll: {
    <E, B, E2, R2>(f: (error: NoInfer<E>) => Subscribable.Subscribable<B, E2, R2>): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable.Subscribable<A, E, R>, f: (error: NoInfer<E>) => Subscribable.Subscribable<B, E2, R2>): Subscribable.Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (error: NoInfer<E>) => Subscribable.Subscribable<B, E2, R2>,
): Subscribable.Subscribable<A | B, E2, R | R2> => Subscribable.make({
    get get() { return Effect.catchAll(self.get, error => f(error).get) },
    get changes() { return Stream.catchAll(self.changes, error => f(error).changes) },
}))

/** Recovers from all failure causes with another `Subscribable`. */
export const catchAllCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable.Subscribable<B, E2, R2>): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable.Subscribable<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable.Subscribable<B, E2, R2>): Subscribable.Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Subscribable.Subscribable<B, E2, R2>,
): Subscribable.Subscribable<A | B, E2, R | R2> => Subscribable.make({
    get get() { return Effect.catchAllCause(self.get, cause => f(cause).get) },
    get changes() { return Stream.catchAllCause(self.changes, cause => f(cause).changes) },
}))

/** Runs an effect when either channel fails, exposing the complete failure cause. */
export const tapErrorCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable.Subscribable<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): Subscribable.Subscribable<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>,
): Subscribable.Subscribable<A, E | E2, R | R2> => Subscribable.make({
    get get() { return Effect.tapErrorCause(self.get, f) },
    get changes() { return Stream.tapErrorCause(self.changes, f) },
}))

/** Falls back to another `Subscribable` when either channel fails. */
export const orElse: {
    <B, E2, R2>(that: () => Subscribable.Subscribable<B, E2, R2>): <A, E, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: Subscribable.Subscribable<A, E, R>, that: () => Subscribable.Subscribable<B, E2, R2>): Subscribable.Subscribable<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    that: () => Subscribable.Subscribable<B, E2, R2>,
): Subscribable.Subscribable<A | B, E2, R | R2> => catchAll(self, that))

/** Replaces typed errors from either channel with a lazily evaluated value. */
export const orElseSucceed: {
    <B>(value: () => B): <A, E, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A | B, never, R>
    <A, E, R, B>(self: Subscribable.Subscribable<A, E, R>, value: () => B): Subscribable.Subscribable<A | B, never, R>
} = Function.dual(2, <A, E, R, B>(
    self: Subscribable.Subscribable<A, E, R>,
    value: () => B,
): Subscribable.Subscribable<A | B, never, R> => Subscribable.make({
    get get() { return Effect.orElseSucceed(self.get, value) },
    get changes() { return Stream.orElseSucceed(self.changes, value) },
}))

/** Retries failures from both channels according to the supplied schedule. */
export const retry: {
    <E, X, R2>(policy: Schedule.Schedule<X, NoInfer<E>, R2>): <A, R>(self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A, E, R | R2>
    <A, E, R, X, R2>(self: Subscribable.Subscribable<A, E, R>, policy: Schedule.Schedule<X, NoInfer<E>, R2>): Subscribable.Subscribable<A, E, R | R2>
} = Function.dual(2, <A, E, R, X, R2>(
    self: Subscribable.Subscribable<A, E, R>,
    policy: Schedule.Schedule<X, NoInfer<E>, R2>,
): Subscribable.Subscribable<A, E, R | R2> => Subscribable.make({
    get get() { return Effect.retry(self.get, policy) },
    get changes() { return Stream.retry(self.changes, policy) },
}))

/** Converts typed failures from both channels into `Either` values. */
export const either = <A, E, R>(
    self: Subscribable.Subscribable<A, E, R>,
): Subscribable.Subscribable<Either.Either<A, E>, never, R> => Subscribable.make({
    get get() { return Effect.either(self.get) },
    get changes() { return Stream.either(self.changes) },
})


/**
 * Narrows the focus to a field of an object.
 */
export const focusObjectOn: {
    <A extends object, K extends keyof A, E, R>(
        key: K,
    ): (self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A[K], E, R>
    <A extends object, K extends keyof A, E, R>(
        self: Subscribable.Subscribable<A, E, R>,
        key: K,
    ): Subscribable.Subscribable<A[K], E, R>
} = Function.dual(2, <A extends object, K extends keyof A, E, R>(
    self: Subscribable.Subscribable<A, E, R>,
    key: K,
): Subscribable.Subscribable<A[K], E, R> => Subscribable.map(self, a => a[key]))

/**
 * Narrows the focus to an indexed element of an array.
 */
export const focusArrayAt: {
    <A extends readonly any[], E, R>(
        index: number
    ): (self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A[number], E | NoSuchElementException, R>
    <A extends readonly any[], E, R>(
        self: Subscribable.Subscribable<A, E, R>,
        index: number,
    ): Subscribable.Subscribable<A[number], E, R>
} = Function.dual(2, <A extends readonly any[], E, R>(
    self: Subscribable.Subscribable<A, E, R>,
    index: number,
): Subscribable.Subscribable<A[number], E | NoSuchElementException, R> => Subscribable.mapEffect(self, Array.get(index)))

/**
 * Narrows the focus to the length of an array.
 */
export const focusArrayLength = <A extends readonly any[], E, R>(
    self: Subscribable.Subscribable<A, E, R>,
): Subscribable.Subscribable<number, E, R> => Subscribable.map(self, Array.length)

/**
 * Narrows the focus to an indexed element of a readonly tuple.
 */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], I extends number, E, R>(
        index: I
    ): (self: Subscribable.Subscribable<T, E, R>) => Subscribable.Subscribable<T[I], E, R>
    <T extends readonly [any, ...any[]], I extends number, E, R>(
        self: Subscribable.Subscribable<T, E, R>,
        index: I,
    ): Subscribable.Subscribable<T[I], E, R>
} = Function.dual(2, <T extends readonly [any, ...any[]], I extends number, E, R>(
    self: Subscribable.Subscribable<T, E, R>,
    index: I,
): Subscribable.Subscribable<T[I], E, R> => Subscribable.map(self, Array.unsafeGet(index)))

/**
 * Narrows the focus to an indexed element of `Chunk`.
 */
export const focusChunkAt: {
    <A, E, R>(
        index: number
    ): (self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>) => Subscribable.Subscribable<A, E | NoSuchElementException, R>
    <A, E, R>(
        self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>,
        index: number,
    ): Subscribable.Subscribable<A, E | NoSuchElementException, R>
} = Function.dual(2, <A, E, R>(
    self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>,
    index: number,
): Subscribable.Subscribable<A, E | NoSuchElementException, R> => Subscribable.mapEffect(self, Chunk.get(index)))

/**
 * Narrows the focus to the size of a `Chunk`.
 */
export const focusChunkSize = <A, E, R>(
    self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>,
): Subscribable.Subscribable<number, E, R> => Subscribable.map(self, Chunk.size)

/**
 * Narrows the focus to the size of a `Iterable`.
 */
export const focusIterableSize = <A, E, R>(
    self: Subscribable.Subscribable<Iterable<A>, E, R>,
): Subscribable.Subscribable<number, E, R> => Subscribable.map(self, Iterable.size)
