/**
 * GameRoom.js
 * Manages an individual game room session, player slots, ready flags, and lifecycle timers.
 */
import { ServerGameState } from '../game/ServerGameState.js';

export class GameRoom {
  constructor(roomId, hostSocketId, hostSessionToken, io, onEmpty) {
    this.roomId = roomId;
    this.io = io;
    this.onEmpty = onEmpty; // Callback when room has expired or emptied
    this.createdAt = Date.now();

    this.gameState = new ServerGameState(5);
    this.matchNumber = 1;
    this.startingPlayer = 'p1';
    this.rematchReady = { p1: false, p2: false };

    // Player slots: p1 = host (blue), p2 = guest (red)
    this.players = {
      p1: {
        role: 'p1',
        name: 'Player 1',
        socketId: hostSocketId,
        sessionToken: hostSessionToken,
        isReady: false,
        isConnected: true,
        rematchRequested: false,
      },
      p2: null,
    };

    this.disconnectTimers = new Map(); // role -> timeout
    this.countdownTimer = null;
    this.emptyRoomTimeout = null;
  }

  isFull() {
    return this.players.p1 !== null && this.players.p2 !== null;
  }

  getPlayerBySocket(socketId) {
    if (this.players.p1?.socketId === socketId) return this.players.p1;
    if (this.players.p2?.socketId === socketId) return this.players.p2;
    return null;
  }

  getPlayerBySession(sessionToken) {
    if (this.players.p1?.sessionToken === sessionToken) return this.players.p1;
    if (this.players.p2?.sessionToken === sessionToken) return this.players.p2;
    return null;
  }

  joinPlayer(socketId, sessionToken, name = 'Player 2') {
    // 1. Check if this is a reconnecting player
    const existing = this.getPlayerBySession(sessionToken);
    if (existing) {
      existing.socketId = socketId;
      existing.isConnected = true;
      this.clearDisconnectTimer(existing.role);
      return {
        success: true,
        role: existing.role,
        isReconnect: true,
        matchNumber: this.matchNumber,
        rematchReady: { ...this.rematchReady },
      };
    }

    // 2. Otherwise allocate p2 if available
    if (this.players.p2 === null) {
      this.players.p2 = {
        role: 'p2',
        name: name,
        socketId: socketId,
        sessionToken: sessionToken,
        isReady: false,
        isConnected: true,
        rematchRequested: false,
      };
      this.clearEmptyTimer();
      return { success: true, role: 'p2', isReconnect: false };
    }

    // Room is full
    return { success: false, error: 'Room is already full' };
  }

  setPlayerReady(role, isReady) {
    const player = this.players[role];
    if (!player) return false;

    player.isReady = !!isReady;
    this.broadcastLobbyState();

    // If both ready and game not yet started, trigger countdown
    if (this.players.p1?.isReady && this.players.p2?.isReady && this.gameState.status !== 'playing') {
      this.startCountdown();
    }
    return true;
  }

  setBoardSize(role, size) {
    if (role !== 'p1') {
      return { success: false, error: 'Only the host can adjust board size' };
    }
    if (this.gameState.status === 'playing') {
      return { success: false, error: 'Cannot change size during active match' };
    }

    this.gameState.setGridSize(size);
    // Reset ready states on size change
    if (this.players.p1) this.players.p1.isReady = false;
    if (this.players.p2) this.players.p2.isReady = false;
    this.cancelCountdown();

    this.broadcastLobbyState();
    return { success: true, gridSize: this.gameState.gridSize };
  }

