import { useState, useEffect } from 'react';
import styles from '../styles/Game.module.css';

interface GameProps {
  gameId: string;
  playerId: number;
  onLeaveGame: () => void;
}

interface GameState {
  players: number[];
  player_names: { [key: number]: string };
  vidas: { [key: number]: number };
  estado: string;
  carta_meio?: string;
  manilha?: string;
  maos?: { [key: number]: string[] };
  palpites?: { [key: number]: number };
  initial_lives: number;
  current_round?: number;
  current_player_idx?: number;
  ordem_jogada?: number[];
  multiplicador?: number;
  soma_palpites?: number;
  mesa?: [number, string][];
  vitorias?: { [key: number]: number };
  dealer?: number;
  first_player?: number;
  cartas?: number;
  eliminados?: number[];
  last_trick_winner?: number;
}

export default function Game({ gameId, playerId, onLeaveGame }: GameProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [bet, setBet] = useState<string>('');
  const [gameStatus, setGameStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [waitingMsg, setWaitingMsg] = useState<string>('');
  const [lastPlayedCard, setLastPlayedCard] = useState<{playerId: number, card: string} | null>(null);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);
  const [prevTrickWinner, setPrevTrickWinner] = useState<number | null>(null);

  // Fetch game state periodically
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        const response = await fetch(`/api/game-state/${gameId}`);
        const data = await response.json();
        if (data.status === 'success') {
          // Check if there's a new trick winner to announce
          if (data.game_state.last_trick_winner && 
              data.game_state.last_trick_winner !== prevTrickWinner) {
            const winnerName = data.game_state.player_names[data.game_state.last_trick_winner];
            setWinnerMessage(`${winnerName} won the trick!`);
            setPrevTrickWinner(data.game_state.last_trick_winner);
            
            // Clear the message after 3 seconds
            setTimeout(() => {
              setWinnerMessage(null);
            }, 3000);
          }
          
          setGameState(data.game_state);
          updateGameStatus(data.game_state);
        }
      } catch (error) {
        console.error('Error fetching game state:', error);
      }
    };

    // Initial fetch
    fetchGameState();

    // Set up polling every 2 seconds
    const interval = setInterval(fetchGameState, 2000);

    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, [gameId, prevTrickWinner]);

  // Update game status message based on state
  const updateGameStatus = (state: GameState) => {
    if (state.estado === 'aguardando') {
      setGameStatus('Aguardando início da rodada');
      setWaitingMsg('');
    } else if (state.estado === 'apostas') {
      const currentPlayerIdx = state.current_player_idx ?? 0;
      const currentPlayer = state.ordem_jogada?.[currentPlayerIdx];
      if (currentPlayer !== undefined && currentPlayer === playerId) {
        setGameStatus('É a sua vez de apostar!');
        setWaitingMsg('');
      } else if (currentPlayer !== undefined) {
        setGameStatus(`Aguardando aposta de ${state.player_names[currentPlayer]}`);
        setWaitingMsg('Aguardando outros jogadores apostarem...');
      } else {
        setGameStatus('Aguardando apostas');
        setWaitingMsg('');
      }
    } else if (state.estado === 'jogando') {
      const currentPlayerIdx = state.current_player_idx ?? 0;
      const currentPlayer = state.ordem_jogada?.[currentPlayerIdx];
      if (currentPlayer !== undefined && currentPlayer === playerId) {
        setGameStatus('É a sua vez de jogar uma carta!');
        setWaitingMsg('');
      } else if (currentPlayer !== undefined) {
        setGameStatus(`Aguardando ${state.player_names[currentPlayer]} jogar`);
        setWaitingMsg('Aguardando outros jogadores jogarem...');
      } else {
        setGameStatus('Aguardando jogadas');
        setWaitingMsg('');
      }
    } else if (state.estado === 'terminado') {
      const winners = state.players.filter(p => !state.eliminados?.includes(p));
      if (winners.length === 1) {
        const winner = winners[0];
        setGameStatus(`Jogo finalizado! ${state.player_names[winner]} venceu!`);
      } else {
        setGameStatus('Jogo finalizado!');
      }
      setWaitingMsg('');
    }
  };

  const startRound = async () => {
    try {
      setError('');
      const response = await fetch(`/api/start-round/${gameId}`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        setGameState(data.game_state);
        updateGameStatus(data.game_state);
      } else {
        setError(data.error || 'Erro ao iniciar rodada');
      }
    } catch (error) {
      console.error('Error starting round:', error);
      setError('Erro de conexão');
    }
  };

  const makeBet = async () => {
    if (!bet) return;
    
    try {
      setError('');
      const response = await fetch(`/api/make-bet/${gameId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          player_id: playerId, 
          bet: parseInt(bet) 
        }),
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        setGameState(data.game_state);
        updateGameStatus(data.game_state);
        setBet('');
      } else {
        setError(data.error || 'Erro ao fazer aposta');
      }
    } catch (error) {
      console.error('Error making bet:', error);
      setError('Erro de conexão');
    }
  };

  const playCard = async (cardIndex: number) => {
    try {
      setError('');
      const cardToPlay = gameState?.maos?.[playerId]?.[cardIndex];
      if (cardToPlay) {
        setLastPlayedCard({ playerId, card: cardToPlay });
      }
      
      const response = await fetch(`/api/play-card/${gameId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          player_id: playerId, 
          card_index: cardIndex 
        }),
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        setGameState(data.game_state);
        updateGameStatus(data.game_state);
        
        // Clear last played card after animation time
        setTimeout(() => {
          setLastPlayedCard(null);
        }, 1000);
      } else {
        setError(data.error || 'Erro ao jogar carta');
        setLastPlayedCard(null);
      }
    } catch (error) {
      console.error('Error playing card:', error);
      setError('Erro de conexão');
      setLastPlayedCard(null);
    }
  };

  // Get color class based on suit
  const getCardColorClass = (card: string) => {
    if (!card || card.length < 2) return '';
    const naipe = card.charAt(card.length - 1);
    return naipe === '♥' || naipe === '♦' ? styles.redCard : styles.blackCard;
  };
  
  // Get suit symbol class
  const getSuitClass = (card: string) => {
    if (!card || card.length < 2) return '';
    const naipe = card.charAt(card.length - 1);
    switch (naipe) {
      case '♣': return styles.clubSuit;
      case '♥': return styles.heartSuit;
      case '♠': return styles.spadeSuit;
      case '♦': return styles.diamondSuit;
      default: return '';
    }
  };

  // Format card for display
  const formatCard = (card: string) => {
    if (!card || card.length < 2) return { value: '', suit: '' };
    return { 
      value: card.substring(0, card.length - 1),
      suit: card.charAt(card.length - 1)
    };
  };

  // Check if it's player's turn
  const isPlayerTurn = () => {
    if (!gameState || !gameState.ordem_jogada) return false;
    const currentPlayerIdx = gameState.current_player_idx || 0;
    return gameState.ordem_jogada[currentPlayerIdx] === playerId;
  };

  // Show card count info for first round
  const isFirstRound = gameState?.cartas === 1;

  // Handler for new game (for now, just leave game)
  const handleNewGame = () => {
    onLeaveGame();
  };

  return (
    <div className={styles.gameContainer}>
      <div className={styles.header}>
        <h2>Game Room: {gameId}</h2>
        <div className={styles.gameInfo}>
          <p>Round: {gameState?.current_round || 0}</p>
          <p>Cards per player: {gameState?.cartas || 1}</p>
          {gameState?.multiplicador && gameState.multiplicador > 1 && (
            <p className={styles.multiplier}>
              Multiplier: x{gameState.multiplicador}
            </p>
          )}
        </div>
        <button onClick={onLeaveGame} className={styles.leaveButton}>
          Leave Game
        </button>
      </div>

      {gameStatus && (
        <div className={styles.gameStatus}>
          <p>{gameStatus}</p>
        </div>
      )}

      {waitingMsg && (
        <div className={styles.waitingMsg}>
          <p>{waitingMsg}</p>
        </div>
      )}

      {winnerMessage && (
        <div className={styles.winnerMessage}>
          <p>{winnerMessage}</p>
        </div>
      )}

      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
        </div>
      )}

      {isFirstRound && gameState?.estado === 'jogando' && (
        <div className={styles.infoMessage}>
          <p>First round rule: You can only see other players' cards!</p>
        </div>
      )}

      <div className={styles.playersList}>
        <h3>Players</h3>
        <div className={styles.playersGrid}>
          {gameState?.players.map((id) => (
            <div 
              key={id} 
              className={`${styles.playerCard} ${id === playerId ? styles.currentPlayer : ''} ${
                isPlayerTurn() && gameState.ordem_jogada?.[gameState.current_player_idx || 0] === id 
                  ? styles.activePlayer 
                  : ''
              }`}
            >
              <div className={styles.playerName}>
                {gameState.player_names[id]} {id === playerId ? '(You)' : ''}
              </div>
              <div className={styles.playerStats}>
                <div className={styles.playerLives}>
                  {'❤️'.repeat(gameState.vidas[id])}
                </div>
                {gameState.palpites && gameState.palpites[id] !== undefined && (
                  <div className={styles.playerBet}>
                    Bet: {gameState.palpites[id]}
                  </div>
                )}
                {gameState.vitorias && (
                  <div className={styles.playerWins}>
                    Wins: {gameState.vitorias[id] || 0}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Game table section */}
      <div className={styles.gameTable}>
        {gameState?.carta_meio && (
          <div className={styles.tableInfo}>
            <div className={styles.centerCardContainer}>
              <div className={`${styles.card} ${getCardColorClass(gameState.carta_meio)}`}>
                <div className={styles.cardContent}>
                  <span className={styles.cardValue}>{formatCard(gameState.carta_meio).value}</span>
                  <span className={`${styles.cardSuit} ${getSuitClass(gameState.carta_meio)}`}>
                    {formatCard(gameState.carta_meio).suit}
                  </span>
                </div>
              </div>
              <div className={styles.cardLabel}>Middle Card</div>
            </div>
            <div className={styles.manilhaContainer}>
              <div className={styles.manilhaInfo}>
                <span>Manilha: </span>
                <span className={styles.manilhaValue}>{gameState.manilha}</span>
              </div>
            </div>
          </div>
        )}

        {gameState?.mesa && gameState.mesa.length > 0 && (
          <div className={styles.playedCards}>
            <h3>Played Cards</h3>
            <div className={styles.tableCards}>
              {gameState.mesa.map(([pid, card], index) => (
                <div key={index} className={styles.playedCardContainer}>
                  <div className={`${styles.card} ${getCardColorClass(card)} ${lastPlayedCard?.playerId === pid && lastPlayedCard?.card === card ? styles.lastPlayed : ''}`}>
                    <div className={styles.cardContent}>
                      <span className={styles.cardValue}>{formatCard(card).value}</span>
                      <span className={`${styles.cardSuit} ${getSuitClass(card)}`}>
                        {formatCard(card).suit}
                      </span>
                    </div>
                  </div>
                  <div className={styles.playerLabel}>
                    {gameState.player_names[pid]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {gameState?.estado === 'aguardando' && (
        <div className={styles.actionContainer}>
          <button 
            onClick={startRound} 
            className={styles.actionButton}
          >
            Start Round
          </button>
        </div>
      )}

      {gameState?.estado === 'apostas' && isPlayerTurn() && (
        <div className={styles.betContainer}>
          <h3>Make Your Bet</h3>
          <div className={styles.betControls}>
            <input
              type="number"
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              min="0"
              max={gameState.cartas || 1}
              className={styles.betInput}
            />
            <button onClick={makeBet} className={styles.actionButton}>
              Confirm Bet
            </button>
          </div>
          <p className={styles.betHint}>
            Total bets so far: {gameState.soma_palpites || 0} / {gameState.cartas}
          </p>
        </div>
      )}

      {/* Only show player's hand if it's not the first round or if the game is not in the playing state */}
      {gameState?.maos && gameState.maos[playerId] && gameState.maos[playerId].length > 0 && 
       ((gameState.cartas ?? 0) > 1 || gameState.estado !== 'jogando') && (
        <div className={styles.handContainer}>
          <h3>Your Hand</h3>
          <div className={styles.cards}>
            {gameState.maos[playerId].map((card, index) => (
              <button
                key={index}
                onClick={() => gameState.estado === 'jogando' && isPlayerTurn() ? playCard(index) : null}
                className={`${styles.card} ${getCardColorClass(card)} ${
                  gameState.estado === 'jogando' && isPlayerTurn() ? styles.playable : ''
                }`}
                disabled={gameState.estado !== 'jogando' || !isPlayerTurn()}
              >
                <div className={styles.cardContent}>
                  <span className={styles.cardValue}>{formatCard(card).value}</span>
                  <span className={`${styles.cardSuit} ${getSuitClass(card)}`}>
                    {formatCard(card).suit}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isFirstRound && gameState?.estado === 'jogando' && gameState?.maos && gameState.maos[playerId] && (
        <div className={styles.handContainer}>
          <h3>Your Hidden Card</h3>
          <div className={styles.cards}>
            <button
              onClick={() => isPlayerTurn() ? playCard(0) : null}
              className={`${styles.card} ${styles.hiddenCard} ${
                isPlayerTurn() ? styles.playable : ''
              }`}
              disabled={!isPlayerTurn()}
            >
              <div className={styles.cardBackContent}>
                <span>?</span>
              </div>
            </button>
          </div>
          <p className={styles.cardHint}>You can't see your card in the first round!</p>
        </div>
      )}

      {gameState?.palpites && Object.keys(gameState.palpites).length > 0 && (
        <div className={styles.betsInfo}>
          <h3>All Bets</h3>
          <div className={styles.betsList}>
            {Object.entries(gameState.palpites).map(([pid, betValue]) => (
              <div key={pid} className={styles.betItem}>
                <span className={styles.betPlayer}>{gameState.player_names[Number(pid)]}</span>
                <span className={styles.betValue}>{betValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gameState?.estado === 'terminado' && (
        <div className={styles.gameOver}>
          <h2>Game Over!</h2>
          <div className={styles.finalResults}>
            {gameState.players.map(id => (
              <div 
                key={id}
                className={`${styles.resultRow} ${gameState.eliminados?.includes(id) ? styles.eliminated : styles.winner}`}
              >
                <span className={styles.resultName}>
                  {gameState.player_names[id]} {id === playerId ? '(You)' : ''}: 
                </span>
                <span className={styles.resultLives}>
                  {gameState.vidas[id] <= 0 ? 'Eliminated' : `${gameState.vidas[id]} lives left`}
                </span>
              </div>
            ))}
          </div>
          <button className={styles.actionButton} onClick={handleNewGame}>
            New Game
          </button>
          <button className={styles.leaveButton} onClick={onLeaveGame}>
            Leave Game
          </button>
        </div>
      )}
    </div>
  );
} 