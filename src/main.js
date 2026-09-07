/**
 * main.js
 * Application entry point orchestrating game state, 3D scene, rendering, audio, and UI.
 * Supports both offline Local 2-Player mode and Authoritative Online Multiplayer mode.
 */
import { AudioManager } from './audio/AudioManager.js';
import { SceneManager } from './three/SceneManager.js';
import { CameraManager } from './three/CameraManager.js';
import { Effects } from './three/Effects.js';
import { BoardRenderer } from './three/BoardRenderer.js';
import { Game } from './game/Game.js';
import { MouseInput } from './input/MouseInput.js';
import { TouchInput } from './input/TouchInput.js';
import { Menu } from './ui/Menu.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { TurnIndicator } from './ui/TurnIndicator.js';
import { GameOver } from './ui/GameOver.js';
import { HowToPlay } from './ui/HowToPlay.js';
import { SocketClient } from './multiplayer/SocketClient.js';
import { MultiplayerGame } from './multiplayer/MultiplayerGame.js';
import { OnlineLobby } from './ui/OnlineLobby.js';

class App {
  constructor() {
    this.canvasContainer = document.getElementById('game-canvas-container');
    this.audioManager = new AudioManager();

    this.mode = 'local'; // 'local' | 'online'

    // 3D Engine
    this.sceneManager = new SceneManager(this.canvasContainer);
    this.cameraManager = new CameraManager(this.canvasContainer);
    this.effects = new Effects(this.sceneManager.scene);
    this.boardRenderer = new BoardRenderer(this.sceneManager.scene);

    // UI Modules
    this.scoreboard = new Scoreboard();
    this.turnIndicator = new TurnIndicator();
    this.howToPlay = new HowToPlay({ audioManager: this.audioManager });

    this.gameOver = new GameOver({
      audioManager: this.audioManager,
      onPlayAgain: () => this.restartCurrentMatch(),
      onNewGame: () => this.openSizeSelection(),
    });

    // Local Game logic instance
    this.game = new Game({
      gridSize: 5,
      spacing: 2.0,
      onLineClaimed: (move) => this.handleLineClaimed(move),
      onTurnChanged: (playerId, isExtraTurn) => this.handleTurnChanged(playerId, isExtraTurn),
      onScoreUpdated: (scores, delta, completedBoxes) => this.handleScoreUpdated(scores, delta, completedBoxes),
      onGameOver: (result) => this.handleGameOver(result),
    });

    // Multiplayer Subsystems
    this.socketClient = new SocketClient();

    this.multiplayerGame = new MultiplayerGame({
      game: this.game,
      socketClient: this.socketClient,
      boardRenderer: this.boardRenderer,
      cameraManager: this.cameraManager,
      sceneManager: this.sceneManager,
      scoreboard: this.scoreboard,
      turnIndicator: this.turnIndicator,
      audioManager: this.audioManager,
      effects: this.effects,
      gameOver: this.gameOver,
      onExitToMenu: () => this.returnToMainMenu(),
      showToast: (msg) => this.showToast(msg),
    });

    this.onlineLobby = new OnlineLobby({
      socketClient: this.socketClient,
      audioManager: this.audioManager,
      onStartGame: (roomId, role, state) => this.startOnlineGame(roomId, role, state),
      onBackToMenu: () => this.menu.showMainMenu(),
      showToast: (msg) => this.showToast(msg),
    });

    // Inputs
    this.mouseInput = new MouseInput(
      this.canvasContainer,
      this.cameraManager,
      this.boardRenderer,
      this.game,
      this.audioManager,
      (lineId) => this.handleLineSelection(lineId)
    );

    this.touchInput = new TouchInput(
      this.canvasContainer,
      this.cameraManager,
      this.boardRenderer,
      this.game,
      (lineId) => this.handleLineSelection(lineId)
    );

    // Menu manager
    this.menu = new Menu({
      audioManager: this.audioManager,
      onStartGame: (size) => this.startGame(size),
      onOpenOnline: () => this.onlineLobby.showOnlineMenu(),
      onOpenHowToPlay: () => this.howToPlay.show(),
      onOpenSettings: () => this.openSettings(),
    });

    this.initControls();
    this.initSettingsModal();
    this.initWindowResize();

    // Start with a preview board in the background of the menu
    this.setupBackgroundBoard(4);

    // Auto-detect invite link URL query
    this.checkForInviteParam();

    // Start animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  checkForInviteParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get('join');
      if (joinCode) {
        this.menu.hide();
        this.onlineLobby.showJoinScreen(joinCode.toUpperCase());
      }
    } catch (e) {
      // Ignore
    }
  }

  setupBackgroundBoard(size = 4) {
    this.game.board = new this.game.board.constructor(size, 2.0);
    this.boardRenderer.buildBoard(this.game.board);
    this.cameraManager.fitToBoard(size, 2.0, false);
    this.mouseInput.setEnabled(false);
    this.touchInput.setEnabled(false);
  }

  // --- LOCAL OFFLINE MODE ---
  startGame(gridSize, preserveStreak = false) {
    this.mode = 'local';
    this.currentGridSize = gridSize;
    this.effects.clear();

    // Set input delegate to local game
    this.mouseInput.setGameDelegate(this.game);
    this.touchInput.setGameDelegate(this.game);

    // Initialize logic with streak preservation option
    this.game.start(gridSize, preserveStreak);

    // Rebuild 3D board
    this.boardRenderer.buildBoard(this.game.board);

    // Adaptive camera distance & lights
    this.cameraManager.fitToBoard(gridSize, this.game.board.spacing, true);
    this.sceneManager.updateShadowBounds(this.game.board.getBoardWorldRadius());

    // Show in-game HUD & controls
    this.scoreboard.reset();
    this.scoreboard.show();
    this.scoreboard.setOnlineMode(false);
    this.scoreboard.setActivePlayer('p1');
    this.scoreboard.updateStreaks(this.game.getStreaks());

    this.turnIndicator.show();
    this.turnIndicator.setTurn('p1', false);

    document.getElementById('in-game-controls')?.classList.remove('hidden');

    // Enable inputs
    this.mouseInput.setEnabled(true);
    this.touchInput.setEnabled(true);
  }

  // --- ONLINE MULTIPLAYER MODE ---
  startOnlineGame(roomId, role, state) {
    this.mode = 'online';
    this.currentGridSize = state.gridSize;
    this.effects.clear();

    // Rebuild 3D board for match
    this.game.board = new this.game.board.constructor(state.gridSize, 2.0);
    this.boardRenderer.buildBoard(this.game.board);

    // Adjust camera distance & shadows
    this.cameraManager.fitToBoard(state.gridSize, 2.0, true);
    this.sceneManager.updateShadowBounds(this.game.board.getBoardWorldRadius());

    // Delegate inputs to online multiplayer manager
    this.mouseInput.setGameDelegate(this.multiplayerGame);
    this.touchInput.setGameDelegate(this.multiplayerGame);

    this.multiplayerGame.setupGame(roomId, role, state);

    this.mouseInput.setEnabled(true);
    this.touchInput.setEnabled(true);
  }

  restartCurrentMatch() {
    if (this.mode === 'online') {
      this.socketClient.requestRematch();
    } else {
      // When local players choose Play Again, preserve their streak!
      this.startGame(this.currentGridSize || 5, true);
    }
  }

  openSizeSelection() {
    if (this.mode === 'online') {
      this.returnToMainMenu();
      return;
    }
    this.scoreboard.hide();
    this.turnIndicator.hide();
    document.getElementById('in-game-controls')?.classList.add('hidden');
    this.mouseInput.setEnabled(false);
    this.touchInput.setEnabled(false);
    this.menu.showSizeSelect();
  }

  returnToMainMenu() {
    if (this.mode === 'online') {
      this.multiplayerGame.cleanup();
    }
    this.mode = 'local';
    this.scoreboard.hide();
    this.turnIndicator.hide();
    document.getElementById('in-game-controls')?.classList.add('hidden');
    this.mouseInput.setEnabled(false);
    this.touchInput.setEnabled(false);
    this.onlineLobby.hideAll();
    this.menu.showMainMenu();
  }

  handleLineSelection(lineId) {
    if (this.mode === 'online') {
      this.multiplayerGame.handleUserLineClick(lineId);
    } else {
      if (!this.game.isLineAvailable(lineId)) return;
      this.game.claimLine(lineId);
    }
  }

  handleLineClaimed(move) {
    const { lineId, player, completedBoxes } = move;

    // 1. Play line placement sound
    this.audioManager.playLinePlace();

    // 2. Animate 3D line growth
    this.boardRenderer.animateLineClaim(lineId, player);

    // 3. If boxes were completed
    if (completedBoxes.length > 0) {
      setTimeout(() => {
        this.audioManager.playBoxClaim(completedBoxes.length);

        completedBoxes.forEach((box) => {
          this.boardRenderer.animateBoxClaim(box.boxId, player);
          this.effects.createBoxBurst(box.x, 0.05, box.z, player.colorHex);
        });
      }, 100);
    }
  }

  handleTurnChanged(playerId, isExtraTurn) {
    this.turnIndicator.setTurn(playerId, isExtraTurn);
    this.scoreboard.setActivePlayer(playerId);
    if (!isExtraTurn) {
      this.audioManager.playTurnChange();
    }
  }

  handleScoreUpdated(scores, delta, completedBoxes) {
    const scoringPlayer = completedBoxes.length > 0 ? completedBoxes[0].player : null;
    this.scoreboard.updateScores(scores, delta, scoringPlayer);
    if (delta > 0) {
      this.audioManager.playScorePing();
    }
  }

  handleGameOver(result) {
    this.mouseInput.setEnabled(false);
    this.touchInput.setEnabled(false);

    setTimeout(() => {
      this.gameOver.show(result, false);
    }, 600);
  }

  initControls() {
    const btnView = document.getElementById('btn-toggle-view');
    const btnSound = document.getElementById('btn-toggle-sound');
    const btnResetCam = document.getElementById('btn-reset-camera');
    const btnRestart = document.getElementById('btn-restart-game');
    const btnMenu = document.getElementById('btn-open-menu');

    const updateSoundIcon = () => {
      const isMuted = this.audioManager.isMuted();
      if (btnSound) btnSound.textContent = isMuted ? '🔇' : '🔊';
      const btnSettingsSound = document.getElementById('btn-settings-sound');
      if (btnSettingsSound) btnSettingsSound.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
    };
    updateSoundIcon();

    const updateViewButton = () => {
      const mode = this.cameraManager.viewMode;
      if (btnView) {
        btnView.textContent = mode === 'front' ? '📐' : '🎯';
        btnView.title = mode === 'front' ? 'Switch to 3D Tilted View' : 'Switch to Front-Facing View';
      }
      const btnSettingsView = document.getElementById('btn-settings-view');
      if (btnSettingsView) {
        btnSettingsView.textContent = mode === 'front' ? 'FRONT VIEW' : '3D TILTED';
      }
    };
    updateViewButton();

    btnView?.addEventListener('click', () => {
      this.audioManager.playClick();
      this.cameraManager.toggleViewMode(true);
      updateViewButton();
    });

    btnSound?.addEventListener('click', () => {
      this.audioManager.toggleSound();
      updateSoundIcon();
    });

    btnResetCam?.addEventListener('click', () => {
      this.audioManager.playClick();
      this.cameraManager.resetView();
    });

    btnRestart?.addEventListener('click', () => {
      this.audioManager.playClick();
      this.restartCurrentMatch();
    });

    btnMenu?.addEventListener('click', () => {
      this.audioManager.playClick();
      this.returnToMainMenu();
    });
  }

  openSettings() {
    const modal = document.getElementById('settings-modal');
    modal?.classList.remove('hidden');
  }

  initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSound = document.getElementById('btn-settings-sound');
    const btnView = document.getElementById('btn-settings-view');

    btnClose?.addEventListener('click', () => {
      this.audioManager.playClick();
      modal?.classList.add('hidden');
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.audioManager.playClick();
        modal?.classList.add('hidden');
      }
    });

    btnSound?.addEventListener('click', () => {
      this.audioManager.toggleSound();
      const isMuted = this.audioManager.isMuted();
      btnSound.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
      const btnInGameSound = document.getElementById('btn-toggle-sound');
      if (btnInGameSound) btnInGameSound.textContent = isMuted ? '🔇' : '🔊';
    });

    btnView?.addEventListener('click', () => {
      this.audioManager.playClick();
      const mode = this.cameraManager.toggleViewMode(true);
      btnView.textContent = mode === 'front' ? 'FRONT VIEW' : '3D TILTED';
      const btnInGameView = document.getElementById('btn-toggle-view');
      if (btnInGameView) {
        btnInGameView.textContent = mode === 'front' ? '📐' : '🎯';
        btnInGameView.title = mode === 'front' ? 'Switch to 3D Tilted View' : 'Switch to Front-Facing View';
      }
    });
  }

  initWindowResize() {
    window.addEventListener('resize', () => {
      this.sceneManager.resize();
      this.cameraManager.resize();
    });
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.sceneManager.clock.getDelta(), 0.1);

    this.cameraManager.update(delta);
    this.sceneManager.update(delta);
    this.boardRenderer.update(delta);
    this.effects.update(delta);

    this.sceneManager.render(this.cameraManager.camera);
  }
}

// Initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
