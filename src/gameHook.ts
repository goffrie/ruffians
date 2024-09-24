import { useState, useEffect } from "react";
import { delay, deepEqual } from "./utils";
import { callCommit, callList } from "./gameAPI";
import { TestRooms } from "./testData";
import { RoomState } from "./gameState";
import { Immutable } from "mutative";

export type GameRoom<State = RoomState> = {
    roomName: string;
    gameState: State;
    stateVersion: number;
    setGameState: (newState: Immutable<RoomState>, abortSignal: AbortSignal) => void;
};

function useDevGame(roomName: string): Immutable<GameRoom> | null {
    // not really my favourite
    const useFake = Object.prototype.hasOwnProperty.call(TestRooms, roomName);
    const fake = useFakeGame(roomName);
    const real = useRealGame(useFake ? "" : roomName);
    return useFake ? fake : real;
}

export const useGame = process.env.NODE_ENV === "development" ? useDevGame : useRealGame;

async function listLoop(roomName: string, version: number, signal: AbortSignal): Promise<GameRoom | null> {
    let backoff = 1000;
    while (true) {
        try {
            const result = await callList(roomName, version, signal);
            backoff = 1000;
            if (result == null) {
                // TODO: potentially add error state
                return null;
            } else if ("timeout" in result) {
                continue;
            } else {
                return {
                    roomName,
                    gameState: result.data,
                    stateVersion: result.version,
                    setGameState: (newState, abortSignal) => {
                        callCommit(roomName, result.version, newState, abortSignal)
                            .then((response) => {
                                if (!response.success) {
                                    console.log("commit failed; race condition occurred");
                                }
                            })
                            .catch((reason) => {
                                if (!abortSignal.aborted) {
                                    console.error(reason);
                                }
                            });
                    },
                };
            }
        } catch (e) {
            if (signal.aborted) return null;
            console.error(e);
            // back off and retry
            console.log(`Backing off for ${backoff} ms`);
            await delay(backoff);
            backoff *= Math.random() + 0.5;
            backoff = Math.min(backoff, 30000);
            continue;
        }
    }
}

function useRealGame(roomName: string): Immutable<GameRoom> | null {
    const [state, setState] = useState<Immutable<GameRoom> | null>(null);
    const version = state?.stateVersion || 0;
    useEffect(() => {
        const abortController = new AbortController();
        if (roomName) {
            listLoop(roomName, version, abortController.signal).then(setState);
        }
        return () => abortController.abort();
    }, [roomName, version]);
    return state;
}

function useFakeGame(roomName: string): Immutable<GameRoom> | null {
    const [state, setState] = useState<Immutable<GameRoom> | null>(null);
    useEffect(() => {
        if (!Object.prototype.hasOwnProperty.call(TestRooms, roomName)) return;
        const makeSetGameState = (version: number) => (newState: Immutable<RoomState>) => {
            setState({
                roomName,
                gameState: newState,
                stateVersion: version + 1,
                setGameState: makeSetGameState(version + 1),
            });
        };
        setState({
            roomName,
            gameState: TestRooms[roomName](),
            stateVersion: 1,
            setGameState: makeSetGameState(1),
        });
    }, [roomName]);
    return state;
}

// GOTCHA: the mutation *must* be idempotent!
export function useMutateGame<State, Mutation>(
    game: Immutable<GameRoom<State>>,
    mutator: (gameState: Immutable<State>, mutation: Mutation) => Immutable<RoomState>,
    initial?: Mutation
): [Mutation | undefined, (arg: Mutation) => void] {
    const { gameState, setGameState } = game;
    const [mutation, setMutation] = useState<Mutation | undefined>(initial);
    useEffect(() => {
        if (mutation === undefined) return;
        const newState = mutator(gameState, mutation);
        if (deepEqual(gameState, newState)) {
            // noop.
            setMutation(undefined);
            return;
        }
        const abortController = new AbortController();
        setGameState(newState, abortController.signal);
        return () => abortController.abort();
    }, [setGameState, gameState, mutator, mutation]);
    return [mutation, setMutation];
}
