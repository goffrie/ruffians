import { GameRoom, useGame, useMutateGame } from "./gameHook";
import { advanceRound, makeInitialGame, maybeResolveJokers } from "./gameImpl";
import {
    BiddingState,
    JokerLogEntry,
    ResolveJokersState,
    RoomPhase,
    RoomState,
    RoundLogEntry,
    ScoringState,
    SetupState,
    StartedPlayer,
    StartedState,
} from "./gameState";
import { CardValue, DeckCard, Suit, Token } from "./gameTypes";
import { deepEqual } from "./utils";
import * as styles from "./Game.module.css";
import { create, Immutable } from "mutative";
import { bestHandAmong, HandKind, PokerHand, pokerHandLessThan } from "./pokerScoring";
import { useMemo, useState } from "react";
import { TokenAnimator, TokenV } from "./TokenV";

type Props = {
    username: string;
    setUsername: (name: string) => void;
    roomName: string;
};
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
        case RoomPhase.RESOLVE_JOKERS:
            return (
                <ResolveJokersGame
                    username={username}
                    setUsername={setUsername}
                    game={{ ...game, gameState: game.gameState }}
                />
            );
        case RoomPhase.BIDDING:
            return (
                <TokenAnimator>
                    <BiddingGame
                        username={username}
                        setUsername={setUsername}
                        game={{ ...game, gameState: game.gameState }}
                    />
                </TokenAnimator>
            );
        case RoomPhase.SCORING:
            return <ScoringGame username={username} game={{ ...game, gameState: game.gameState }} />;
    }
}

type SetupGameProps = {
    username: string;
    game: Immutable<GameRoom<SetupState>>;
};
function joinRoomMutator(game: Immutable<SetupState>, username: string): Immutable<SetupState> {
    if (game.players.some((p) => p.name === username)) return game;
    return { ...game, players: [...game.players, { name: username }] };
}
function leaveRoomMutator(game: Immutable<SetupState>, username: string): Immutable<SetupState> {
    return {
        ...game,
        players: game.players.filter((p) => p.name !== username),
    };
}
function withJokersMutator(game: Immutable<SetupState>, withJokers: boolean): Immutable<SetupState> {
    return { ...game, config: { ...game.config, withJokers } };
}
function startGameMutator(game: Immutable<SetupState>): Immutable<StartedState> {
    return makeInitialGame(game.players, game.config);
}
function SetupGame(props: SetupGameProps) {
    const { username, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);

    const [, setJoinRoom] = useMutateGame(game, joinRoomMutator);
    const [, setLeaveRoom] = useMutateGame(game, leaveRoomMutator);
    const joinRoom = () => setJoinRoom(username);

    const [withJokersMutation, setWithJokers] = useMutateGame(game, withJokersMutator);

    const [, setStartGame] = useMutateGame(game, startGameMutator);
    const startGame = () => setStartGame(true);
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {game.gameState.players.map((p) => (
                    <div className={styles.player} key={p.name}>
                        <span className={styles.playerName}>{p.name}</span>
                        {inRoom && (
                            <>
                                {" "}
                                <button onClick={() => setLeaveRoom(p.name)}>
                                    {p.name === username ? "Leave" : "Kick"}
                                </button>
                            </>
                        )}
                    </div>
                ))}
                {!inRoom && <button onClick={joinRoom}>Join</button>}
            </div>
            <div>
                <div className={styles.heading}>Creating game</div>
                <input
                    type="checkbox"
                    checked={withJokersMutation ?? game.gameState.config.withJokers}
                    onChange={(e) => setWithJokers(e.target.checked)}
                    id="with_jokers"
                />{" "}
                <label htmlFor="with_jokers">Include jokers in the deck</label>
                <br />
                <button
                    className="startGame"
                    disabled={!inRoom || game.gameState.players.length < 2 || withJokersMutation != null}
                    onClick={startGame}
                >
                    Start game
                </button>
            </div>
        </div>
    );
}

