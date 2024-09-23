import { makeDeck } from "./gameImpl";
import { BiddingState, RoomPhase, RoomState, SetupState } from "./gameState";
import { PokerCard } from "./gameTypes";

const starting: SetupState = {
    phase: RoomPhase.SETUP,
    players: [
        { name: "player1" },
        { name: "player2" },
        { name: "player3" },
    ],
    config: { withJokers: true },
};
function makeFinishing(): BiddingState {
    const deck = makeDeck(false) as PokerCard[];
    return {
        phase: RoomPhase.BIDDING,
        config: { withJokers: true },
        players: starting.players.map((p, i) => ({
            name: p.name, hand: deck.splice(0, 2), pastTokens: [], token: { index: i + 1, round: 0 },
        })),
        communityCards: [...deck.splice(0, 4).map((x) => [x]), deck.splice(0, 2)],
        deck,
        futureRounds: [],
        jokerLog: [],
        log: [[]],
        tokens: [null, null, null],
    };
}
export const TestRooms: Record<string, () => RoomState> = {
    starting: () => starting,
    finishing: makeFinishing,
};
