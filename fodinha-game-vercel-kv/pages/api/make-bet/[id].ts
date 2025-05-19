import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

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
  current_hand?: number;
  current_player_idx: number;
  ordem_jogada: number[];
  multiplicador: number;
  soma_palpites: number;
  mesa: [number, string][];
  vitorias: { [key: number]: number };
  dealer?: number;
  first_player?: number;
  cartas: number;
  eliminados: number[];
  direction?: 'up' | 'down';
  original_maos?: { [key: number]: string[] };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  const { player_id, bet } = req.body;
  
  const lobby = await getLobby(id as string);
  if (!lobby) {
    return res.status(404).json({ status: 'error', error: 'Game not found' });
  }
  
  const gameState = lobby.gameState as GameState;
  if (!gameState) {
    return res.status(404).json({ status: 'error', error: 'Game state not found' });
  }
  
  if (gameState.estado !== 'apostas') {
    return res.status(400).json({ status: 'error', error: 'Not in betting phase' });
  }
  
  if (gameState.palpites[player_id] !== undefined) {
    return res.status(400).json({ status: 'error', error: 'You already bet' });
  }
  
  // Only allow the current player to bet
  const currentPlayer = gameState.ordem_jogada[gameState.current_player_idx];
  if (currentPlayer !== player_id) {
    return res.status(400).json({ status: 'error', error: 'Not your turn to bet' });
  }
  
  // Check if this is the last player to bet
  const isLastPlayer = gameState.current_player_idx === gameState.ordem_jogada.length - 1;
  
  // If last player, enforce "forbidden sum" rule
  if (isLastPlayer) {
    let currentSum = 0;
    for (const pid in gameState.palpites) {
      currentSum += gameState.palpites[pid];
    }
    
    // Cannot bet if it would make the sum equal to the number of cards
    if (currentSum + bet === gameState.cartas) {
      return res.status(400).json({
        status: 'error',
        error: `You can't bet ${bet}. The total would equal the number of cards (${gameState.cartas}).`
      });
    }
  }
  
  // Add the bet
  gameState.palpites[player_id] = bet;
  gameState.soma_palpites = (gameState.soma_palpites || 0) + bet;
  gameState.current_player_idx++;
  
  // If all players have bet, move to playing phase
  if (Object.keys(gameState.palpites).length === gameState.players.filter(p => !gameState.eliminados.includes(p)).length) {
    gameState.estado = 'jogando';
    gameState.current_player_idx = 0;
    
    // Reset order of play to start from first player
    if (gameState.first_player) {
      const firstPlayerIdx = gameState.players.indexOf(gameState.first_player);
      gameState.ordem_jogada = [
        ...gameState.players.slice(firstPlayerIdx),
        ...gameState.players.slice(0, firstPlayerIdx)
      ];
    }
    
    // For one-card hands, we need to hide each player's own card
    // but allow them to see other players' cards
    if (gameState.cartas === 1) {
      // Store original cards for later reference (needed when a player plays their card)
      gameState.original_maos = JSON.parse(JSON.stringify(gameState.maos));
      
      // For now, we've already shown other players' cards during betting phase
      // in the Game component, so no need to modify the state here
    }
  }
  
  lobby.gameState = gameState;
  await setLobby(lobby);
  
  return res.status(200).json({ status: 'success', game_state: gameState });
} 