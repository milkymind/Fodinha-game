import { Server, Socket } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';

const SocketIoHandler = (req: NextApiRequest, res: NextApiResponse) => {
  if ((res.socket as any).server.io) {
    console.log('Socket.IO already running on /api/socket-io path');
    res.end();
    return;
  }

  console.log('Setting up Socket.IO server on /api/socket-io path');
  
  // Forward to the main socket handler
  res.writeHead(307, { Location: '/api/socket' });
  res.end();
};

export default SocketIoHandler;

// Configure for API route handling
export const config = {
  api: {
    bodyParser: false,
  },
}; 