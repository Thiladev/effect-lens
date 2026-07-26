import { Array, type Cause, Chunk, type Context, Effect, Function, identity, Option, Pipeable, Predicate, PubSub, Ref, Semaphore, Stream, SubscriptionRef, SynchronizedRef } from "effect"
import * as View from "./View.js"


export const LensTypeId: unique symbol = Symbol.for("@effect-lens/Lens/Lens")
export type LensTypeId = typeof LensTypeId

/**
 * A bidirectional view into some shared state that exposes:
 *
 * 1. a `get` effect for reading the current value of type `A`,
 * 2. a `changes` stream that emits every subsequent update to `A`, and
 * 3. a `modify` effect that can transform the current value.
 */
export interface Lens<in out A, out ER = never, out EW = never, out RR = never, out RW = never>
extends View.View<A, ER, RR> {
    readonly [LensTypeId]: LensTypeId

    readonly modifyEffect: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>
    ) => Effect.Effect<B, ER | EW | E1, RR | RW | R1>

    readonly modifySomeEffect: <B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E1, R1>
    ) => Effect.Effect<B, ER | EW | E1, RR | RW | R1>
}

/**
 * Checks whether a value is a `Lens`.
 */
export const isLens = (u: unknown): u is Lens<unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, LensTypeId)


export const LensImplTypeId: unique symbol = Symbol.for("@effect-lens/Lens/LensImpl")
export type LensImplTypeId = typeof LensImplTypeId

export declare namespace LensImpl {
    export interface Resolved<in out A, out EW = never, out RW = never> {
        readonly value: A
        readonly commit: <E = never, R = never>(
            next: Effect.Effect<A, E, R>
        ) => Effect.Effect<void, EW | E, RW | R>
    }

    export interface Lock {
        <A1, E1, R1>(self: Effect.Effect<A1, E1, R1>): Effect.Effect<A1, E1, R1>
    }
}

export abstract class LensImpl<in out A, out ER = never, out EW = never, out RR = never, out RW = never>
extends Pipeable.Class implements Lens<A, ER, EW, RR, RW> {
    readonly [View.ViewTypeId]: View.ViewTypeId = View.ViewTypeId
    readonly [LensTypeId]: LensTypeId = LensTypeId
    readonly [LensImplTypeId]: LensImplTypeId = LensImplTypeId

    abstract readonly resolve: Effect.Effect<LensImpl.Resolved<A, EW, RW>, ER, RR>
    abstract readonly changes: Stream.Stream<A, ER, RR>
    abstract readonly lock: Effect.Effect<LensImpl.Lock, EW, RW>

    get get() { return Effect.map(this.resolve, resolved => resolved.value) }

    modifyEffect<B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, A], E1, R1>,
    ): Effect.Effect<B, ER | EW | E1, RR | RW | R1> {
        return Effect.flatMap(
            this.lock,
            lock => lock(Effect.flatMap(
                this.resolve,
                resolved => Effect.flatMap(
                    f(resolved.value),
                    ([c, next]) => Effect.as(resolved.commit(Effect.succeed(next)), c),
                ),
            )),
        )
    }

    modifySomeEffect<B, E1 = never, R1 = never>(
        f: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E1, R1>,
    ): Effect.Effect<B, ER | EW | E1, RR | RW | R1> {
        return Effect.flatMap(
            this.lock,
            lock => lock(Effect.flatMap(
                this.resolve,
                resolved => Effect.flatMap(
                    f(resolved.value),
                    ([result, next]) => Option.match(next, {
                        onSome: value => Effect.as(resolved.commit(Effect.succeed(value)), result),
                        onNone: () => Effect.succeed(result),
                    }),
                ),
            )),
        )
    }
}

export const isLensImpl = (u: unknown): u is LensImpl<unknown, unknown, unknown, unknown, unknown> => Predicate.hasProperty(u, LensImplTypeId)

export const asLensImpl = <A, ER, EW, RR, RW>(
    lens: Lens<A, ER, EW, RR, RW>
): LensImpl<A, ER, EW, RR, RW> => {
    if (!isLensImpl(lens))
        throw new Error("Not a 'LensImpl'")
    return lens as LensImpl<A, ER, EW, RR, RW>
}

export const asView = <A, ER, EW, RR, RW>(
    lens: Lens<A, ER, EW, RR, RW>
): View.View<A, ER, RR> => lens


export declare namespace LensLazyImpl {
    export interface Source<in out A, out ER = never, out EW = never, out RR = never, out RW = never> {
        readonly get: Effect.Effect<A, ER, RR>
        readonly changes: Stream.Stream<A, ER, RR>
        readonly commit: (a: A) => Effect.Effect<void, EW, RW>
        readonly lock: Effect.Effect<LensImpl.Lock, EW, RW>
    }
}

