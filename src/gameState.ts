import { Token, PokerCard, Round } from "./gameTypes";

export enum RoomPhase {
    SETUP = 'setup',
    BIDDING = 'bidding',
    SCORING = 'scoring',
};

export interface SetupPlayer {
    name: string,
}

export interface SetupState {
    phase: RoomPhase.SETUP,
    players: SetupPlayer[],
}

export const NEW_ROOM: SetupState = {
    phase: RoomPhase.SETUP,
    players: [],
};

export interface StartedPlayer {
    name: string,
    hand: PokerCard[],
    pastTokens: Token[],
    token: Token | null,
}

// 0-indexed
export type PlayerNumber = number;

export interface RoundLogEntry {
    player: PlayerNumber,
    action: {
        // Taking a token from another player or from the centre
        take: Token,
        from: PlayerNumber | null,
    } | {
        // Putting a token back in the centre
        put: Token
    },
}

export interface BaseStartedState {
    players: StartedPlayer[],
    communityCards: PokerCard[],
    deck: PokerCard[],
    log: RoundLogEntry[][],
}

export interface BiddingState extends BaseStartedState {
    phase: RoomPhase.BIDDING,
    tokens: (Token | null)[],
    futureRounds: Round[],
}

export interface ScoringState extends BaseStartedState {
    phase: RoomPhase.SCORING,
}

export type StartedState = BiddingState | ScoringState;
export type RoomState = SetupState | StartedState;
