/**
 * GameState.js
 * State store managing pure game data, turn order, claims, scores, and status.
 */
export class GameState {
  constructor(gridSize = 5) {
    this.gridSize = gridSize;
    this.currentPlayer = 'p1';
    this.scores = { p1: 0, p2: 0 };
    this.claimedLines = new Map(); // lineId -> { player, timestamp }
    this.claimedBoxes = new Map(); // boxId -> { player, timestamp }
    this.status = 'idle';          // 'idle' | 'playing' | 'gameover'
    this.winner = null;            // null | 'p1' | 'p2' | 'draw'
    this.history = [];
    this.streaks = { p1: 0, p2: 0, currentWinner: null, count: 0 };
  }

  reset(newGridSize = this.gridSize, preserveStreak = false) {
    this.gridSize = newGridSize;
    this.currentPlayer = 'p1';
    this.scores = { p1: 0, p2: 0 };
    this.claimedLines.clear();
    this.claimedBoxes.clear();
    this.status = 'playing';
    this.winner = null;
    this.history = [];
    if (!preserveStreak) {
      this.streaks = { p1: 0, p2: 0, currentWinner: null, count: 0 };
    }
  }

  isLineClaimed(lineId) {
    return this.claimedLines.has(lineId);
  }

  isBoxClaimed(boxId) {
    return this.claimedBoxes.has(boxId);
  }

  claimLine(lineId, player) {
    if (this.isLineClaimed(lineId)) return false;
    this.claimedLines.set(lineId, {
      player,
      timestamp: Date.now()
    });
    return true;
  }

  claimBox(boxId, player) {
    if (this.isBoxClaimed(boxId)) return false;
    this.claimedBoxes.set(boxId, {
      player,
      timestamp: Date.now()
    });
    this.scores[player]++;
    return true;
  }

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 'p1' ? 'p2' : 'p1';
    return this.currentPlayer;
  }

  recordMove(lineId, player, completedBoxes) {
    this.history.push({
      lineId,
      player,
      completedBoxes: [...completedBoxes],
      timestamp: Date.now()
    });
  }

  checkGameOver(totalBoxes) {
    if (this.claimedBoxes.size >= totalBoxes) {
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
      return true;
    }
    return false;
  }
}