export class LensLazyImpl<in out A, out ER = never, out EW = never, out RR = never, out RW = never>
extends LensImpl<A, ER, EW, RR, RW> {
    constructor(
        readonly source: LensLazyImpl.Source<A, ER, EW, RR, RW>,
    ) {
        super()
    }

    get resolve(): Effect.Effect<LensImpl.Resolved<A, EW, RW>, ER, RR> {
        return Effect.map(
            this.source.get,
            value => ({
                value,
                commit: next => Effect.flatMap(next, value => this.source.commit(value)),
            }),
        )
    }
    get changes() { return this.source.changes }
    get lock() { return this.source.lock }
}

/**
 * Creates a `Lens` by supplying how to read the current value, observe changes, and apply transformations.
 */
export const make = <A, ER, EW, RR, RW>(
    source: LensLazyImpl.Source<A, ER, EW, RR, RW>
): Lens<A, ER, EW, RR, RW> => new LensLazyImpl(source)


export class UnwrappedLensImpl<in out A, out ER, out EW, out RR, out RW, out E1, out R1>
extends LensImpl<A, ER | E1, EW | E1, RR | R1, RW | R1> {
    constructor(
        readonly effect: Effect.Effect<Lens<A, ER, EW, RR, RW>, E1, R1>
    ) {
        super()
    }

    get resolve(): Effect.Effect<LensImpl.Resolved<A, EW | E1, RW | R1>, ER | E1, RR | R1> {
        return Effect.map(
            Effect.flatMap(this.effect, l => asLensImpl(l).resolve),
            resolved => ({
                value: resolved.value,
                commit: next => resolved.commit(next),
            }),
        )
    }
    get changes() { return Stream.unwrap(Effect.map(this.effect, l => l.changes)) }
    get lock() { return Effect.flatMap(this.effect, l => asLensImpl(l).lock) }
}

/**
 * Flattens an effectful `Lens`.
 */
export const unwrap = <A, ER, EW, RR, RW, E1, R1>(
    effect: Effect.Effect<Lens<A, ER, EW, RR, RW>, E1, R1>
): Lens<A, ER | E1, EW | E1, RR | R1, RW | R1> => new UnwrappedLensImpl(effect)


export class RefLensImpl<in out A>
extends LensImpl<A, never, never, never, never> {
    constructor(
        readonly ref: Ref.Ref<A>,
        readonly semaphore: Semaphore.Semaphore,
    ) {
        super()
    }

    get resolve(): Effect.Effect<LensImpl.Resolved<A>, never, never> {
        return Effect.map(
            Ref.get(this.ref),
            value => ({
                value,
                commit: next => Effect.flatMap(
                    next,
                    value => Ref.set(this.ref, value),
                ),
            }),
        )
    }
    get changes() { return Stream.unwrap(Effect.map(Ref.get(this.ref), Stream.make)) }
    get lock() { return Effect.succeed(this.semaphore.withPermit) }
}

/**
 * Creates a `Lens` that proxies a `Ref`.
 *
 * Note: since `Ref` does not provide any kind of reactivity mechanism, the produced `Lens` will be non-reactive.
 * This means its `changes` stream will only emit the current value once when evaluated and nothing else.
 */
export const fromRef = <A>(
    ref: Ref.Ref<A>
): Effect.Effect<Lens<A, never, never, never, never>, never, never> => Effect.map(
    Semaphore.make(1),
    semaphore => new RefLensImpl(ref, semaphore),
)


export class SynchronizedRefLensImpl<in out A>
extends LensImpl<A, never, never, never, never> {
    constructor(
        readonly ref: SynchronizedRef.SynchronizedRef<A>
    ) {
        super()
    }

    get resolve(): Effect.Effect<LensImpl.Resolved<A>, never, never> {
        return Effect.map(
            SynchronizedRef.get(this.ref),
            value => ({
                value,
                commit: next => Effect.flatMap(
                    next,
                    value => Ref.set(this.ref.backing, value),
                ),
            }),
        )
    }
    get changes() { return Stream.unwrap(Effect.map(SynchronizedRef.get(this.ref), Stream.make)) }
    get lock() { return Effect.succeed(this.ref.semaphore.withPermit) }
}

/**
 * Creates a `Lens` that proxies a `SynchronizedRef`.
 *
 * Note: since `SynchronizedRef` does not provide any kind of reactivity mechanism, the produced `Lens` will be non-reactive.
 * This means its `changes` stream will only emit the current value once when evaluated and nothing else.
 */
export const fromSynchronizedRef = <A>(
    ref: SynchronizedRef.SynchronizedRef<A>
): Lens<A, never, never, never, never> => new SynchronizedRefLensImpl(ref)


