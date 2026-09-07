/**
 * MultiplayerGame.js
 * Synchronizes the authoritative server game state with the local 3D board and HUD.
 */
import { PLAYERS } from '../game/Player.js';

export class MultiplayerGame {
  constructor(options = {}) {
    this.game = options.game;
    this.socketClient = options.socketClient;
    this.boardRenderer = options.boardRenderer;
    this.cameraManager = options.cameraManager;
    this.sceneManager = options.sceneManager;
    this.scoreboard = options.scoreboard;
    this.turnIndicator = options.turnIndicator;
    this.audioManager = options.audioManager;
    this.effects = options.effects;
    this.gameOver = options.gameOver;

    this.roomId = null;
    this.myRole = null;          // 'p1' | 'p2'
    this.currentTurn = 'p1';
    this.pendingLineId = null;
    this.isActive = false;
    this.countdownTimer = null;

    this.onExitToMenu = options.onExitToMenu || (() => {});
    this.showToast = options.showToast || ((msg) => console.log(msg));

    this.initSocketEvents();
  }

  initSocketEvents() {
    // 1. Move applied by server (confirmed for both players)
    this.socketClient.on('MOVE_APPLIED', (data) => {
      this.handleServerMove(data);
    });

    // 2. Game over
    this.socketClient.on('GAME_OVER', (data) => {
      this.handleServerGameOver(data);
    });

    // 3. Opponent disconnected
    this.socketClient.on('OPPONENT_DISCONNECTED', (data) => {
      this.showToast(`⚠️ ${data.name || 'Opponent'} disconnected. Waiting 45s for reconnect...`);
      this.scoreboard.setOpponentStatus(false);
      this.gameOver?.showOpponentLeft();
    });

    // 4. Opponent reconnected
    this.socketClient.on('OPPONENT_RECONNECTED', () => {
      this.showToast('✅ Opponent reconnected!');
      this.scoreboard.setOpponentStatus(true);
      this.gameOver?.resetButtonState();
    });

    // 5. Player permanently left
    this.socketClient.on('PLAYER_LEFT', () => {
      this.showToast('ℹ️ Opponent left the match.');
      this.scoreboard.setOpponentStatus(false);
      this.gameOver?.showOpponentLeft();
    });

    // 6. Rematch status broadcast from authoritative server
    this.socketClient.on('REMATCH_STATUS', (data) => {
      this.handleRematchStatus(data);
    });

    // 7. Authoritative Rematch started (new match initialized by server)
    this.socketClient.on('REMATCH_STARTED', (data) => {
      this.handleRematchStarted(data);
    });

    // Fallback for initial room start
    this.socketClient.on('GAME_STARTED', (data) => {
      this.startOnlineMatch(data.state);
    });
  }

  setupGame(roomId, myRole, initialState) {
    this.roomId = roomId;
    this.myRole = myRole; // 'p1' or 'p2'
    this.startOnlineMatch(initialState);
  }

  startOnlineMatch(state) {
    this.isActive = true;
    this.currentTurn = state.currentPlayer || 'p1';
    this.pendingLineId = null;
    this.effects.clear();

    // Show HUD and controls
    this.scoreboard.reset();
    this.scoreboard.show();
    this.scoreboard.setOnlineMode(true, this.myRole);
    this.scoreboard.setOpponentStatus(true);
    this.scoreboard.updateStreaks(state.streaks);

    this.turnIndicator.show();
    this.updateTurnDisplay(this.currentTurn, false);

    document.getElementById('in-game-controls')?.classList.remove('hidden');

    // Replay any already claimed lines (for reconnects)
    if (state.claimedLines?.length > 0) {
      for (const line of state.claimedLines) {
        const playerObj = PLAYERS[line.player.toUpperCase()];
        this.boardRenderer.animateLineClaim(line.id, playerObj);
      }
    }

    if (state.claimedBoxes?.length > 0) {
      for (const box of state.claimedBoxes) {
        const playerObj = PLAYERS[box.player.toUpperCase()];
        this.boardRenderer.animateBoxClaim(box.id, playerObj);
      }
      this.scoreboard.updateScores(state.scores);
    }
  }

  isMyTurn() {
    return this.isActive && this.currentTurn === this.myRole;
  }

  getCurrentPlayer() {
    return PLAYERS[this.myRole?.toUpperCase()] || PLAYERS.P1;
  }

  isLineAvailable(lineId) {
    if (!this.isMyTurn()) return false;
    const line = this.boardRenderer.lines.get(lineId);
    return line && line.state === 'unclaimed' && this.pendingLineId !== lineId;
  }

  async handleUserLineClick(lineId) {
    if (!this.isActive) return;

    if (!this.isMyTurn()) {
      this.audioManager.playClick();
      this.showToast("⏳ Opponent's turn! Please wait.");
      return;
    }

    // Mark as pending/waiting confirmation
    this.pendingLineId = lineId;
    const myPlayer = PLAYERS[this.myRole.toUpperCase()];
    this.boardRenderer.setLineHover(lineId, true, myPlayer);

    try {
      await this.socketClient.makeMove(lineId);
      // Success will be confirmed via MOVE_APPLIED broadcast
    } catch (err) {
      // Revert pending state if server rejected
      this.pendingLineId = null;
      this.boardRenderer.setLineHover(lineId, false);
      this.showToast(`Move failed: ${err.message}`);
    }
  }

