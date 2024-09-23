import { makeDeck } from "./gameImpl";
import { BiddingState, RoomPhase, RoomState, SetupState } from "./gameState";

const starting: SetupState = {
    phase: RoomPhase.SETUP,
    players: [
        { name: "player1" },
        { name: "player2" },
        { name: "player3" },
    ],
};
function makeFinishing(): BiddingState {
    const deck = makeDeck();
    return {
        phase: RoomPhase.BIDDING,
        players: starting.players.map((p, i) => ({
            name: p.name, hand: deck.splice(0, 2), pastTokens: [], token: { index: i + 1, round: 0 },
        })),
        communityCards: deck.splice(0, 5),
        deck,
        futureRounds: [],
        log: [[]],
        tokens: [null, null, null],
    };
}
export const TestRooms: Record<string, () => RoomState> = {
    starting: () => starting,
    finishing: makeFinishing,
};
