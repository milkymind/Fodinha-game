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
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000
        });
        
        // Set up event listeners
        socketConnection.on('connect', () => {
          console.log('Socket connected:', socketConnection.id);
          setSocketConnected(true);
        });
        
        socketConnection.on('disconnect', () => {
          console.log('Socket disconnected');
          setSocketConnected(false);
        });
        
        socketConnection.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setSocketConnected(false);
        });
        
        socketConnection.on('error', (error) => {
          console.error('Socket error:', error);
        });
        
        setSocket(socketConnection);
      } catch (error) {
        console.error('Failed to initialize socket:', error);
        // Try again after 5 seconds
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