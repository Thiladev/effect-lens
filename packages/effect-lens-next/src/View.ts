import { Array, type Cause, Chunk, Effect, Function, Iterable, Option, Pipeable, Predicate, type Result, type Schedule, Stream } from "effect"


export const ViewTypeId: unique symbol = Symbol.for("@effect-lens/View/View")
export type ViewTypeId = typeof ViewTypeId

export interface View<out A, out E = never, out R = never> extends Pipeable.Pipeable {
    readonly [ViewTypeId]: ViewTypeId
    readonly get: Effect.Effect<A, E, R>
    readonly changes: Stream.Stream<A, E, R>
}

export const isView = (u: unknown): u is View<unknown, unknown, unknown> => Predicate.hasProperty(u, ViewTypeId)


export const ViewImplTypeId: unique symbol = Symbol.for("@effect-lens/Lens/ViewImpl")
export type ViewImplTypeId = typeof ViewImplTypeId

export declare namespace ViewImpl {
    export interface Source<out A, out E = never, out R = never> {
        readonly get: Effect.Effect<A, E, R>
        readonly changes: Stream.Stream<A, E, R>
    }
}

export class ViewImpl<out A, out E = never, out R = never>
extends Pipeable.Class implements View<A, E, R> {
    readonly [ViewTypeId]: ViewTypeId = ViewTypeId
    readonly [ViewImplTypeId]: ViewImplTypeId = ViewImplTypeId

    constructor(
        readonly source: ViewImpl.Source<A, E, R>,
    ) {
        super()
    }

    get get() { return this.source.get }
    get changes() { return this.source.changes }
}

export const isViewImpl = (u: unknown): u is ViewImpl<unknown, unknown, unknown> => Predicate.hasProperty(u, ViewImplTypeId)

export const asViewImpl = <A, E, R>(
    view: View<A, E, R>
): ViewImpl<A, E, R> => {
    if (!isViewImpl(view))
        throw new Error("Not a 'ViewImpl'")
    return view as ViewImpl<A, E, R>
}

export const make = <A, E, R>(
    source: ViewImpl.Source<A, E, R>
): View<A, E, R> => new ViewImpl(source)

export const unwrap = <A, E, R, E1, R1>(
    effect: Effect.Effect<View<A, E, R>, E1, R1>,
): View<A, E | E1, R | R1> => make({
    get: Effect.flatMap(effect, self => self.get),
    changes: Stream.unwrap(Effect.map(effect, self => self.changes)),
})


export const map: {
    <A, B>(f: (a: NoInfer<A>) => B): <E, R>(self: View<A, E, R>) => View<B, E, R>
    <A, E, R, B>(self: View<A, E, R>, f: (a: NoInfer<A>) => B): View<B, E, R>
} = Function.dual(2, <A, E, R, B>(self: View<A, E, R>, f: (a: NoInfer<A>) => B) => make({
    get get() { return Effect.map(self.get, f) },
    get changes() { return Stream.map(self.changes, f) },
}))

export const mapEffect: {
    <A, B, E2, R2>(f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>): <E, R>(self: View<A, E, R>) => View<B, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>): View<B, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.flatMap(self.get, f) },
    get changes() { return Stream.mapEffect(self.changes, f) },
}))

/** Maps over an `Option` value in the `View`. */
export const mapOption: {
    <A, B>(f: (a: A) => B): <E, R>(self: View<Option.Option<A>, E, R>) => View<Option.Option<B>, E, R>
    <A, B, E, R>(self: View<Option.Option<A>, E, R>, f: (a: A) => B): View<Option.Option<B>, E, R>
} = Function.dual(2, <A, B, E, R>(self: View<Option.Option<A>, E, R>, f: (a: A) => B) =>
    map(self, Option.map(f)),
)

/** Maps over an `Option` value in the `View` with an Effect. */
export const mapOptionEffect: {
    <A, B, E2, R2>(f: (a: A) => Effect.Effect<B, E2, R2>): <E, R>(self: View<Option.Option<A>, E, R>) => View<Option.Option<B>, E | E2, R | R2>
    <A, B, E, R, E2, R2>(self: View<Option.Option<A>, E, R>, f: (a: A) => Effect.Effect<B, E2, R2>): View<Option.Option<B>, E | E2, R | R2>
} = Function.dual(2, <A, B, E, R, E2, R2>(
    self: View<Option.Option<A>, E, R>,
    f: (a: A) => Effect.Effect<B, E2, R2>,
) => mapEffect(self, Option.match({
    onSome: a => Effect.map(f(a), Option.some),
    onNone: () => Effect.succeed(Option.none()),
})))

