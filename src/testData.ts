import { RoomPhase, RoomState, SetupState } from "./gameState";

const starting: SetupState = {
    phase: RoomPhase.SETUP,
    players: [
        { name: "player1" },
        { name: "player2" },
        { name: "player3" },
    ],
};
export const TestRooms: Record<string, RoomState> = {
    starting,
};
