/**
 * OnlineLobby.js
 * Manages the multiplayer room creation, joining, invite link copying,
 * player ready cards, board size selection (host), and countdown.
 */
export class OnlineLobby {
  constructor(options = {}) {
    this.socketClient = options.socketClient;
    this.audioManager = options.audioManager;
    this.onStartGame = options.onStartGame || (() => {});
    this.onBackToMenu = options.onBackToMenu || (() => {});
    this.showToast = options.showToast || ((msg) => console.log(msg));

    this.currentRoom = null;
    this.myRole = null;
    this.isReady = false;

    this.initElements();
    this.bindEvents();
    this.initSocketEvents();
  }

  initElements() {
    // Screens
    this.onlineMenuScreen = document.getElementById('online-menu-screen');
    this.joinRoomScreen = document.getElementById('join-room-screen');
    this.lobbyRoomScreen = document.getElementById('lobby-room-screen');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');

    // Online Menu buttons
    this.btnCreateGame = document.getElementById('btn-online-create');
    this.btnOpenJoin = document.getElementById('btn-online-join');
    this.btnOnlineBack = document.getElementById('btn-online-back');

    // Join Screen elements
    this.inputRoomCode = document.getElementById('input-room-code');
    this.btnSubmitJoin = document.getElementById('btn-submit-join');
    this.btnJoinBack = document.getElementById('btn-join-back');

    // Lobby Screen elements
    this.displayRoomCode = document.getElementById('lobby-display-code');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.btnCopyLink = document.getElementById('btn-copy-link');

    this.p1Card = document.getElementById('lobby-p1-card');
    this.p1Status = document.getElementById('lobby-p1-status');
    this.p2Card = document.getElementById('lobby-p2-card');
    this.p2Status = document.getElementById('lobby-p2-status');

    this.boardSizeControls = document.getElementById('lobby-size-controls');
    this.sizeMinus = document.getElementById('btn-lobby-size-minus');
    this.sizePlus = document.getElementById('btn-lobby-size-plus');
    this.sizeValue = document.getElementById('lobby-size-value');
    this.sizeLabel = document.getElementById('lobby-size-label');

    this.btnReadyToggle = document.getElementById('btn-lobby-ready');
    this.btnLeaveLobby = document.getElementById('btn-lobby-leave');
  }