/**
 * Allows transforming only the `changes` stream of a `View`.
 */
export const mapStream: {
    <A, E, R>(
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>) => Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>,
    ): (self: View<A, E, R>) => View<A, E, R>
    <A, E, R>(
        self: View<A, E, R>,
        f: (changes: Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>) => Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>,
    ): View<A, E, R>
} = Function.dual(2, <A, E, R>(
    self: View<A, E, R>,
    f: (changes: Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>) => Stream.Stream<NoInfer<A>, NoInfer<E>, NoInfer<R>>,
): View<A, E, R> => make({
    get get() { return self.get },
    get changes() { return f(self.changes) },
}))

/** Converts typed failures from both channels into `Result` values. */
export const result = <A, E, R>(
    self: View<A, E, R>,
): View<Result.Result<A, E>, never, R> => make({
    get get() { return Effect.result(self.get) },
    get changes() { return Stream.result(self.changes) },
})

/**
 * Combines the current values and streams of changes from multiple `View` values.
 */
export const zipLatestAll = <const T extends readonly View<any, any, any>[]>(
    ...elements: T
): View<
    [T[number]] extends [never]
        ? never
        : { [K in keyof T]: T[K] extends View<infer A, infer _E, infer _R> ? A : never },
    [T[number]] extends [never] ? never : T[number] extends View<infer _A, infer E, infer _R> ? E : never,
    [T[number]] extends [never] ? never : T[number] extends View<infer _A, infer _E, infer R> ? R : never
> => make({
    get: Effect.all(elements.map(view => view.get)),
    changes: Stream.zipLatestAll(...elements.map(view => view.changes)),
}) as any


/** Maps errors from both the current value and the stream of changes. */
export const mapError: {
    <E, E2>(f: (error: NoInfer<E>) => E2): <A, R>(self: View<A, E, R>) => View<A, E2, R>
    <A, E, R, E2>(self: View<A, E, R>, f: (error: NoInfer<E>) => E2): View<A, E2, R>
} = Function.dual(2, <A, E, R, E2>(
    self: View<A, E, R>,
    f: (error: NoInfer<E>) => E2,
) => make({
    get get() { return Effect.mapError(self.get, f) },
    get changes() { return Stream.mapError(self.changes, f) },
}))

/** Runs an effect when either the current value or the stream of changes fails. */
export const tapError: {
    <E, B, E2, R2>(f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>): <A, R>(self: View<A, E, R>) => View<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>): View<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    f: (error: NoInfer<E>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.tapError(self.get, f) },
    get changes() { return Stream.tapError(self.changes, f) },
}))

const catch_: {
    <E, B, E2, R2>(f: (error: NoInfer<E>) => View<B, E2, R2>): <A, R>(self: View<A, E, R>) => View<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, f: (error: NoInfer<E>) => View<B, E2, R2>): View<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    f: (error: NoInfer<E>) => View<B, E2, R2>,
) => make({
    get get() { return Effect.catch(self.get, error => f(error).get) },
    get changes() { return Stream.catch(self.changes, error => f(error).changes) },
}))

/** Recovers from typed errors with another `View`. */
export { catch_ as catch }

/** Recovers from all failure causes with another `View`. */
export const catchCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => View<B, E2, R2>): <A, R>(self: View<A, E, R>) => View<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => View<B, E2, R2>): View<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => View<B, E2, R2>,
) => make({
    get get() { return Effect.catchCause(self.get, cause => f(cause).get) },
    get changes() { return Stream.catchCause(self.changes, cause => f(cause).changes) },
}))

/** Runs an effect when either channel fails, exposing the complete failure cause. */
export const tapCause: {
    <E, B, E2, R2>(f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): <A, R>(self: View<A, E, R>) => View<A, E | E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>): View<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect.Effect<B, E2, R2>,
) => make({
    get get() { return Effect.tapCause(self.get, f) },
    get changes() { return Stream.tapCause(self.changes, f) },
}))

/** Falls back to another `View` when either channel fails. */
export const orElse: {
    <B, E2, R2>(that: () => View<B, E2, R2>): <A, E, R>(self: View<A, E, R>) => View<A | B, E2, R | R2>
    <A, E, R, B, E2, R2>(self: View<A, E, R>, that: () => View<B, E2, R2>): View<A | B, E2, R | R2>
} = Function.dual(2, <A, E, R, B, E2, R2>(
    self: View<A, E, R>,
    that: () => View<B, E2, R2>,
) => catch_(self, that))

