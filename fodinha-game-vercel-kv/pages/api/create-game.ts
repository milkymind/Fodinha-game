import type { NextApiRequest, NextApiResponse } from 'next';
import { setLobby } from './persistent-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }

  try {
    const { player_name, lives } = req.body;

    if (!player_name) {
      return res.status(400).json({ status: 'error', error: 'Player name is required' });
    }

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const lobby = {
      gameId,
      players: [{ id: 1, name: player_name }],
      maxPlayers: 6,
      lives: lives || 3,
      gameStarted: false,
      gameState: null,
    };

    await setLobby(lobby);

    return res.status(200).json({
      status: 'success',
      game_id: gameId,
      player_id: 1,
      lobby: {
        players: lobby.players,
        maxPlayers: lobby.maxPlayers,
        lives: lobby.lives,
      },
    });
  } catch (error) {
    console.error('Error creating game:', error);
    return res.status(500).json({ status: 'error', error: 'Failed to create game' });
  }
} 