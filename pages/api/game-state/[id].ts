import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from '../persistent-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const lobby = await getLobby(id as string);
  
  if (!lobby) {
    return res.status(404).json({ status: 'error', error: 'Game not found' });
  }
  
  if (!lobby.gameState) {
    return res.status(404).json({ status: 'error', error: 'Game state not found' });
  }
  
  // Check if we need to transition from round_over to jogando for multi-round hands
  if (lobby.gameState.estado === 'round_over' && 
      lobby.gameState.current_round && 
      lobby.gameState.cartas && 
      lobby.gameState.current_round < lobby.gameState.cartas) {
    
    // If it's been at least 2 seconds since the round ended, start a new round
    const now = Date.now();
    if (lobby.gameState.round_over_timestamp && now - lobby.gameState.round_over_timestamp >= 2000) {
      console.log(`Starting next round after delay`);
      
      // Start the next round
      lobby.gameState.estado = 'jogando';
      lobby.gameState.current_round++;
      lobby.gameState.mesa = [];
      lobby.gameState.cards_played_this_round = 0;
      
      // For subsequent rounds within the same hand, the winner of the previous round goes first
      // If there was no winner (tie), the last player who played starts
      if (lobby.gameState.tie_in_previous_round) {
        // If there was a tie in the previous round, the player who played last starts
        // (This is already set as last_round_winner in the play-card endpoint)
        if (lobby.gameState.last_round_winner) {
          console.log(`Previous round was a tie. Last player ${lobby.gameState.last_round_winner} will start next round`);
          const firstPlayerIdx = lobby.gameState.players.indexOf(lobby.gameState.last_round_winner);
          if (firstPlayerIdx !== -1) {
            lobby.gameState.first_player = lobby.gameState.last_round_winner;
            lobby.gameState.ordem_jogada = [
              ...lobby.gameState.players.slice(firstPlayerIdx),
              ...lobby.gameState.players.slice(0, firstPlayerIdx)
            ].filter(p => !lobby.gameState.eliminados.includes(p));
            lobby.gameState.current_player_idx = 0;
          }
        }
      } else if (lobby.gameState.last_round_winner) {
        // Winner of previous round starts
        const firstPlayerIdx = lobby.gameState.players.indexOf(lobby.gameState.last_round_winner);
        if (firstPlayerIdx !== -1) {
          console.log(`Round winner ${lobby.gameState.last_round_winner} will start next round`);
          lobby.gameState.first_player = lobby.gameState.last_round_winner;
          lobby.gameState.ordem_jogada = [
            ...lobby.gameState.players.slice(firstPlayerIdx),
            ...lobby.gameState.players.slice(0, firstPlayerIdx)
          ].filter(p => !lobby.gameState.eliminados.includes(p));
          lobby.gameState.current_player_idx = 0;
        } else {
          // Fallback if winner is not found (shouldn't happen)
          console.log(`Warning: Round winner ${lobby.gameState.last_round_winner} not found in players list`);
          // Use dealer-based ordering as fallback
          const dealerIdx = lobby.gameState.players.indexOf(lobby.gameState.dealer);
          lobby.gameState.first_player = lobby.gameState.players[(dealerIdx + 1) % lobby.gameState.players.length];
          lobby.gameState.ordem_jogada = [
            ...lobby.gameState.players.slice(lobby.gameState.players.indexOf(lobby.gameState.first_player)),
            ...lobby.gameState.players.slice(0, lobby.gameState.players.indexOf(lobby.gameState.first_player))
          ].filter(p => !lobby.gameState.eliminados.includes(p));
          lobby.gameState.current_player_idx = 0;
        }
      } else if (lobby.gameState.mesa && lobby.gameState.mesa.length > 0) {
        // No winner (tie) - last player who played starts
        const lastPlayerId = lobby.gameState.mesa[lobby.gameState.mesa.length - 1][0];
        const lastPlayerIdx = lobby.gameState.players.indexOf(lastPlayerId);
        console.log(`No round winner (tie). Last player ${lastPlayerId} will start next round`);
        lobby.gameState.first_player = lastPlayerId;
        lobby.gameState.ordem_jogada = [
          ...lobby.gameState.players.slice(lastPlayerIdx),
          ...lobby.gameState.players.slice(0, lastPlayerIdx)
        ].filter(p => !lobby.gameState.eliminados.includes(p));
        lobby.gameState.current_player_idx = 0;
      } else {
        // Fallback - first player is to the right of the dealer (clockwise)
        console.log(`Using dealer-based ordering as fallback`);
        const dealerIdx = lobby.gameState.players.indexOf(lobby.gameState.dealer);
        lobby.gameState.first_player = lobby.gameState.players[(dealerIdx + 1) % lobby.gameState.players.length];
        lobby.gameState.ordem_jogada = [
          ...lobby.gameState.players.slice(lobby.gameState.players.indexOf(lobby.gameState.first_player)),
          ...lobby.gameState.players.slice(0, lobby.gameState.players.indexOf(lobby.gameState.first_player))
        ].filter(p => !lobby.gameState.eliminados.includes(p));
        lobby.gameState.current_player_idx = 0;
      }
      
      lobby.gameState.round_over_timestamp = undefined;
      
      // Save the updated game state
      await setLobby(lobby);
    }
  }
  
  return res.status(200).json({ status: 'success', game_state: lobby.gameState });
} 