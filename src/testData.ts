import { Immutable } from "mutative";
import { GameRoom } from "./gameHook";
import { DEFAULT_GAME, makeDeck, maybeResolveJokers } from "./gameImpl";
import { BiddingState, RoomPhase, RoomState, SetupState } from "./gameState";
import { PokerCard } from "./gameTypes";
import { useEffect, useState } from "react";

const starting: SetupState = {
    phase: RoomPhase.SETUP,
    players: [{ name: "player1" }, { name: "player2" }, { name: "player3" }],
    config: { withJokers: true },
};
function makeResolveJokers(): Immutable<RoomState> {
    const deck = makeDeck(false) as PokerCard[];
    return maybeResolveJokers({
        phase: RoomPhase.RESOLVE_JOKERS,
        config: { withJokers: true },
        players: starting.players.map((p, i) => ({
            name: p.name,
            hand: i === 0 ? [{ joker: 0 }, deck.shift()!] : deck.splice(0, 2),
            pastTokens: [],
            token: null,
        })),
        communityCards: [],
        deck: [{ joker: 1 }, ...deck],
        futureRounds: DEFAULT_GAME,
        jokerLog: [],
    });
}
function makeFinishing(): BiddingState {
    const deck = makeDeck(false) as PokerCard[];
    return {
        phase: RoomPhase.BIDDING,
        config: { withJokers: true },
        players: starting.players.map((p, i) => ({
            name: p.name,
            hand: deck.splice(0, 2),
            pastTokens: [],
            token: { index: i + 1, round: 0 },
        })),
        communityCards: [...deck.splice(0, 4).map((x) => [x]), deck.splice(0, 2)],
        deck,
        futureRounds: [],
        jokerLog: [],
        log: [[]],
        tokens: [null, null, null],
    };
}
export const TestRooms: Record<string, () => Immutable<RoomState>> = {
    starting: () => starting,
    resolveJokers: makeResolveJokers,
    finishing: makeFinishing,
};

let STATE: Record<string, Immutable<RoomState>> = {};

if (module.hot) {
    module.hot.dispose((data) => {
        data.state = STATE;
    });
    module.hot.accept(() => {
        STATE = module.hot?.data.state;
    });
}

export function useFakeGame(roomName: string): Immutable<GameRoom> | null {
    const [state, setState] = useState<Immutable<GameRoom> | null>(null);
    useEffect(() => {
        if (!Object.prototype.hasOwnProperty.call(TestRooms, roomName)) return;
        const makeSetGameState = (version: number) => (newState: Immutable<RoomState>) => {
            STATE[roomName] = newState;
            setState({
                roomName,
                gameState: newState,
                stateVersion: version + 1,
                setGameState: makeSetGameState(version + 1),
            });
        };
        if (!(roomName in STATE)) {
            STATE[roomName] = TestRooms[roomName]();
        }
        setState({
            roomName,
            gameState: STATE[roomName],
            stateVersion: 1,
            setGameState: makeSetGameState(1),
        });
    }, [roomName]);
    return state;
}
