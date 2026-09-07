/**
 * Game.js
 * Rule enforcement, turn management, box closure detection, and game lifecycle.
 */
import { Board } from './Board.js';
import { GameState } from './GameState.js';
import { PLAYERS } from './Player.js';

export class Game {
  constructor(options = {}) {
    this.gridSize = options.gridSize || 5;
    this.spacing = options.spacing || 2.0;

    this.board = new Board(this.gridSize, this.spacing);
    this.state = new GameState(this.gridSize);

    // Event callbacks
    this.onLineClaimed = options.onLineClaimed || (() => {});
    this.onTurnChanged = options.onTurnChanged || (() => {});
    this.onScoreUpdated = options.onScoreUpdated || (() => {});
    this.onGameOver = options.onGameOver || (() => {});
  }

  start(gridSize = this.gridSize, preserveStreak = false) {
    this.gridSize = Math.max(3, Math.min(12, gridSize));
    this.board = new Board(this.gridSize, this.spacing);
    this.state.reset(this.gridSize, preserveStreak);

    this.onTurnChanged(this.state.currentPlayer, false);
    this.onScoreUpdated(this.state.scores, 0, []);
  }

  getStreaks() {
    return { ...this.state.streaks };
  }

  getGridSize() {
    return this.gridSize;
  }

  getCurrentPlayer() {
    return PLAYERS[this.state.currentPlayer.toUpperCase()];
  }

  getCurrentPlayerId() {
    return this.state.currentPlayer;
  }

  getScores() {
    return { ...this.state.scores };
  }

  getTotalBoxes() {
    return this.board.getTotalBoxesCount();
  }

  isLineAvailable(lineId) {
    return this.state.status === 'playing' && !this.state.isLineClaimed(lineId);
  }

  /**
   * Attempts to claim a line.
   * @param {string} lineId 
   * @returns {object|null} Move result or null if invalid
   */
  claimLine(lineId) {
    if (!this.isLineAvailable(lineId)) {
      return null;
    }

    const lineData = this.board.getLine(lineId);
    if (!lineData) {
      return null;
    }

    const actingPlayer = this.state.currentPlayer;
    const playerObj = PLAYERS[actingPlayer.toUpperCase()];

    // Claim line
    this.state.claimLine(lineId, actingPlayer);

    // Check completed boxes
    const completedBoxes = [];
    for (const boxId of lineData.adjBoxes) {
      const box = this.board.getBox(boxId);
      if (!box) continue;

      // Check if all 4 lines are claimed
      const allFourClaimed = box.lines.every(lid => this.state.isLineClaimed(lid));
      if (allFourClaimed && !this.state.isBoxClaimed(boxId)) {
        this.state.claimBox(boxId, actingPlayer);
        completedBoxes.push({
          boxId,
          x: box.x,
          z: box.z,
          player: actingPlayer
        });
      }
    }

    const hadCompletedBoxes = completedBoxes.length > 0;
    const isGameOver = this.state.checkGameOver(this.board.getTotalBoxesCount());

    // If completed at least one box, player gets an EXTRA turn!
    let nextPlayer = actingPlayer;
    let isExtraTurn = false;

    if (hadCompletedBoxes) {
      isExtraTurn = true;
      // Score updated
      this.onScoreUpdated(this.state.scores, completedBoxes.length, completedBoxes);
    } else {
      // Switch player
      nextPlayer = this.state.switchPlayer();
    }

    this.state.recordMove(lineId, actingPlayer, completedBoxes);

    const result = {
      lineId,
      player: playerObj,
      playerId: actingPlayer,
      completedBoxes,
      isExtraTurn,
      nextPlayer: PLAYERS[nextPlayer.toUpperCase()],
      isGameOver,
      scores: { ...this.state.scores },
      winner: this.state.winner
    };

    this.onLineClaimed(result);

    if (!isGameOver) {
      this.onTurnChanged(nextPlayer, isExtraTurn);
    } else {
      this.onGameOver({
        winner: this.state.winner,
        scores: { ...this.state.scores },
        totalBoxes: this.board.getTotalBoxesCount(),
        gridSize: this.gridSize,
        streaks: { ...this.state.streaks }
      });
    }

    return result;
  }
}