function moveTokenMutator(
    game: Immutable<BiddingState>,
    [username, token, from]: [string, Token | null, string | null]
): Immutable<BiddingState> {
    return create(game, (draft) => {
        const toPlayerIndex = draft.players.findIndex((p) => p.name === username);
        if (toPlayerIndex === -1) return;
        const toPlayer = draft.players[toPlayerIndex];
        const log = draft.log[draft.log.length - 1];
        const relinquish = () => {
            if (toPlayer.token) {
                const t = toPlayer.token;
                draft.tokens[toPlayer.token.index - 1] = t;
                toPlayer.token = null;
                return t;
            }
            return null;
        };
        if (!token) {
            const put = relinquish();
            if (put) {
                log.push({ player: toPlayerIndex, action: { put } });
            }
        } else if (from != null) {
            if (from === username) return; // this makes no sense
            // take from another player
            const fromPlayerIndex = draft.players.findIndex((p) => p.name === from);
            if (fromPlayerIndex !== -1) {
                const fromPlayer = draft.players[fromPlayerIndex];
                if (deepEqual(fromPlayer.token, token)) {
                    const put = relinquish();
                    log.push({
                        player: toPlayerIndex,
                        action: { from: fromPlayerIndex, put, take: token },
                    });
                    toPlayer.token = fromPlayer.token;
                    fromPlayer.token = null;
                }
            }
        } else {
            const ix = draft.tokens.findIndex((t) => deepEqual(t, token));
            if (ix !== -1) {
                draft.tokens[ix] = null;
                const put = relinquish();
                log.push({
                    player: toPlayerIndex,
                    action: { from: null, put, take: token },
                });
                toPlayer.token = token;
            }
        }
    });
}

function advanceRoundMutator(game: Immutable<BiddingState>): Immutable<RoomState> {
    if (!game.tokens.every((t) => t == null)) return game;
    return advanceRound(game);
}

function selectCardMutator(
    game: Immutable<ResolveJokersState>,
    [username, card, index]: [string, DeckCard, number]
): Immutable<StartedState> {
    return maybeResolveJokers(
        create(game, (draft) => {
            const player = draft.players.find((p) => p.name === username);
            if (!player) return;
            const stackIndex = player.hand.findIndex((cards) => cards instanceof Array);
            if (stackIndex === -1) return;
            if (!deepEqual((player.hand[stackIndex] as Immutable<DeckCard[]>)[index], card)) return;
            player.hand[stackIndex] = card;
        })
    );
}