  startCountdown() {
    this.cancelCountdown();
    let count = 3;

    this.io.to(this.roomId).emit('COUNTDOWN_TICK', { count });

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.io.to(this.roomId).emit('COUNTDOWN_TICK', { count });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startGame();
      }
    }, 1000);
  }

  cancelCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.io.to(this.roomId).emit('COUNTDOWN_CANCELLED');
    }
  }

  startGame(preserveStreak = false) {
    this.gameState.start(preserveStreak);

    // Reset ready & rematch flags
    if (this.players.p1) {
      this.players.p1.isReady = false;
      this.players.p1.rematchRequested = false;
    }
    if (this.players.p2) {
      this.players.p2.isReady = false;
      this.players.p2.rematchRequested = false;
    }

    this.io.to(this.roomId).emit('GAME_STARTED', {
      state: this.gameState.serialize(),
      players: this.getPublicPlayers(),
    });
  }

  handleMove(socketId, lineId) {
    const player = this.getPlayerBySocket(socketId);
    if (!player) {
      return { success: false, error: 'Player not recognized' };
    }

    const result = this.gameState.makeMove(player.role, lineId);
    if (result.success) {
      this.io.to(this.roomId).emit('MOVE_APPLIED', result.moveData);
      if (result.moveData.isGameOver) {
        this.io.to(this.roomId).emit('GAME_OVER', {
          winner: result.moveData.winner,
          scores: result.moveData.scores,
          streaks: result.moveData.streaks,
        });
      }
    }
    return result;
  }

  requestRematch(role) {
    if (role !== 'p1' && role !== 'p2') {
      return { success: false, error: 'Invalid player role' };
    }

    const player = this.players[role];
    if (!player || !player.isConnected) {
      return { success: false, error: 'Player not recognized or disconnected' };
    }

    if (this.gameState.status !== 'gameover') {
      console.warn(`[ROOM ${this.roomId}] Rematch request rejected: game status is ${this.gameState.status}`);
      return { success: false, error: 'Game is not over' };
    }

    // Guard against duplicate requests from the same player
    if (this.rematchReady[role]) {
      return { success: true, alreadyRequested: true };
    }

    this.rematchReady[role] = true;
    player.rematchRequested = true;

    const pNum = role === 'p1' ? '1' : '2';
    console.log(`[ROOM ${this.roomId}]\nPlayer ${pNum} requested rematch`);
    console.log(`[ROOM ${this.roomId}]\nRematch status:\nP1 ${this.rematchReady.p1 ? 'READY' : 'NOT READY'}\nP2 ${this.rematchReady.p2 ? 'READY' : 'NOT READY'}`);

    this.io.to(this.roomId).emit('REMATCH_STATUS', {
      p1: this.rematchReady.p1,
      p2: this.rematchReady.p2,
      player1Ready: this.rematchReady.p1,
      player2Ready: this.rematchReady.p2,
    });

    if (this.rematchReady.p1 === true && this.rematchReady.p2 === true) {
      this.startRematch();
    }
    return { success: true };
  }

  startRematch() {
    if (!this.players.p1 || !this.players.p2) {
      console.warn(`[ROOM ${this.roomId}] Cannot start rematch: missing players`);
      return false;
    }

    this.matchNumber = (this.matchNumber || 1) + 1;
    this.startingPlayer = this.startingPlayer === 'p1' ? 'p2' : 'p1';

    console.log(`[ROOM ${this.roomId}]\nStarting rematch #${this.matchNumber}`);

    this.gameState.startRematch(this.startingPlayer, this.matchNumber);

    this.rematchReady = { p1: false, p2: false };
    if (this.players.p1) this.players.p1.rematchRequested = false;
    if (this.players.p2) this.players.p2.rematchRequested = false;

    const payload = {
      type: 'REMATCH_STARTED',
      matchNumber: this.matchNumber,
      boardSize: this.gameState.gridSize,
      gridSize: this.gameState.gridSize,
      currentPlayer: this.startingPlayer,
      startingPlayer: this.startingPlayer,
      scores: { p1: 0, p2: 0 },
      lines: {},
      boxes: {},
      claimedLines: [],
      claimedBoxes: [],
      gameOver: false,
      winner: null,
      streaks: { ...this.gameState.streaks },
      players: this.getPublicPlayers(),
      state: this.gameState.serialize(),
    };

    this.io.to(this.roomId).emit('REMATCH_STARTED', payload);

    console.log(`[ROOM ${this.roomId}]\nRematch started successfully`);
    return true;
  }

  handleDisconnect(socketId) {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;

    player.isConnected = false;

    // If waiting for rematch, reset their readiness and broadcast
    if (this.rematchReady && this.rematchReady[player.role]) {
      this.rematchReady[player.role] = false;
      player.rematchRequested = false;
      this.io.to(this.roomId).emit('REMATCH_STATUS', {
        p1: this.rematchReady.p1,
        p2: this.rematchReady.p2,
        player1Ready: this.rematchReady.p1,
        player2Ready: this.rematchReady.p2,
      });
    }

    this.io.to(this.roomId).emit('OPPONENT_DISCONNECTED', {
      role: player.role,
      name: player.name,
    });

    // Start 45 second grace period timer
    this.disconnectTimers.set(
      player.role,
      setTimeout(() => {
        this.onPlayerDisconnectExpired(player.role);
      }, 45000)
    );

    // If both disconnected, start 60s room cleanup timer
    const p1Connected = this.players.p1?.isConnected;
    const p2Connected = this.players.p2?.isConnected;
    if (!p1Connected && !p2Connected) {
      this.startEmptyTimer();
    }
  }

  clearDisconnectTimer(role) {
    const t = this.disconnectTimers.get(role);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(role);
    }
  }

  onPlayerDisconnectExpired(role) {
    // Player failed to reconnect within grace period
    this.io.to(this.roomId).emit('PLAYER_LEFT', { role });
    this.players[role] = null;

    if (!this.players.p1 && !this.players.p2) {
      this.destroy();
    }
  }

  startEmptyTimer() {
    this.clearEmptyTimer();
    this.emptyRoomTimeout = setTimeout(() => {
      this.destroy();
    }, 60000);
  }

  clearEmptyTimer() {
    if (this.emptyRoomTimeout) {
      clearTimeout(this.emptyRoomTimeout);
      this.emptyRoomTimeout = null;
    }
  }

  broadcastLobbyState() {
    this.io.to(this.roomId).emit('LOBBY_STATE', {
      roomId: this.roomId,
      gridSize: this.gameState.gridSize,
      players: this.getPublicPlayers(),
    });
  }

  getPublicPlayers() {
    return {
      p1: this.players.p1 ? {
        role: 'p1',
        name: this.players.p1.name,
        isReady: this.players.p1.isReady,
        isConnected: this.players.p1.isConnected,
      } : null,
      p2: this.players.p2 ? {
        role: 'p2',
        name: this.players.p2.name,
        isReady: this.players.p2.isReady,
        isConnected: this.players.p2.isConnected,
      } : null,
    };
  }

  destroy() {
    this.cancelCountdown();
    this.clearEmptyTimer();
    for (const t of this.disconnectTimers.values()) {
      clearTimeout(t);
    }
    this.disconnectTimers.clear();
    if (this.onEmpty) {
      this.onEmpty(this.roomId);
    }
  }
}
