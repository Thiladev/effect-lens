import { Array, Chunk, Effect, Function, Option, Subscribable } from "effect"
import type { NoSuchElementException } from "effect/Cause"


export * from "effect/Subscribable"

/**
 * Maps over an `Option` value in the `Subscribable`.
 */
export const mapOption: {
    <A, B, E, R>(
        self: Subscribable.Subscribable<Option.Option<A>, E, R>,
        f: (a: A) => B,
    ): Subscribable.Subscribable<Option.Option<B>, E, R>
    <A, B>(
        f: (a: A) => B,
    ): <E, R>(self: Subscribable.Subscribable<Option.Option<A>, E, R>) => Subscribable.Subscribable<Option.Option<B>, E, R>
} = Function.dual(2, <A, B, E, R>(
    self: Subscribable.Subscribable<Option.Option<A>, E, R>,
    f: (a: A) => B,
): Subscribable.Subscribable<Option.Option<B>, E, R> => Subscribable.map(self, Option.map(f)))

/**
 * Maps over an `Option` value in the `Subscribable` with an Effect.
 */
export const mapOptionEffect: {
    <A, B, E, E2, R>(
        self: Subscribable.Subscribable<Option.Option<A>, E, R>,
        f: (a: A) => Effect.Effect<B, E2, R>,
    ): Subscribable.Subscribable<Option.Option<B>, E | E2, R>
    <A, B, E2>(
        f: (a: A) => Effect.Effect<B, E2>,
    ): <E, R>(self: Subscribable.Subscribable<Option.Option<A>, E, R>) => Subscribable.Subscribable<Option.Option<B>, E | E2, R>
} = Function.dual(2, <A, B, E, E2, R>(
    self: Subscribable.Subscribable<Option.Option<A>, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R>,
): Subscribable.Subscribable<Option.Option<B>, E | E2, R> => Subscribable.mapEffect(self, Option.match({
    onSome: a => Effect.map(f(a), Option.some),
    onNone: () => Effect.succeed(Option.none()),
})))

/**
 * Narrows the focus to a field of an object.
 */
export const focusObjectField: {
    <A extends object, K extends keyof A, E, R>(
        self: Subscribable.Subscribable<A, E, R>,
        key: K,
    ): Subscribable.Subscribable<A[K], E, R>
    <A extends object, K extends keyof A, E, R>(
        key: K,
    ): (self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A[K], E, R>
} = Function.dual(2, <A extends object, K extends keyof A, E, R>(
    self: Subscribable.Subscribable<A, E, R>,
    key: K,
): Subscribable.Subscribable<A[K], E, R> => Subscribable.map(self, a => a[key]))

/**
 * Narrows the focus to an indexed element of an array.
 */
export const focusArrayAt: {
    <A extends readonly any[], E, R>(
        self: Subscribable.Subscribable<A, E, R>,
        index: number,
    ): Subscribable.Subscribable<A[number], E, R>
    <A extends readonly any[], E, R>(
        index: number
    ): (self: Subscribable.Subscribable<A, E, R>) => Subscribable.Subscribable<A[number], E | NoSuchElementException, R>
} = Function.dual(2, <A extends readonly any[], E, R>(
    self: Subscribable.Subscribable<A, E, R>,
    index: number,
): Subscribable.Subscribable<A[number], E | NoSuchElementException, R> => Subscribable.mapEffect(self, Array.get(index)))

/**
 * Narrows the focus to an indexed element of a readonly tuple.
 */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], I extends number, E, R>(
        self: Subscribable.Subscribable<T, E, R>,
        index: I,
    ): Subscribable.Subscribable<T[I], E, R>
    <T extends readonly [any, ...any[]], I extends number, E, R>(
        index: I
    ): (self: Subscribable.Subscribable<T, E, R>) => Subscribable.Subscribable<T[I], E, R>
} = Function.dual(2, <T extends readonly [any, ...any[]], I extends number, E, R>(
    self: Subscribable.Subscribable<T, E, R>,
    index: I,
): Subscribable.Subscribable<T[I], E, R> => Subscribable.map(self, Array.unsafeGet(index)))

/**
 * Narrows the focus to an indexed element of `Chunk`.
 */
export const focusChunkAt: {
    <A, E, R>(
        self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>,
        index: number,
    ): Subscribable.Subscribable<A, E | NoSuchElementException, R>
    <A, E, R>(
        index: number
    ): (self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>) => Subscribable.Subscribable<A, E | NoSuchElementException, R>
} = Function.dual(2, <A, E, R>(
    self: Subscribable.Subscribable<Chunk.Chunk<A>, E, R>,
    index: number,
): Subscribable.Subscribable<A, E | NoSuchElementException, R> => Subscribable.mapEffect(self, Chunk.get(index)))
