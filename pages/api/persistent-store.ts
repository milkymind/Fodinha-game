import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { Memory } from 'lowdb';
import path from 'path';
import fs from 'fs';

type Lobby = {
  gameId: string;
  players: { id: number; name: string }[];
  maxPlayers: number;
  lives: number;
  gameStarted?: boolean;
  gameState?: any;
  lastUpdated?: number;
};

type Data = {
  lobbies: Record<string, Lobby>;
};

// This variable will store lobbies in memory across API calls
// but only within the same serverless function instance
let memoryLobbies: Record<string, Lobby> = {};

let db: Low<Data>;

// Check if we're in production (Vercel) or development environment
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // In production, use in-memory storage with a shared memory object
  const defaultData: Data = { lobbies: {} };
  db = new Low<Data>(new Memory(), defaultData);
} else {
  // In development, use file storage
  const dbPath = path.join(process.cwd(), 'db.json');

  // Ensure the db.json file exists with default data
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ lobbies: {} }));
  }

  const adapter = new JSONFile<Data>(dbPath);
  const defaultData: Data = { lobbies: {} };
  db = new Low<Data>(adapter, defaultData);
}

// Initialize db with empty lobbies if not present
async function init() {
  await db.read();
  if (!db.data) {
    db.data = { lobbies: {} };
  }
  if (!db.data.lobbies) {
    db.data.lobbies = {};
  }
  
  // In production, synchronize with our shared memory object
  if (isProduction) {
    // We need to merge the in-memory lobbies with the db's lobbies
    db.data.lobbies = { ...db.data.lobbies, ...memoryLobbies };
  }
  
  await db.write();
}

// Use a long polling approach to improve persistence in serverless
const MAX_POLLING_ATTEMPTS = 3;

export async function getLobby(gameId: string): Promise<Lobby | undefined> {
  // For production/Vercel, with improved reliability
  if (isProduction) {
    // First check memory cache
    if (memoryLobbies[gameId]) {
      return memoryLobbies[gameId];
    }
    
    // If not in memory, try retrieving from db with retries
    for (let attempt = 1; attempt <= MAX_POLLING_ATTEMPTS; attempt++) {
      try {
        await init();
        const lobby = db.data.lobbies[gameId];
        
        if (lobby) {
          // Cache result in memory for faster access
          memoryLobbies[gameId] = lobby;
          break;
        }
        
        if (attempt < MAX_POLLING_ATTEMPTS) {
          // Short delay between attempts
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error(`Error retrieving lobby (attempt ${attempt}/${MAX_POLLING_ATTEMPTS}):`, err);
      }
    }
    
    return memoryLobbies[gameId];
  }
  
  // Development environment - use file storage directly
  await init();
  return db.data.lobbies[gameId];
}

export async function setLobby(lobby: Lobby) {
  // Add timestamp to track updates
  lobby.lastUpdated = Date.now();
  
  // Save to memory first for all environments
  memoryLobbies[lobby.gameId] = lobby;
  
  if (isProduction) {
    // For production, save with retries
    for (let attempt = 1; attempt <= MAX_POLLING_ATTEMPTS; attempt++) {
      try {
        await init();
        db.data.lobbies[lobby.gameId] = lobby;
        await db.write();
        break;
      } catch (err) {
        console.error(`Error saving lobby (attempt ${attempt}/${MAX_POLLING_ATTEMPTS}):`, err);
        
        if (attempt < MAX_POLLING_ATTEMPTS) {
          // Short delay between attempts
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  } else {
    // Regular development mode using file system
    await init();
    db.data.lobbies[lobby.gameId] = lobby;
    await db.write();
  }
}

export async function getAllLobbies(): Promise<Record<string, Lobby>> {
  // In production, combine memory cache with stored data
  if (isProduction) {
    try {
      await init();
      // Merge db lobbies with in-memory lobbies, preferring newer versions
      const allLobbies = { ...db.data.lobbies };
      
      // Add any lobbies from memory that might be newer
      for (const [id, lobby] of Object.entries(memoryLobbies)) {
        const dbLobby = allLobbies[id];
        if (!dbLobby || !dbLobby.lastUpdated || (lobby.lastUpdated && lobby.lastUpdated > dbLobby.lastUpdated)) {
          allLobbies[id] = lobby;
        }
      }
      
      return allLobbies;
    } catch (err) {
      console.error('Error getting all lobbies, returning memory cache:', err);
      // If there's an error, fall back to memory cache
      return memoryLobbies;
    }
  }
  
  // Development environment - use file storage
  await init();
  return db.data.lobbies;
}

export async function deleteLobby(gameId: string) {
  // Remove from memory cache
  delete memoryLobbies[gameId];
  
  if (isProduction) {
    // For production, delete with retries
    for (let attempt = 1; attempt <= MAX_POLLING_ATTEMPTS; attempt++) {
      try {
        await init();
        delete db.data.lobbies[gameId];
        await db.write();
        break;
      } catch (err) {
        console.error(`Error deleting lobby (attempt ${attempt}/${MAX_POLLING_ATTEMPTS}):`, err);
        
        if (attempt < MAX_POLLING_ATTEMPTS) {
          // Short delay between attempts
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  } else {
    // Regular development mode using file system
    await init();
    delete db.data.lobbies[gameId];
    await db.write();
  }
}
