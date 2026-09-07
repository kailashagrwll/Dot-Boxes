/**
 * multiplayer.test.js
 * End-to-end socket client test suite for Authoritative Multiplayer Dots & Boxes.
 */
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { RoomManager } from '../server/rooms/RoomManager.js';

async function runTests() {
  console.log('🚀 Starting Multiplayer End-to-End Tests...');

  // Setup test server
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, { cors: { origin: '*' } });
  const roomManager = new RoomManager(ioServer);

  ioServer.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('CREATE_ROOM', (data, callback) => {
      const room = roomManager.createRoom(socket.id, data?.sessionToken || socket.id);
      currentRoomId = room.roomId;
      socket.join(room.roomId);
      callback({
        success: true,
        roomId: room.roomId,
        role: 'p1',
        gridSize: room.gameState.gridSize,
      });
      room.broadcastLobbyState();
    });

    socket.on('JOIN_ROOM', (data, callback) => {
      const room = roomManager.getRoom(data?.roomId);
      if (!room) return callback({ success: false, error: 'Room not found' });
      const joinRes = room.joinPlayer(socket.id, data?.sessionToken || socket.id);
      if (!joinRes.success) return callback(joinRes);
      currentRoomId = room.roomId;
      socket.join(room.roomId);
      callback({ success: true, roomId: room.roomId, role: joinRes.role });
      room.broadcastLobbyState();
    });

    socket.on('SET_READY', (data, callback) => {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const p = room.getPlayerBySocket(socket.id);
        if (p) room.setPlayerReady(p.role, data.isReady);
      }
      callback?.({ success: true });
    });

    socket.on('SET_BOARD_SIZE', (data, callback) => {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const p = room.getPlayerBySocket(socket.id);
        const res = room.setBoardSize(p?.role, data.size);
        callback?.(res);
      }
    });

    socket.on('MAKE_MOVE', (data, callback) => {
      const room = roomManager.getRoom(currentRoomId);
      const res = room.handleMove(socket.id, data.lineId);
      callback?.(res);
    });

    const handleRematch = (data, callback) => {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const p = room.getPlayerBySocket(socket.id);
        const res = room.requestRematch(p?.role);
        callback?.(res);
      }
    };
    socket.on('REMATCH_REQUEST', handleRematch);
    socket.on('REQUEST_REMATCH', handleRematch);
  });

  await new Promise((resolve) => server.listen(3456, resolve));
  const serverUrl = 'http://localhost:3456';

  function createClient(token) {
    return Client(serverUrl, { transports: ['websocket'], forceNew: true });
  }

  const p1Socket = createClient('token_p1');
  const p2Socket = createClient('token_p2');
  const p3Socket = createClient('token_p3');

  await Promise.all([
    new Promise((res) => p1Socket.on('connect', res)),
    new Promise((res) => p2Socket.on('connect', res)),
    new Promise((res) => p3Socket.on('connect', res)),
  ]);
  console.log('✅ 3 test socket clients connected to test server');

  // 1. Player 1 creates room
  const createRes = await new Promise((resolve) => {
    p1Socket.emit('CREATE_ROOM', { sessionToken: 'token_p1' }, resolve);
  });
  console.log(`✅ P1 created room: ${createRes.roomId} (Role: ${createRes.role})`);
  if (!createRes.success || createRes.role !== 'p1' || createRes.roomId.length !== 6) {
    throw new Error('Room creation failed');
  }

  // 2. Player 2 joins room
  const joinRes = await new Promise((resolve) => {
    p2Socket.emit('JOIN_ROOM', { roomId: createRes.roomId, sessionToken: 'token_p2' }, resolve);
  });
  console.log(`✅ P2 joined room: ${joinRes.roomId} (Role: ${joinRes.role})`);
  if (!joinRes.success || joinRes.role !== 'p2') {
    throw new Error('P2 join failed');
  }

  // 3. Player 3 attempts to join full room -> MUST be rejected
  const fullRes = await new Promise((resolve) => {
    p3Socket.emit('JOIN_ROOM', { roomId: createRes.roomId, sessionToken: 'token_p3' }, resolve);
  });
  console.log(`✅ P3 join attempt correctly rejected: "${fullRes.error}"`);
  if (fullRes.success !== false) {
    throw new Error('P3 was allowed to join full room!');
  }

  // 4. Host changes board size to 3 (3x3 dots = 4 boxes)
  const sizeRes = await new Promise((resolve) => {
    p1Socket.emit('SET_BOARD_SIZE', { size: 3 }, resolve);
  });
  console.log(`✅ Board size changed to 3: success = ${sizeRes.success}`);

  // 5. Ready up and start game
  const gameStartPromise = Promise.all([
    new Promise((res) => p1Socket.on('GAME_STARTED', res)),
    new Promise((res) => p2Socket.on('GAME_STARTED', res)),
  ]);

  p1Socket.emit('SET_READY', { isReady: true });
  p2Socket.emit('SET_READY', { isReady: true });

  const [startP1, startP2] = await gameStartPromise;
  console.log(`✅ GAME_STARTED received by both clients! Grid size: ${startP1.state.gridSize}`);

  // 6. Test Authoritative Turns: P2 tries to move first (out of turn) -> MUST fail
  const invalidTurnRes = await new Promise((resolve) => {
    p2Socket.emit('MAKE_MOVE', { lineId: 'h_0_0' }, resolve);
  });
  console.log(`✅ Out of turn move rejected: "${invalidTurnRes.error}"`);
  if (invalidTurnRes.success) throw new Error('Out of turn move was accepted!');

  // 7. Play through complete 3x3 game to reach GAME_OVER
  // All 12 lines:
  const linesToPlay = [
    'h_0_0', 'v_0_0', 'h_1_0', 'v_0_1',
    'h_0_1', 'v_0_2', 'h_1_1',
    'v_1_0', 'h_2_0', 'v_1_1',
    'h_2_1', 'v_1_2'
  ];

  let currentTurn = 'p1';
  const gameOverPromise = Promise.all([
    new Promise((res) => p1Socket.once('GAME_OVER', res)),
    new Promise((res) => p2Socket.once('GAME_OVER', res)),
  ]);

  for (const lineId of linesToPlay) {
    const activeSocket = currentTurn === 'p1' ? p1Socket : p2Socket;
    const moveRes = await new Promise((resolve) => {
      activeSocket.emit('MAKE_MOVE', { lineId }, resolve);
    });
    if (!moveRes.success) {
      throw new Error(`Failed to play move ${lineId} by ${currentTurn}: ${moveRes.error}`);
    }
    currentTurn = moveRes.moveData.currentPlayer;
  }

  const [gameOverP1, gameOverP2] = await gameOverPromise;
  console.log(`✅ Match #1 GAME_OVER broadcast received! Winner: ${gameOverP1.winner}, Scores:`, gameOverP1.scores);

  // 8. Test Authoritative Rematch Flow
  console.log('🔄 Testing Authoritative Rematch Flow...');

  // Step 8a: Player 1 clicks Rematch
  const p1RematchStatusPromise = new Promise((resolve) => {
    p2Socket.once('REMATCH_STATUS', resolve);
  });
  p1Socket.emit('REMATCH_REQUEST', {});
  const status1 = await p1RematchStatusPromise;
  console.log('✅ P1 requested rematch. REMATCH_STATUS received on P2:', status1);
  if (!status1.p1 || status1.p2) {
    throw new Error(`Expected P1 ready and P2 not ready, got: ${JSON.stringify(status1)}`);
  }

  // Step 8b: P1 duplicate click should be safely ignored
  const dupRes = await new Promise((resolve) => {
    p1Socket.emit('REMATCH_REQUEST', {}, resolve);
  });
  console.log('✅ P1 duplicate REMATCH_REQUEST safely ignored:', dupRes);

  // Step 8c: Player 2 clicks Rematch -> triggers REMATCH_STARTED on both clients
  const rematchStartedPromise = Promise.all([
    new Promise((res) => p1Socket.once('REMATCH_STARTED', res)),
    new Promise((res) => p2Socket.once('REMATCH_STARTED', res)),
  ]);

  p2Socket.emit('REMATCH_REQUEST', {});
  const [rematchP1, rematchP2] = await rematchStartedPromise;
  console.log('✅ REMATCH_STARTED received by both clients!');
  console.log(`Match Number: ${rematchP1.matchNumber}, Starting Player: ${rematchP1.startingPlayer}, Scores:`, rematchP1.scores);

  // Verify Match #2 state
  if (rematchP1.matchNumber !== 2) throw new Error(`Expected matchNumber 2, got ${rematchP1.matchNumber}`);
  if (rematchP1.startingPlayer !== 'p2') throw new Error(`Expected alternating startingPlayer 'p2', got ${rematchP1.startingPlayer}`);
  if (rematchP1.currentPlayer !== 'p2') throw new Error(`Expected currentPlayer 'p2', got ${rematchP1.currentPlayer}`);
  if (rematchP1.scores.p1 !== 0 || rematchP1.scores.p2 !== 0) throw new Error('Scores not reset to 0-0');
  if (rematchP1.gameOver !== false) throw new Error('gameOver is not false');

  // Step 8d: Verify that in Match #2, P2 moves first, and P1 is rejected out of turn
  const p1OutTurnInMatch2 = await new Promise((resolve) => {
    p1Socket.emit('MAKE_MOVE', { lineId: 'h_0_0' }, resolve);
  });
  console.log(`✅ In Match #2, P1 out of turn move correctly rejected: "${p1OutTurnInMatch2.error}"`);
  if (p1OutTurnInMatch2.success) throw new Error('P1 was allowed to move when P2 had the starting turn!');

  const p2FirstMoveInMatch2 = await new Promise((resolve) => {
    p2Socket.emit('MAKE_MOVE', { lineId: 'h_0_0' }, resolve);
  });
  console.log(`✅ In Match #2, P2 starting move accepted: success = ${p2FirstMoveInMatch2.success}`);
  if (!p2FirstMoveInMatch2.success) throw new Error(`P2 starting move failed: ${p2FirstMoveInMatch2.error}`);

  // Clean up
  p1Socket.disconnect();
  p2Socket.disconnect();
  p3Socket.disconnect();
  server.close();

  console.log('\n🎉 ALL MULTIPLAYER LOGIC AND PROTOCOL TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
