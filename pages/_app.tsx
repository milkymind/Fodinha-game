import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app'
import '../styles/globals.css'
import io, { Socket } from 'socket.io-client';

// Create a WebSocket context to be used throughout the app
import { createContext } from 'react';
export const SocketContext = createContext<Socket | null>(null);

export default function App({ Component, pageProps }: AppProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const initializeSocket = async () => {
      try {
        // Make sure the socket server is running
        await fetch('/api/socket');
        
        // Connect to the socket server with auto reconnection
        const socketConnection = io({
          path: '/api/socket-io',
          addTrailingSlash: false,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          transports: ['polling', 'websocket'], // Start with polling, then upgrade to WebSocket
          upgrade: true, // Allow transport upgrade
          forceNew: true, // Force a new connection
          autoConnect: true,
          query: {
            timestamp: Date.now().toString() // Prevent caching issues
          }
        });
        
        // Set up event listeners
        socketConnection.on('connect', () => {
          console.log('Socket connected:', socketConnection.id);
          setSocketConnected(true);
        });
        
        socketConnection.on('disconnect', () => {
          console.log('Socket disconnected');
          setSocketConnected(false);
          
          // Try to reconnect manually after a short delay if not reconnecting automatically
          setTimeout(() => {
            if (!socketConnection.connected) {
              console.log('Attempting manual reconnection...');
              socketConnection.connect();
            }
          }, 2000);
        });
        
        socketConnection.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setSocketConnected(false);
          
          // Manual reconnect attempt with refreshed parameters
          setTimeout(() => {
            console.log('Attempting reconnection after error...');
            // Update the query to force a new connection attempt
            socketConnection.io.opts.query = { timestamp: Date.now().toString() };
            socketConnection.connect();
          }, 3000);
        });
        
        socketConnection.on('error', (error) => {
          console.error('Socket error:', error);
        });
        
        // Handle engine errors
        socketConnection.io.engine?.on('error', (error: string | Error) => {
          console.error('Transport error:', error);
        });
        
        // Keep track of connection attempts
        socketConnection.io.on('reconnect_attempt', (attempt) => {
          console.log(`Reconnection attempt ${attempt}`);
          // Update the query parameter to avoid caching issues
          socketConnection.io.opts.query = { timestamp: Date.now().toString() };
        });
        
        setSocket(socketConnection);
      } catch (error) {
        console.error('Failed to initialize socket:', error);
        // Try again after a delay with exponential backoff
        setTimeout(initializeSocket, 5000);
      }
    };

    // Only initialize if we don't have a socket yet
    if (!socket) {
      initializeSocket();
    }

    // Clean up on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={socket}>
      <Component {...pageProps} />
    </SocketContext.Provider>
  );
} 