import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby } from '../persistent-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const lobby = await getLobby(id as string);
  
  if (!lobby) {
    return res.status(404).json({ status: 'error', error: 'Game not found' });
  }
  
  if (!lobby.gameState) {
    return res.status(404).json({ status: 'error', error: 'Game state not found' });
  }
  
  return res.status(200).json({ status: 'success', game_state: lobby.gameState });
} 