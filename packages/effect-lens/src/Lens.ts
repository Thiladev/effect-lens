import { Array, Chunk, type Context, Effect, Function, identity, Option, Pipeable, Predicate, Readable, Stream, type SubscriptionRef, type SynchronizedRef } from "effect"
import type { NoSuchElementException } from "effect/Cause"
import * as Subscribable from "./Subscribable.js"


export const LensTypeId: unique symbol = Symbol.for("@effect-fc/Lens/Lens")
export type LensTypeId = typeof LensTypeId

/**
 * A bidirectional view into some shared state that exposes:
 *
 * 1. a `get` effect for reading the current value of type `A`,
 * 2. a `changes` stream that emits every subsequent update to `A`, and
 * 3. a `modify` effect that can transform the current value.
 */
export interface Lens<in out A, in out ER = never, in out EW = never, in out RR = never, in out RW = never>
extends Subscribable.Subscribable<A, ER, RR> {
    readonly [LensTypeId]: LensTypeId

    readonly modify: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
    ) => Effect.Effect<B, ER | EW | E1, RR | RW | R1>
}

/**
 * Internal `Lens` implementation.
 */
export class LensImpl<in out A, in out ER = never, in out EW = never, in out RR = never, in out RW = never>
extends Pipeable.Class() implements Lens<A, ER, EW, RR, RW> {
    readonly [Readable.TypeId]: Readable.TypeId = Readable.TypeId
    readonly [Subscribable.TypeId]: Subscribable.TypeId = Subscribable.TypeId
    readonly [LensTypeId]: LensTypeId = LensTypeId

    constructor(
        readonly get: Effect.Effect<A, ER, RR>,
        readonly changes: Stream.Stream<A, ER, RR>,
        readonly modify: <B, E1 = never, R1 = never>(
            f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
        ) => Effect.Effect<B, ER | EW | E1, RR | RW | R1>,
    ) {
        super()
    }
}


/**
 * Checks whether a value is a `Lens`.
 */
export const isLens = (u: unknown): u is Lens<unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, LensTypeId)


/**
 * Creates a `Lens` by supplying how to read the current value, observe changes, and apply transformations.
 *
 * Either `modify` or `set` needs to be supplied.
 */
export const make = <A, ER, EW, RR, RW>(
    options: {
        readonly get: Effect.Effect<A, ER, RR>
        readonly changes: Stream.Stream<A, ER, RR>
    } & (
        | {
            readonly modify: <B, E1 = never, R1 = never>(
                f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
            ) => Effect.Effect<B, ER | EW | E1, RR | RW | R1>
        }
        | { readonly set: (a: A) => Effect.Effect<void, EW, RW> }
    )
): Lens<A, ER, EW, RR, RW> => new LensImpl<A, ER, EW, RR, RW>(
    options.get,
    options.changes,
    Predicate.hasProperty(options, "modify")
        ? options.modify
        : <B, E1 = never, R1 = never>(
            f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
        ) => Effect.flatMap(
            options.get,
            a => Effect.flatMap(f(a), ([b, next]) => Effect.as(options.set(next), b)
        )),
)

/**
 * Creates a `Lens` that proxies a `SubscriptionRef`.
 */
export const fromSubscriptionRef = <A>(
    ref: SubscriptionRef.SubscriptionRef<A>
): Lens<A, never, never, never, never> => make({
    get get() { return ref.get },
    get changes() { return ref.changes },
    modify: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
    ) => ref.modifyEffect(f),
})

/**
 * Creates a `Lens` that proxies a `SynchronizedRef`.
 *
 * Note: since `SynchronizedRef` does not provide any kind of reactivity mechanism, the produced `Lens` will be non-reactive.
 * This means its `changes` stream will only emit the current value once when evaluated and nothing else.
 */
