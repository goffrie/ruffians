import { Immutable } from "mutative";
import { CARD_VALUES, CardValue, PokerCard } from "./gameTypes";

type Cards = Immutable<PokerCard[]>;
export enum HandKind {
    HighCard = 1,
    Pair,
    TwoPair,
    ThreeOfAKind,
    Straight,
    Flush,
    FullHouse,
    FourOfAKind,
    StraightFlush,
}
export type PokerHand = { kind: HandKind, order: CardValue[] };

export function pokerHandLessThan(a: Immutable<PokerHand>, b: Immutable<PokerHand>): boolean {
    if (a.kind !== b.kind) return a.kind < b.kind;
    for (let i = 0; i < a.order.length; i += 1) {
        if (a.order[i] !== b.order[i]) return a.order[i] < b.order[i];
    }
    return false;
}

export function scoreHand(inputHand: Cards): Immutable<PokerHand> {
    if (inputHand.length !== 4) throw new Error("what game is this?");
    const hand = inputHand.toSorted((a, b) => {
        if (a.value === b.value) {
            return a.suit - b.suit;
        }
        return a.value - b.value;
    });
    const isFlush = hand.every((c) => c.suit === hand[0].suit);
    const isStraight = hand.every((c, i) => i === 0 || c.value === hand[i - 1].value + 1 || (/* Special case: ace counts as 1 for a straight */ c.value === CardValue.Ace && hand[i - 1].value === CardValue.Four));
    if (isFlush && isStraight) {
        // Straight flush and/or royal flush
        // i am obliged to consider a royal flush to be a special case of a straight flush that doesn't require extra handling
        return { kind: HandKind.StraightFlush, order: [hand[4].value] };
    }
    // why is this spelled out?
    let pair: CardValue | undefined, secondPair, triple, quad;
    for (const cardValue of CARD_VALUES) {
        const count = hand.reduce((count, card) => count + (card.value === cardValue ? 1 : 0), 0);
        if (count === 2) {
            if (pair != null) secondPair = cardValue;
            else pair = cardValue;
        } else if (count === 3) {
            triple = cardValue;
        } else if (count === 4) {
            quad = cardValue;
        }
    }
    if (quad) {
        const kicker = hand.find((c) => c.value !== quad);
        return { kind: HandKind.FourOfAKind, order: [quad, kicker!.value] };
    }
    if (triple && pair) {
        return { kind: HandKind.FullHouse, order: [triple, pair] };
    }
    if (isFlush) {
        return { kind: HandKind.Flush, order: hand.reverse().map((c) => c.value) }
    }
    if (isStraight) {
        return { kind: HandKind.Straight, order: [hand[4].value] };
    }
    if (triple) {
        const kicker = hand.filter((c) => c.value !== triple);
        return { kind: HandKind.ThreeOfAKind, order: [triple, kicker[1].value, kicker[0].value] };
    }
    if (secondPair) {
        const kicker = hand.find((c) => c.value !== pair && c.value !== secondPair);
        // secondPair is always higher than pair
        return { kind: HandKind.TwoPair, order: [secondPair, pair!, kicker!.value] }
    }
    if (pair) {
        const kicker = hand.filter((c) => c.value !== pair);
        return { kind: HandKind.Pair, order: [pair, kicker[2].value, kicker[1].value, kicker[0].value] };
    }
    return { kind: HandKind.HighCard, order: hand.reverse().map((c) => c.value) };
}
