import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { Memory } from 'lowdb';
import path from 'path';
import fs from 'fs';
import { setValue, getValue, deleteValue, getLobbyKey } from './db-handler';

type Lobby = {
  gameId: string;
  players: { id: number; name: string }[];
  maxPlayers: number;
  lives: number;
  gameStarted?: boolean;
  gameState?: any;
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

export async function getLobby(gameId: string): Promise<Lobby | undefined> {
  // For production/Vercel, use our db-handler
  if (isProduction) {
    try {
      // First check memory cache
      if (memoryLobbies[gameId]) {
        return memoryLobbies[gameId];
      }
      
      // Try to get from Vercel KV or fallback store
      const key = getLobbyKey(gameId);
      const lobby = await getValue(key);
      
      if (lobby) {
        // Cache in memory for faster access
        memoryLobbies[gameId] = lobby;
        return lobby;
      }
      
      return undefined;
    } catch (err) {
      console.error('Error retrieving lobby:', err);
      return undefined;
    }
  } else {
    // Regular development mode using file system
    await init();
    return db.data.lobbies[gameId];
  }
}

export async function setLobby(lobby: Lobby) {
  // For production environments, use our db-handler
  if (isProduction) {
    try {
      // Save to memory cache
      memoryLobbies[lobby.gameId] = lobby;
      
      // Save to Vercel KV or fallback store
      const key = getLobbyKey(lobby.gameId);
      await setValue(key, lobby);
      
      return;
    } catch (err) {
      console.error('Error saving lobby:', err);
    }
  }
  
  // Regular development mode using file system
  await init();
  db.data.lobbies[lobby.gameId] = lobby;
  await db.write();
}

export async function getAllLobbies(): Promise<Record<string, Lobby>> {
  // In production, we don't have a good way to get all lobbies
  // So we'll just return what's in memory
  if (isProduction) {
    return memoryLobbies;
  }
  
  await init();
  return db.data.lobbies;
}

export async function deleteLobby(gameId: string) {
  // Remove from all storage locations
  if (isProduction) {
    // Remove from memory
    delete memoryLobbies[gameId];
    
    // Remove from Vercel KV or fallback store
    const key = getLobbyKey(gameId);
    await deleteValue(key);
    
    return;
  }
  
  // Regular development mode using file system
  await init();
  delete db.data.lobbies[gameId];
  await db.write();
}

// Helper functions for cookie management in server-side context
// Add custom type for globalThis with our cookies property
declare global {
  var gameCookies: Record<string, string>;
}

function parseCookies() {
  // In server context, get cookies from the request
  // This is a simple implementation that assumes cookies
  // were passed in the request context
  const cookies: Record<string, string> = {};
  
  try {
    if (typeof window === 'undefined' && global.gameCookies) {
      // Attempt to read from a global context if available
      return global.gameCookies;
    }
  } catch (e) {
    console.error('Error parsing cookies:', e);
  }
  
  return cookies;
}

function setCookie(name: string, value: string) {
  try {
    if (typeof window === 'undefined') {
      // Initialize if not exists
      if (!global.gameCookies) {
        global.gameCookies = {};
      }
      global.gameCookies[name] = value;
    }
  } catch (e) {
    console.error('Error setting cookie:', e);
  }
}

function deleteCookie(name: string) {
  try {
    if (typeof window === 'undefined' && global.gameCookies) {
      delete global.gameCookies[name];
    }
  } catch (e) {
    console.error('Error deleting cookie:', e);
  }
}