export class SubscriptionRefLensImpl<in out A>
extends LensImpl<A, never, never, never, never> {
    constructor(
        readonly ref: SubscriptionRef.SubscriptionRef<A>
    ) {
        super()
    }

    get resolve(): Effect.Effect<LensImpl.Resolved<A>, never, never> {
        return Effect.map(
            SubscriptionRef.get(this.ref),
            value => ({
                value,
                commit: next => Effect.flatMap(
                    next,
                    value => Effect.sync(() => {
                        this.ref.value = value
                        PubSub.publishUnsafe(this.ref.pubsub, value)
                    }),
                ),
            }),
        )
    }
    get changes() { return SubscriptionRef.changes(this.ref) }
    get lock() { return Effect.succeed(this.ref.semaphore.withPermit) }
}

/**
 * Creates a `Lens` that proxies a `SubscriptionRef`.
 */
export const fromSubscriptionRef = <A>(
    ref: SubscriptionRef.SubscriptionRef<A>
): Lens<A, never, never, never, never> => new SubscriptionRefLensImpl(ref)


export declare namespace DerivedLensImpl {
    export interface Source<
        in out A,
        in out B,
        in out ER = never,
        in out ESR = never,
        in out EW = never,
        in out ESW = never,
        in out RR = never,
        in out RSR = never,
        in out RW = never,
        in out RSW = never,
    > {
        readonly resolve: (effect: Effect.Effect<LensImpl.Resolved<B, ESW, RSW>, ESR, RSR>) => Effect.Effect<LensImpl.Resolved<A, EW, RW>, ER, RR>
        readonly mapStream: (stream: Stream.Stream<B, ESR, RSR>) => Stream.Stream<A, ER, RR>
        readonly mapLock: (lock: Effect.Effect<LensImpl.Lock, ESW, RSW>) => Effect.Effect<LensImpl.Lock, EW, RW>
    }
}

export class DerivedLensImpl<
    in out A,
    in out B,
    in out ER = never,
    in out PER = never,
    in out EW = never,
    in out PEW = never,
    in out RR = never,
    in out PRR = never,
    in out RW = never,
    in out PRW = never,
>
extends LensImpl<A, ER, EW, RR, RW> {
    constructor(
        readonly parent: LensImpl<B, PER, PEW, PRR, PRW>,
        readonly source: DerivedLensImpl.Source<A, B, ER, PER, EW, PEW, RR, PRR, RW, PRW>,
    ) {
        super()
    }

    get resolve() { return this.source.resolve(this.parent.resolve) }
    get changes() { return this.source.mapStream(this.parent.changes) }
    get lock() { return this.source.mapLock(this.parent.lock) }
}

/**
 * Derives a new `Lens` by linking a step to an existing parent lens.
 */
export const derive: {
    <A, B, ER, EW, RR, RW, ER2, EW2, RR2, RW2>(
        source: DerivedLensImpl.Source<A, B, ER2, ER, EW2, EW, RR2, RR, RW2, RW>,
    ): (self: Lens<B, ER, EW, RR, RW>) => Lens<A, ER2, EW2, RR2, RW2>
    <A, B, ER, EW, RR, RW, ER2, EW2, RR2, RW2>(
        self: Lens<B, ER, EW, RR, RW>,
        source: DerivedLensImpl.Source<A, B, ER2, ER, EW2, EW, RR2, RR, RW2, RW>,
    ): Lens<A, ER2, EW2, RR2, RW2>
} = Function.dual(2, <A, B, ER, EW, RR, RW, ER2, EW2, RR2, RW2>(
    self: Lens<B, ER, EW, RR, RW>,
    source: DerivedLensImpl.Source<A, B, ER2, ER, EW2, EW, RR2, RR, RW2, RW>,
): Lens<A, ER2, EW2, RR2, RW2> => new DerivedLensImpl(asLensImpl(self), source))


/**
 * Derives a new `Lens` by applying synchronous getters and setters over the focused value.
 */
