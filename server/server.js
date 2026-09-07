/**
 * server.js
 * Express + Socket.IO Authoritative Game Server for 3D Dots & Boxes.
 */
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { RoomManager } from './rooms/RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend assets if built
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const roomManager = new RoomManager(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    ...roomManager.getStats(),
  });
});

io.on('connection', (socket) => {
  let currentRoomId = null;

  // 1. Create Room
  socket.on('CREATE_ROOM', (data, callback) => {
    try {
      const sessionToken = data?.sessionToken || socket.id;
      const room = roomManager.createRoom(socket.id, sessionToken);
      currentRoomId = room.roomId;

      socket.join(room.roomId);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId: room.roomId,
          role: 'p1',
          sessionToken,
          gridSize: room.gameState.gridSize,
          players: room.getPublicPlayers(),
        });
      }
      room.broadcastLobbyState();
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // 2. Join Room
  socket.on('JOIN_ROOM', (data, callback) => {
    try {
      const roomId = data?.roomId?.toUpperCase()?.trim();
      const sessionToken = data?.sessionToken || socket.id;
      const room = roomManager.getRoom(roomId);

      if (!room) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Room not found. Please verify the code.' });
        }
        return;
      }

      const joinRes = room.joinPlayer(socket.id, sessionToken, data?.name || 'Player 2');
      if (!joinRes.success) {
        if (typeof callback === 'function') {
          callback({ success: false, error: joinRes.error });
        }
        return;
      }

      currentRoomId = room.roomId;
      socket.join(room.roomId);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId: room.roomId,
          role: joinRes.role,
          sessionToken,
          isReconnect: joinRes.isReconnect,
          gridSize: room.gameState.gridSize,
          status: room.gameState.status,
          matchNumber: room.matchNumber,
          rematchReady: { ...room.rematchReady },
          state: room.gameState.serialize(),
          players: room.getPublicPlayers(),
        });
      }

      if (joinRes.isReconnect) {
        socket.to(room.roomId).emit('OPPONENT_RECONNECTED', {
          role: joinRes.role,
        });
      } else {
        socket.to(room.roomId).emit('PLAYER_JOINED', {
          players: room.getPublicPlayers(),
        });
      }

      room.broadcastLobbyState();
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // 3. Set Ready State
  socket.on('SET_READY', (data, callback) => {
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const player = room.getPlayerBySocket(socket.id);
    if (player) {
      room.setPlayerReady(player.role, data.isReady);
      if (typeof callback === 'function') callback({ success: true });
    }
  });

  // 4. Set Board Size (Host Only)
  socket.on('SET_BOARD_SIZE', (data, callback) => {
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const player = room.getPlayerBySocket(socket.id);
    if (player) {
      const res = room.setBoardSize(player.role, data.size);
      if (typeof callback === 'function') callback(res);
    }
  });

  // 5. Make Move (Authoritative)
  socket.on('MAKE_MOVE', (data, callback) => {
    const room = roomManager.getRoom(currentRoomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    const res = room.handleMove(socket.id, data.lineId);
    if (typeof callback === 'function') {
      callback(res);
    }
  });

  // 6. Request Rematch (Authoritative)
  const handleRematchRequest = (data, callback) => {
    const room = roomManager.getRoom(currentRoomId);
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
      return;
    }

    const player = room.getPlayerBySocket(socket.id);
    if (!player) {
      if (typeof callback === 'function') callback({ success: false, error: 'Player not recognized in room' });
      return;
    }

    const res = room.requestRematch(player.role);
    if (typeof callback === 'function') callback(res);
  };

  socket.on('REMATCH_REQUEST', handleRematchRequest);
  socket.on('REQUEST_REMATCH', handleRematchRequest);

  // 7. Leave Room
  socket.on('LEAVE_ROOM', () => {
    if (currentRoomId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        socket.leave(room.roomId);
        room.handleDisconnect(socket.id);
      }
      currentRoomId = null;
    }
  });

  // 8. Disconnect
  socket.on('disconnect', () => {
    if (currentRoomId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        room.handleDisconnect(socket.id);
      }
    }
  });
});

if (fs.existsSync(distPath)) {
  app.get('/{*splat}', (req, res, next) => {
    if (req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Dots & Boxes Authoritative Server running on port ${PORT}`);
});
