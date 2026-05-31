/**
 * Compile-time branding for domain primitives, the mechanism behind "illegal states unrepresentable"
 * (doc 13 §2).
 *
 * A {@link Brand} is the underlying type `T` intersected with a unique, phantom `__brand` tag. The tag exists
 * only in the type system — there is no runtime field and no runtime cost — so a branded value *is* its base
 * value at run time, but the compiler will not let an arbitrary `T` be used where the brand is expected.
 *
 * The contract is that a branded type's parser is its **sole producer**: each module exports only a parser
 * (returning {@link Parsed}) and never a constructor or cast, so any value of the branded type has provably
 * passed validation. Consumers therefore never re-validate — holding the type is the proof.
 *
 * @typeParam T - The underlying primitive (here always `string`).
 * @typeParam B - A unique string tag identifying the brand.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
