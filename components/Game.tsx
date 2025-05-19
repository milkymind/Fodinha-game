import { useState, useEffect, useRef } from 'react';
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
  current_hand?: number;
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
  last_round_winner?: number;
  last_trick_winner?: number;
  round_over_timestamp?: number;
  tie_in_previous_round?: boolean;
}

export default function Game({ gameId, playerId, onLeaveGame }: GameProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [bet, setBet] = useState<string>('');
  const [gameStatus, setGameStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [waitingMsg, setWaitingMsg] = useState<string>('');
  const [lastPlayedCard, setLastPlayedCard] = useState<{playerId: number, card: string} | null>(null);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);
  const [prevRoundWinner, setPrevRoundWinner] = useState<number | null>(null);
  const [roundEndMessage, setRoundEndMessage] = useState<string | null>(null);
  const [prevRound, setPrevRound] = useState<number | null>(null);
  const [prevHand, setPrevHand] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [pollError, setPollError] = useState<boolean>(false);
  const unmounted = useRef<boolean>(false);

  // Fetch game state periodically
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(`/api/game-state/${gameId}`, {
          signal: controller.signal,
          // Add cache busting to prevent stale data issues
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Game not found (404): ${gameId}`);
          }
          throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status === 'success') {
          // Reset error state on successful fetch
          if (error) {
            setError(null);
          }
          
          // Reset retry count on successful connection
          setRetryCount(0);
          
          const newGameState = data.game_state;
          
          // Check for round changes
          if (prevRound !== null && 
              newGameState.current_round !== prevRound &&
              newGameState.current_hand === prevHand) {
            // Round has changed within the same hand
            setRoundEndMessage(`Round ${prevRound} complete! Starting round ${newGameState.current_round}`);
            
            // Clear the message after 3 seconds
            setTimeout(() => {
              setRoundEndMessage(null);
            }, 3000);
          }
          
          // Check if a new hand has started
          if (prevHand !== null && newGameState.current_hand !== prevHand) {
            // New hand has started
            setRoundEndMessage(`Hand ${prevHand + 1} complete! Starting hand ${newGameState.current_hand + 1} with ${newGameState.cartas} cards per player`);
            
            // Clear the message after 3 seconds
            setTimeout(() => {
              setRoundEndMessage(null);
            }, 3000);
          }
          
          // Check if there's a new round winner or tie to announce
          const roundWinner = newGameState.last_round_winner || newGameState.last_trick_winner;
          if (roundWinner && roundWinner !== prevRoundWinner) {
            // Check if this was a tie in a non-final round
            if (newGameState.tie_in_previous_round) {
              setWinnerMessage(`Round ended in a tie! Next round will have a x${newGameState.multiplicador || 2} multiplier.`);
            } else {
              const winnerName = newGameState.player_names[roundWinner];
              setWinnerMessage(`${winnerName} won the round!`);
            }
            setPrevRoundWinner(roundWinner);
            
            // Clear the message after 3 seconds
            setTimeout(() => {
              setWinnerMessage(null);
            }, 3000);
          }
          
          // Update game state
          setGameState(newGameState);
          updateGameStatus(newGameState);
          
          // Save current round and hand to detect changes
          setPrevRound(newGameState.current_round || null);
          setPrevHand(newGameState.current_hand || null);
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error: any) {
        console.error('Error fetching game state:', error);
        
        // Handle specific error types
        if (error.name === 'AbortError') {
          setError('Request timed out. The server might be slow or offline.');
        } else if (!navigator.onLine) {
          setError('You are offline. Please check your internet connection.');
        } else if (error.message.includes('404')) {
          setError('Game not found. The lobby might have been deleted.');
          setPollError(true); // Stop polling on 404
          return;
        } else {
          setError('Failed to update game state. The game will try to reconnect.');
        }
        
        // Implement exponential backoff for retries
        if (retryCount < 5) {
          const nextRetryCount = retryCount + 1;
          setRetryCount(nextRetryCount);
          
          // Calculate backoff time: 1s, 2s, 4s, 8s, 16s
          const backoffTime = Math.min(1000 * Math.pow(2, nextRetryCount - 1), 16000);
          console.log(`Retrying connection in ${backoffTime/1000} seconds (attempt ${nextRetryCount}/5)`);
          
          // Temporarily stop polling until after backoff
          setPollError(true);
          
          // Set up timer for retry
          const retryTimer = setTimeout(() => {
            if (!unmounted.current) {
              setPollError(false); // Resume polling after backoff
            }
          }, backoffTime);
          
          // Clean up timer if component unmounts
          return () => clearTimeout(retryTimer);
        } else {
          // After 5 failed attempts, stop retrying
          setError('Unable to connect to the game. Please refresh the page or try again later.');
          setPollError(true);
        }
      }
    };
    
    // Fetch game state immediately
    fetchGameState();
    
    // Only set up polling if we're not in an error state
    let interval: NodeJS.Timeout | null = null;
    if (!pollError) {
      interval = setInterval(fetchGameState, 2000);
    }
    
    // Clean up interval on unmount
    return () => {
      if (interval) clearInterval(interval);
      unmounted.current = true;
    };
  }, [gameId, prevRoundWinner, prevRound, prevHand, retryCount, error, pollError]);

  // Update game status message based on state
  const updateGameStatus = (state: GameState) => {
    if (state.estado === 'aguardando') {
      setGameStatus('Waiting to start the next hand');
      setWaitingMsg('');
    } else if (state.estado === 'apostas') {
      const currentPlayerIdx = state.current_player_idx ?? 0;
      const currentPlayer = state.ordem_jogada?.[currentPlayerIdx];
      if (currentPlayer !== undefined && currentPlayer === playerId) {
        setGameStatus('It\'s your turn to place a bet!');
        setWaitingMsg('');
      } else if (currentPlayer !== undefined) {
        setGameStatus(`Waiting for ${state.player_names[currentPlayer]} to place a bet`);
        setWaitingMsg('Waiting for other players to place bets...');
      } else {
        setGameStatus('Waiting for bets');
        setWaitingMsg('');
      }
    } else if (state.estado === 'jogando') {
      const currentPlayerIdx = state.current_player_idx ?? 0;
      const currentPlayer = state.ordem_jogada?.[currentPlayerIdx];
      if (currentPlayer !== undefined && currentPlayer === playerId) {
        setGameStatus('It\'s your turn to play a card!');
        setWaitingMsg('');
      } else if (currentPlayer !== undefined) {
        setGameStatus(`Waiting for ${state.player_names[currentPlayer]} to play a card`);
        setWaitingMsg('Waiting for other players to play...');
      } else {
        setGameStatus('Waiting for plays');
        setWaitingMsg('');
      }
    } else if (state.estado === 'round_over') {
      if (state.current_round && state.cartas && state.current_round < state.cartas) {
        // Between rounds in a multi-card hand
        const roundWinner = state.last_round_winner || state.last_trick_winner;
        
        if (state.tie_in_previous_round) {
          setGameStatus(`Round ${state.current_round} complete! It was a tie.`);
          setWaitingMsg(`Starting next round shortly... Next round will have a x${state.multiplicador || 2} multiplier.`);
        } else if (roundWinner) {
          const winnerName = state.player_names[roundWinner];
          setGameStatus(`Round ${state.current_round} complete! ${winnerName} won this round.`);
          
          // The next player to play is after the dealer (not the round winner)
          if (state.dealer && state.first_player) {
            const firstPlayerName = state.player_names[state.first_player];
            setWaitingMsg(`Starting next round shortly... ${firstPlayerName} will play first.`);
          } else {
            setWaitingMsg('Starting next round shortly...');
          }
        } else {
          setGameStatus(`Round ${state.current_round} complete!`);
          setWaitingMsg('Starting next round shortly...');
        }
      } else {
        // Between hands
        setGameStatus('Hand complete!');
        
        // Show results summary
        let resultsMsg = 'Results: ';
        for (const playerId of state.players) {
          if (!state.eliminados?.includes(playerId)) {
            const name = state.player_names[playerId];
            const bet = state.palpites?.[playerId] || 0;
            const wins = state.vitorias?.[playerId] || 0;
            const lives = state.vidas?.[playerId] || 0;
            resultsMsg += `${name}: bet ${bet}, won ${wins}, lives ${lives} | `;
          }
        }
        setWaitingMsg(resultsMsg + 'Waiting to start the next hand...');
      }
    } else if (state.estado === 'terminado') {
      const winners = state.players.filter(p => !state.eliminados?.includes(p));
      if (winners.length === 1) {
        const winner = winners[0];
        setGameStatus(`Game over! ${state.player_names[winner]} won!`);
      } else {
        setGameStatus('Game over!');
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
        setError(data.error || 'Error starting round');
      }
    } catch (error) {
      console.error('Error starting round:', error);
      setError('Connection error');
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
        setError(data.error || 'Error making bet');
      }
    } catch (error) {
      console.error('Error making bet:', error);
      setError('Connection error');
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
        setError(data.error || 'Error playing card');
        setLastPlayedCard(null);
      }
    } catch (error) {
      console.error('Error playing card:', error);
      setError('Connection error');
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

  // Check if this is a one-card hand
  const isOneCardHand = gameState?.cartas === 1;

  // Handler for new game (for now, just leave game)
  const handleNewGame = () => {
    onLeaveGame();
  };

  return (
    <div className={styles.gameContainer}>
      <div className={styles.header}>
        <h2>Game Room: {gameId}</h2>
        <div className={styles.gameInfo}>
          {gameState?.current_hand && (
            <p className={styles.handInfo}>Hand: {gameState.current_hand + 1}</p>
          )}
          <p>Cards per player: {gameState?.cartas || 1}</p>
          {gameState?.current_round && (
            <p className={styles.roundInfo}>Round: {gameState.current_round} of {gameState?.cartas || 1}</p>
          )}
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
      
      {roundEndMessage && (
        <div className={styles.roundEndMessage}>
          <p>{roundEndMessage}</p>
        </div>
      )}

      {error && (
        <div className={styles.errorMessage}>
          <p>{error}</p>
        </div>
      )}

      {isOneCardHand && (
        <div className={styles.infoMessage}>
          <p>One-card hand rule: You can only see other players' cards!</p>
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
              } ${(gameState.last_round_winner === id || gameState.last_trick_winner === id) ? styles.lastWinner : ''}`}
            >
              <div className={styles.playerName}>
                {gameState.player_names[id]} {id === playerId ? '(You)' : ''}
                {gameState.dealer === id && <span className={styles.dealerLabel}> 🎲</span>}
              </div>
              <div className={styles.playerStats}>
                <div className={styles.playerLives}>
                  {'❤️'.repeat(Math.max(0, gameState.vidas[id]))}
                  {gameState.vidas[id] <= 0 && <span className={styles.eliminatedText}>Eliminated</span>}
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

        {/* Other players' cards in one-card hand */}
        {isOneCardHand && gameState?.estado === 'apostas' && gameState?.maos && (
          <div className={styles.otherPlayersCards}>
            <h3>Other Players' Cards</h3>
            <div className={styles.tableCards}>
              {gameState.players
                .filter(id => id !== playerId)
                .map((id) => 
                  gameState.maos && gameState.maos[id] && gameState.maos[id].length > 0 ? (
                    <div key={id} className={styles.playedCardContainer}>
                      <div className={`${styles.card} ${getCardColorClass(gameState.maos[id][0])}`}>
                        <div className={styles.cardContent}>
                          <span className={styles.cardValue}>{formatCard(gameState.maos[id][0]).value}</span>
                          <span className={`${styles.cardSuit} ${getSuitClass(gameState.maos[id][0])}`}>
                            {formatCard(gameState.maos[id][0]).suit}
                          </span>
                        </div>
                      </div>
                      <div className={styles.playerLabel}>
                        {gameState.player_names[id]}
                      </div>
                    </div>
                  ) : null
              )}
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

      {gameState?.estado === 'aguardando' && playerId === 1 && (
        <div className={styles.actionContainer}>
          <button 
            onClick={startRound} 
            className={styles.actionButton}
          >
            Start New Hand
          </button>
        </div>
      )}

      {gameState?.estado === 'aguardando' && playerId !== 1 && (
        <div className={styles.actionContainer}>
          <p className={styles.waitingMsg}>Waiting for host to start next hand...</p>
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

      {/* Only show player's hand if it's not a one-card hand */}
      {gameState?.maos && gameState.maos[playerId] && gameState.maos[playerId].length > 0 && 
       !isOneCardHand && (
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

      {/* For one-card hand during playing phase, show hidden card */}
      {isOneCardHand && gameState?.estado === 'jogando' && gameState?.maos && gameState.maos[playerId] && (
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
          <p className={styles.cardHint}>You can't see your card in the one-card hand!</p>
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