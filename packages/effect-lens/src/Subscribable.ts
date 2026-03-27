import { Array, Chunk, Function, Subscribable } from "effect"
import type { NoSuchElementException } from "effect/Cause"


export * from "effect/Subscribable"

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