export const fromSynchronizedRef = <A>(
    ref: SynchronizedRef.SynchronizedRef<A>
): Lens<A, never, never, never, never> => make({
    get get() { return ref.get },
    get changes() { return Stream.unwrap(Effect.map(ref.get, Stream.make)) },
    modify: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
    ) => ref.modifyEffect(f),
})

/**
 * Flattens an effectful `Lens`.
 */
export const unwrap = <A, ER, EW, RR, RW, E1, R1>(
    effect: Effect.Effect<Lens<A, ER, EW, RR, RW>, E1, R1>
): Lens<A, ER | E1, EW | E1, RR | R1, RW | R1> => make({
    get: Effect.flatMap(effect, l => l.get),
    changes: Stream.unwrap(Effect.map(effect, l => l.changes)),
    modify: <B, E2 = never, R2 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E2, R2>
    ) => Effect.flatMap(effect, l => l.modify(f)),
})


/**
 * Derives a new `Lens` by applying synchronous getters and setters over the focused value.
 */
export const map: {
    <A, ER, EW, RR, RW, B>(
        self: Lens<A, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): Lens<B, ER, EW, RR, RW>
    <A, ER, EW, RR, RW, B>(
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<B, ER, EW, RR, RW>
} = Function.dual(3, <A, ER, EW, RR, RW, B>(
    self: Lens<A, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => B,
    set: (a: NoInfer<A>, b: B) => NoInfer<A>,
): Lens<B, ER, EW, RR, RW> => make({
    get get() { return Effect.map(self.get, get) },
    get changes() { return Stream.map(self.changes, get) },
    modify: <C, E1 = never, R1 = never>(
        f: (b: B) => Effect.Effect<readonly [C, B], E1, R1>
    ) => self.modify(a =>
        Effect.flatMap(f(get(a)), ([c, next]) => Effect.succeed([c, set(a, next)]))
    ),
}))

/**
 * Derives a new `Lens` by applying effectful getters and setters over the focused value.
 */
export const mapEffect: {
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        self: Lens<A, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
} = Function.dual(3, <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
    self: Lens<A, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
    set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
): Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet> => make({
    get get() { return Effect.flatMap(self.get, get) },
    get changes() { return Stream.mapEffect(self.changes, get) },
    modify: <C, E1 = never, R1 = never>(
        f: (b: B) => Effect.Effect<readonly [C, B], E1, R1>
    ) => self.modify(a => Effect.flatMap(
        get(a),
        b => Effect.flatMap(
            f(b),
            ([c, bNext]) => Effect.flatMap(
                set(a, bNext),
                nextA => Effect.succeed([c, nextA] as const),
            ),
        )
    )),
}))

/**
 * Derives a new `Lens` by applying synchronous getters and setters over the value inside an `Option`.
 *
 * Similar to `Option.map`, this preserves the `Option` structure:
 * - If the `Option` is `Some(a)`, applies the getter and setter to the inner value
 * - If the `Option` is `None`, it remains `None`
 */
export const mapOption: {
    <A, ER, EW, RR, RW, B>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): Lens<Option.Option<B>, ER, EW, RR, RW>
    <A, ER, EW, RR, RW, B>(
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): (self: Lens<Option.Option<A>, ER, EW, RR, RW>) => Lens<Option.Option<B>, ER, EW, RR, RW>
} = Function.dual(3, <A, ER, EW, RR, RW, B>(
    self: Lens<Option.Option<A>, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => B,
    set: (a: NoInfer<A>, b: B) => NoInfer<A>,
): Lens<Option.Option<B>, ER, EW, RR, RW> => map(
    self,
    Option.map(get),
    (opt, newOpt) => Option.match(opt, {
        onSome: a => Option.map(newOpt, b => set(a, b)),
        onNone: () => Option.none(),
    }),
))

/**
 * Derives a new `Lens` by applying effectful getters and setters over the value inside an `Option`.
 *
 * Similar to `Option.map`, this preserves the `Option` structure:
 * - If the `Option` is `Some(a)`, applies the effectful getter and setter to the inner value
 * - If the `Option` is `None`, it remains `None`
 */
