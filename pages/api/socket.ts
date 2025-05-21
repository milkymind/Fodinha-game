import { Server } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { getLobby, setLobby } from './persistent-store';

// Keep track of active connections
const activeConnections: Map<string, number> = new Map();
const activeGames: Map<string, Map<number, string>> = new Map();

// Clean up stale connections periodically
setInterval(() => {
  const now = Date.now();
  activeConnections.forEach((timestamp, socketId) => {
    if (now - timestamp > 5 * 60 * 1000) { // 5 minutes
      activeConnections.delete(socketId);
    }
  });
}, 60000);

const SocketHandler = (req: NextApiRequest, res: NextApiResponse) => {
  if ((res.socket as any).server.io) {
    console.log('Socket already running');
    res.end();
    return;
  }

  console.log('Setting up socket.io server');
  const io = new Server((res.socket as any).server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Increase reconnection attempts and timeouts
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // Reduce connection timeouts
    connectTimeout: 10000
  });
  (res.socket as any).server.io = io;

  // Track ongoing actions to prevent duplicates
  const ongoingActions: Map<string, number> = new Map();
  
  // Clean up stale actions periodically
  setInterval(() => {
    const now = Date.now();
    ongoingActions.forEach((timestamp, key) => {
      if (now - timestamp > 10000) { // Remove after 10 seconds
        ongoingActions.delete(key);
      }
    });
  }, 30000);

  io.on('connection', socket => {
    console.log(`Socket connected: ${socket.id}`);
    activeConnections.set(socket.id, Date.now());
    
    // Create a throttle mechanism for this socket
    const socketThrottle: Map<string, number> = new Map();
    
    // Helper function to throttle events
    const throttleEvent = (eventName: string, data: any, cooldown = 2000): boolean => {
      const key = `${eventName}-${JSON.stringify(data)}`;
      const now = Date.now();
      const lastTime = socketThrottle.get(key) || 0;
      
      if (now - lastTime < cooldown) {
        return false;
      }
      
      socketThrottle.set(key, now);
      return true;
    };

    // Add custom properties to socket
    interface CustomSocket extends ReturnType<Server['sockets']['sockets'][0]> {
      gameId?: string;
      playerId?: number;
    }
    const typedSocket = socket as CustomSocket;

    // Join a game room
    socket.on('join-game', async ({ gameId, playerId, playerName }: { gameId: string, playerId: number, playerName: string }) => {
      if (!throttleEvent('join-game', { gameId, playerId }, 5000)) {
        console.log(`Throttled join-game event for player ${playerId}`);
        return;
      }
      
      try {
        console.log(`Player ${playerId} (${playerName}) joining game ${gameId}`);
        
        // Track this socket's game association 
        typedSocket.gameId = gameId;
        typedSocket.playerId = playerId;
        
        // Keep track of sockets in this game
        if (!activeGames.has(gameId)) {
          activeGames.set(gameId, new Map());
        }
        activeGames.get(gameId)?.set(playerId, socket.id);
        
        await socket.join(gameId);
        
        // Get current lobby
        const lobby = await getLobby(gameId);
        if (lobby) {
          // Notify room of new player
          socket.to(gameId).emit('player-joined', { playerId, playerName });
          
          // Send current game state to joining player
          socket.emit('game-state-update', { gameState: lobby.gameState });
          console.log(`Sent initial game state to player ${playerId}`);
          
          // Update player's last activity time
          if (lobby.gameState && !lobby.gameState.last_activity) {
            lobby.gameState.last_activity = {};
          }
          
          if (lobby.gameState) {
            lobby.gameState.last_activity[playerId] = Date.now();
            await setLobby(lobby);
          }
        } else {
          console.error(`Failed to find lobby ${gameId} for player ${playerId}`);
          socket.emit('error', { message: 'Game not found' });
        }
      } catch (error) {
        console.error(`Error in join-game handler:`, error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Listen for game actions
    socket.on('game-action', async (data: { gameId: string, action: string, playerId: number, payload?: any, actionId?: string }) => {
      if (!throttleEvent('game-action', data, 500)) {
        console.log(`Throttled game-action event from player ${data.playerId}`);
        return;
      }
      
      try {
        const { gameId, action, playerId, payload, actionId } = data;
        
        if (!gameId || !action || !playerId) {
          socket.emit('action-error', { error: 'Invalid action data' });
          return;
        }
        
        // Generate a unique action ID if not provided
        const effectiveActionId = actionId || `${gameId}-${playerId}-${action}-${Date.now()}`;
        
        // Check if this is a duplicate/rapid action
        if (action === 'play-card' || action === 'make-bet') {
          const playerActionKey = `${gameId}-${playerId}-${action}`;
          const lastAction = ongoingActions.get(playerActionKey);
          
          if (lastAction && Date.now() - lastAction < 2000) {
            // Ignore rapid actions but still acknowledge receipt to avoid retries
            console.log(`Ignoring rapid action ${action} from player ${playerId}`);
            socket.emit('action-received', { 
              actionId: effectiveActionId,
              action,
              status: 'throttled'
            });
            return;
          }
          
          // Mark this action as in progress
          ongoingActions.set(playerActionKey, Date.now());
        }
        
        console.log(`Game action: ${action} from player ${playerId} in game ${gameId}`);
        
        // Broadcasts the action to everyone else for immediate feedback
        socket.to(gameId).emit('player-action', { 
          playerId, 
          action, 
          actionId: effectiveActionId,
          timestamp: Date.now() 
        });
        
        // Acknowledge receipt of action to client
        socket.emit('action-received', { 
          actionId: effectiveActionId,
          action,
          status: 'received'
        });
      } catch (error: any) {
        console.error(`Error in game-action handler:`, error);
        socket.emit('action-error', { 
          error: 'Failed to process action',
          details: error.message
        });
      }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      activeConnections.delete(socket.id);
      
      // Remove this socket from the active games tracking
      if (typedSocket.gameId && typedSocket.playerId) {
        const gameConnections = activeGames.get(typedSocket.gameId);
        if (gameConnections && gameConnections.get(typedSocket.playerId) === socket.id) {
          gameConnections.delete(typedSocket.playerId);
          
          // If game has no more connections, clean up
          if (gameConnections.size === 0) {
            activeGames.delete(typedSocket.gameId);
          }
        }
      }
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
    
    socket.on('connect_error', (error) => {
      console.error(`Socket connection error for ${socket.id}:`, error);
    });
    
    // Handle explicit reconnection attempts
    socket.on('reconnect-attempt', async ({ gameId, playerId }: { gameId: string, playerId: number }) => {
      if (!throttleEvent('reconnect-attempt', { gameId, playerId }, 5000)) {
        console.log(`Throttled reconnect-attempt event from player ${playerId}`);
        return;
      }
      
      console.log(`Player ${playerId} attempting to reconnect to game ${gameId}`);
      try {
        // Update socket's game info
        typedSocket.gameId = gameId;
        typedSocket.playerId = playerId;
        
        // Update active games tracking
        if (!activeGames.has(gameId)) {
          activeGames.set(gameId, new Map());
        }
        activeGames.get(gameId)?.set(playerId, socket.id);
        
        await socket.join(gameId);
        const lobby = await getLobby(gameId);
        
        if (lobby) {
          // Update player's activity timestamp
          if (lobby.gameState) {
            if (!lobby.gameState.last_activity) {
              lobby.gameState.last_activity = {};
            }
            lobby.gameState.last_activity[playerId] = Date.now();
            
            // Check if player was marked as inactive and reactivate
            if (lobby.gameState.inactive_players && 
                lobby.gameState.inactive_players.includes(playerId)) {
              // Remove from inactive players list
              lobby.gameState.inactive_players = lobby.gameState.inactive_players.filter(
                (id: number) => id !== playerId
              );
              console.log(`Player ${playerId} was reactivated in game ${gameId}`);
            }
            
            // Save updated lobby state
            await setLobby(lobby);
          }
          
          // Send current game state to reconnected player
          socket.emit('game-state-update', { gameState: lobby.gameState });
          
          // Notify others that this player reconnected
          socket.to(gameId).emit('player-reconnected', { playerId });
          
          // Let the player know they're reconnected
          socket.emit('reconnected', { gameId, playerId });
        } else {
          socket.emit('error', { message: 'Game not found' });
        }
      } catch (error) {
        console.error(`Error in reconnect-attempt handler:`, error);
        socket.emit('error', { message: 'Failed to reconnect to game' });
      }
    });
  });

  res.end();
};

export default SocketHandler; 