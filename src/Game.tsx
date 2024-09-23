import { GameRoom, useGame, useMutateGame } from "./gameHook";
import { advanceRound, makeDeck, makeInitialGame } from "./gameImpl";
import { BiddingState, RoomPhase, RoomState, ScoringState, SetupState, StartedState } from "./gameState";
import { CardValue, PokerCard, Suit, Token } from "./gameTypes";
import { deepEqual, Immutable } from "./utils";
import styles from "./Game.module.css";
import { create } from "mutative";
import { bestHandAmong, HandKind, PokerHand, pokerHandLessThan } from "./pokerScoring";
import { useMemo, useState } from "react";

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
        case RoomPhase.SCORING:
            return <ScoringGame username={username} game={{ ...game, gameState: game.gameState }} />;
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
    return <div className={styles.container}>
        <div className={styles.players}>
            {
                game.gameState.players.map((p) => <div className={styles.player}>{p.name}{p.name === username && <>{" "}<button onClick={leaveRoom}>Leave</button></>}</div>)
            }
            {
                !inRoom && <button onClick={joinRoom}>Join</button>
            }
        </div>
        <div>
            <div className={styles.heading}>Creating game</div>
            <button className="startGame" disabled={!inRoom || game.gameState.players.length < 2} onClick={startGame}>Start game</button>
        </div>
    </div>;
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

function killGameMutator(game: Immutable<BiddingState>): Immutable<SetupState> {
    return {
        phase: RoomPhase.SETUP,
        players: game.players.map((p) => ({ name: p.name })),
    };
}

type BiddingGameProps = { username: string, setUsername: (name: string) => void, game: Immutable<GameRoom<BiddingState>> };
function BiddingGame(props: BiddingGameProps) {
    const { username, setUsername, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);
    const [, setMoveToken] = useMutateGame(game, moveTokenMutator);
    const [, setAdvanceRound] = useMutateGame(game, advanceRoundMutator);
    const [, setKillGame] = useMutateGame(game, killGameMutator);
    const [reallyKillGame, setReallyKillGame] = useState(false);
    return <div className={styles.container}>
        <div className={styles.players}>
            {
                game.gameState.players.map((p) => <div className={styles.player}>
                    {p.name}
                    {process.env.NODE_ENV !== "production" && p.name !== username && <button onClick={() => setUsername(p.name)}>Impersonate</button>}
                    {p.name === username && " (You)"}
                    <br />
                    {p.hand.map((c) => (!inRoom || p.name === username ? <Card card={c} /> : <NoCard />))}<br />
                    {p.pastTokens.map((t) => <TokenV token={t} disabled={true} />)}
                    {p.token ? <TokenV token={p.token} disabled={false} onClick={() => setMoveToken([username, username === p.name ? null : p.token, p.name])} /> : <NoToken />}
                </div>)
            }
        </div>
        <div>
            <div className={styles.heading}>
                Round {game.gameState.log.length}
                {!inRoom && " (You are spectating.)"}
                {inRoom && <button onClick={() => {
                    if (reallyKillGame) {
                        setKillGame(true);
                    } else {
                        setReallyKillGame(true);
                    }
                }}>{reallyKillGame ? "Really go back to game setup" : "Go back to game setup"}</button>}
                {reallyKillGame && <button onClick={() => setReallyKillGame(false)}>Just kidding</button>}
            </div>
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
            <button disabled={!inRoom || !game.gameState.tokens.every((t) => t == null)} onClick={() => setAdvanceRound(true)}>
                {game.gameState.futureRounds.length === 0 ? "Finish" : "Next round"}
            </button>
        </div>
    </div>;
}

function setRevealIndexMutator(game: Immutable<ScoringState>, newRevealIndex: number): Immutable<ScoringState> {
    return { ...game, revealIndex: Math.max(game.revealIndex, newRevealIndex) };
}

function startNewGameMutator(game: Immutable<ScoringState>): Immutable<StartedState> {
    return makeInitialGame(game.players);
}

