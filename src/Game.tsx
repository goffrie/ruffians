import { GameRoom, useGame, useMutateGame } from "./gameHook";
import { advanceRound, DEFAULT_GAME, gameHandsAreResolved, makeInitialGame, maybeResolveJokers } from "./gameImpl";
import {
    BiddingState,
    GameMode,
    JokerLogEntry,
    NEW_ROOM,
    RoomPhase,
    RoomState,
    RoundLogEntry,
    ScoringState,
    SetupState,
    StartedPlayer,
    StartedState,
    WinRecord,
} from "./gameState";
import { CardValue, DeckCard, Suit, Token } from "./gameTypes";
import { deepEqual } from "./utils";
import * as styles from "./Game.module.css";
import { create, Immutable } from "mutative";
import { bestHandAmong, bestOmahaHand, HandKind, PokerHand, pokerHandLessThan } from "./pokerScoring";
import { useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_STYLES, TokenAnimator, TokenV } from "./TokenV";
import { FxProvider, FxContext } from "./Fx";
import { PreferencesPanel, usePreferences, PreferencesProvider } from "./Preferences";
import { NoteModal } from "./NoteModal";

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
    return (
        <PreferencesProvider>
            <GameInner username={username} setUsername={setUsername} game={game} />
        </PreferencesProvider>
    );
}

