export function delay(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
}

export function flatten<T>(list: Readonly<T[]>[]): T[] {
    return ([] as T[]).concat(...list);
}

export function shuffle<T>(list: Readonly<ArrayLike<T>>): T[] {
    const array = Array.from(list);
    for (let i = 1; i < array.length; i++) {
        let j = Math.floor(Math.random() * (i + 1));
        if (i !== j) {
            const val = array[i];
            array[i] = array[j];
            array[j] = val;
        }
    }
    return array;
}

// good enough for json
export function deepEqual(x: any, y: any): boolean {
    if (x === y) return true;
    if (x == null || y == null) return false;
    if (typeof x == "object" && typeof y == "object") {
        if (Array.isArray(x) && Array.isArray(y)) {
            if (x.length !== y.length) return false;
            for (let i = 0; i < x.length; i++) {
                if (!deepEqual(x[i], y[i])) return false;
            }
            return true;
        } else if (!Array.isArray(x) && !Array.isArray(y)) {
            let xk = Object.keys(x);
            let yk = Object.keys(y);
            if (xk.length !== yk.length) return false;
            for (const key of xk) {
                if (!Object.prototype.hasOwnProperty.call(y, key)) return false;
                if (!deepEqual(x[key], y[key])) return false;
            }
            return true;
        }
    }
    return false;
}

export function mapNth<T>(xs: readonly T[], index: number, f: (arg: T) => T): T[] {
    return xs.map((item, i) => i === index ? f(item) : item);
}

// stolen from https://github.com/unadlib/mutative/blob/c1f6e80b0aff3caec6aec0e7679bdf121c516bd9/src/interface.ts#L164
type Primitive = string | number | bigint | boolean | null | undefined;

type ImmutableMap<K, V> = ReadonlyMap<Immutable<K>, Immutable<V>>;
type ImmutableSet<T> = ReadonlySet<Immutable<T>>;
type ImmutableObject<T> = { readonly [K in keyof T]: Immutable<T[K]> };

type IfAvailable<T, Fallback = void> = true | false extends (
    T extends never ? true : false
)
    ? Fallback
    : keyof T extends never
    ? Fallback
    : T;
type WeakReferences =
    | IfAvailable<WeakMap<any, any>>
    | IfAvailable<WeakSet<any>>;
type AtomicObject = Function | Promise<any> | Date | RegExp;

export type Immutable<T> = T extends Primitive | AtomicObject
    ? T
    : T extends IfAvailable<ReadonlyMap<infer K, infer V>>
    ? ImmutableMap<K, V>
    : T extends IfAvailable<ReadonlySet<infer V>>
    ? ImmutableSet<V>
    : T extends WeakReferences
    ? T
    : T extends object
    ? ImmutableObject<T>
    : T;
