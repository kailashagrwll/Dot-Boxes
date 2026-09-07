/**
 * Scoreboard.js
 * Heads-Up Display (HUD) showing player scores, animated countups, and floating "+1" badges.
 */
export class Scoreboard {
  constructor() {
    this.container = document.getElementById('hud-container');
    this.p1ScoreEl = document.getElementById('hud-p1-score');
    this.p2ScoreEl = document.getElementById('hud-p2-score');
    this.p1CardEl = document.getElementById('hud-p1-card');
    this.p2CardEl = document.getElementById('hud-p2-card');

    this.currentScores = { p1: 0, p2: 0 };
  }

  show() {
    this.container?.classList.remove('hidden');
  }

  hide() {
    this.container?.classList.add('hidden');
  }

  reset() {
    this.currentScores = { p1: 0, p2: 0 };
    this.updateScores({ p1: 0, p2: 0 });
  }

  updateScores(scores, delta = 0, player = null) {
    if (this.p1ScoreEl) {
      if (scores.p1 !== this.currentScores.p1) {
        this.animateNumber(this.p1ScoreEl, scores.p1);
        if (delta > 0 && player === 'p1') {
          this.spawnFloatingBadge(this.p1CardEl, `+${delta}`);
        }
      } else {
        this.p1ScoreEl.textContent = String(scores.p1).padStart(2, '0');
      }
    }

    if (this.p2ScoreEl) {
      if (scores.p2 !== this.currentScores.p2) {
        this.animateNumber(this.p2ScoreEl, scores.p2);
        if (delta > 0 && player === 'p2') {
          this.spawnFloatingBadge(this.p2CardEl, `+${delta}`);
        }
      } else {
        this.p2ScoreEl.textContent = String(scores.p2).padStart(2, '0');
      }
    }

    this.currentScores = { ...scores };
  }

  animateNumber(el, newScore) {
    el.classList.remove('score-bump');
    void el.offsetWidth;
    el.classList.add('score-bump');
    el.textContent = String(newScore).padStart(2, '0');
  }

  spawnFloatingBadge(targetCard, text) {
    if (!targetCard) return;
    const badge = document.createElement('div');
    badge.className = 'floating-score-badge';
    badge.textContent = text;
    targetCard.appendChild(badge);

    setTimeout(() => {
      badge.remove();
    }, 1100);
  }

  setActivePlayer(playerId) {
    if (playerId === 'p1') {
      this.p1CardEl?.classList.add('active-turn');
      this.p2CardEl?.classList.remove('active-turn');
    } else {
      this.p2CardEl?.classList.add('active-turn');
      this.p1CardEl?.classList.remove('active-turn');
    }
  }

  updateStreaks(streaks = { p1: 0, p2: 0 }) {
    const p1StreakEl = document.getElementById('hud-p1-streak');
    const p2StreakEl = document.getElementById('hud-p2-streak');

    if (p1StreakEl) {
      if (streaks.p1 > 0) {
        p1StreakEl.innerHTML = `<span class="fire-icon">🔥</span> ${streaks.p1} STREAK`;
        p1StreakEl.classList.remove('hidden');
      } else {
        p1StreakEl.classList.add('hidden');
      }
    }

    if (p2StreakEl) {
      if (streaks.p2 > 0) {
        p2StreakEl.innerHTML = `<span class="fire-icon">🔥</span> ${streaks.p2} STREAK`;
        p2StreakEl.classList.remove('hidden');
      } else {
        p2StreakEl.classList.add('hidden');
      }
    }
  }

  setOnlineMode(isOnline, myRole = null) {
    this.isOnline = isOnline;
    this.myRole = myRole;

    const p1Label = document.getElementById('hud-p1-name-tag');
    const p2Label = document.getElementById('hud-p2-name-tag');

    if (p1Label) {
      p1Label.textContent = isOnline && myRole === 'p1' ? 'YOU (P1)' : (isOnline ? 'OPPONENT (P1)' : 'PLAYER 1');
    }
    if (p2Label) {
      p2Label.textContent = isOnline && myRole === 'p2' ? 'YOU (P2)' : (isOnline ? 'OPPONENT (P2)' : 'PLAYER 2');
    }

    const connEl = document.getElementById('hud-opponent-status');
    if (connEl) {
      connEl.classList.toggle('hidden', !isOnline);
    }
  }

  setOpponentStatus(isConnected) {
    const connEl = document.getElementById('hud-opponent-status');
    if (connEl) {
      connEl.innerHTML = isConnected
        ? '<span style="color:#22c55e;">●</span> OPPONENT ONLINE'
        : '<span style="color:#ef4444; animation: pulse 1s infinite;">○</span> OPPONENT DISCONNECTED';
    }
  }
}