export const mapOptionEffect: {
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): Lens<Option.Option<B>, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): (self: Lens<Option.Option<A>, ER, EW, RR, RW>) => Lens<Option.Option<B>, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
} = Function.dual(3, <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
    self: Lens<Option.Option<A>, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
    set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
): Lens<Option.Option<B>, ER | EGet, EW | ESet, RR | RGet, RW | RSet> => mapEffect(
    self,
    Option.match({
        onSome: a => Effect.map(get(a), Option.some),
        onNone: () => Effect.succeed(Option.none()),
    }),
    (opt, newOpt) => Option.match(opt, {
        onSome: a => Option.match(newOpt, {
            onSome: b => Effect.map(set(a, b), Option.some),
            onNone: () => Effect.succeed(Option.none()),
        }),
        onNone: () => Effect.succeed(Option.none()),
    }),
))

/**
 * Allows transforming only the `changes` stream of a `Lens` while keeping the focus type intact.
 */
export const mapStream: {
    <A, ER, EW, RR, RW>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
    ): Lens<A, ER, EW, RR, RW>
    <A, ER, EW, RR, RW>(
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
): Lens<A, ER, EW, RR, RW> => make({
    get get() { return self.get },
    get changes() { return f(self.changes) },
    get modify() { return self.modify },
}))

/**
 * Provides a single service to a `Lens`, removing it from both the read and write environments.
 */
export const provide: {
    <A, ER, EW, RR, RW, I, S>(
        self: Lens<A, ER, EW, RR, RW>,
        tag: Context.Tag<I, S>,
        service: NoInfer<S>,
    ): Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>>
    <I, S>(
        tag: Context.Tag<I, S>,
        service: NoInfer<S>,
    ): <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>>
} = Function.dual(3, <A, ER, EW, RR, RW, I, S>(
    self: Lens<A, ER, EW, RR, RW>,
    tag: Context.Tag<I, S>,
    service: NoInfer<S>,
): Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>> => make({
    get get() { return Effect.provideService(self.get, tag, service) },
    get changes() { return Stream.provideService(self.changes, tag, service) },
    modify: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
    ) => Effect.provideService(self.modify(f), tag, service),
}))


/**
 * Narrows the focus to a field of an object. Replaces the object in an immutable fashion when written to.
 */
