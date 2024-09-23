import { GameRoom, useGame, useMutateGame } from "./gameHook";
import { advanceRound, makeDeck, makeInitialGame } from "./gameImpl";
import { BiddingState, RoomPhase, RoomState, ScoringState, SetupState, StartedState } from "./gameState";
import { CardValue, PokerCard, Suit, Token } from "./gameTypes";
import { deepEqual, Immutable } from "./utils";
import styles from "./Game.module.css";
import { create } from "mutative";

type Props = { username: string, setUsername: (name: string) => void, roomName: string };
export function Game(props: Props) {
    const { username, setUsername, roomName } = props;
    const game = useGame(roomName);
    if (!game) {
        return <div>loading...</div>;
    }
    switch (game.gameState.phase) {
        case RoomPhase.SETUP:
            // https://github.com/microsoft/TypeScript/issues/18758
            return <SetupGame username={username} game={{ ...game, gameState: game.gameState }} />;
        case RoomPhase.BIDDING:
            return <BiddingGame username={username} setUsername={setUsername} game={{ ...game, gameState: game.gameState }} />;
    }
    return <div>todo</div>;
}

type SetupGameProps = { username: string, game: Immutable<GameRoom<SetupState>> };
function joinRoomMutator(game: Immutable<SetupState>, username: string): Immutable<SetupState> {
    if (game.players.some((p) => p.name === username)) return game;
    return { ...game, players: [...game.players, { name: username }] };
}
function leaveRoomMutator(game: Immutable<SetupState>, username: string): Immutable<SetupState> {
    return { ...game, players: game.players.filter((p) => p.name !== username) };
}
function startGameMutator(game: Immutable<SetupState>): Immutable<StartedState> {
    return makeInitialGame(game.players);
}
function SetupGame(props: SetupGameProps) {
    const { username, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);

    const [, setJoinRoom] = useMutateGame(game, joinRoomMutator);
    const [, setLeaveRoom] = useMutateGame(game, leaveRoomMutator);
    const joinRoom = () => setJoinRoom(username);
    const leaveRoom = () => setLeaveRoom(username);

    const [, setStartGame] = useMutateGame(game, startGameMutator);
    const startGame = () => setStartGame(true);
    return <>
        <button className="startGame" disabled={!inRoom || game.gameState.players.length < 2} onClick={startGame}>Start game</button>
        {
            game.gameState.players.map((p) => <div className={styles.player}>{p.name}{p.name === username && <>{" "}<button onClick={leaveRoom}>Leave</button></>}</div>)
        }
        {
            !inRoom && <button onClick={joinRoom}>Join</button>
        }
    </>;
}

function moveTokenMutator(game: Immutable<BiddingState>, [username, token, from]: [string, Token | null, string | null]): Immutable<BiddingState> {
    return create(game, (draft) => {
        const toPlayer = draft.players.find((p) => p.name === username);
        if (!toPlayer) return;
        const relinquish = () => {
            if (toPlayer.token) {
                draft.tokens[toPlayer.token.index - 1] = toPlayer.token;
                toPlayer.token = null;
            }
        }
        if (!token) {
            relinquish();
        } else if (from != null) {
            if (from === username) return; // this makes no sense
            // take from another player
            const fromPlayer = draft.players.find((p) => p.name === from);
            if (fromPlayer && deepEqual(fromPlayer.token, token)) {
                relinquish();
                toPlayer.token = fromPlayer.token;
                fromPlayer.token = null;
            }
        } else {
            const ix = draft.tokens.findIndex((t) => deepEqual(t, token));
            if (ix !== -1) {
                draft.tokens[ix] = null;
                relinquish();
                toPlayer.token = token;
            }
        }
    });
}

function advanceRoundMutator(game: Immutable<BiddingState>): Immutable<RoomState> {
    if (!game.tokens.every((t) => t == null)) return game;
    return advanceRound(game);
}

type BiddingGameProps = { username: string, setUsername: (name: string) => void, game: Immutable<GameRoom<BiddingState>> };
function BiddingGame(props: BiddingGameProps) {
    const { username, setUsername, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);
    const [, setMoveToken] = useMutateGame(game, moveTokenMutator);
    const [, setAdvanceRound] = useMutateGame(game, advanceRoundMutator);
    return <>
        <div>
            Round {game.gameState.log.length}
        </div>
        {
            game.gameState.players.map((p) => <div className={styles.player}>
                {p.name}{process.env.NODE_ENV !== "production" && p.name !== username && <button onClick={() => setUsername(p.name)}>Impersonate</button>}<br />
                {p.hand.map((c) => (!inRoom || p.name === username ? <Card card={c} /> : <NoCard />))}<br />
                {p.pastTokens.map((t) => <TokenV token={t} disabled={true} />)}
                {p.token ? <TokenV token={p.token} disabled={false} onClick={() => setMoveToken([username, username === p.name ? null : p.token, p.name])} /> : <NoToken />}
            </div>)
        }
        <div className={styles.communityCards}>
            {
                game.gameState.communityCards.map((c) => <Card card={c} />)
            }
            {
                Array.from({ length: game.gameState.futureRounds.reduce((c, r) => r.cards + c, 0) }).map(() => <NoCard />)
            }
        </div>
        <div className={styles.tokenPool}>
            {
                game.gameState.tokens.map((token) => token ? <TokenV token={token} disabled={false} onClick={() => setMoveToken([username, token, null])} /> : <NoToken />)
            }
        </div>
        <button disabled={!game.gameState.tokens.every((t) => t == null)} onClick={() => setAdvanceRound(true)}>
            {game.gameState.futureRounds.length === 0 ? "Finish" : "Next round"}
        </button>
    </>;
}

const STRING_VALUES: Record<number, string> = {
    [CardValue.Ace]: "A",
    [CardValue.Jack]: "J",
    [CardValue.Queen]: "Q",
    [CardValue.King]: "K",
};
const UNICODE_SUITS = {
    [Suit.Diamonds]: "♦",
    [Suit.Hearts]: "♥",
    [Suit.Clubs]: "♣",
    [Suit.Spades]: "♠",
};

function Card(props: { card: PokerCard }) {
    const { card } = props;
    return <div className={styles.card}>{STRING_VALUES[card.value] ?? card.value.toString()}<br />{UNICODE_SUITS[card.suit]}</div>;
}

function NoCard() {
    return <div className={styles.noCard}></div>
}

// how 2 naming?
function TokenV(props: { token: Token, disabled: boolean, onClick?: () => void }) {
    const { token, disabled, onClick } = props;
    return <button className={styles.token} disabled={disabled} onClick={onClick}>{token.index}</button>
}

function NoToken() {
    return <div className={styles.noToken} />
}