function GameInner(props: { username: string; setUsername: (name: string) => void; game: Immutable<GameRoom> }) {
    const { username, setUsername, game } = props;
    switch (game.gameState.phase) {
        case RoomPhase.SETUP:
            // https://github.com/microsoft/TypeScript/issues/18758
            return <SetupGame username={username} game={{ ...game, gameState: game.gameState }} />;
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
            return (
                <FxProvider>
                    <ScoringGame username={username} game={{ ...game, gameState: game.gameState }} />
                </FxProvider>
            );
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
    return create(game, (draft) => {
        draft.config.withJokers = withJokers;
    });
}
function gameModeMutator(game: Immutable<SetupState>, gameMode: GameMode): Immutable<SetupState> {
    return create(game, (draft) => {
        draft.config.gameMode = gameMode;
    });
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
    const [gameModeMutation, setGameMode] = useMutateGame(game, gameModeMutator);

    const [, setStartGame] = useMutateGame(game, startGameMutator);
    const startGame = () => setStartGame(true);
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {game.gameState.players.map((p, pi) => (
                    <div className={styles.player} key={p.name}>
                        <span
                            className={styles.playerName}
                            style={p.name === username ? {} : { color: playerColour(pi) }}
                        >
                            {p.name}
                        </span>
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
                {!inRoom && (
                    <div className={styles.player}>
                        <button onClick={joinRoom}>Join room</button>
                    </div>
                )}
            </div>
            <div>
                {game.gameState.winRecord && (
                    <>
                        <WinRecordView record={game.gameState.winRecord} />
                        {game.gameState.winRecord.wins === game.gameState.winRecord.targetWins && "You won!"}
                        {game.gameState.winRecord.losses === game.gameState.winRecord.targetLosses && "You unwon."}
                    </>
                )}
                <div className={styles.heading}>Creating a new game</div>
                <input
                    type="checkbox"
                    checked={withJokersMutation ?? game.gameState.config.withJokers}
                    onChange={(e) => setWithJokers(e.target.checked)}
                    id="with_jokers"
                />{" "}
                <label htmlFor="with_jokers">Include jokers in the deck</label>
                <br />
                <div>
                    <label>Game mode:</label>
                    <div>
                        <input
                            type="radio"
                            name="gameMode"
                            id="texas_holdem"
                            checked={
                                (gameModeMutation ?? game.gameState.config.gameMode ?? GameMode.TEXAS_HOLDEM) ===
                                GameMode.TEXAS_HOLDEM
                            }
                            onChange={() => setGameMode(GameMode.TEXAS_HOLDEM)}
                        />
                        <label htmlFor="texas_holdem">Texas Hold&apos;em (2 cards)</label>
                    </div>
                    <div>
                        <input
                            type="radio"
                            name="gameMode"
                            id="omaha"
                            checked={
                                (gameModeMutation ?? game.gameState.config.gameMode ?? GameMode.TEXAS_HOLDEM) ===
                                GameMode.OMAHA
                            }
                            onChange={() => setGameMode(GameMode.OMAHA)}
                        />
                        <label htmlFor="omaha">Omaha (4 cards)</label>
                    </div>
                </div>
                <button
                    className="startGame"
                    disabled={
                        !inRoom ||
                        game.gameState.players.length < 2 ||
                        withJokersMutation != null ||
                        gameModeMutation != null
                    }
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

function addNoteMutator(
    game: Immutable<BiddingState>,
    [username, tokenKey, noteText]: [string, string, string]
): Immutable<BiddingState> {
    return create(game, (draft) => {
        if (!draft.notes) {
            draft.notes = {};
        }
        if (!draft.notes[username]) {
            draft.notes[username] = {};
        }
        if (noteText.trim() === "") {
            // Delete note if empty
            delete draft.notes[username][tokenKey];
            // Clean up empty user entries
            if (Object.keys(draft.notes[username]).length === 0) {
                delete draft.notes[username];
            }
        } else {
            draft.notes[username][tokenKey] = noteText;
        }
    });
}

function advanceRoundMutator(game: Immutable<BiddingState>): Immutable<RoomState> {
    if (!gameHandsAreResolved(game)) return game;
    if (!game.tokens.every((t) => t == null)) return game;
    return advanceRound(game);
}

function selectCardMutator(
    game: Immutable<BiddingState>,
    [username, card, index]: [string, DeckCard, number]
): Immutable<StartedState> {
    const [draft, finalize] = create(game);
    const player = draft.players.find((p) => p.name === username);
    if (!player) return game;
    const stackIndex = player.hand.findIndex((cards) => cards instanceof Array);
    if (stackIndex === -1) return game;
    if (!deepEqual((player.hand[stackIndex] as Immutable<DeckCard[]>)[index], card)) return game;
    player.hand[stackIndex] = card;
    return maybeResolveJokers(finalize());
}

type BiddingGameProps = {
    username: string;
    setUsername: (name: string) => void;
    game: Immutable<GameRoom<BiddingState>>;
};
function BiddingGame(props: BiddingGameProps) {
    const { username, setUsername, game } = props;
    const inRoom = game.gameState.players.some((p) => p.name === username);
    const [preferences] = usePreferences();
    const [showPreferences, setShowPreferences] = useState(false);
    const [noteModalState, setNoteModalState] = useState<{ round: number; playerName: string } | null>(null);
    const [, setSelectCard] = useMutateGame(game, selectCardMutator);
    const selectCard = (card: DeckCard, index: number) => {
        setSelectCard([username, card, index]);
    };
    const [, setMoveToken] = useMutateGame(game, moveTokenMutator);
    const [, setAddNote] = useMutateGame(game, addNoteMutator);
    const [, setAdvanceRound] = useMutateGame(game, advanceRoundMutator);
    const waitingForJoker = !gameHandsAreResolved(game.gameState);

    const getNoteKey = (playerName: string, round: number) => `${round}::${playerName}`;
    const currentRound = game.gameState.log.length - 1;

    const handlePlayerRightClick = (e: React.MouseEvent, playerName: string) => {
        e.preventDefault();
        setNoteModalState({ round: currentRound, playerName });
    };

    const handleSaveNote = (noteText: string) => {
        if (noteModalState) {
            const noteKey = getNoteKey(noteModalState.playerName, noteModalState.round);
            setAddNote([username, noteKey, noteText]);
        }
    };

    const getCurrentNote = (playerName: string, round: number): string => {
        const noteKey = getNoteKey(playerName, round);
        return game.gameState.notes?.[username]?.[noteKey] ?? "";
    };

    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {game.gameState.players.map((p, pi) => (
                    <div className={styles.player} key={p.name}>
                        <span
                            className={styles.playerName}
                            style={p.name === username ? {} : { color: playerColour(pi) }}
                        >
                            {p.name}
                        </span>
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
                                            fourColourSuits={preferences.fourColourSuits}
                                            key={i}
                                        />
                                    ) : (
                                        <Card card={c} fourColourSuits={preferences.fourColourSuits} key={i} />
                                    )
                                ) : (
                                    <NoCard key={i} />
                                )
                            )}
                            {p.pastTokens.map((t, i) => (
                                <TokenV
                                    token={t}
                                    past={true}
                                    disabled={true}
                                    title={getCurrentNote(p.name, t.round) || undefined}
                                    key={i}
                                />
                            ))}
                            {!waitingForJoker && (
                                <TokenV
                                    token={p.token}
                                    disabled={!inRoom}
                                    onClick={() =>
                                        setMoveToken([username, username === p.name ? null : p.token, p.name])
                                    }
                                    onContextMenu={(e) => handlePlayerRightClick(e, p.name)}
                                />
                            )}
                            {game.gameState.futureRounds.map((_, i) => (
                                <div className={styles.tokenPlaceholder} key={i} />
                            ))}
                        </div>
                        <div className={styles.handScore}>&nbsp;</div>
                    </div>
                ))}
            </div>
            <div>
                <WinRecordView record={game.gameState.winRecord} />
                <div className={styles.heading}>
                    {waitingForJoker
                        ? "Waiting for players to choose their cards"
                        : `Round ${game.gameState.log.length} - ${
                              (game.gameState.config.gameMode ?? GameMode.TEXAS_HOLDEM) === GameMode.OMAHA
                                  ? "Omaha"
                                  : "Hold'em"
                          }`}{" "}
                    {!inRoom && "(You are spectating.) "}
                    {inRoom && <KillGameButton game={game} />}
                    <button onClick={() => setShowPreferences(true)}>⚙</button>
                </div>
                <CommunityCards gameState={game.gameState} fourColourSuits={preferences.fourColourSuits} />
                <div className={styles.tokenPool}>
                    {game.gameState.tokens.map((token, i) => (
                        <TokenV
                            token={token}
                            disabled={!inRoom}
                            onClick={() => setMoveToken([username, token, null])}
                            key={i}
                        />
                    ))}
                </div>
                <button
                    disabled={!inRoom || waitingForJoker || !game.gameState.tokens.every((t) => t == null)}
                    onClick={() => setAdvanceRound(true)}
                >
                    {game.gameState.futureRounds.length === 0 ? "Finish" : "Next round"}
                </button>
                <GameLog
                    players={game.gameState.players}
                    jokerLog={game.gameState.jokerLog}
                    log={game.gameState.log}
                    username={username}
                />
            </div>
            {showPreferences && <PreferencesPanel onClose={() => setShowPreferences(false)} />}
            {noteModalState && (
                <NoteModal
                    round={noteModalState.round}
                    playerName={noteModalState.playerName}
                    currentNote={getCurrentNote(noteModalState.playerName, noteModalState.round)}
                    onSave={handleSaveNote}
                    onClose={() => setNoteModalState(null)}
                />
            )}
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

function isWinRecordFinished(record: WinRecord): boolean {
    return record.wins === record.targetWins || record.losses === record.targetLosses;
}

function startNextGameMutator(game: Immutable<ScoringState>, newWinRecord: WinRecord): Immutable<RoomState> {
    if (isWinRecordFinished(newWinRecord)) {
        return {
            ...killGameMutator(game),
            winRecord: newWinRecord,
        };
    }
    return makeInitialGame(game.players, game.config, newWinRecord);
}

type ScoringGameProps = {
    username: string;
    game: Immutable<GameRoom<ScoringState>>;
};
function ScoringGame(props: ScoringGameProps) {
    const { username, game } = props;
    const { players, communityCards, revealIndex } = game.gameState;
    const [preferences] = usePreferences();
    const [showPreferences, setShowPreferences] = useState(false);

    const getNoteKey = (playerName: string, round: number) => `${round}::${playerName}`;
    const getCurrentNote = (playerName: string, round: number): string => {
        const noteKey = getNoteKey(playerName, round);
        return game.gameState.notes?.[username]?.[noteKey] ?? "";
    };
    const handScores = useMemo(
        () =>
            players.map((p) => {
                const mode = game.gameState.config.gameMode ?? GameMode.TEXAS_HOLDEM;
                return mode === GameMode.OMAHA
                    ? bestOmahaHand(p.hand, communityCards)
                    : bestHandAmong([...p.hand, ...communityCards]);
            }),
        [players, communityCards, game.gameState.config.gameMode]
    );
    const inRoom = players.some((p) => p.name === username);
    const [, setRevealIndex] = useMutateGame(game, setRevealIndexMutator);
    const [, setStartNextGame] = useMutateGame(game, startNextGameMutator);
    const revealedPlayerIndex = players.findIndex((p) => p.token!.index === revealIndex);
    const revealedPlayerBestHand = new Set(handScores[revealedPlayerIndex][0]);
    const playerScores = useMemo(
        () =>
            players
                .map((p, i) => ({
                    index: p.token!.index,
                    score: handScores[i][1],
                    playerIndex: i,
                }))
                .sort((p, q) => p.index - q.index),
        [players, handScores]
    );
    const gameWon = useMemo(() => {
        return playerScores.every((p, i) => i === 0 || !pokerHandLessThan(p.score, playerScores[i - 1].score));
    }, [playerScores]);
    const { shootConfetti } = useContext(FxContext);
    const doneRevealing = revealIndex === players.length;
    useEffect(() => {
        if (doneRevealing && gameWon) {
            shootConfetti(0, window.innerHeight, -Math.PI / 2 + 0.3);
            setTimeout(() => {
                shootConfetti(window.innerWidth, window.innerHeight, -Math.PI / 2 - 0.3);
            }, 400);
        }
    }, [doneRevealing, gameWon, shootConfetti]);
    const nextWinRecord = doneRevealing
        ? {
              wins: (game.gameState.winRecord?.wins ?? 0) + (gameWon ? 1 : 0),
              losses: (game.gameState.winRecord?.losses ?? 0) + (gameWon ? 0 : 1),
              targetWins: game.gameState.winRecord?.targetWins ?? NEW_ROOM.config.targetWins,
              targetLosses: game.gameState.winRecord?.targetLosses ?? NEW_ROOM.config.targetLosses,
          }
        : game.gameState.winRecord;
    return (
        <div className={styles.container}>
            <div className={styles.players}>
                {players.map((p, pi) => (
                    <div
                        className={`${styles.player} ${pi === revealedPlayerIndex ? styles.highlightPlayer : ""}`}
                        key={p.name}
                    >
                        <span
                            className={styles.playerName}
                            style={p.name === username ? {} : { color: playerColour(pi) }}
                        >
                            {p.name}
                        </span>
                        {p.name === username && " (You)"}
                        <br />
                        <div className={styles.hand}>
                            {p.hand.map((c, i) =>
                                !inRoom || p.name === username || p.token!.index <= revealIndex ? (
                                    <Card
                                        card={c}
                                        highlight={revealedPlayerBestHand.has(c)}
                                        fourColourSuits={preferences.fourColourSuits}
                                        key={i}
                                    />
                                ) : (
                                    <NoCard key={i} />
                                )
                            )}
                            {p.pastTokens.map((t, i) => (
                                <TokenV
                                    token={t}
                                    past={true}
                                    disabled={true}
                                    title={getCurrentNote(p.name, t.round) || undefined}
                                    key={i}
                                />
                            ))}
                            <TokenV token={p.token!} disabled={true} />
                        </div>
                        <div className={styles.handScore}>
                            {p.token!.index <= revealIndex ? formatScore(handScores[pi][1]) : <>&nbsp;</>}
                        </div>
                    </div>
                ))}
            </div>
            <div>
                <WinRecordView record={nextWinRecord} />
                <div className={styles.heading}>
                    Scoring: {revealIndex} ({players[revealedPlayerIndex].name}) -{" "}
                    {(game.gameState.config.gameMode ?? GameMode.TEXAS_HOLDEM) === GameMode.OMAHA ? "Omaha" : "Hold'em"}{" "}
                    <button onClick={() => setShowPreferences(true)}>⚙</button>
                </div>
                <CommunityCards
                    gameState={game.gameState}
                    highlight={revealedPlayerBestHand}
                    fourColourSuits={preferences.fourColourSuits}
                />
                <div className={styles.revealLog}>
                    {playerScores.slice(1, revealIndex).map((p, j) => {
                        const i = j + 1;
                        const beat = !pokerHandLessThan(playerScores[i].score, playerScores[i - 1].score);
                        const tied = beat && !pokerHandLessThan(playerScores[i - 1].score, playerScores[i].score);
                        return (
                            <div key={i}>
                                <span className={styles.playerName}>{players[playerScores[i].playerIndex].name}</span>
                                &apos;s hand {tied ? "tied" : beat ? "beat" : "didn't beat"}{" "}
                                <span className={styles.playerName}>
                                    {players[playerScores[i - 1].playerIndex].name}
                                </span>
                                .
                            </div>
                        );
                    })}
                </div>
                {revealIndex < players.length && (
                    <button disabled={!inRoom} onClick={() => setRevealIndex(revealIndex + 1)}>
                        Reveal {revealIndex + 1} ({players.find((p) => p.token!.index === revealIndex + 1)?.name})
                    </button>
                )}
                {doneRevealing && (
                    <>
                        <div className={styles.gameResult}>
                            {gameWon ? "You won this one!" : "You didn't wonnered."}
                        </div>
                        {game.gameState.notes && Object.keys(game.gameState.notes).length > 0 && (
                            <div className={styles.notesSection}>
                                <h3>Player Notes</h3>
                                {Object.entries(game.gameState.notes).map(([noteAuthor, authorNotes]) => (
                                    <div key={noteAuthor} className={styles.playerNotes}>
                                        <h4>{noteAuthor}&apos;s notes:</h4>
                                        {Object.entries(authorNotes).map(([noteKey, noteText]) => {
                                            const [round, notedPlayer] = noteKey.split("::");
                                            return (
                                                <div key={noteKey} className={styles.noteEntry}>
                                                    <span className={styles.noteToken}>
                                                        Round {Number(round) + 1} - {notedPlayer}:
                                                    </span>
                                                    <span className={styles.noteText}>{noteText}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={() => setStartNextGame(nextWinRecord)}>
                            {isWinRecordFinished(nextWinRecord) ? "Finish" : "Next game"}
                        </button>
                    </>
                )}
                <GameLog
                    players={game.gameState.players}
                    jokerLog={game.gameState.jokerLog}
                    log={game.gameState.log}
                    username={username}
                />
            </div>
            {showPreferences && <PreferencesPanel onClose={() => setShowPreferences(false)} />}
        </div>
    );
}

function CommunityCards({
    gameState,
    highlight,
    fourColourSuits,
}: {
    gameState: Immutable<StartedState>;
    highlight?: Set<Immutable<DeckCard>>;
    fourColourSuits?: boolean;
}) {
    // Group up cards into their rounds
    const rounds = gameState.pastRounds
        ? "futureRounds" in gameState
            ? [...gameState.pastRounds, ...gameState.futureRounds]
            : gameState.pastRounds
        : /* migration */ DEFAULT_GAME;
    let ix = 0;
    return (
        <div className={styles.communityCards}>
            {rounds.map(({ cards }, i) => {
                const start = ix;
                const end = ix + cards;
                ix = end;
                if (!cards) return;
                return (
                    <div
                        className={`${TOKEN_STYLES[i]} ${styles.roundCards} ${start >= gameState.communityCards.length ? styles.futureRound : ""}`}
                        key={i}
                    >
                        {start < gameState.communityCards.length
                            ? gameState.communityCards
                                  .slice(start, end)
                                  .map((c, j) => (
                                      <CardStack
                                          cards={c}
                                          key={j}
                                          highlight={highlight}
                                          fourColourSuits={fourColourSuits}
                                      />
                                  ))
                            : Array.from({ length: cards }).map((_, j) => <NoCard key={j} />)}
                    </div>
                );
            })}
        </div>
    );
}

function GameLog({
    players,
    jokerLog,
    log,
    username,
}: {
    players: Immutable<StartedPlayer<object>[]>;
    jokerLog: Immutable<JokerLogEntry[]>;
    log: Immutable<RoundLogEntry[][]>;
    username: string;
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
                                <span
                                    className={styles.playerName}
                                    style={
                                        players[logEntry.player].name === username
                                            ? {}
                                            : {
                                                  color: playerColour(logEntry.player),
                                              }
                                    }
                                >
                                    {players[logEntry.player].name}
                                </span>
                                {"take" in logEntry.action ? (
                                    <>
                                        {" "}
                                        took the <SmallToken token={logEntry.action.take} /> from{" "}
                                        {logEntry.action.from == null ? (
                                            <>the middle</>
                                        ) : (
                                            <span
                                                className={styles.playerName}
                                                style={
                                                    players[logEntry.action.from].name === username
                                                        ? {}
                                                        : {
                                                              color: playerColour(logEntry.action.from),
                                                          }
                                                }
                                            >
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

function playerColour(i: number): string {
    return `hsl(${190 + i * 137} 90 80)`;
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

const FOUR_COLOUR_SUIT_STYLES = {
    [Suit.Clubs]: styles.clubsSuit,
    [Suit.Diamonds]: styles.diamondsSuit,
    [Suit.Hearts]: styles.heartsSuit,
    [Suit.Spades]: styles.spadesSuit,
};

const TWO_COLOUR_SUIT_STYLES = {
    [Suit.Clubs]: styles.blackSuit,
    [Suit.Diamonds]: styles.redSuit,
    [Suit.Hearts]: styles.redSuit,
    [Suit.Spades]: styles.blackSuit,
};

function Card(props: {
    card: Immutable<DeckCard>;
    onClick?: () => void;
    highlight?: boolean;
    fourColourSuits?: boolean;
}) {
    const { card, onClick, highlight, fourColourSuits = true } = props;
    const suitStyles = fourColourSuits ? FOUR_COLOUR_SUIT_STYLES : TWO_COLOUR_SUIT_STYLES;
    return (
        <div
            className={`${styles.card} ${highlight ? styles.cardHighlight : ""} ${
                onClick != null ? styles.cardClickable : ""
            } ${"joker" in card ? styles.cardJoker : ""}`}
            onClick={onClick}
        >
            {"joker" in card ? (
                <>&#x2728;</>
            ) : (
                <>
                    {formatCardValue(card.value)}
                    <br />
                    <span className={suitStyles[card.suit]}>{UNICODE_SUITS[card.suit]}</span>
                </>
            )}
        </div>
    );
}

function CardStack(props: {
    cards: Immutable<DeckCard[]>;
    onClick?: (card: DeckCard, index: number) => void;
    highlight?: Set<Immutable<DeckCard>>;
    fourColourSuits?: boolean;
}) {
    const { cards, onClick, highlight, fourColourSuits } = props;
    return (
        <div className={styles.cardStack}>
            {cards.map((card, i) => (
                <Card
                    card={card}
                    onClick={onClick != null ? () => onClick(card, i) : undefined}
                    highlight={highlight?.has(card)}
                    fourColourSuits={fourColourSuits}
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

function WinRecordView({ record }: { record: WinRecord }) {
    if (!record) return <></>; // for migration purposes
    const { wins, losses, targetWins, targetLosses } = record;
    return (
        <div className={styles.winRecord}>
            {Array.from({ length: targetWins }).map((_, i) => (
                <span key={i} className={i < targetWins - wins ? styles.notWin : styles.win} />
            ))}
            {Array.from({ length: targetLosses }).map((_, i) => (
                <span key={i + targetWins} className={i < losses ? styles.loss : styles.notLoss} />
            ))}
        </div>
    );
}