export const map: {
    <A, ER, EW, RR, RW, B>(
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<B, ER, EW, RR, RW>
    <A, ER, EW, RR, RW, B>(
        self: Lens<A, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): Lens<B, ER, EW, RR, RW>
} = Function.dual(3, <A, ER, EW, RR, RW, B>(
    self: Lens<A, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => B,
    set: (a: NoInfer<A>, b: B) => NoInfer<A>,
): Lens<B, ER, EW, RR, RW> => derive(self, {
    resolve: parent => Effect.map(
        parent,
        resolved => ({
            value: get(resolved.value),
            commit: next => resolved.commit(Effect.map(next, b => set(resolved.value, b))),
        }),
    ),
    mapStream: Stream.map(get),
    mapLock: identity,
}))

/**
 * Derives a new `Lens` by applying effectful getters and setters over the focused value.
 */
export const mapEffect: {
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        self: Lens<A, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
} = Function.dual(3, <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
    self: Lens<A, ER, EW, RR, RW>,
    get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
    set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
): Lens<B, ER | EGet, EW | ESet, RR | RGet, RW | RSet> => derive(self, {
    resolve: parent => Effect.flatMap(
        parent,
        resolved => Effect.map(
            get(resolved.value),
            value => ({
                value,
                commit: next => resolved.commit(Effect.flatMap(next, b => set(resolved.value, b))),
            }),
        ),
    ),
    mapStream: Stream.mapEffect(get),
    mapLock: identity<Effect.Effect<LensImpl.Lock, EW | ESet, RW | RSet>>,
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
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): (self: Lens<Option.Option<A>, ER, EW, RR, RW>) => Lens<Option.Option<B>, ER, EW, RR, RW>
    <A, ER, EW, RR, RW, B>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => B,
        set: (a: NoInfer<A>, b: B) => NoInfer<A>,
    ): Lens<Option.Option<B>, ER, EW, RR, RW>
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
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): (self: Lens<Option.Option<A>, ER, EW, RR, RW>) => Lens<Option.Option<B>, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
    <A, ER, EW, RR, RW, B, EGet = never, RGet = never, ESet = never, RSet = never>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
        get: (a: NoInfer<A>) => Effect.Effect<B, EGet, RGet>,
        set: (a: NoInfer<A>, b: B) => Effect.Effect<NoInfer<A>, ESet, RSet>,
    ): Lens<Option.Option<B>, ER | EGet, EW | ESet, RR | RGet, RW | RSet>
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
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW, RR, RW>
    <A, ER, EW, RR, RW>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
    ): Lens<A, ER, EW, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (changes: Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>) => Stream.Stream<NoInfer<A>, NoInfer<ER>, NoInfer<RR>>,
): Lens<A, ER, EW, RR, RW> => derive(self, {
    resolve: identity,
    mapStream: f,
    mapLock: identity,
}))


/**
 * Transforms read errors of a `Lens`.
 *
 * Applies to `get` and `changes` while leaving `modify` unchanged.
 */
export const mapErrorRead: {
    <A, ER, EW, RR, RW, E2>(
        f: (error: NoInfer<ER>) => E2,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, E2, EW, RR, RW>
    <A, ER, EW, RR, RW, E2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<ER>) => E2,
    ): Lens<A, E2, EW, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW, E2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<ER>) => E2,
): Lens<A, E2, EW, RR, RW> => derive(self, {
    resolve: Effect.mapError(f),
    mapStream: Stream.mapError(f),
    mapLock: identity,
}))

/**
 * Transforms modify errors of a `Lens`.
 *
 * Applies to the commit/rebuild portion of `modifyEffect` while leaving failures from the
 * user-supplied callback unchanged.
 */
export const mapErrorWrite: {
    <A, ER, EW, RR, RW, E2>(
        f: (error: NoInfer<EW>) => E2,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, E2, RR, RW>
    <A, ER, EW, RR, RW, E2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<EW>) => E2,
    ): Lens<A, ER, E2, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW, E2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<EW>) => E2,
): Lens<A, ER, E2, RR, RW> => derive(self, {
    resolve: parent => Effect.map(parent, resolved => ({
        value: resolved.value,
        commit: next => Effect.flatMap(
            next,
            value => Effect.mapError(resolved.commit(Effect.succeed(value)), f),
        ),
    })),
    mapStream: identity,
    mapLock: Effect.mapError(f),
}))

/**
 * Transforms all errors of a `Lens`.
 *
 * Applies to `get`, `changes`, and the commit/rebuild portion of `modifyEffect` while leaving
 * failures from the user-supplied callback unchanged.
 */
export const mapError: {
    <A, ER, EW, RR, RW, E2>(
        f: (error: NoInfer<ER | EW>) => E2,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, E2, E2, RR, RW>
    <A, ER, EW, RR, RW, E2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<ER | EW>) => E2,
    ): Lens<A, E2, E2, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW, E2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<ER | EW>) => E2,
): Lens<A, E2, E2, RR, RW> => derive(self, {
    resolve: parent => Effect.map(
        Effect.mapError(parent, f),
        resolved => ({
            value: resolved.value,
            commit: next => Effect.flatMap(
                next,
                value => Effect.mapError(resolved.commit(Effect.succeed(value)), f),
            ),
        }),
    ),
    mapStream: Stream.mapError(f),
    mapLock: Effect.mapError(f),
}))

/**
 * Runs an effect when read failures occur.
 *
 * Applies to `get` and `changes` while leaving `modify` unchanged.
 */
