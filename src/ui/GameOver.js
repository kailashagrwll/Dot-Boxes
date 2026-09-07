/**
 * GameOver.js
 * Cinematic victory & game over screen with score breakdown, confetti, and replay options.
 */
import confetti from 'canvas-confetti';
import { PLAYERS } from '../game/Player.js';

export class GameOver {
  constructor(options = {}) {
    this.audioManager = options.audioManager;
    this.onPlayAgain = options.onPlayAgain || (() => {});
    this.onNewGame = options.onNewGame || (() => {});

    this.container = document.getElementById('game-over-screen');
    this.winnerTextEl = document.getElementById('game-over-winner-text');
    this.winnerSubEl = document.getElementById('game-over-winner-sub');
    this.p1BoxesEl = document.getElementById('game-over-p1-boxes');
    this.p2BoxesEl = document.getElementById('game-over-p2-boxes');
    this.streakBannerEl = document.getElementById('game-over-streak-banner');

    this.btnPlayAgain = document.getElementById('btn-game-over-play-again');
    this.btnNewGame = document.getElementById('btn-game-over-new-game');

    this.isOnline = false;
    this.onRematchRequest = null;

    this.bindEvents();
  }

  bindEvents() {
    this.btnPlayAgain?.addEventListener('click', () => {
      this.audioManager?.playClick();
      if (this.isOnline && this.onRematchRequest) {
        this.btnPlayAgain.textContent = '✓ REMATCH REQUESTED (WAITING...)';
        this.btnPlayAgain.disabled = true;
        this.btnPlayAgain.classList.remove('rematch-alert-pulse');
        this.onRematchRequest();
      } else {
        this.hide();
        this.onPlayAgain();
      }
    });

    this.btnNewGame?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.hide();
      this.onNewGame();
    });
  }

  show(result, isOnline = false, onRematchRequest = null) {
    this.isOnline = isOnline;
    this.onRematchRequest = onRematchRequest;

    this.resetButtonState();

    const { winner, scores, streaks } = result;

    if (this.p1BoxesEl) this.p1BoxesEl.textContent = `${scores.p1} BOXES`;
    if (this.p2BoxesEl) this.p2BoxesEl.textContent = `${scores.p2} BOXES`;

    if (winner === 'draw') {
      if (this.winnerTextEl) {
        this.winnerTextEl.textContent = 'IT\'S A DRAW!';
        this.winnerTextEl.style.color = '#e2e8f0';
      }
      if (this.winnerSubEl) {
        this.winnerSubEl.textContent = 'Both players claimed equal boxes';
      }
      if (this.streakBannerEl) {
        this.streakBannerEl.classList.add('hidden');
      }
      this.audioManager?.playDraw();
    } else {
      const winnerPlayer = PLAYERS[winner.toUpperCase()];
      const winStreak = streaks ? (streaks[winner] || 1) : 1;

      if (this.winnerTextEl) {
        this.winnerTextEl.textContent = `🏆 ${winnerPlayer.name.toUpperCase()} WINS!`;
        this.winnerTextEl.style.color = winnerPlayer.colorCss;
      }

      if (this.streakBannerEl) {
        if (winStreak >= 2) {
          this.streakBannerEl.innerHTML = `<span class="fire-icon">🔥</span> ${winStreak} MATCH WIN STREAK!`;
          this.streakBannerEl.classList.remove('hidden');
          if (this.winnerSubEl) {
            this.winnerSubEl.textContent = `Unstoppable momentum! Can you keep the streak alive?`;
          }
        } else {
          this.streakBannerEl.innerHTML = `<span class="fire-icon">🔥</span> 1st MATCH WIN!`;
          this.streakBannerEl.classList.remove('hidden');
          if (this.winnerSubEl) {
            this.winnerSubEl.textContent = `Dominant strategic victory with ${scores[winner]} boxes`;
          }
        }
      }

      this.audioManager?.playVictory();

      // Confetti burst with player's color
      const colors = winner === 'p1' ? ['#00d2ff', '#38bdf8', '#ffffff'] : ['#ff2a5f', '#f43f5e', '#ffffff'];
      try {
        confetti({
          particleCount: 85,
          spread: 80,
          origin: { y: 0.6 },
          colors: colors,
        });
      } catch (e) {
        // Fallback if canvas-confetti is not available
      }
    }

    this.container?.classList.remove('hidden');
  }

  updateRematchStatus(status, myRole) {
    if (!this.btnPlayAgain || !this.isOnline) return;

    const p1Ready = !!(status?.p1 ?? status?.player1Ready);
    const p2Ready = !!(status?.p2 ?? status?.player2Ready);
    const isMeReady = myRole === 'p1' ? p1Ready : p2Ready;
    const isOpponentReady = myRole === 'p1' ? p2Ready : p1Ready;

    if (isMeReady && isOpponentReady) {
      this.btnPlayAgain.textContent = '⚡ REMATCH STARTING...';
      this.btnPlayAgain.disabled = true;
      this.btnPlayAgain.classList.remove('rematch-alert-pulse');
    } else if (isMeReady) {
      this.btnPlayAgain.textContent = '✓ REMATCH REQUESTED (WAITING...)';
      this.btnPlayAgain.disabled = true;
      this.btnPlayAgain.classList.remove('rematch-alert-pulse');
    } else if (isOpponentReady) {
      this.btnPlayAgain.textContent = '🔥 OPPONENT WANTS REMATCH! PLAY AGAIN';
      this.btnPlayAgain.disabled = false;
      this.btnPlayAgain.classList.add('rematch-alert-pulse');
    } else {
      this.resetButtonState();
    }
  }

  resetButtonState() {
    if (this.btnPlayAgain) {
      this.btnPlayAgain.disabled = false;
      this.btnPlayAgain.textContent = '🔄 PLAY AGAIN';
      this.btnPlayAgain.classList.remove('rematch-alert-pulse');
    }
  }

  showOpponentLeft() {
    if (this.btnPlayAgain) {
      this.btnPlayAgain.disabled = true;
      this.btnPlayAgain.textContent = '❌ OPPONENT LEFT';
      this.btnPlayAgain.classList.remove('rematch-alert-pulse');
    }
  }

  hide() {
    this.resetButtonState();
    this.container?.classList.add('hidden');
  }
}
