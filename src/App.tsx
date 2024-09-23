import React from 'react';
import './App.css';
import { useEffect, useState } from 'react';
import { callMakeRoom } from './gameAPI';
import { NEW_ROOM } from './gameState';
import { Game } from './Game';

function useUsername(): [string | null, (username: string) => void] {
  const [username, setUsername] = useState(() => window.localStorage.getItem("username"));
  return [username, (name) => {
    window.localStorage.setItem("username", name);
    setUsername(name);
  }];
}

function useRoomName(): [string | null, ((roomName: string | null) => void)] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const listener = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  });
  const roomName = hash.replace("#", "");
  return [roomName || null, (newRoomName) => {
    window.location.hash = newRoomName ? "#" + newRoomName : "";
  }];
}

function App() {
  const [username, saveUsername] = useUsername();
  const [roomName, setRoomName] = useRoomName();
  if (!username || !roomName) {
    const newRoom = async () => {
      setRoomName((await callMakeRoom(NEW_ROOM)).room);
    };
    return (
      <header className="App-header">
        <h1>the ruffians</h1>
        <div>
          What's your name?<br />
          <input type="input" value={username ?? ""} onChange={(e) => saveUsername(e.target.value)}></input>
        </div>
        {!roomName && <>
          <button disabled={!username} onClick={newRoom}>New game</button>
        </>}
      </header>
    );
  } else {
    return <Game username={username} setUsername={saveUsername} roomName={roomName} />
  }
}

export default App;