export const tapErrorRead: {
    <A, ER, EW, RR, RW, B, E2, R2>(
        f: (error: NoInfer<ER>) => Effect.Effect<B, E2, R2>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER | E2, EW, RR | R2, RW>
    <A, ER, EW, RR, RW, B, E2, R2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<ER>) => Effect.Effect<B, E2, R2>,
    ): Lens<A, ER | E2, EW, RR | R2, RW>
} = Function.dual(2, <A, ER, EW, RR, RW, B, E2, R2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<ER>) => Effect.Effect<B, E2, R2>,
): Lens<A, ER | E2, EW, RR | R2, RW> => derive(self, {
    resolve: Effect.tapError(f),
    mapStream: Stream.tapError(f),
    mapLock: identity,
}))

/**
 * Runs an effect when modify failures occur.
 *
 * Applies to the commit/rebuild portion of `modifyEffect` while leaving failures from the
 * user-supplied callback unchanged.
 */
export const tapErrorWrite: {
    <A, ER, EW, RR, RW, B, E2, R2>(
        f: (error: NoInfer<EW>) => Effect.Effect<B, E2, R2>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW | E2, RR, RW | R2>
    <A, ER, EW, RR, RW, B, E2, R2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<EW>) => Effect.Effect<B, E2, R2>,
    ): Lens<A, ER, EW | E2, RR, RW | R2>
} = Function.dual(2, <A, ER, EW, RR, RW, B, E2, R2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<EW>) => Effect.Effect<B, E2, R2>,
): Lens<A, ER, EW | E2, RR, RW | R2> => derive(self, {
    resolve: parent => Effect.map(parent, resolved => ({
        value: resolved.value,
        commit: next => Effect.flatMap(
            next,
            value => Effect.tapError(resolved.commit(Effect.succeed(value)), f),
        ),
    })),
    mapStream: identity,
    mapLock: Effect.tapError(f),
}))

/**
 * Runs an effect when any `Lens` failure occurs.
 *
 * Applies to `get`, `changes`, and the commit/rebuild portion of `modifyEffect` while leaving
 * failures from the user-supplied callback unchanged.
 */
