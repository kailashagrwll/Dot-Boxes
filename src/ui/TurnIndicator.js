/**
 * TurnIndicator.js
 * Center HUD banner showing current turn with smooth slide/fade animations and color accenting.
 */
import { PLAYERS } from '../game/Player.js';

export class TurnIndicator {
  constructor() {
    this.container = document.getElementById('turn-indicator');
    this.textEl = document.getElementById('turn-indicator-text');
    this.subTextEl = document.getElementById('turn-indicator-sub');

    this.currentPlayer = null;
    this.isAnimating = false;
  }

  show() {
    this.container?.classList.remove('hidden');
  }

  hide() {
    this.container?.classList.add('hidden');
  }

  setTurn(playerId, isExtraTurn = false, customLabel = null) {
    const player = PLAYERS[playerId.toUpperCase()];
    if (!player || !this.textEl || !this.container) return;

    this.currentPlayer = playerId;

    // Trigger smooth fade/slide out and in
    this.container.classList.remove('turn-p1', 'turn-p2');
    this.container.classList.add(`turn-${playerId}`);

    this.textEl.classList.remove('turn-text-slide-in');
    this.textEl.classList.add('turn-text-slide-out');

    setTimeout(() => {
      this.textEl.textContent = customLabel ? customLabel.toUpperCase() : `${player.name.toUpperCase()}'S TURN`;
      this.textEl.style.color = player.colorCss;

      if (isExtraTurn) {
        if (this.subTextEl) {
          this.subTextEl.textContent = '✨ EXTRA TURN!';
          this.subTextEl.classList.add('extra-turn-pulse');
        }
      } else {
        if (this.subTextEl) {
          this.subTextEl.textContent = customLabel === "OPPONENT'S TURN" ? 'Thinking...' : '';
          this.subTextEl.classList.remove('extra-turn-pulse');
        }
      }

      this.textEl.classList.remove('turn-text-slide-out');
      this.textEl.classList.add('turn-text-slide-in');
    }, 120);
  }
}
