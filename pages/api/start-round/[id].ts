import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

const SUITS = ['♣', '♥', '♠', '♦'];
const VALUES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function createDeck() {
  const deck = SUITS.flatMap((suit) => VALUES.map((value) => ({ value, suit })));
  return shuffle(deck);
}

function getNextManilha(carta: string): string {
  const value = carta.substring(0, carta.length - 1);
  const valueIndex = VALUES.indexOf(value);
  return VALUES[(valueIndex + 1) % VALUES.length];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  const lobby = await getLobby(id as string);
  
  if (!lobby) {
    return res.status(404).json({ status: 'error', error: 'Game not found' });
  }
  
  if (!lobby.gameState) {
    // If game state doesn't exist, initialize it
    const players = lobby.players.map((p) => p.id);
    const player_names = Object.fromEntries(lobby.players.map((p) => [p.id, p.name]));
    const vidas = Object.fromEntries(lobby.players.map((p) => [p.id, lobby.lives]));
    
    lobby.gameState = {
      players,
      player_names,
      vidas,
      estado: 'aguardando',
      initial_lives: lobby.lives,
      current_round: 0,
      multiplicador: 1,
      mesa: [],
      palpites: {},
      vitorias: {},
      eliminados: [],
    };
  }
  
  const gameState = lobby.gameState;
  
  if (gameState.estado !== 'aguardando' && gameState.estado !== 'round_over') {
    return res.status(400).json({ status: 'error', error: 'Cannot start round now' });
  }
  
  // Update dealer for next round (rotate)
  if (gameState.dealer === undefined) {
    // First round, pick a random dealer
    gameState.dealer = gameState.players[Math.floor(Math.random() * gameState.players.length)];
  } else {
    // Rotate dealer
    const dealerIdx = gameState.players.indexOf(gameState.dealer);
    gameState.dealer = gameState.players[(dealerIdx + 1) % gameState.players.length];
  }
  
  // First player is after the dealer
  const dealerIdx = gameState.players.indexOf(gameState.dealer);
  gameState.first_player = gameState.players[(dealerIdx + 1) % gameState.players.length];
  
  // Reset game state for new round
  gameState.multiplicador = 1;
  gameState.palpites = {};
  gameState.vitorias = {};
  gameState.mesa = [];
  gameState.eliminados = gameState.eliminados || [];
  gameState.current_round = (gameState.current_round || 0) + 1;
  
  // Calculate cards per player for this round
  const maxCardsPerPlayer = Math.floor(SUITS.length * VALUES.length / gameState.players.length);
  
  // Handle crescendo/decrescendo logic
  if (gameState.cartas === undefined) {
    gameState.cartas = 1;
  } else {
    // If we're already at max cards, start decreasing
    if (gameState.cartas === maxCardsPerPlayer) {
      gameState.cartas--;
    } 
    // If we're at 1 card, start increasing
    else if (gameState.cartas === 1) {
      gameState.cartas = 2;
    }
    // Otherwise continue the trend (increasing or decreasing)
    else {
      const isIncreasing = gameState.current_round <= Math.ceil(maxCardsPerPlayer / 2);
      gameState.cartas = isIncreasing ? gameState.cartas + 1 : gameState.cartas - 1;
      
      // Cap at max cards
      if (gameState.cartas > maxCardsPerPlayer) {
        gameState.cartas = maxCardsPerPlayer;
      }
    }
  }
  
  // Create and shuffle deck
  const deck = createDeck();
  
  // Deal middle card (for manilha)
  const middleCard = deck.shift();
  if (middleCard) {
    gameState.carta_meio = middleCard.value + middleCard.suit;
    gameState.manilha = getNextManilha(gameState.carta_meio);
  }
  
  // Deal cards to players
  gameState.maos = {};
  for (const player of gameState.players) {
    if (!gameState.eliminados.includes(player)) {
      gameState.maos[player] = [];
      for (let i = 0; i < gameState.cartas; i++) {
        const card = deck.shift();
        if (card) {
          gameState.maos[player].push(card.value + card.suit);
        }
      }
    }
  }
  
  // Set up betting phase
  gameState.estado = 'apostas';
  gameState.ordem_jogada = [
    ...gameState.players.slice(gameState.players.indexOf(gameState.first_player)),
    ...gameState.players.slice(0, gameState.players.indexOf(gameState.first_player))
  ];
  gameState.current_player_idx = 0;
  gameState.soma_palpites = 0;
  
  // For players with 0 lives, don't deal cards
  for (const player of gameState.players) {
    if (gameState.eliminados.includes(player)) {
      gameState.maos[player] = [];
      gameState.vitorias[player] = 0;
    } else {
      gameState.vitorias[player] = 0;
    }
  }
  
  // Update the lobby with the new game state
  lobby.gameState = gameState;
  await setLobby(lobby);
  
  return res.status(200).json({
    status: 'success',
    game_state: gameState
  });
} 