  bindEvents() {
    // Online Menu
    this.btnCreateGame?.addEventListener('click', () => this.handleCreateRoom());
    this.btnOpenJoin?.addEventListener('click', () => this.showJoinScreen());
    this.btnOnlineBack?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.hideAll();
      this.onBackToMenu();
    });

    // Join Screen
    this.btnSubmitJoin?.addEventListener('click', () => this.handleJoinSubmit());
    this.btnJoinBack?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.showOnlineMenu();
    });

    this.inputRoomCode?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    this.inputRoomCode?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoinSubmit();
    });

    // Lobby Screen
    this.btnCopyCode?.addEventListener('click', () => this.copyRoomCode());
    this.btnCopyLink?.addEventListener('click', () => this.copyInviteLink());

    this.sizeMinus?.addEventListener('click', () => this.adjustBoardSize(-1));
    this.sizePlus?.addEventListener('click', () => this.adjustBoardSize(1));

    this.btnReadyToggle?.addEventListener('click', () => this.toggleReady());
    this.btnLeaveLobby?.addEventListener('click', () => this.leaveLobby());
  }

  initSocketEvents() {
    // Lobby state updates
    this.socketClient.on('LOBBY_STATE', (data) => {
      this.updateLobbyView(data);
    });

    // Countdown events
    this.socketClient.on('COUNTDOWN_TICK', ({ count }) => {
      this.showCountdown(count);
    });

    this.socketClient.on('COUNTDOWN_CANCELLED', () => {
      this.hideCountdown();
      this.showToast('Countdown cancelled: A player unreadied.');
    });

    // Game starting
    this.socketClient.on('GAME_STARTED', (data) => {
      this.hideCountdown();
      this.hideAll();
      this.onStartGame(this.currentRoom, this.myRole, data.state);
    });
  }

  showOnlineMenu() {
    this.hideAll();
    this.onlineMenuScreen?.classList.remove('hidden');
  }

  showJoinScreen(prefillCode = '') {
    this.hideAll();
    if (this.inputRoomCode) {
      this.inputRoomCode.value = prefillCode;
    }
    this.joinRoomScreen?.classList.remove('hidden');
    setTimeout(() => this.inputRoomCode?.focus(), 150);
  }

  async handleCreateRoom() {
    this.audioManager?.playClick();
    try {
      this.btnCreateGame.disabled = true;
      this.btnCreateGame.textContent = 'CREATING...';

      const res = await this.socketClient.createRoom();
      this.currentRoom = res.roomId;
      this.myRole = res.role;
      this.isReady = false;

      this.showLobbyScreen(res);
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    } finally {
      if (this.btnCreateGame) {
        this.btnCreateGame.disabled = false;
        this.btnCreateGame.textContent = '▶ CREATE GAME';
      }
    }
  }

  async handleJoinSubmit() {
    const code = this.inputRoomCode?.value?.trim();
    if (!code || code.length < 4) {
      this.showToast('Please enter a valid 6-character room code');
      return;
    }

    this.audioManager?.playClick();
    try {
      this.btnSubmitJoin.disabled = true;
      this.btnSubmitJoin.textContent = 'JOINING...';

      const res = await this.socketClient.joinRoom(code);
      this.currentRoom = res.roomId;
      this.myRole = res.role;
      this.isReady = false;

      if (res.status === 'playing') {
        // Reconnecting to active game
        this.hideAll();
        this.onStartGame(this.currentRoom, this.myRole, res.state);
      } else {
        this.showLobbyScreen(res);
      }
    } catch (err) {
      this.showToast(`Failed to join: ${err.message}`);
    } finally {
      if (this.btnSubmitJoin) {
        this.btnSubmitJoin.disabled = false;
        this.btnSubmitJoin.textContent = 'JOIN GAME';
      }
    }
  }

  showLobbyScreen(roomData) {
    this.hideAll();
    this.lobbyRoomScreen?.classList.remove('hidden');

    if (this.displayRoomCode) {
      this.displayRoomCode.textContent = roomData.roomId;
    }

    // Host vs Guest controls
    const isHost = this.myRole === 'p1';
    if (this.boardSizeControls) {
      this.boardSizeControls.style.opacity = isHost ? '1' : '0.5';
      if (this.sizeMinus) this.sizeMinus.disabled = !isHost;
      if (this.sizePlus) this.sizePlus.disabled = !isHost;
    }

    this.updateReadyButton();
    this.updateLobbyView(roomData);
  }

  updateLobbyView(data) {
    if (!data) return;

    // Update board size label
    if (data.gridSize && this.sizeValue && this.sizeLabel) {
      this.sizeValue.textContent = data.gridSize;
      const boxes = (data.gridSize - 1) * (data.gridSize - 1);
      this.sizeLabel.textContent = `${data.gridSize} × ${data.gridSize} (${boxes} boxes)`;
    }

    // Update Player 1
    if (this.p1Status) {
      if (data.players?.p1) {
        const isMe = this.myRole === 'p1' ? ' (You)' : '';
        const readyText = data.players.p1.isReady ? 'READY ✓' : 'NOT READY';
        this.p1Status.textContent = readyText;
        this.p1Status.className = `lobby-status-tag ${data.players.p1.isReady ? 'ready' : ''}`;
        const p1Name = document.getElementById('lobby-p1-name');
        if (p1Name) p1Name.textContent = `PLAYER 1 🔵${isMe}`;
      }
    }

    // Update Player 2
    if (this.p2Status) {
      if (data.players?.p2) {
        const isMe = this.myRole === 'p2' ? ' (You)' : '';
        const readyText = data.players.p2.isReady ? 'READY ✓' : 'NOT READY';
        this.p2Status.textContent = readyText;
        this.p2Status.className = `lobby-status-tag ${data.players.p2.isReady ? 'ready' : ''}`;
        const p2Name = document.getElementById('lobby-p2-name');
        if (p2Name) p2Name.textContent = `PLAYER 2 🔴${isMe}`;
      } else {
        this.p2Status.textContent = 'WAITING FOR FRIEND...';
        this.p2Status.className = 'lobby-status-tag waiting';
        const p2Name = document.getElementById('lobby-p2-name');
        if (p2Name) p2Name.textContent = 'PLAYER 2 🔴';
      }
    }
  }

  adjustBoardSize(delta) {
    if (this.myRole !== 'p1') return;
    const current = parseInt(this.sizeValue?.textContent || '5', 10);
    const next = Math.max(3, Math.min(12, current + delta));
    if (next !== current) {
      this.audioManager?.playClick();
      this.socketClient.setBoardSize(next);
    }
  }

  toggleReady() {
    this.isReady = !this.isReady;
    this.audioManager?.playClick();
    this.updateReadyButton();
    this.socketClient.setReady(this.isReady);
  }

  updateReadyButton() {
    if (!this.btnReadyToggle) return;
    if (this.isReady) {
      this.btnReadyToggle.textContent = 'READY ✓ (CLICK TO CANCEL)';
      this.btnReadyToggle.classList.add('btn-ready-active');
    } else {
      this.btnReadyToggle.textContent = 'READY TO PLAY';
      this.btnReadyToggle.classList.remove('btn-ready-active');
    }
  }

  copyRoomCode() {
    if (!this.currentRoom) return;
    this.audioManager?.playClick();
    navigator.clipboard.writeText(this.currentRoom).then(() => {
      this.flashButton(this.btnCopyCode, 'COPIED ✓');
    }).catch(() => {
      this.showToast(`Room Code: ${this.currentRoom}`);
    });
  }

  copyInviteLink() {
    if (!this.currentRoom) return;
    this.audioManager?.playClick();
    const url = `${window.location.origin}${window.location.pathname}?join=${this.currentRoom}`;
    navigator.clipboard.writeText(url).then(() => {
      this.flashButton(this.btnCopyLink, 'LINK COPIED ✓');
    }).catch(() => {
      this.showToast(`Invite Link: ${url}`);
    });
  }

  flashButton(btn, text) {
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = `<span>✓</span> ${text}`;
    btn.style.borderColor = 'var(--p1-cyan)';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.borderColor = '';
    }, 1800);
  }

  showCountdown(number) {
    if (this.countdownOverlay && this.countdownNumber) {
      this.countdownOverlay.classList.remove('hidden');
      this.countdownNumber.textContent = number;
      this.countdownNumber.classList.remove('countdown-pulse');
      void this.countdownNumber.offsetWidth;
      this.countdownNumber.classList.add('countdown-pulse');
      this.audioManager?.playScorePing();
    }
  }

  hideCountdown() {
    this.countdownOverlay?.classList.add('hidden');
  }

  leaveLobby() {
    this.audioManager?.playClick();
    this.socketClient.leaveRoom();
    this.currentRoom = null;
    this.myRole = null;
    this.isReady = false;
    this.showOnlineMenu();
  }

  hideAll() {
    this.onlineMenuScreen?.classList.add('hidden');
    this.joinRoomScreen?.classList.add('hidden');
    this.lobbyRoomScreen?.classList.add('hidden');
    this.hideCountdown();
  }
}
