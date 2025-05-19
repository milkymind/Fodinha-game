import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

const ORDEM_CARTAS = {
  '4': 0, '5': 1, '6': 2, '7': 3, 'Q': 4, 'J': 5, 'K': 6, 'A': 7, '2': 8, '3': 9
};

const ORDEM_NAIPE_MANILHA = {'♦': 0, '♠': 1, '♥': 2, '♣': 3};
const ORDEM_NAIPE_DESEMPATE = {'♣': 3, '♥': 2, '♠': 1, '♦': 0};

interface GameState {
  players: number[];
  player_names: { [key: number]: string };
  vidas: { [key: number]: number };
  estado: string;
  carta_meio?: string;
  manilha?: string;
  maos: { [key: number]: string[] };
  original_maos?: { [key: number]: string[] }; // For one-card hands
  palpites: { [key: number]: number };
  initial_lives: number;
  current_round?: number;
  current_hand?: number;
  current_player_idx: number;
  ordem_jogada: number[];
  multiplicador: number;
  soma_palpites?: number;
  mesa: [number, string][];
  vitorias: { [key: number]: number };
  dealer?: number;
  first_player?: number;
  cartas?: number;
  eliminados: number[];
  last_round_winner?: number;
  last_trick_winner?: number; // Keeping this for backward compatibility
  direction?: 'up' | 'down';
  round_over_timestamp?: number; // To add a delay between rounds
  cards_played_this_round?: number; // Track how many cards played in current round
  tie_in_previous_round?: boolean; // Track if there was a tie in previous round
  timestamp_round_over?: number; // To add a delay between rounds
}

function getCardValue(card: string): string {
  return card.substring(0, card.length - 1);
}

function getCardSuit(card: string): string {
  return card.charAt(card.length - 1);
}