export const tapError: {
    <A, ER, EW, RR, RW, B, E2, R2>(
        f: (error: NoInfer<ER | EW>) => Effect.Effect<B, E2, R2>,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER | E2, EW | E2, RR | R2, RW | R2>
    <A, ER, EW, RR, RW, B, E2, R2>(
        self: Lens<A, ER, EW, RR, RW>,
        f: (error: NoInfer<ER | EW>) => Effect.Effect<B, E2, R2>,
    ): Lens<A, ER | E2, EW | E2, RR | R2, RW | R2>
} = Function.dual(2, <A, ER, EW, RR, RW, B, E2, R2>(
    self: Lens<A, ER, EW, RR, RW>,
    f: (error: NoInfer<ER | EW>) => Effect.Effect<B, E2, R2>,
): Lens<A, ER | E2, EW | E2, RR | R2, RW | R2> => derive(self, {
    resolve: parent => Effect.map(
        Effect.tapError(parent, f),
        resolved => ({
            value: resolved.value,
            commit: next => Effect.flatMap(
                next,
                value => Effect.tapError(resolved.commit(Effect.succeed(value)), f),
            ),
        }),
    ),
    mapStream: Stream.tapError(e => f(e)),
    mapLock: Effect.tapError(e => f(e)),
}))


/**
 * Provides a `Context` to a `Lens`, removing it from both the read and write environments.
 */
export const provideContext: {
    <R2>(
        context: Context.Context<R2>,
    ): <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW, Exclude<RR, R2>, Exclude<RW, R2>>
    <A, ER, EW, RR, RW, R2>(
        self: Lens<A, ER, EW, RR, RW>,
        context: Context.Context<R2>,
    ): Lens<A, ER, EW, Exclude<RR, R2>, Exclude<RW, R2>>
} = Function.dual(2, <A, ER, EW, RR, RW, R2>(
    self: Lens<A, ER, EW, RR, RW>,
    context: Context.Context<R2>,
): Lens<A, ER, EW, Exclude<RR, R2>, Exclude<RW, R2>> => derive(self, {
    resolve: parent => Effect.map(
        Effect.provide(parent, context),
        resolved => ({
            value: resolved.value,
            commit: next => Effect.provide(resolved.commit(next), context),
        }),
    ),
    mapStream: Stream.provideContext(context),
    mapLock: Effect.provide(context),
}))

/**
 * Provides a single service to a `Lens`, removing it from both the read and write environments.
 *
 * This is the `Lens` equivalent of `Effect.provideService`: use it when a lens requires one
 * `Context.Key` and you already have the concrete service value.
 */
export const provideService: {
    <I, S>(
        tag: Context.Key<I, S>,
        service: NoInfer<S>,
    ): <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>>
    <A, ER, EW, RR, RW, I, S>(
        self: Lens<A, ER, EW, RR, RW>,
        tag: Context.Key<I, S>,
        service: NoInfer<S>,
    ): Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>>
} = Function.dual(3, <A, ER, EW, RR, RW, I, S>(
    self: Lens<A, ER, EW, RR, RW>,
    tag: Context.Key<I, S>,
    service: NoInfer<S>,
): Lens<A, ER, EW, Exclude<RR, I>, Exclude<RW, I>> => derive(self, {
    resolve: parent => Effect.map(
        Effect.provideService(parent, tag, service),
        resolved => ({
            value: resolved.value,
            commit: next => Effect.provideService(resolved.commit(next), tag, service),
        }),
    ),
    mapStream: Stream.provideService(tag, service),
    mapLock: Effect.provideService(tag, service),
}))


/**
 * Narrows the focus to a field of an object. Replaces the object in an immutable fashion when written to.
 */
export const focusObjectOn: {
    <A extends object, ER, EW, RR, RW, K extends keyof A>(
        key: K,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[K], ER, EW, RR, RW>
    <A extends object, ER, EW, RR, RW, K extends keyof A>(
        self: Lens<A, ER, EW, RR, RW>,
        key: K,
    ): Lens<A[K], ER, EW, RR, RW>
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
        key: K,
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[K], ER, EW, RR, RW>
    <A extends object, ER, EW, RR, RW, K extends focusObjectOnWritable.WritableKeys<A>>(
        self: Lens<A, ER, EW, RR, RW>,
        key: K,
    ): Lens<A[K], ER, EW, RR, RW>
} = Function.dual(2, <A extends object, ER, EW, RR, RW, K extends focusObjectOnWritable.WritableKeys<A>>(
    self: Lens<A, ER, EW, RR, RW>,
    key: K,
): Lens<A[K], ER, EW, RR, RW> => map(self, a => a[key], (a, b) => { a[key] = b; return a }))

/**
 * Narrows the focus to an indexed element of an array. Replaces the array in an immutable fashion when written to.
 */
export const focusArrayAt: {
    <A extends readonly any[], ER, EW, RR, RW>(
        index: number
    ): (self: Lens<A, ER, EW, RR, RW>) => Lens<A[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW>
    <A extends readonly any[], ER, EW, RR, RW>(
        self: Lens<A, ER, EW, RR, RW>,
        index: number,
    ): Lens<A[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW>
} = Function.dual(2, <A extends readonly any[], ER, EW, RR, RW>(
    self: Lens<A, ER, EW, RR, RW>,
    index: number,
): Lens<A[number], ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW> => mapEffect(
    self,
    a => Effect.fromOption(Array.get(a, index)),
    (a, b) => Effect.fromOption(Array.replace(a, index, b)) as any,
))

/**
 * Narrows the focus to an indexed element of a mutable array. Mutates the array in place when written to.
 */
export const focusMutableArrayAt: {
    <A, ER, EW, RR, RW>(
        index: number
    ): (self: Lens<A[], ER, EW, RR, RW>) => Lens<A, ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW>
    <A, ER, EW, RR, RW>(
        self: Lens<A[], ER, EW, RR, RW>,
        index: number,
    ): Lens<A, ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<A[], ER, EW, RR, RW>,
    index: number,
): Lens<A, ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW> => mapEffect(
    self,
    a => Effect.fromOption(Array.get(a, index)),
    (a, b) => Effect.flatMap(
        Effect.fromOption(Array.get(a, index)),
        () => Effect.as(Effect.sync(() => { a[index] = b }), a),
    ),
))

/**
 * Narrows the focus to an indexed element of a readonly tuple. Replaces the tuple in an immutable fashion when written to.
 */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
        index: I
    ): (self: Lens<T, ER, EW, RR, RW>) => Lens<T[I], ER, EW, RR, RW>
    <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
        self: Lens<T, ER, EW, RR, RW>,
        index: I,
    ): Lens<T[I], ER, EW, RR, RW>
} = Function.dual(2, <T extends readonly [any, ...any[]], ER, EW, RR, RW, I extends number>(
    self: Lens<T, ER, EW, RR, RW>,
    index: I,
): Lens<T[I], ER, EW, RR, RW> => map(
    self,
    Array.getUnsafe(index),
    (a, b) => Option.getOrElse(Array.replace(a, index, b), () => a) as T,
))

/**
 * Narrows the focus to an indexed element of a mutable tuple. Mutates the tuple in place when written to.
 */
export const focusMutableTupleAt: {
    <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
        index: I
    ): (self: Lens<T, ER, EW, RR, RW>) => Lens<T[I], ER, EW, RR, RW>
    <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
        self: Lens<T, ER, EW, RR, RW>,
        index: I,
    ): Lens<T[I], ER, EW, RR, RW>
} = Function.dual(2, <T extends [any, ...any[]], ER, EW, RR, RW, I extends number>(
    self: Lens<T, ER, EW, RR, RW>,
    index: I,
): Lens<T[I], ER, EW, RR, RW> => map(
    self,
    Array.getUnsafe(index),
    (a, b) => { a[index] = b; return a },
))

