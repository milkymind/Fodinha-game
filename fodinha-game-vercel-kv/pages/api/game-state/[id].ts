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
      const roundOverTime = lobby.gameState.timestamp_round_over || 0;
      
      if (currentTime - roundOverTime >= 4000) {
        console.log(`Transitioning game ${id} from round_over to jogando for round ${lobby.gameState.current_round + 1}`);
        
        // Increment the current round
        lobby.gameState.current_round += 1;
        
        // Update the game state
        lobby.gameState.estado = 'jogando';
        
        // Clear the table for the next round
        lobby.gameState.mesa = {};
        
        // Set the current player to the last round winner or the last player who played
        if (lobby.gameState.last_round_winner !== undefined) {
          console.log(`Setting current player to last round winner: ${lobby.gameState.last_round_winner}`);
          lobby.gameState.current_player_idx = lobby.gameState.ordem_jogada.indexOf(lobby.gameState.last_round_winner);
        } else if (lobby.gameState.last_player !== undefined) {
          console.log(`Setting current player to last player: ${lobby.gameState.last_player}`);
          lobby.gameState.current_player_idx = lobby.gameState.ordem_jogada.indexOf(lobby.gameState.last_player);
        }
        
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