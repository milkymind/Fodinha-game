// This file handles database connections in a way that's compatible with Vercel's serverless environment

import { createClient } from '@vercel/kv';

// Initialize KV client if credentials are available
let kvClient: any = null;

try {
  // Check if we're in a Vercel environment with KV credentials
  if (process.env.KV_URL && process.env.KV_REST_API_URL && 
      process.env.KV_REST_API_TOKEN && process.env.KV_REST_API_READ_ONLY_TOKEN) {
    kvClient = createClient({
      url: process.env.KV_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    console.log('Vercel KV client initialized');
  }
} catch (error) {
  console.error('Failed to initialize Vercel KV client:', error);
}

// For testing or development without Vercel KV, use an in-memory store
const memoryStore: Record<string, any> = {};

export async function setValue(key: string, value: any): Promise<void> {
  try {
    if (kvClient) {
      // Use Vercel KV if available
      await kvClient.set(key, JSON.stringify(value));
    } else {
      // Fallback to in-memory store
      memoryStore[key] = value;
    }
  } catch (error) {
    console.error(`Error setting value for key ${key}:`, error);
    // Fallback to in-memory store on error
    memoryStore[key] = value;
  }
}

export async function getValue(key: string): Promise<any | null> {
  try {
    if (kvClient) {
      // Use Vercel KV if available
      const value = await kvClient.get(key);
      if (value) {
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    } else {
      // Fallback to in-memory store
      return memoryStore[key] || null;
    }
  } catch (error) {
    console.error(`Error getting value for key ${key}:`, error);
    // Fallback to in-memory store on error
    return memoryStore[key] || null;
  }
  return null;
}

export async function deleteValue(key: string): Promise<void> {
  try {
    if (kvClient) {
      // Use Vercel KV if available
      await kvClient.del(key);
    } else {
      // Fallback to in-memory store
      delete memoryStore[key];
    }
  } catch (error) {
    console.error(`Error deleting value for key ${key}:`, error);
    // Still try to remove from memory store on error
    delete memoryStore[key];
  }
}

// Helper function to generate a unique lobby key
export function getLobbyKey(gameId: string): string {
  return `lobby:${gameId}`;
} 