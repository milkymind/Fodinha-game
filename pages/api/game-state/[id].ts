import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  try {
    const lobby = await getLobby(id as string);
    
    if (!lobby) {
      console.error(`Game not found: ${id}`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Game not found',
        code: 'GAME_NOT_FOUND',
        gameId: id 
      });
    }
    
    if (!lobby.gameState) {
      console.error(`Game state not found for: ${id}`);
      return res.status(404).json({ 
        status: 'error', 
        error: 'Game state not found',
        code: 'GAME_STATE_NOT_FOUND',
        gameId: id 
      });
    }
    
    // Check if we need to transition from round_over to jogando for multi-round hands
    if (lobby.gameState.estado === 'round_over' && 
        lobby.gameState.current_round && 
        lobby.gameState.cartas && 
        lobby.gameState.current_round < lobby.gameState.cartas) {
      
      // If it's been at least 4 seconds since the round ended
      const currentTime = Date.now();
      const roundOverTime = lobby.gameState.round_over_timestamp || 0;
      
      if (currentTime - roundOverTime >= 4000) {
        console.log(`Transitioning game ${id} from round_over to jogando for round ${lobby.gameState.current_round + 1}`);
        
        // Increment the current round
        lobby.gameState.current_round += 1;
        
        // Update the game state
        lobby.gameState.estado = 'jogando';
        
        // Clear the mesa for the next round
        lobby.gameState.mesa = [];
        lobby.gameState.cards_played_this_round = 0;
        
        // For multi-round hands within the same hand, the dealer rotation doesn't change
        // First player should be the one after the dealer (consistent with the rules)
        if (lobby.gameState.dealer !== undefined) {
          const dealerIdx = lobby.gameState.players.indexOf(lobby.gameState.dealer);
          lobby.gameState.first_player = lobby.gameState.players[(dealerIdx + 1) % lobby.gameState.players.length];
          
          // Set the play order starting from the first player
          const firstPlayerIdx = lobby.gameState.players.indexOf(lobby.gameState.first_player);
          lobby.gameState.ordem_jogada = [
            ...lobby.gameState.players.slice(firstPlayerIdx),
            ...lobby.gameState.players.slice(0, firstPlayerIdx)
          ].filter(p => !lobby.gameState.eliminados.includes(p));
          
          lobby.gameState.current_player_idx = 0;
        }
        
        // Reset the round_over_timestamp
        lobby.gameState.round_over_timestamp = undefined;
        
        // Save the updated lobby
        await setLobby(lobby);
      }
    }
    
    return res.status(200).json({ status: 'success', game_state: lobby.gameState });
  } catch (error) {
    console.error(`Error processing game state for ID ${id}:`, error);
    return res.status(500).json({ 
      status: 'error', 
      error: 'Server error processing game state',
      code: 'SERVER_ERROR',
      gameId: id
    });
  }
} 