function getCardStrength(card: string, manilha: string | undefined): number {
  const value = getCardValue(card);
  const suit = getCardSuit(card);
  
  if (manilha && value === manilha) {
    return 100 + ORDEM_NAIPE_MANILHA[suit as keyof typeof ORDEM_NAIPE_MANILHA];
  }
  
  return ORDEM_CARTAS[value as keyof typeof ORDEM_CARTAS] || 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  const { player_id, card_index } = req.body;
  
  const lobby = await getLobby(id as string);
  if (!lobby) {
    return res.status(404).json({ status: 'error', error: 'Game not found' });
  }
  
  const gameState = lobby.gameState as GameState;
  if (!gameState) {
    return res.status(404).json({ status: 'error', error: 'Game state not found' });
  }
  
  // Check if we need to transition from round_over to jogando for multi-round hands
  if (gameState.estado === 'round_over' && gameState.current_round && gameState.cartas && 
      gameState.current_round < gameState.cartas) {
    console.log(`Checking if we should transition from round_over to jogando`);
    console.log(`Current round: ${gameState.current_round}, Cards per hand: ${gameState.cartas}`);
    
    // If it's been at least 2 seconds since the round ended, start a new round
    const now = Date.now();
    if (gameState.round_over_timestamp && now - gameState.round_over_timestamp >= 2000) {
      console.log(`Starting next round after delay`);
      // Start the next round
      gameState.estado = 'jogando';
      gameState.current_round++;
      gameState.mesa = [];
      gameState.cards_played_this_round = 0;
      
      // For multi-round hands within the same hand, the dealer rotation doesn't change
      // First player should be the one after the dealer (consistent with the rules)
      if (gameState.dealer !== undefined) {
        const dealerIdx = gameState.players.indexOf(gameState.dealer);
        gameState.first_player = gameState.players[(dealerIdx + 1) % gameState.players.length];
        gameState.ordem_jogada = [
          ...gameState.players.slice(gameState.players.indexOf(gameState.first_player)),
          ...gameState.players.slice(0, gameState.players.indexOf(gameState.first_player))
        ];
        gameState.current_player_idx = 0;
      }
      
      gameState.round_over_timestamp = undefined;
    }
  }
  
  if (gameState.estado !== 'jogando') {
    return res.status(400).json({ status: 'error', error: 'Not in playing phase' });
  }
  
  const currentPlayer = gameState.ordem_jogada[gameState.current_player_idx];
  if (currentPlayer !== player_id) {
    return res.status(400).json({ status: 'error', error: 'Not your turn to play' });
  }
  
  // Initialize cards_played_this_round if not already set
  if (gameState.cards_played_this_round === undefined) {
    gameState.cards_played_this_round = gameState.mesa.length;
  }
  
  // Handle one-card hand special case - we need to use the original card from the hidden hand
  if (gameState.cartas === 1 && gameState.original_maos) {
    const originalHand = gameState.original_maos[player_id];
    if (originalHand && originalHand.length > 0) {
      // Play the card from the original hand
      const card = originalHand[card_index];
      
      // Remove card from both original and current hands to keep them in sync
      originalHand.splice(card_index, 1);
      if (gameState.maos[player_id] && gameState.maos[player_id].length > 0) {
        gameState.maos[player_id].splice(card_index, 1);
      }
      
      gameState.mesa.push([player_id, card]);
      gameState.cards_played_this_round = (gameState.cards_played_this_round || 0) + 1;
      gameState.current_player_idx = (gameState.current_player_idx + 1) % gameState.players.length;
    } else {
      return res.status(400).json({ status: 'error', error: 'Invalid card index' });
    }
  } else {
    // Regular case - play from visible hand
    const hand = gameState.maos[player_id];
    if (!hand || hand.length <= card_index) {
      return res.status(400).json({ status: 'error', error: 'Invalid card index' });
    }
    
    // Play the card
    const card = hand.splice(card_index, 1)[0];
    gameState.mesa.push([player_id, card]);
    gameState.cards_played_this_round = (gameState.cards_played_this_round || 0) + 1;
    gameState.current_player_idx = (gameState.current_player_idx + 1) % gameState.players.length;
  }
  
  // If all active players have played, resolve the trick
  const activePlayersCount = gameState.players.filter(p => !gameState.eliminados.includes(p)).length;
  if (gameState.mesa.length === activePlayersCount) {
    // Find the highest card
    let highestStrength = -1;
    let winners: [number, string][] = [];
    
    for (const [pid, cardPlayed] of gameState.mesa) {
      const strength = getCardStrength(cardPlayed, gameState.manilha);
      
      if (strength > highestStrength) {
        highestStrength = strength;
        winners = [[pid, cardPlayed]];
      } else if (strength === highestStrength) {
        winners.push([pid, cardPlayed]);
      }
    }
    
    // Handle ties with suit order
    let winner: number = gameState.players[0]; // Default in case of unexpected errors
    let isTie = false;
    
    if (winners.length > 1) {
      // Check if this is the last round of the entire hand
      const isLastRoundOfHand = gameState.current_round === gameState.cartas;
      
      if (isLastRoundOfHand) {
        // This is the last round of the hand, we must break the tie using suit order
        console.log(`Breaking tie in final round using suits`);
        let highestSuit = -1;
        
        for (const [pid, cardPlayed] of winners) {
          const suit = getCardSuit(cardPlayed);
          // Use ORDEM_NAIPE_MANILHA for the suit tiebreaker - where ♣ is strongest
          const suitValue = ORDEM_NAIPE_MANILHA[suit as keyof typeof ORDEM_NAIPE_MANILHA] || 0;
          
          if (suitValue > highestSuit) {
            highestSuit = suitValue;
            winner = pid;
          }
        }
        console.log(`Tie broken: winner is player ${winner} with suit value ${highestSuit}`);
      } else {
        // This is not the final round, we increase multiplier but still complete the round
        console.log(`Tie in non-final round. Increasing multiplier and completing round.`);
        gameState.multiplicador = (gameState.multiplicador || 1) + 1;
        isTie = true;
        
        // In a tie, the last player to play will start the next round
        const lastPlayerId = gameState.mesa[gameState.mesa.length - 1][0];
        winner = lastPlayerId;
        gameState.tie_in_previous_round = true;
      }
    } else if (winners.length === 1) {
      winner = winners[0][0];
      gameState.tie_in_previous_round = false;
    }
    
    // Award trick to winner - only if there was a clear winner
    if (!isTie) {
      gameState.vitorias[winner] = (gameState.vitorias[winner] || 0) + (gameState.multiplicador || 1);
      gameState.multiplicador = 1; // Reset multiplier after awarding points
    }
    
    // Set the round winner (with backward compatibility)
    gameState.last_round_winner = winner;
    gameState.last_trick_winner = winner; // For backward compatibility
    
    // Check if round is over (all players have played one card in this round)
    const isRoundComplete = gameState.cards_played_this_round === activePlayersCount;
    
    if (isRoundComplete) {
      console.log(`Round ${gameState.current_round} of ${gameState.cartas} completed`);
      
      // Reset cards played counter for next round
      gameState.cards_played_this_round = 0;
      
      // If this isn't the last round of the hand, move to round_over state temporarily
      if ((gameState.current_round || 1) < (gameState.cartas || 1)) {
        console.log(`Moving to round_over state for next round. Current round: ${gameState.current_round}, Cards per hand: ${gameState.cartas}`);
        // This is a round within a multi-card hand, mark it as round_over temporarily
        gameState.estado = 'round_over';
        gameState.round_over_timestamp = Date.now(); // Set timestamp for the delay
        
        // Store the round winner for UI display purposes
        gameState.last_round_winner = winner;
        gameState.last_trick_winner = winner; // For backward compatibility
        
        // Clear the mesa for the next round
        gameState.mesa = [];
      } else {
        // This was the last round of the hand, hand is complete
        gameState.estado = 'round_over';
        
        // Calculate life losses based on bets vs. tricks won
        for (const playerId of gameState.players) {
          if (gameState.eliminados.includes(playerId)) continue;
          
          const palpite = gameState.palpites[playerId] || 0;
          const vitorias = gameState.vitorias[playerId] || 0;
          const diff = Math.abs(palpite - vitorias);
          
          gameState.vidas[playerId] -= diff;
        }
        
        // Check for eliminated players
        gameState.eliminados = gameState.players.filter(pid => gameState.vidas[pid] <= 0);
        
        if (gameState.players.filter(pid => !gameState.eliminados.includes(pid)).length <= 1) {
          // Only one or fewer players remain, game is over
          gameState.estado = 'terminado';
        } else {
          // Ready to start a new hand
          gameState.estado = 'aguardando';
        }
      }
      
      // Save the round-ending timestamp for the delay before next round
      if (gameState.current_round !== undefined && 
          gameState.cartas !== undefined && 
          gameState.current_round < gameState.cartas) {
        // Use consistent naming - timestamp_round_over is used in game-state/[id].ts
        gameState.timestamp_round_over = Date.now();
        console.log(`End of round ${gameState.current_round}. Setting timestamp for ${gameState.multiplicador || 1}x multiplier round.`);
      }
    } else {
      // Round continues, next trick
      // Setup for next trick (winner leads)
      const winnerIdx = gameState.players.indexOf(winner);
      gameState.current_player_idx = winnerIdx;
      gameState.mesa = [];
    }
  }
  
  lobby.gameState = gameState;
  await setLobby(lobby);
  
  return res.status(200).json({ status: 'success', game_state: gameState });
} 