  handleServerMove(data) {
    const { lineId, player: playerId, completedBoxes, isExtraTurn, currentPlayer, scores, isGameOver } = data;
    this.pendingLineId = null;

    const playerObj = PLAYERS[playerId.toUpperCase()];

    // 1. Sound & line growth
    this.audioManager.playLinePlace();
    this.boardRenderer.animateLineClaim(lineId, playerObj);

    // 2. Boxes & effects
    if (completedBoxes?.length > 0) {
      setTimeout(() => {
        this.audioManager.playBoxClaim(completedBoxes.length);
        completedBoxes.forEach((box) => {
          this.boardRenderer.animateBoxClaim(box.boxId, playerObj);
          this.effects.createBoxBurst(box.x, 0.05, box.z, playerObj.colorHex);
        });
      }, 100);

      this.scoreboard.updateScores(scores, completedBoxes.length, playerId);
      this.audioManager.playScorePing();
    }

    // 3. Update turn
    this.currentTurn = currentPlayer;
    if (!isGameOver) {
      this.updateTurnDisplay(this.currentTurn, isExtraTurn);
    }
  }

  updateTurnDisplay(activePlayerId, isExtraTurn) {
    const isMe = activePlayerId === this.myRole;
    this.scoreboard.setActivePlayer(activePlayerId);

    if (isMe) {
      this.turnIndicator.setTurn(activePlayerId, isExtraTurn, 'YOUR TURN');
    } else {
      this.turnIndicator.setTurn(activePlayerId, isExtraTurn, "OPPONENT'S TURN");
    }

    if (!isExtraTurn) {
      this.audioManager.playTurnChange();
    }
  }

  handleServerGameOver(data) {
    this.isActive = false;
    setTimeout(() => {
      this.gameOver.show(data, true, (role) => this.socketClient.requestRematch(role));
    }, 600);
  }

  handleRematchStatus(status) {
    this.gameOver?.updateRematchStatus(status, this.myRole);

    const opponentRole = this.myRole === 'p1' ? 'p2' : 'p1';
    const p1Ready = !!(status?.p1 ?? status?.player1Ready);
    const p2Ready = !!(status?.p2 ?? status?.player2Ready);
    const opponentReady = this.myRole === 'p1' ? p2Ready : p1Ready;
    const myReady = this.myRole === 'p1' ? p1Ready : p2Ready;

    if (opponentReady && !myReady) {
      this.showToast('🔥 Opponent requested a rematch! Click Play Again to accept.');
    }
  }

  handleRematchStarted(data) {
    // 1. Immediately close Game Over modal & reset buttons
    this.gameOver?.hide();

    // 2. Extract authoritative parameters
    const state = data.state || data;
    const matchNumber = data.matchNumber || state.matchNumber || 2;
    const startingPlayer = data.startingPlayer || data.currentPlayer || state.currentPlayer || 'p1';
    const boardSize = data.boardSize || state.gridSize || state.boardSize || 5;

    // 3. Clear existing visual board and smoothly rebuild fresh 3D board
    if (this.game) {
      this.game.board = new this.game.board.constructor(boardSize, 2.0);
      this.boardRenderer.buildBoard(this.game.board);
      if (this.cameraManager) {
        this.cameraManager.fitToBoard(boardSize, 2.0, false);
      }
      if (this.sceneManager) {
        this.sceneManager.updateShadowBounds(this.game.board.getBoardWorldRadius());
      }
    } else {
      this.boardRenderer.clear();
    }

    // 4. Reset scores (0-0), turn, lines, boxes, streaks
    this.isActive = false; // Keep interaction disabled during 3-2-1 countdown
    this.currentTurn = startingPlayer;
    this.pendingLineId = null;
    this.effects.clear();

    this.scoreboard.reset();
    this.scoreboard.show();
    this.scoreboard.setOnlineMode(true, this.myRole);
    this.scoreboard.setOpponentStatus(true);
    if (state.streaks) {
      this.scoreboard.updateStreaks(state.streaks);
    }

    this.turnIndicator.show();
    this.turnIndicator.setTurn(
      startingPlayer,
      false,
      startingPlayer === this.myRole ? 'YOUR TURN' : "OPPONENT'S TURN"
    );

    // 5. Trigger cinematic 3-2-1-START countdown!
    this.runRematchCountdown(() => {
      this.isActive = true;
      this.updateTurnDisplay(this.currentTurn, false);
      this.showToast(`🎮 Match #${matchNumber} Started!`);
    });
  }

  runRematchCountdown(onComplete) {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }

    const overlay = document.getElementById('countdown-overlay');
    const numberEl = document.getElementById('countdown-number');
    const textEl = overlay?.querySelector('.countdown-text');

    if (!overlay || !numberEl) {
      if (onComplete) onComplete();
      return;
    }

    overlay.classList.remove('hidden');
    if (textEl) textEl.textContent = 'REMATCH STARTING...';

    const steps = [
      { text: '3', sfx: () => this.audioManager?.playClick() },
      { text: '2', sfx: () => this.audioManager?.playClick() },
      { text: '1', sfx: () => this.audioManager?.playClick() },
      { text: 'START!', sfx: () => this.audioManager?.playTurnChange() },
    ];

    let stepIndex = 0;

    const showStep = () => {
      if (stepIndex < steps.length) {
        const current = steps[stepIndex];
        numberEl.textContent = current.text;
        numberEl.classList.remove('countdown-pulse');
        void numberEl.offsetWidth; // Force CSS reflow
        numberEl.classList.add('countdown-pulse');
        current.sfx();

        stepIndex++;
        this.countdownTimer = setTimeout(showStep, 650);
      } else {
        overlay.classList.add('hidden');
        if (textEl) textEl.textContent = 'MATCH STARTING...';
        this.countdownTimer = null;
        if (onComplete) onComplete();
      }
    };

    showStep();
  }

  cleanup() {
    this.isActive = false;
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    const overlay = document.getElementById('countdown-overlay');
    overlay?.classList.add('hidden');
    this.gameOver?.hide();
    this.socketClient.leaveRoom();
    this.roomId = null;
    this.myRole = null;
  }
}
