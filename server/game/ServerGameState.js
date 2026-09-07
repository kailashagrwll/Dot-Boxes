/**
 * ServerGameState.js
 * Authoritative game state engine running on Node.js server.
 */
import { ServerBoard } from './ServerBoard.js';

export class ServerGameState {
  constructor(gridSize = 5) {
    this.gridSize = Math.max(3, Math.min(12, gridSize));
    this.board = new ServerBoard(this.gridSize);
    this.currentPlayer = 'p1';
    this.scores = { p1: 0, p2: 0 };
    this.claimedLines = new Map(); // lineId -> { player, timestamp }
    this.claimedBoxes = new Map(); // boxId -> { player, timestamp }
    this.status = 'waiting';       // 'waiting' | 'ready' | 'playing' | 'gameover'
    this.winner = null;            // null | 'p1' | 'p2' | 'draw'
    this.streaks = { p1: 0, p2: 0, currentWinner: null, count: 0 };
    this.moveHistory = [];
    this.matchNumber = 1;
    this.startingPlayer = 'p1';
  }

  setGridSize(size) {
    if (this.status === 'playing') {
      throw new Error('Cannot change board size during active game');
    }
    this.gridSize = Math.max(3, Math.min(12, size));
    this.board = new ServerBoard(this.gridSize);
  }

  start(preserveStreak = false, startingPlayer = 'p1') {
    this.board = new ServerBoard(this.gridSize);
    this.startingPlayer = startingPlayer;
    this.currentPlayer = startingPlayer;
    this.scores = { p1: 0, p2: 0 };
    this.claimedLines.clear();
    this.claimedBoxes.clear();
    this.status = 'playing';
    this.winner = null;
    this.moveHistory = [];

    if (!preserveStreak) {
      this.streaks = { p1: 0, p2: 0, currentWinner: null, count: 0 };
    }
  }

  startRematch(startingPlayer = 'p2', matchNumber = 2) {
    this.matchNumber = matchNumber;
    this.start(true, startingPlayer);
  }

  /**
   * Validates and applies a move from a player.
   * @param {string} playerId 'p1' | 'p2'
   * @param {string} lineId 
   * @returns {{ success: boolean, error?: string, moveData?: object }}
   */
  makeMove(playerId, lineId) {
    if (this.status !== 'playing') {
      return { success: false, error: 'Game is not currently active' };
    }

    if (this.currentPlayer !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const lineData = this.board.getLine(lineId);
    if (!lineData) {
      return { success: false, error: 'Invalid line specified' };
    }

    if (this.claimedLines.has(lineId)) {
      return { success: false, error: 'Line is already claimed' };
    }

    // 1. Claim line
    this.claimedLines.set(lineId, {
      player: playerId,
      timestamp: Date.now(),
    });

    // 2. Check adjacent boxes for completion
    const completedBoxes = [];
    for (const boxId of lineData.adjBoxes) {
      const box = this.board.getBox(boxId);
      if (!box) continue;

      const allFour = box.lines.every(lid => this.claimedLines.has(lid));
      if (allFour && !this.claimedBoxes.has(boxId)) {
        this.claimedBoxes.set(boxId, {
          player: playerId,
          timestamp: Date.now(),
        });
        this.scores[playerId]++;
        completedBoxes.push({
          boxId,
          x: box.x,
          z: box.z,
          player: playerId,
        });
      }
    }

    const hadCompletedBoxes = completedBoxes.length > 0;
    const totalBoxes = this.board.getTotalBoxesCount();
    const isGameOver = this.claimedBoxes.size >= totalBoxes;

    let isExtraTurn = false;
    let nextPlayer = this.currentPlayer;

    if (isGameOver) {
      this.status = 'gameover';
      if (this.scores.p1 > this.scores.p2) {
        this.winner = 'p1';
        this.streaks.p1++;
        this.streaks.p2 = 0;
        this.streaks.currentWinner = 'p1';
        this.streaks.count = this.streaks.p1;
      } else if (this.scores.p2 > this.scores.p1) {
        this.winner = 'p2';
        this.streaks.p2++;
        this.streaks.p1 = 0;
        this.streaks.currentWinner = 'p2';
        this.streaks.count = this.streaks.p2;
      } else {
        this.winner = 'draw';
      }
    } else {
      if (hadCompletedBoxes) {
        isExtraTurn = true;
        // Same player keeps turn!
      } else {
        nextPlayer = this.currentPlayer === 'p1' ? 'p2' : 'p1';
        this.currentPlayer = nextPlayer;
      }
    }

    const moveData = {
      lineId,
      player: playerId,
      completedBoxes,
      isExtraTurn,
      currentPlayer: this.currentPlayer,
      scores: { ...this.scores },
      isGameOver,
      winner: this.winner,
      streaks: { ...this.streaks },
    };

    this.moveHistory.push(moveData);

    return { success: true, moveData };
  }

  serialize() {
    return {
      gridSize: this.gridSize,
      boardSize: this.gridSize,
      matchNumber: this.matchNumber,
      startingPlayer: this.startingPlayer,
      status: this.status,
      currentPlayer: this.currentPlayer,
      scores: { ...this.scores },
      claimedLines: Array.from(this.claimedLines.entries()).map(([id, val]) => ({ id, ...val })),
      claimedBoxes: Array.from(this.claimedBoxes.entries()).map(([id, val]) => ({ id, ...val })),
      winner: this.winner,
      streaks: { ...this.streaks },
      totalBoxes: this.board.getTotalBoxesCount(),
    };
  }
}
