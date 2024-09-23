import { create } from "mutative";
import { BiddingState, RoomPhase, SetupPlayer, StartedState } from "./gameState";
import { CARD_VALUES, PokerCard, Round, Suit, SUITS } from "./gameTypes";
import { Immutable, shuffle } from "./utils";

export function makeDeck(): PokerCard[] {
    return shuffle(SUITS.flatMap((suit) => CARD_VALUES.map((value) => ({ suit, value }))));
}

const DEFAULT_GAME: Immutable<Round[]> = [
    { cards: 0 },
    { cards: 3 },
    { cards: 1 },
    { cards: 1 },
]

export function makeInitialGame(players: Immutable<SetupPlayer[]>): Immutable<StartedState> {
    const deck = makeDeck();
    const state: Immutable<BiddingState> = {
        phase: RoomPhase.BIDDING,
        players: players.map((p) => ({
            name: p.name,
            // deal two cards to each player
            hand: deck.splice(0, 2),
            pastTokens: [],
            token: null,
        })),
        communityCards: [],
        deck,
        futureRounds: DEFAULT_GAME,
        log: [],
        tokens: [],
    };
    return advanceRound(state);
}

export function advanceRound(game: Immutable<BiddingState>): Immutable<StartedState> {
    return create(game, (draft) => {
        // update history bookkeeping for a new round
        const roundIndex = draft.log.length;
        if (roundIndex > 0) {
            for (const p of draft.players) {
                if (!p.token) throw new Error("can't advance round unless every player has a token!");
                p.pastTokens.push(p.token);
                p.token = null;
            }
        }
        draft.log.push([]);

        const currentRound = draft.futureRounds.shift();
        if (currentRound == null) {
            throw new Error("todo: go to scoring");
        }
        // deal new community card(s)
        draft.communityCards.push(...draft.deck.splice(0, currentRound.cards));

        // mint new tokens
        draft.tokens = draft.players.map((_, i) => ({ index: i + 1, round: roundIndex }));
    });
}
