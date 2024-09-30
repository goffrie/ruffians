/* eslint-disable react/no-unescaped-entities */
import * as styles from "./App.module.css";
import { useEffect, useState } from "react";
import { callMakeRoom } from "./gameAPI";
import { NEW_ROOM } from "./gameState";
import { Game } from "./Game";

function useUsername(): [string | null, (username: string) => void] {
    const [username, setUsername] = useState(() => window.localStorage.getItem("username"));
    return [
        username,
        (name) => {
            window.localStorage.setItem("username", name);
            setUsername(name);
        },
    ];
}

function useRoomName(): [string | null, (roomName: string | null) => void] {
    const [hash, setHash] = useState(() => window.location.hash);
    useEffect(() => {
        const listener = () => {
            setHash(window.location.hash);
        };
        window.addEventListener("hashchange", listener);
        return () => window.removeEventListener("hashchange", listener);
    });
    const roomName = hash.replace("#", "");
    return [
        roomName || null,
        (newRoomName) => {
            window.location.hash = newRoomName ? "#" + newRoomName : "";
        },
    ];
}

const LOGO = new URL('../uwu_plain.svg', import.meta.url);

function App() {
    const [username, saveUsername] = useUsername();
    const [roomName, setRoomName] = useRoomName();
    const [inGame, setInGame] = useState(Boolean(username && roomName));
    const uwu = window.location.search.indexOf("uwu") !== -1;
    if (!username || !roomName || !inGame) {
        if (inGame) {
            setInGame(false); // bad practice
        }
        const newRoom = async () => {
            setRoomName((await callMakeRoom(NEW_ROOM)).room);
            setInGame(true);
        };
        return (
            <header className={styles.header}>
                {uwu ? <img className={styles.logo} src={LOGO.toString()} alt="the ruffians" /> : <h1>the ruffians</h1>}
                <div>
                    What's your name?
                    <br />
                    <input type="input" value={username ?? ""} onChange={(e) => saveUsername(e.target.value)}></input>
                </div>
                {!roomName && (
                    <>
                        <button disabled={!username} onClick={newRoom}>
                            New game
                        </button>
                    </>
                )}
                {roomName && (
                    <>
                        <button onClick={() => setInGame(true)}>Join game ({roomName})</button>
                    </>
                )}
            </header>
        );
    } else {
        return <Game username={username} setUsername={saveUsername} roomName={roomName} key={roomName} />;
    }
}

export default App;
