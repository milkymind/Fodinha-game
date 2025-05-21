import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Game from '../components/Game';
import styles from '../styles/Home.module.css';

interface LobbyInfo {
  players: string[];
  maxPlayers: number;
  gameStarted: boolean;
}

export default function Home() {
  const [gameId, setGameId] = useState<string>('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [joinGameId, setJoinGameId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [lives, setLives] = useState<number>(3);
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    }

    const handleOffline = () => {
      setIsOffline(true);
      setError('You are currently offline. Some features may be limited.');
    };

    const handleOnline = () => {
      setIsOffline(false);
      setError('');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const createGame = async () => {
    try {
      setError('');
      setIsLoading(true);
      
      if (!playerName.trim()) {
        setError('Please enter a player name');
        setIsLoading(false);
        return;
      }
      
      localStorage.setItem('playerName', playerName);
      
      const response = await fetch('/api/create-game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          player_name: playerName,
          lives: lives 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === 'success') {
        setGameId(data.game_id);
        setPlayerId(data.player_id);
        setLobbyInfo(data.lobby);
        setError('');
      } else {
        setError(data.error || 'Failed to create game');
      }
    } catch (error) {
      console.error('Error creating game:', error);
      setError('Failed to connect to the game server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const joinGame = async (id: string) => {
    try {
      setError('');
      setIsLoading(true);
      
      if (!playerName.trim()) {
        setError('Please enter a player name');
        setIsLoading(false);
        return;
      }
      
      if (!id.trim()) {
        setError('Please enter a game ID');
        setIsLoading(false);
        return;
      }
      
      localStorage.setItem('playerName', playerName);
      
      const response = await fetch(`/api/join-game/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ player_name: playerName }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === 'success') {
        setPlayerId(data.player_id);
        setGameId(id);
        setLobbyInfo(data.lobby);
        setError('');
      } else {
        setError(data.error || 'Failed to join game');
      }
    } catch (error) {
      console.error('Error joining game:', error);
      setError('Failed to connect to the game server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveGame = () => {
    setGameId('');
    setPlayerId(null);
    setJoinGameId('');
    setLobbyInfo(null);
    setGameStarted(false);
    setError('');
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  useEffect(() => {
    if (gameId && playerId && !gameStarted) {
      const poll = async () => {
        try {
          const response = await fetch(`/api/lobby-info/${gameId}`);
          if (!response.ok) {
            console.warn(`Lobby polling failed with status: ${response.status}`);
            return;
          }
          
          const data = await response.json();
          if (data.status === 'success') {
            setLobbyInfo(data.lobby);
            if (data.lobby.gameStarted) {
              setGameStarted(true);
            }
          }
        } catch (e) {
          console.warn('Lobby polling error:', e);
        }
      };
      
      poll();
      pollingRef.current = setInterval(poll, 2000);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [gameId, playerId, gameStarted]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Fodinha Card Game</title>
        <meta name="description" content="Play the traditional Brazilian card game Fodinha online with friends" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <main className={styles.main}>
        {gameStarted && playerId !== null ? (
          <Game 
            gameId={gameId} 
            playerId={playerId} 
            onLeaveGame={handleLeaveGame} 
          />
        ) : (
          <div className={styles.homeContent}>
            <h1 className={styles.title}>
              Fodinha Card Game
            </h1>
            
            {isOffline && (
              <div className={styles.offlineWarning}>
                You are currently offline. Limited functionality available.
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}
            
            {gameId ? (
              <div className={styles.lobby}>
                <h2>Game Room: {gameId}</h2>
                {lobbyInfo && (
                  <div className={styles.lobbyInfo}>
                    <p>Players: {lobbyInfo.players.length}/{lobbyInfo.maxPlayers}</p>
                    <ul className={styles.playerList}>
                      {lobbyInfo.players.map((player, index) => (
                        <li key={index}>{player} {index === 0 ? '(Host)' : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button 
                  className={styles.button} 
                  onClick={handleLeaveGame}
                  disabled={isLoading}
                >
                  Leave Game
                </button>
              </div>
            ) : (
              <div className={styles.formContainer}>
                <div className={styles.inputGroup}>
                  <label htmlFor="playerName">Your Name:</label>
                  <input
                    id="playerName"
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className={styles.input}
                    maxLength={20}
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label htmlFor="lives">Starting Lives:</label>
                  <select
                    id="lives"
                    value={lives}
                    onChange={(e) => setLives(parseInt(e.target.value))}
                    className={styles.input}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
                
                <button 
                  className={styles.button} 
                  onClick={createGame}
                  disabled={isLoading || isOffline}
                >
                  {isLoading ? 'Creating...' : 'Create New Game'}
                </button>
                
                <div className={styles.divider}>or</div>
                
                <div className={styles.inputGroup}>
                  <label htmlFor="joinGameId">Join Existing Game:</label>
                  <input
                    id="joinGameId"
                    type="text"
                    value={joinGameId}
                    onChange={(e) => setJoinGameId(e.target.value.toUpperCase())}
                    placeholder="Enter Game ID"
                    className={styles.input}
                    maxLength={6}
                  />
                </div>
                
                <button 
                  className={styles.button} 
                  onClick={() => joinGame(joinGameId)}
                  disabled={isLoading || !joinGameId || isOffline}
                >
                  {isLoading ? 'Joining...' : 'Join Game'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
} 