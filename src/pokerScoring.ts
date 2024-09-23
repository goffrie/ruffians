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
    if (inputHand.length !== 5) throw new Error("what game is this?");
    const hand = inputHand.toSorted((a, b) => {
        if (a.value === b.value) {
            return a.suit - b.suit;
        }
        return a.value - b.value;
    });
    const isFlush = hand.every((c) => c.suit === hand[0].suit);
    const isStraight = hand.every((c, i) => i === 0 || c.value === hand[i - 1].value + 1 || (/* Special case: ace counts as 1 for a straight */ c.value === CardValue.Ace && hand[i - 1].value === CardValue.Four));
    const straightValue = isStraight ? (
        hand[4].value === CardValue.Ace && hand[3].value === CardValue.Four ? CardValue.Four : hand[4].value
    ) : null;
    if (isFlush && straightValue != null) {
        // Straight flush and/or royal flush
        // i am obliged to consider a royal flush to be a special case of a straight flush that doesn't require extra handling
        return { kind: HandKind.StraightFlush, order: [straightValue] };
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
    if (straightValue != null) {
        return { kind: HandKind.Straight, order: [straightValue] };
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

export function bestHandAmong(cards: Immutable<(PokerCard | PokerCard[])[]>): Immutable<[PokerCard[], PokerHand]> {
    if (cards.length < 5) throw new Error("no");
    const picked: PokerCard[] = [];
    let best: Immutable<[PokerCard[], PokerHand]> | null = null;
    const dfs = (i: number) => {
        if (picked.length === 5) {
            const score = scoreHand(picked);
            if (best == null || pokerHandLessThan(best[1], score)) best = [[...picked], score];
            return;
        }
        if (cards.length - i < 5 - picked.length) return;
        if (cards[i] instanceof Array) {
            for (const card of cards[i]) {
                picked.push(card);
                dfs(i + 1);
                picked.pop();
            }
        } else {
            picked.push(cards[i]);
            dfs(i + 1);
            picked.pop();
        }
        dfs(i + 1);
    };
    dfs(0);
    return best!;
}