/** Replaces typed errors from either channel with a lazily evaluated value. */
export const orElseSucceed: {
    <B>(value: () => B): <A, E, R>(self: View<A, E, R>) => View<A | B, never, R>
    <A, E, R, B>(self: View<A, E, R>, value: () => B): View<A | B, never, R>
} = Function.dual(2, <A, E, R, B>(self: View<A, E, R>, value: () => B) => make({
    get get() { return Effect.orElseSucceed(self.get, value) },
    get changes() { return Stream.orElseSucceed(self.changes, value) },
}))

/** Retries failures from both channels according to the supplied schedule. */
export const retry: {
    <E, X, E2, R2>(policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>): <A, R>(self: View<A, E, R>) => View<A, E | E2, R | R2>
    <A, E, R, X, E2, R2>(self: View<A, E, R>, policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>): View<A, E | E2, R | R2>
} = Function.dual(2, <A, E, R, X, E2, R2>(
    self: View<A, E, R>,
    policy: Schedule.Schedule<X, NoInfer<E>, E2, R2>,
) => make({
    get get() { return Effect.retry(self.get, policy) },
    get changes() { return Stream.retry(self.changes, policy) },
}))


/** Narrows the focus to a field of an object. */
export const focusObjectOn: {
    <A extends object, K extends keyof A>(key: K): <E, R>(self: View<A, E, R>) => View<A[K], E, R>
    <A extends object, K extends keyof A, E, R>(self: View<A, E, R>, key: K): View<A[K], E, R>
} = Function.dual(2, <A extends object, K extends keyof A, E, R>(self: View<A, E, R>, key: K) =>
    map(self, a => a[key]),
)

/** Narrows the focus to an indexed element of an array. */
export const focusArrayAt: {
    <A extends readonly any[]>(index: number): <E, R>(self: View<A, E, R>) => View<A[number], E | Cause.NoSuchElementError, R>
    <A extends readonly any[], E, R>(self: View<A, E, R>, index: number): View<A[number], E | Cause.NoSuchElementError, R>
} = Function.dual(2, <A extends readonly any[], E, R>(self: View<A, E, R>, index: number) =>
    mapEffect(self, a => Effect.fromOption(Array.get(a, index))),
)

export const focusArrayLength = <A extends readonly any[], E, R>(
    self: View<A, E, R>,
): View<number, E, R> => map(self, Array.length)

/** Narrows the focus to an indexed element of a readonly tuple. */
export const focusTupleAt: {
    <T extends readonly [any, ...any[]], I extends number>(index: I): <E, R>(self: View<T, E, R>) => View<T[I], E, R>
    <T extends readonly [any, ...any[]], I extends number, E, R>(self: View<T, E, R>, index: I): View<T[I], E, R>
} = Function.dual(2, <T extends readonly [any, ...any[]], I extends number, E, R>(self: View<T, E, R>, index: I) =>
    map(self, Array.getUnsafe(index)),
)

/** Narrows the focus to an indexed element of `Chunk`. */
export const focusChunkAt: {
    <A>(index: number): <E, R>(self: View<Chunk.Chunk<A>, E, R>) => View<A, E | Cause.NoSuchElementError, R>
    <A, E, R>(self: View<Chunk.Chunk<A>, E, R>, index: number): View<A, E | Cause.NoSuchElementError, R>
} = Function.dual(2, <A, E, R>(self: View<Chunk.Chunk<A>, E, R>, index: number) =>
    mapEffect(self, chunk => Effect.fromOption(Chunk.get(chunk, index))),
)

export const focusChunkSize = <A, E, R>(
    self: View<Chunk.Chunk<A>, E, R>,
): View<number, E, R> => map(self, Chunk.size)

export const focusIterableSize = <A extends Iterable<any>, E, R>(
    self: View<A, E, R>,
): View<number, E, R> => map(self, Iterable.size)


/**
 * Reads the current value from a `View`.
 */
export const get = <A, E, R>(self: View<A, E, R>): Effect.Effect<A, E, R> => self.get

/**
 * Returns the stream of changes from a `View`.
 */
export const changes = <A, E, R>(self: View<A, E, R>): Stream.Stream<A, E, R> => self.changes
