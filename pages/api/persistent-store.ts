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
  // For production/Vercel, first check the memory cache
  if (isProduction && memoryLobbies[gameId]) {
    return memoryLobbies[gameId];
  }
  
  await init();
  const lobby = db.data.lobbies[gameId];
  
  // Cache the result in memory for faster access
  if (isProduction && lobby) {
    memoryLobbies[gameId] = lobby;
  }
  
  return lobby;
}

export async function setLobby(lobby: Lobby) {
  // Save to memory cache first for Vercel
  if (isProduction) {
    memoryLobbies[lobby.gameId] = lobby;
  }
  
  await init();
  db.data.lobbies[lobby.gameId] = lobby;
  await db.write();
}

export async function getAllLobbies(): Promise<Record<string, Lobby>> {
  await init();
  return db.data.lobbies;
}

export async function deleteLobby(gameId: string) {
  // Remove from memory cache for Vercel
  if (isProduction) {
    delete memoryLobbies[gameId];
  }
  
  await init();
  delete db.data.lobbies[gameId];
  await db.write();
}