type ScoringGameProps = { username: string, game: Immutable<GameRoom<ScoringState>> };
function ScoringGame(props: ScoringGameProps) {
    const { username, game } = props;
    const { players, communityCards, revealIndex } = game.gameState;
    const handScores = useMemo(() => players.map((p) => bestHandAmong([...p.hand, ...communityCards])), [players, communityCards]);
    const inRoom = players.some((p) => p.name === username);
    const [, setRevealIndex] = useMutateGame(game, setRevealIndexMutator);
    const [, setStartNewGame] = useMutateGame(game, startNewGameMutator);
    const revealedPlayerIndex = players.findIndex((p) => p.token!.index === revealIndex);
    const revealedPlayerBestHand = new Set(handScores[revealedPlayerIndex][0]);
    const gameWon = useMemo(() => {
        const playerScores = players.map((p, i) => ({ index: p.token!.index, score: handScores[i][1] }));
        playerScores.sort((p, q) => p.index - q.index);
        return playerScores.every((p, i) => i === 0 || !pokerHandLessThan(p.score, playerScores[i - 1].score));
    }, [players, handScores]);
    return <div className={styles.container}>
        <div className={styles.players}>
            {
                players.map((p, i) => <div className={`${styles.player} ${i === revealedPlayerIndex ? styles.highlightPlayer : ""}`}>
                    {p.name}
                    {p.name === username && " (You)"}
                    <br />
                    {p.hand.map((c) => (!inRoom || p.name === username || (p.token!.index <= revealIndex) ? <Card card={c} highlight={revealedPlayerBestHand.has(c)} /> : <NoCard />))}
                    {p.token!.index <= revealIndex && <div className={styles.handScore}>
                        {formatScore(handScores[i][1])}
                    </div>}
                    <br />
                    {p.pastTokens.map((t) => <TokenV token={t} disabled={true} />)}
                    <TokenV token={p.token!} disabled={true} />
                </div>)
            }
        </div>
        <div>
            <div className={styles.heading}>
                Scoring: {revealIndex} ({players[revealedPlayerIndex].name})
            </div>
            <div className={styles.communityCards}>
                {
                    game.gameState.communityCards.map((c) => <Card card={c} highlight={revealedPlayerBestHand.has(c)} />)
                }
            </div>
            {revealIndex < players.length && <button disabled={!inRoom} onClick={() => setRevealIndex(revealIndex + 1)}>
                Reveal {revealIndex + 1} ({players.find((p) => p.token!.index === revealIndex + 1)?.name})
            </button>}
            {revealIndex === players.length && <>
                <div className={styles.gameResult}>
                    {gameWon ? "You won this one!" : "You didn't wonnered."}
                </div>
                <button onClick={() => setStartNewGame(true)}>
                    Next game
                </button>
            </>}
        </div>
    </div>;
}

const BREAK: Record<HandKind, number | null> = {
    [HandKind.Flush]: null,
    [HandKind.HighCard]: null,
    [HandKind.Straight]: null,
    [HandKind.StraightFlush]: null,
    [HandKind.FourOfAKind]: 1,
    [HandKind.Pair]: 1,
    [HandKind.TwoPair]: 2,
    [HandKind.ThreeOfAKind]: 1,
    [HandKind.FullHouse]: 2,
}
const HAND_KIND_NAME: Record<HandKind, string> = {
    [HandKind.Flush]: "Flush",
    [HandKind.HighCard]: "High card",
    [HandKind.Straight]: "Straight",
    [HandKind.StraightFlush]: "Straight flush",
    [HandKind.FourOfAKind]: "Four of a kind",
    [HandKind.Pair]: "Pair",
    [HandKind.TwoPair]: "Two pair",
    [HandKind.ThreeOfAKind]: "Three of a kind",
    [HandKind.FullHouse]: "Full house",
}
function formatScore(score: Immutable<PokerHand>) {
    const brk = BREAK[score.kind];
    if (score.kind === HandKind.StraightFlush && score.order[0] === CardValue.Ace) {
        // wow you are so cool
        return <>Royal Flush!!!</>;
    }
    return <>{HAND_KIND_NAME[score.kind]} (
        {score.order.slice(0, brk != null ? brk : score.order.length).map(formatCardValue).join(",")}
        {brk != null ? "; " + score.order.slice(brk).map(formatCardValue).join(",") : ""}
        )</>
}

const STRING_VALUES: Record<number, string> = {
    [CardValue.Ace]: "A",
    [CardValue.Jack]: "J",
    [CardValue.Queen]: "Q",
    [CardValue.King]: "K",
};
function formatCardValue(value: CardValue): string {
    return STRING_VALUES[value] ?? value.toString();
}
const UNICODE_SUITS = {
    [Suit.Diamonds]: "♦",
    [Suit.Hearts]: "♥",
    [Suit.Clubs]: "♣",
    [Suit.Spades]: "♠",
};

function Card(props: { card: PokerCard, highlight?: boolean }) {
    const { card, highlight } = props;
    return <div className={`${styles.card} ${highlight ? styles.cardHighlight : ""}`}>
        {formatCardValue(card.value)}
        <br />
        <span className={(card.suit === Suit.Diamonds || card.suit === Suit.Hearts) ? styles.redSuit : styles.blackSuit}>{UNICODE_SUITS[card.suit]}</span>
    </div>;
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