export const focusObjectOn: {
    <A extends object, ER, EW, RR, RW, K extends keyof A>(
        self: Lens<A, ER, EW, RR, RW>,
        key: K,
    ): Lens<A[K], ER, EW, RR, RW>
    <A extends object, ER, EW, RR, RW, K extends keyof A>(
        key: K,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[K], ER, EW, RR, RW>
} = Function.dual(2, <A extends object, ER, EW, RR, RW, K extends keyof A>(
    self: Lens<A, ER, EW, RR, RW>,
    key: K,
): Lens<A[K], ER, EW, RR, RW> => map(
    self,
    a => a[key],
    (a, b) => Object.setPrototypeOf({ ...a, [key]: b }, Object.getPrototypeOf(a)),
))

export declare namespace focusObjectOnWritable {
    export type WritableKeys<T> = {
        [K in keyof T]-?: IfEquals<
            { [P in K]: T[K] },
            { -readonly [P in K]: T[K] },
            K,
            never
        >
    }[keyof T]

    type IfEquals<X, Y, A = X, B = never> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? A : B
}

/**
 * Narrows the focus to a writable field of an object. Mutates the object in place when written to.
 */
export const focusObjectOnWritable: {
    <A extends object, ER, EW, RR, RW, K extends focusObjectOnWritable.WritableKeys<A>>(
        self: Lens<A, ER, EW, RR, RW>,
        key: K,
    ): Lens<A[K], ER, EW, RR, RW>
    <A extends object, ER, EW, RR, RW, K extends focusObjectOnWritable.WritableKeys<A>>(
        key: K,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[K], ER, EW, RR, RW>
} = Function.dual(2, <A extends object, ER, EW, RR, RW, K extends focusObjectOnWritable.WritableKeys<A>>(
    self: Lens<A, ER, EW, RR, RW>,
    key: K,
): Lens<A[K], ER, EW, RR, RW> => map(self, a => a[key], (a, b) => { a[key] = b; return a }))

/**
 * Narrows the focus to an indexed element of an array. Replaces the array in an immutable fashion when written to.
 */
export const focusArrayAt: {
    <A extends readonly any[], ER, EW, RR, RW>(
        self: Lens<A, ER, EW, RR, RW>,
        index: number,
    ): Lens<A[number], ER | NoSuchElementException, EW | NoSuchElementException, RR, RW>
    <A extends readonly any[], ER, EW, RR, RW>(
        index: number
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[number], ER | NoSuchElementException, EW | NoSuchElementException, RR, RW>
} = Function.dual(2, <A extends readonly any[], ER, EW, RR, RW>(
    self: Lens<A, ER, EW, RR, RW>,
    index: number,
): Lens<A[number], ER | NoSuchElementException, EW | NoSuchElementException, RR, RW> => mapEffect(
    self,
    Array.get(index),
    (a, b) => Array.replaceOption(a, index, b) as any,
))

/**
 * Narrows the focus to an indexed element of a mutable array. Mutates the array in place when written to.
 */
export const focusMutableArrayAt: {
    <A, ER, EW, RR, RW>(
        self: Lens<A[], ER, EW, RR, RW>,
        index: number,
    ): Lens<A, ER | NoSuchElementException, EW | NoSuchElementException, RR, RW>
    <A, ER, EW, RR, RW>(
        index: number
    ): (self: Lens<A[], ER, EW, RR, RW>) => Lens<A, ER | NoSuchElementException, EW | NoSuchElementException, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<A[], ER, EW, RR, RW>,
    index: number,
): Lens<A, ER | NoSuchElementException, EW | NoSuchElementException, RR, RW> => mapEffect(
    self,
    Array.get(index),
    (a, b) => Effect.flatMap(
        Array.get(a, index),
        () => Effect.as(Effect.sync(() => { a[index] = b }), a),
    ),
))

/**
 * Narrows the focus to an indexed element of a readonly tuple. Replaces the tuple in an immutable fashion when written to.
 */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
        self: Lens<T, ER, EW, RR, RW>,
        index: I,
    ): Lens<T[I], ER, EW, RR, RW>
    <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
        index: I
    ): (self: Lens<T, ER, EW, RR, RW>) => Lens<T[I], ER, EW, RR, RW>
} = Function.dual(2, <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
    self: Lens<T, ER, EW, RR, RW>,
    index: I,
): Lens<T[I], ER, EW, RR, RW> => map(
    self,
    Array.unsafeGet(index),
    (a, b) => Array.replace(a, index, b) as any,
))

/**
 * Narrows the focus to an indexed element of a mutable tuple. Mutates the tuple in place when written to.
 */
export const focusMutableTupleAt: {
    <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
        self: Lens<T, ER, EW, RR, RW>,
        index: I,
    ): Lens<T[I], ER, EW, RR, RW>
    <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
        index: I
    ): (self: Lens<T, ER, EW, RR, RW>) => Lens<T[I], ER, EW, RR, RW>
} = Function.dual(2, <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
    self: Lens<T, ER, EW, RR, RW>,
    index: I,
): Lens<T[I], ER, EW, RR, RW> => map(
    self,
    Array.unsafeGet(index),
    (a, b) => { a[index] = b; return a },
))

/**
 * Narrows the focus to an indexed element of `Chunk`. Replaces the `Chunk` in an immutable fashion when written to.
 */
