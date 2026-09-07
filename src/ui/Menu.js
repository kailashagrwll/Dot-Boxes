/**
 * Menu.js
 * Manages the main menu screen, board size selection (3 to 12 dots), and modal views.
 */
export class Menu {
  constructor(options = {}) {
    this.audioManager = options.audioManager;
    this.onStartGame = options.onStartGame || (() => {});
    this.onOpenOnline = options.onOpenOnline || (() => {});
    this.onOpenHowToPlay = options.onOpenHowToPlay || (() => {});
    this.onOpenSettings = options.onOpenSettings || (() => {});

    this.selectedSize = 5; // Default 5x5 dots (16 boxes)
    this.minSize = 3;
    this.maxSize = 12;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.mainMenuEl = document.getElementById('main-menu-screen');
    this.sizeSelectEl = document.getElementById('size-select-screen');

    this.btnPlayLocal = document.getElementById('btn-menu-play-local');
    this.btnPlayOnline = document.getElementById('btn-menu-play-online');
    this.btnHowToPlay = document.getElementById('btn-menu-how');
    this.btnSettings = document.getElementById('btn-menu-settings');

    this.sizeValueEl = document.getElementById('size-display-value');
    this.sizeDotsLabel = document.getElementById('size-dots-label');
    this.sizeBoxesLabel = document.getElementById('size-boxes-label');

    this.btnSizeMinus = document.getElementById('btn-size-minus');
    this.btnSizePlus = document.getElementById('btn-size-plus');
    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnBackToMenu = document.getElementById('btn-size-back');
  }

  bindEvents() {
    // Play Local -> show size screen
    this.btnPlayLocal?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.showSizeSelect();
    });

    // Play Online -> show online lobby
    this.btnPlayOnline?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.hide();
      this.onOpenOnline();
    });

    // How to Play
    this.btnHowToPlay?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.onOpenHowToPlay();
    });

    // Settings
    this.btnSettings?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.onOpenSettings();
    });

    // Size minus
    this.btnSizeMinus?.addEventListener('click', () => {
      if (this.selectedSize > this.minSize) {
        this.selectedSize--;
        this.audioManager?.playClick();
        this.updateSizeDisplay();
      }
    });

    // Size plus
    this.btnSizePlus?.addEventListener('click', () => {
      if (this.selectedSize < this.maxSize) {
        this.selectedSize++;
        this.audioManager?.playClick();
        this.updateSizeDisplay();
      }
    });

    // Start Game
    this.btnStartGame?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.hide();
      this.onStartGame(this.selectedSize);
    });

    // Back to Menu
    this.btnBackToMenu?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.showMainMenu();
    });
  }

  updateSizeDisplay() {
    if (!this.sizeValueEl) return;

    // Trigger bounce animation
    this.sizeValueEl.classList.remove('number-bounce');
    void this.sizeValueEl.offsetWidth; // Force reflow
    this.sizeValueEl.classList.add('number-bounce');

    this.sizeValueEl.textContent = this.selectedSize;
    this.sizeDotsLabel.textContent = `${this.selectedSize} × ${this.selectedSize} DOTS`;

    const totalBoxes = (this.selectedSize - 1) * (this.selectedSize - 1);
    this.sizeBoxesLabel.textContent = `${totalBoxes} BOXES`;

    // Disable/enable minus and plus buttons
    if (this.btnSizeMinus) this.btnSizeMinus.disabled = (this.selectedSize <= this.minSize);
    if (this.btnSizePlus) this.btnSizePlus.disabled = (this.selectedSize >= this.maxSize);
  }

  showMainMenu() {
    this.mainMenuEl?.classList.remove('hidden');
    this.sizeSelectEl?.classList.add('hidden');
  }

  showSizeSelect() {
    this.mainMenuEl?.classList.add('hidden');
    this.sizeSelectEl?.classList.remove('hidden');
    this.updateSizeDisplay();
  }

  hide() {
    this.mainMenuEl?.classList.add('hidden');
    this.sizeSelectEl?.classList.add('hidden');
  }
}
