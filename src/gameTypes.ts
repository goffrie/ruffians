export enum Suit {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}
export const SUITS: readonly Suit[] = [Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades];

export enum CardValue {
    Ace = 14,
    Two = 2,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
}
export const CARD_VALUES: readonly CardValue[] = [
    CardValue.Ace,
    CardValue.Two,
    CardValue.Three,
    CardValue.Four,
    CardValue.Five,
    CardValue.Six,
    CardValue.Seven,
    CardValue.Eight,
    CardValue.Nine,
    CardValue.Ten,
    CardValue.Jack,
    CardValue.Queen,
    CardValue.King,
];

export type PokerCard = {
    suit: Suit,
    value: CardValue,
};

export type DeckCard = PokerCard | { joker: number };

export type Token = {
    index: number,
    // 0-indexed
    round: number,
};

export type Round = {
    cards: number,
};