/**
 * Narrows the focus to an indexed element of `Chunk`. Replaces the `Chunk` in an immutable fashion when written to.
 */
export const focusChunkAt: {
    <A, ER, EW, RR, RW>(
        index: number
    ): (self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>) => Lens<A, ER | Cause.NoSuchElementError, EW, RR, RW>
    <A, ER, EW, RR, RW>(
        self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>,
        index: number,
    ): Lens<A, ER | Cause.NoSuchElementError, EW, RR, RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(
    self: Lens<Chunk.Chunk<A>, ER, EW, RR, RW>,
    index: number,
): Lens<A, ER | Cause.NoSuchElementError, EW, RR, RW> => mapEffect(
    self,
    chunk => Effect.fromOption(Chunk.get(chunk, index)),
    (chunk, value) => Effect.succeed(Option.getOrElse(Chunk.replace(chunk, index, value), () => chunk))),
)

/**
 * Narrows the focus to the value inside an `Option`.
 *
 * Reading or writing through this lens fails with `NoSuchElementError` when the parent option is `None`.
 * Writing wraps the new focused value back into `Option.some`.
 */
export const focusOption: {
    <A, ER, EW, RR, RW>(
        self: Lens<Option.Option<A>, ER, EW, RR, RW>,
    ): Lens<A, ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW>
} = <A, ER, EW, RR, RW>(
    self: Lens<Option.Option<A>, ER, EW, RR, RW>,
): Lens<A, ER | Cause.NoSuchElementError, EW | Cause.NoSuchElementError, RR, RW> => mapEffect(
    self,
    Effect.fromOption,
    (option, value) => Effect.as(Effect.fromOption(option), Option.some(value)),
)


/**
 * Reads the current value from a `Lens`.
 */
export const get = <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>): Effect.Effect<A, ER, RR> => self.get

/**
 * Returns the stream of changes from a `Lens`.
 */
export const changes = <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>): Stream.Stream<A, ER, RR> => self.changes

/**
 * Atomically modifies the value of a `Lens` and returns a computed result.
 */
export const modify: {
    <A, B>(f: (a: A) => readonly [B, A]): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<B, ER | EW, RR | RW>
    <A, ER, EW, RR, RW, B>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => readonly [B, A]): Effect.Effect<B, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW, B>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => readonly [B, A]) =>
    self.modifyEffect<B, never, never>(a => Effect.succeed(f(a))),
)

/**
 * Atomically modifies the value of a `Lens` with an effect and returns a computed result.
 */
export const modifyEffect: {
    <A, B, E, R>(f: (a: A) => Effect.Effect<readonly [B, A], E, R>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<B, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, B, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<readonly [B, A], E, R>): Effect.Effect<B, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, B, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<readonly [B, A], E, R>) =>
    self.modifyEffect(f),
)

/**
 * Conditionally modifies a `Lens` without committing when the next value is `None`.
 */
export const modifySome: {
    <B, A>(f: (a: NoInfer<A>) => readonly [B, Option.Option<NoInfer<A>>]): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<B, ER | EW, RR | RW>
    <A, ER, EW, RR, RW, B>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => readonly [B, Option.Option<A>]): Effect.Effect<B, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW, B>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => readonly [B, Option.Option<A>]) =>
    self.modifySomeEffect<B, never, never>(a => Effect.succeed(f(a))),
)

/**
 * Conditionally modifies a `Lens` with an effect without committing when the next value is `None`.
 */
export const modifySomeEffect: {
    <B, A, E = never, R = never>(f: (a: NoInfer<A>) => Effect.Effect<readonly [B, Option.Option<NoInfer<A>>], E, R>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<B, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, B, E = never, R = never>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>): Effect.Effect<B, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, B, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<readonly [B, Option.Option<A>], E, R>) =>
    self.modifySomeEffect(f),
)

/**
 * Sets the value of a `Lens`.
 */
export const set: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<void, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modifyEffect<void, never, never>(() => Effect.succeed([void 0, value] as const)),
)

/**
 * Sets a `Lens` to a new value and returns the previous value.
 */
export const getAndSet: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modifyEffect<A, never, never>(a => Effect.succeed([a, value] as const)),
)

/**
 * Applies a synchronous transformation to the value of a `Lens`, discarding the previous value.
 */
export const update: {
    <A, ER, EW, RR, RW>(f: (a: A) => A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A): Effect.Effect<void, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A) =>
    self.modifyEffect<void, never, never>(a => Effect.succeed([void 0, f(a)] as const)),
)