export const focusChunkAt: {
    <A, ER, EW, RR, RW>(
        self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>,
        index: number,
    ): Lens<A, ER | NoSuchElementException, EW, RR, RW>
    <A, ER, EW, RR, RW>(
        index: number
    ): (self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>) => Lens<A, ER | NoSuchElementException, EW, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>,
    index: number,
): Lens<A, ER | NoSuchElementException, EW, RR, RW> => mapEffect(
    self,
    Chunk.get(index),
    (a, b) => Effect.succeed(Chunk.replace(a, index, b))),
)

/**
 * Narrows the focus to the value inside an `Option`.
 *
 * Reading or writing through this lens fails with `NoSuchElementException` when the parent option is `None`.
 * Writing wraps the new focused value back into `Option.some`.
 */
export const focusOption: {
    <A, ER, EW, RR, RW>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
    ): Lens<A, ER | NoSuchElementException, EW | NoSuchElementException, RR, RW>
} = <A, ER, EW, RR, RW>(
    self: Lens<Option.Option<A>, ER, EW, RR, RW>,
): Lens<A, ER | NoSuchElementException, EW | NoSuchElementException, RR, RW> => mapEffect(
    self,
    identity,
    (a, b) => Effect.map(a, () => Option.some(b)),
)


/**
 * Reads the current value from a `Lens`.
 */
export const get = <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>): Effect.Effect<A, ER, RR> => self.get

/**
 * Sets the value of a `Lens`.
 */
export const set: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<void, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modify<void, never, never>(() => Effect.succeed([void 0, value] as const)),
)

/**
 * Sets a `Lens` to a new value and returns the previous value.
 */
export const getAndSet: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modify<A, never, never>(a => Effect.succeed([a, value] as const)),
)

/**
 * Applies a synchronous transformation to the value of a `Lens`, discarding the previous value.
 */
export const update: {
    <A, ER, EW, RR, RW>(f: (a: A) => A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A): Effect.Effect<void, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A) =>
    self.modify<void, never, never>(a => Effect.succeed([void 0, f(a)] as const)),
)

/**
 * Applies an effectful transformation to the value of a `Lens`, discarding the previous value.
 */
export const updateEffect: {
    <A, ER, EW, RR, RW, E, R>(f: (a: A) => Effect.Effect<A, E, R>): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<void, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>) =>
    self.modify<void, E, R>(a => Effect.flatMap(
        f(a),
        next => Effect.succeed([void 0, next] as const),
    )),
)

/**
 * Applies a synchronous transformation the value of a `Lens` while returning the previous value.
 */
export const getAndUpdate: {
    <A, ER, EW, RR, RW>(f: (a: A) => A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A) =>
    self.modify<A, never, never>(a => Effect.succeed([a, f(a)] as const)),
)

/**
 * Applies an effectful transformation the value of a `Lens` while returning the previous value.
 */
export const getAndUpdateEffect: {
    <A, ER, EW, RR, RW, E, R>(f: (a: A) => Effect.Effect<A, E, R>): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>) =>
    self.modify<A, E, R>(a => Effect.flatMap(
        f(a),
        next => Effect.succeed([a, next] as const)
    )),
)

/**
 * Sets the value of a `Lens` and returns the new value.
 */
export const setAndGet: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modify<A, never, never>(() => Effect.succeed([value, value] as const)),
)

/**
 * Applies a synchronous update the value of a `Lens` and returns the new value.
 */
export const updateAndGet: {
    <A, ER, EW, RR, RW>(f: (a: A) => A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A) =>
    self.modify<A, never, never>(a => {
        const next = f(a)
        return Effect.succeed([next, next] as const)
    }),
)

/**
 * Applies an effectful update to the value of a `Lens` and returns the new value.
 */
export const updateAndGetEffect: {
    <A, ER, EW, RR, RW, E, R>(f: (a: A) => Effect.Effect<A, E, R>): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>) =>
    self.modify<A, E, R>(a => Effect.flatMap(
        f(a),
        next => Effect.succeed([next, next] as const),
    )),
)
