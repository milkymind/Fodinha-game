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
  palpites: { [key: number]: number };
  initial_lives: number;
  current_round?: number;
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
  last_trick_winner?: number;
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
  
  if (gameState.estado !== 'jogando') {
    return res.status(400).json({ status: 'error', error: 'Not in playing phase' });
  }
  
  const currentPlayer = gameState.ordem_jogada[gameState.current_player_idx];
  if (currentPlayer !== player_id) {
    return res.status(400).json({ status: 'error', error: 'Not your turn to play' });
  }
  
  const hand = gameState.maos[player_id];
  if (!hand || hand.length <= card_index) {
    return res.status(400).json({ status: 'error', error: 'Invalid card index' });
  }
  
  // Play the card
  const card = hand.splice(card_index, 1)[0];
  gameState.mesa.push([player_id, card]);
  gameState.current_player_idx = (gameState.current_player_idx + 1) % gameState.players.length;
  
  // If all players have played, resolve the trick
  if (gameState.mesa.length === gameState.players.length) {
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
    
    if (winners.length > 1) {
      // If it's the last trick, use suit order to break ties
      const allHandsEmpty = Object.values(gameState.maos).every(hand => hand.length === 0);
      
      if (allHandsEmpty) {
        let highestSuit = -1;
        
        for (const [pid, cardPlayed] of winners) {
          const suit = getCardSuit(cardPlayed);
          const suitValue = ORDEM_NAIPE_DESEMPATE[suit as keyof typeof ORDEM_NAIPE_DESEMPATE] || 0;
          
          if (suitValue > highestSuit) {
            highestSuit = suitValue;
            winner = pid;
          }
        }
      } else {
        // For non-final tricks, cancel the trick and increase multiplier
        gameState.multiplicador = (gameState.multiplicador || 1) + 1;
        
        // Reset for next trick with the last player starting
        const lastPlayerIdx = gameState.players.indexOf(gameState.mesa[gameState.mesa.length - 1][0]);
        gameState.current_player_idx = lastPlayerIdx;
        gameState.mesa = [];
        
        // Clear last trick winner when there's a tie
        gameState.last_trick_winner = undefined;
        
        lobby.gameState = gameState;
        await setLobby(lobby);
        return res.status(200).json({ status: 'success', game_state: gameState });
      }
    } else if (winners.length === 1) {
      winner = winners[0][0];
    }
    
    // Award trick to winner
    gameState.vitorias[winner] = (gameState.vitorias[winner] || 0) + (gameState.multiplicador || 1);
    gameState.multiplicador = 1;
    
    // Set the last trick winner
    gameState.last_trick_winner = winner;
    
    // Setup for next trick (winner leads)
    const winnerIdx = gameState.players.indexOf(winner);
    gameState.current_player_idx = winnerIdx;
    gameState.mesa = [];
    
    // Check if round is over
    const allHandsEmpty = Object.values(gameState.maos).every(hand => hand.length === 0);
    if (allHandsEmpty) {
      gameState.estado = 'round_over';
      
      // Calculate life losses
      for (const playerId of gameState.players) {
        const palpite = gameState.palpites[playerId] || 0;
        const vitorias = gameState.vitorias[playerId] || 0;
        const diff = Math.abs(palpite - vitorias);
        
        gameState.vidas[playerId] -= diff;
      }
      
      // Check for eliminated players
      gameState.eliminados = gameState.players.filter(pid => gameState.vidas[pid] <= 0);
      
      if (gameState.eliminados.length > 0) {
        gameState.estado = 'terminado';
      } else {
        gameState.estado = 'aguardando';
        gameState.current_round = (gameState.current_round || 1) + 1;
      }
    }
  }
  
  lobby.gameState = gameState;
  await setLobby(lobby);
  
  return res.status(200).json({ status: 'success', game_state: gameState });
} 