/**
 * Applies an effectful transformation to the value of a `Lens`, discarding the previous value.
 */
export const updateEffect: {
    <A, ER, EW, RR, RW, E, R>(f: (a: A) => Effect.Effect<A, E, R>): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<void, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>) =>
    self.modifyEffect<void, E, R>(a => Effect.flatMap(
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
    self.modifyEffect<A, never, never>(a => Effect.succeed([a, f(a)] as const)),
)

/**
 * Applies an effectful transformation the value of a `Lens` while returning the previous value.
 */
export const getAndUpdateEffect: {
    <A, ER, EW, RR, RW, E, R>(f: (a: A) => Effect.Effect<A, E, R>): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>): Effect.Effect<A, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => Effect.Effect<A, E, R>) =>
    self.modifyEffect<A, E, R>(a => Effect.flatMap(
        f(a),
        next => Effect.succeed([a, next] as const)
    )),
)

/**
 * Conditionally updates a `Lens` and returns the previous value.
 */
export const getAndUpdateSome: {
    <A>(pf: (a: NoInfer<A>) => Option.Option<NoInfer<A>>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>) =>
    self.modifySomeEffect<A, never, never>(a => Effect.succeed([a, pf(a)] as const)),
)

/**
 * Conditionally updates a `Lens` with an effect and returns the previous value.
 */
export const getAndUpdateSomeEffect: {
    <A, E = never, R = never>(pf: (a: NoInfer<A>) => Effect.Effect<Option.Option<NoInfer<A>>, E, R>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E = never, R = never>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>) =>
    self.modifySomeEffect<A, E, R>(a => Effect.map(
        pf(a),
        next => [a, next] as const,
    )),
)

/**
 * Sets the value of a `Lens` and returns the new value.
 */
export const setAndGet: {
    <A, ER, EW, RR, RW>(value: A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, value: A) =>
    self.modifyEffect<A, never, never>(() => Effect.succeed([value, value] as const)),
)

/**
 * Applies a synchronous update the value of a `Lens` and returns the new value.
 */
export const updateAndGet: {
    <A, ER, EW, RR, RW>(f: (a: A) => A): (self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, f: (a: A) => A) =>
    self.modifyEffect<A, never, never>(a => {
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
    self.modifyEffect<A, E, R>(a => Effect.flatMap(
        f(a),
        next => Effect.succeed([next, next] as const),
    )),
)

/**
 * Conditionally updates the value of a `Lens`.
 */
export const updateSome: {
    <A>(pf: (a: NoInfer<A>) => Option.Option<NoInfer<A>>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>): Effect.Effect<void, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>) =>
    self.modifySomeEffect<void, never, never>(a => Effect.succeed([void 0, pf(a)] as const)),
)

/**
 * Conditionally updates the value of a `Lens` with an effect.
 */
export const updateSomeEffect: {
    <A, E = never, R = never>(pf: (a: NoInfer<A>) => Effect.Effect<Option.Option<NoInfer<A>>, E, R>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<void, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E = never, R = never>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<void, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>) =>
    self.modifySomeEffect<void, E, R>(a => Effect.map(
        pf(a),
        next => [void 0, next] as const,
    )),
)

/**
 * Conditionally updates a `Lens` and returns the resulting value.
 */
export const updateSomeAndGet: {
    <A>(pf: (a: NoInfer<A>) => Option.Option<NoInfer<A>>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW, RR | RW>
    <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>): Effect.Effect<A, ER | EW, RR | RW>
} = Function.dual(2, <A, ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Option.Option<A>) =>
    self.modifySomeEffect<A, never, never>(a => Effect.succeed(Option.match(pf(a), {
        onNone: () => [a, Option.none()] as const,
        onSome: next => [next, Option.some(next)] as const,
    }))),
)

/**
 * Conditionally updates a `Lens` with an effect and returns the resulting value.
 */
export const updateSomeAndGetEffect: {
    <A, E = never, R = never>(pf: (a: NoInfer<A>) => Effect.Effect<Option.Option<NoInfer<A>>, E, R>): <ER, EW, RR, RW>(self: Lens<A, ER, EW, RR, RW>) => Effect.Effect<A, ER | EW | E, RR | RW | R>
    <A, ER, EW, RR, RW, E = never, R = never>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<A, ER | EW | E, RR | RW | R>
} = Function.dual(2, <A, ER, EW, RR, RW, E, R>(self: Lens<A, ER, EW, RR, RW>, pf: (a: A) => Effect.Effect<Option.Option<A>, E, R>) =>
    self.modifySomeEffect<A, E, R>(a => Effect.map(
        pf(a),
        next => Option.match(next, {
            onNone: () => [a, Option.none()] as const,
            onSome: value => [value, Option.some(value)] as const,
        }),
    )),
)
