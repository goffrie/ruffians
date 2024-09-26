import { create, Immutable } from "mutative";
import {
    BiddingState,
    BiddingStateWithoutJokers,
    Config,
    NEW_ROOM,
    RoomPhase,
    SetupPlayer,
    StartedPlayer,
    StartedState,
    WinRecord,
} from "./gameState";
import { CARD_VALUES, DeckCard, PokerCard, Round, SUITS } from "./gameTypes";
import { shuffle } from "./utils";

export function makeDeck(withJokers: boolean): DeckCard[] {
    const baseDeck: DeckCard[] = SUITS.flatMap((suit) => CARD_VALUES.map((value) => ({ suit, value })));
    if (withJokers) baseDeck.push(...Array.from({ length: 2 }).map((_, i) => ({ joker: i })));
    return shuffle(baseDeck);
}

export const DEFAULT_GAME: Immutable<Round[]> = [{ cards: 0 }, { cards: 3 }, { cards: 1 }, { cards: 1 }];

export function makeInitialGame(
    players: Immutable<SetupPlayer[]>,
    config: Config,
    winRecord?: WinRecord
): Immutable<StartedState> {
    const deck = makeDeck(config.withJokers);
    const state: Immutable<BiddingState> = {
        phase: RoomPhase.BIDDING,
        config,
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
        jokerLog: [],
        log: [],
        winRecord: winRecord ?? {
            wins: 0,
            losses: 0,
            targetWins: config.targetWins ?? NEW_ROOM.config.targetWins,
            targetLosses: config.targetLosses ?? NEW_ROOM.config.targetLosses,
        },
        // start out with null tokens in case we need to resolve jokers
        tokens: players.map(() => null),
    };
    return maybeResolveJokers(state);
}

function allHandsResolved(
    players: Immutable<StartedPlayer<DeckCard | DeckCard[]>[]>
): players is Immutable<StartedPlayer<PokerCard>[]> {
    return players.every((p) => p.hand.every((c) => !(c instanceof Array) && !("joker" in c)));
}

export function gameHandsAreResolved(game: Immutable<BiddingState>): game is Immutable<BiddingStateWithoutJokers> {
    return allHandsResolved(game.players);
}

export function maybeResolveJokers(game: Immutable<BiddingState>): Immutable<StartedState> {
    if (gameHandsAreResolved(game)) {
        return advanceRound(game);
    }
    return create(game, (draft) => {
        draft.players.forEach((player, playerIx) => {
            if (player.hand.every((obj) => !(obj instanceof Array))) {
                const ix = player.hand.findIndex((obj) => "joker" in obj);
                if (ix !== -1) {
                    player.hand[ix] = draft.deck.splice(0, 2);
                    draft.jokerLog.push({ player: playerIx });
                }
            }
        });
    });
}

export function advanceRound(game: Immutable<BiddingStateWithoutJokers>): Immutable<StartedState> {
    const [draft, finalize] = create(game);

    const currentRound = draft.futureRounds.shift();
    if (currentRound == null) {
        return {
            phase: RoomPhase.SCORING,
            config: game.config,
            players: game.players,
            communityCards: game.communityCards,
            deck: game.deck,
            jokerLog: game.jokerLog,
            log: game.log,
            winRecord: game.winRecord,
            revealIndex: 1,
        };
    }

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

    // deal new community card(s)
    for (let i = 0; i < currentRound.cards; i += 1) {
        const slot = [];
        let cardsInSlot = 1;
        while (cardsInSlot > 0) {
            const draw = draft.deck.shift()!;
            if ("joker" in draw) {
                cardsInSlot += 1;
            } else {
                cardsInSlot -= 1;
                slot.push(draw);
            }
        }
        draft.communityCards.push(slot);
    }

    // mint new tokens
    draft.tokens = draft.players.map((_, i) => ({ index: i + 1, round: roundIndex }));
    return finalize();
}
