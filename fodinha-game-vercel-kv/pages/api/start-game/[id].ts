import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

const SUITS = ['♣', '♥', '♠', '♦'];
const VALUES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

function shuffle<T>(array: T[]): T[] {
  return array.sort(() => Math.random() - 0.5);
}

function createDeck() {
  const deck = SUITS.flatMap((suit) => VALUES.map((value) => ({ value, suit })));
  return shuffle(deck);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }
  
  try {
    const { id } = req.query;
    const lobby = await getLobby(id as string);
    
    if (!lobby) {
      return res.status(404).json({ status: 'error', error: 'Lobby not found' });
    }
    
    // Mark the lobby as started
    lobby.gameStarted = true;

    // Initialize game state
    const players = lobby.players.map((p) => p.id);
    const player_names = Object.fromEntries(lobby.players.map((p) => [p.id, p.name]));
    const vidas = Object.fromEntries(lobby.players.map((p) => [p.id, lobby.lives]));
    const round = 1;
    const deck = createDeck();
    const hands: Record<number, string[]> = {};
    const cardsPerPlayer = round;
    
    for (const pid of players) {
      hands[pid] = deck.splice(0, cardsPerPlayer).map(card => card.value + card.suit);
    }
    
    const carta_meio = deck.shift();
    const manilha = carta_meio ? VALUES[(VALUES.indexOf(carta_meio.value) + 1) % VALUES.length] : undefined;

    const gameState = {
      players,
      player_names,
      vidas,
      estado: 'apostas',
      round,
      carta_meio: carta_meio ? carta_meio.value + carta_meio.suit : '',
      manilha,
      maos: hands,
      palpites: {},
      mesa: [],
      vitorias: Object.fromEntries(players.map(pid => [pid, 0])),
      ordem_jogada: players.slice(),
      current_player_idx: 0,
      cartas: cardsPerPlayer,
      eliminados: [],
    };
    
    lobby.gameState = gameState;
    await setLobby(lobby);
    
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error starting game:', error);
    return res.status(500).json({ status: 'error', error: 'Failed to start game' });
  }
} 