type ResolveJokersGameProps = {
    username: string;
    setUsername: (name: string) => void;
    game: Immutable<GameRoom<ResolveJokersState>>;
};
function ResolveJokersGame(props: ResolveJokersGameProps) {
    const { username, setUsername, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);
    const [, setSelectCard] = useMutateGame(game, selectCardMutator);
    const selectCard = (card: DeckCard, index: number) => {
        setSelectCard([username, card, index]);
    };
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {game.gameState.players.map((p) => (
                    <div className={styles.player} key={p.name}>
                        <span className={styles.playerName}>{p.name}</span>
                        {process.env.NODE_ENV !== "production" && p.name !== username && (
                            <button onClick={() => setUsername(p.name)}>Impersonate</button>
                        )}
                        {p.name === username && " (You)"}
                        <br />
                        <div className={styles.hand}>
                            {p.hand.map((c, i) =>
                                !inRoom || p.name === username ? (
                                    c instanceof Array ? (
                                        <CardStack
                                            cards={c}
                                            onClick={p.name === username ? selectCard : undefined}
                                            key={i}
                                        />
                                    ) : (
                                        <Card card={c} key={i} />
                                    )
                                ) : (
                                    <NoCard key={i} />
                                )
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div>
                <div className={styles.heading}>
                    Waiting for players to choose their cards {inRoom && <KillGameButton game={game} />}
                </div>
                <GameLog players={game.gameState.players} jokerLog={game.gameState.jokerLog} log={[]} />
            </div>
        </div>
    );
}

type BiddingGameProps = {
    username: string;
    setUsername: (name: string) => void;
    game: Immutable<GameRoom<BiddingState>>;
};
function BiddingGame(props: BiddingGameProps) {
    const { username, setUsername, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);
    const [, setMoveToken] = useMutateGame(game, moveTokenMutator);
    const [, setAdvanceRound] = useMutateGame(game, advanceRoundMutator);
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {game.gameState.players.map((p) => (
                    <div className={styles.player} key={p.name}>
                        <span className={styles.playerName}>{p.name}</span>
                        {process.env.NODE_ENV !== "production" && p.name !== username && (
                            <button onClick={() => setUsername(p.name)}>Impersonate</button>
                        )}
                        {p.name === username && " (You)"}
                        <br />
                        <div className={styles.hand}>
                            {p.hand.map((c, i) =>
                                !inRoom || p.name === username ? <Card card={c} key={i} /> : <NoCard key={i} />
                            )}
                            {p.pastTokens.map((t, i) => (
                                <TokenV token={t} past={true} disabled={true} key={i} />
                            ))}
                            <TokenV
                                token={p.token}
                                disabled={false}
                                onClick={() => setMoveToken([username, username === p.name ? null : p.token, p.name])}
                            />
                        </div>
                        <div className={styles.handScore}>&nbsp;</div>
                    </div>
                ))}
            </div>
            <div>
                <div className={styles.heading}>
                    Round {game.gameState.log.length} {!inRoom && "(You are spectating.)"}
                    {inRoom && <KillGameButton game={game} />}
                </div>
                <div className={styles.communityCards}>
                    {game.gameState.communityCards.map((c, i) =>
                        c instanceof Array ? <CardStack cards={c} key={i} /> : <Card card={c} key={i} />
                    )}
                    {Array.from({
                        length: game.gameState.futureRounds.reduce((c, r) => r.cards + c, 0),
                    }).map((_, i) => (
                        <NoCard key={i} />
                    ))}
                </div>
                <div className={styles.tokenPool}>
                    {game.gameState.tokens.map((token, i) => (
                        <TokenV
                            token={token}
                            disabled={false}
                            onClick={() => setMoveToken([username, token, null])}
                            key={i}
                        />
                    ))}
                </div>
                <button
                    disabled={!inRoom || !game.gameState.tokens.every((t) => t == null)}
                    onClick={() => setAdvanceRound(true)}
                >
                    {game.gameState.futureRounds.length === 0 ? "Finish" : "Next round"}
                </button>
                <GameLog players={game.gameState.players} jokerLog={game.gameState.jokerLog} log={game.gameState.log} />
            </div>
        </div>
    );
}

function killGameMutator(game: Immutable<StartedState>): Immutable<SetupState> {
    return {
        phase: RoomPhase.SETUP,
        players: game.players.map((p) => ({ name: p.name })),
        config: game.config,
    };
}

function KillGameButton({ game }: { game: Immutable<GameRoom<StartedState>> }) {
    const [, setKillGame] = useMutateGame(game, killGameMutator);
    const [reallyKillGame, setReallyKillGame] = useState(false);
    return (
        <>
            <button
                onClick={() => {
                    if (reallyKillGame) {
                        setKillGame(true);
                    } else {
                        setReallyKillGame(true);
                    }
                }}
            >
                {reallyKillGame ? "Really go back to game setup" : "Go back to game setup"}
            </button>
            {reallyKillGame && <button onClick={() => setReallyKillGame(false)}>Just kidding</button>}
        </>
    );
}

function setRevealIndexMutator(game: Immutable<ScoringState>, newRevealIndex: number): Immutable<ScoringState> {
    return { ...game, revealIndex: Math.max(game.revealIndex, newRevealIndex) };
}

function startNewGameMutator(game: Immutable<ScoringState>): Immutable<StartedState> {
    return makeInitialGame(game.players, game.config);
}

type ScoringGameProps = {
    username: string;
    game: Immutable<GameRoom<ScoringState>>;
};
function ScoringGame(props: ScoringGameProps) {
    const { username, game } = props;
    const { players, communityCards, revealIndex } = game.gameState;
    const handScores = useMemo(
        () => players.map((p) => bestHandAmong([...p.hand, ...communityCards])),
        [players, communityCards]
    );
    const inRoom = players.some((p) => p.name === username);
    const [, setRevealIndex] = useMutateGame(game, setRevealIndexMutator);
    const [, setStartNewGame] = useMutateGame(game, startNewGameMutator);
    const revealedPlayerIndex = players.findIndex((p) => p.token!.index === revealIndex);
    const revealedPlayerBestHand = new Set(handScores[revealedPlayerIndex][0]);
    const gameWon = useMemo(() => {
        const playerScores = players.map((p, i) => ({
            index: p.token!.index,
            score: handScores[i][1],
        }));
        playerScores.sort((p, q) => p.index - q.index);
        return playerScores.every((p, i) => i === 0 || !pokerHandLessThan(p.score, playerScores[i - 1].score));
    }, [players, handScores]);
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {players.map((p, i) => (
                    <div
                        className={`${styles.player} ${i === revealedPlayerIndex ? styles.highlightPlayer : ""}`}
                        key={p.name}
                    >
                        <span className={styles.playerName}>{p.name}</span>
                        {p.name === username && " (You)"}
                        <br />
                        <div className={styles.hand}>
                            {p.hand.map((c, i) =>
                                !inRoom || p.name === username || p.token!.index <= revealIndex ? (
                                    <Card card={c} highlight={revealedPlayerBestHand.has(c)} key={i} />
                                ) : (
                                    <NoCard key={i} />
                                )
                            )}
                            {p.pastTokens.map((t) => (
                                <TokenV token={t} past={true} disabled={true} key={i} />
                            ))}
                            <TokenV token={p.token!} disabled={true} />
                        </div>
                        <div className={styles.handScore}>
                            {p.token!.index <= revealIndex ? formatScore(handScores[i][1]) : <>&nbsp;</>}
                        </div>
                    </div>
                ))}
            </div>
            <div>
                <div className={styles.heading}>
                    Scoring: {revealIndex} ({players[revealedPlayerIndex].name})
                </div>
                <div className={styles.communityCards}>
                    {game.gameState.communityCards.map((c, i) => (
                        <CardStack cards={c} highlight={revealedPlayerBestHand} key={i} />
                    ))}
                </div>
                <div className={styles.revealLog}>
                    {players.slice(1, revealIndex).map((p, j) => {
                        const i = j + 1;
                        const beat = !pokerHandLessThan(handScores[i][1], handScores[i - 1][1]);
                        return (
                            <div>
                                <span className={styles.playerName}>{players[i].name}</span>'s hand{" "}
                                {beat ? "beat" : "didn't beat"}{" "}
                                <span className={styles.playerName}>{players[i - 1].name}</span>.
                            </div>
                        );
                    })}
                </div>
                {revealIndex < players.length && (
                    <button disabled={!inRoom} onClick={() => setRevealIndex(revealIndex + 1)}>
                        Reveal {revealIndex + 1} ({players.find((p) => p.token!.index === revealIndex + 1)?.name})
                    </button>
                )}
                {revealIndex === players.length && (
                    <>
                        <div className={styles.gameResult}>
                            {gameWon ? "You won this one!" : "You didn't wonnered."}
                        </div>
                        <button onClick={() => setStartNewGame(true)}>Next game</button>
                    </>
                )}
                <GameLog players={game.gameState.players} jokerLog={game.gameState.jokerLog} log={game.gameState.log} />
            </div>
        </div>
    );
}

function GameLog({
    players,
    jokerLog,
    log,
}: {
    players: Immutable<StartedPlayer<object>[]>;
    jokerLog: Immutable<JokerLogEntry[]>;
    log: Immutable<RoundLogEntry[][]>;
}) {
    return (
        <>
            <div className={styles.log}>
                {jokerLog.length > 0 && (
                    <div className={styles.roundLog}>
                        <h2>Setup</h2>
                        {jokerLog.map((entry, i) => (
                            <div className={styles.roundLogEntry} key={i}>
                                <span className={styles.playerName}>{players[entry.player].name}</span> discarded a
                                joker
                            </div>
                        ))}
                    </div>
                )}
                {log.map((roundLog, roundIndex) => (
                    <div className={styles.roundLog} key={roundIndex}>
                        <h2>Round {roundIndex + 1}</h2>
                        {roundLog.map((logEntry, i) => (
                            <div className={styles.roundLogEntry} key={i}>
                                <span className={styles.playerName}>{players[logEntry.player].name}</span>
                                {"take" in logEntry.action ? (
                                    <>
                                        {" "}
                                        took the <SmallToken token={logEntry.action.take} /> from{" "}
                                        {logEntry.action.from == null ? (
                                            <>the middle</>
                                        ) : (
                                            <span className={styles.playerName}>
                                                {players[logEntry.action.from].name}
                                            </span>
                                        )}
                                        {logEntry.action.put != null && (
                                            <>
                                                {" "}
                                                and returned the <SmallToken token={logEntry.action.put} />
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {" "}
                                        returned the <SmallToken token={logEntry.action.put} />
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </>
    );
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
    [HandKind.FullHouse]: null,
};
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
};
function formatScore(score: Immutable<PokerHand>) {
    const brk = BREAK[score.kind];
    if (score.kind === HandKind.StraightFlush && score.order[0] === CardValue.Ace) {
        // wow you are so cool
        return <>Royal Flush!!!</>;
    }
    return (
        <>
            {HAND_KIND_NAME[score.kind]} (
            {score.order
                .slice(0, brk != null ? brk : score.order.length)
                .map(formatCardValue)
                .join(",")}
            {brk != null ? "; " + score.order.slice(brk).map(formatCardValue).join(",") : ""})
        </>
    );
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

function Card(props: { card: Immutable<DeckCard>; onClick?: () => void; highlight?: boolean }) {
    const { card, onClick, highlight } = props;
    return (
        <div
            className={`${styles.card} ${highlight ? styles.cardHighlight : ""} ${
                onClick != null ? styles.cardClickable : ""
            }`}
            onClick={onClick}
        >
            {"joker" in card ? (
                <>!</>
            ) : (
                <>
                    {formatCardValue(card.value)}
                    <br />
                    <span
                        className={
                            card.suit === Suit.Diamonds || card.suit === Suit.Hearts ? styles.redSuit : styles.blackSuit
                        }
                    >
                        {UNICODE_SUITS[card.suit]}
                    </span>
                </>
            )}
        </div>
    );
}

function CardStack(props: {
    cards: Immutable<DeckCard[]>;
    onClick?: (card: DeckCard, index: number) => void;
    highlight?: Set<Immutable<DeckCard>>;
}) {
    const { cards, onClick, highlight } = props;
    return (
        <div className={styles.cardStack}>
            {cards.map((card, i) => (
                <Card
                    card={card}
                    onClick={onClick != null ? () => onClick(card, i) : undefined}
                    highlight={highlight?.has(card)}
                    key={i}
                />
            ))}
        </div>
    );
}

function NoCard() {
    return <div className={styles.noCard}></div>;
}

function SmallToken({ token }: { token: Token }) {
    return <span className={styles.smallToken}>{token.index}</span>;
}
