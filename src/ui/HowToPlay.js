/**
 * HowToPlay.js
 * Visual tutorial modal illustrating rules, turns, and box completions.
 */
export class HowToPlay {
  constructor(options = {}) {
    this.audioManager = options.audioManager;
    this.container = document.getElementById('how-to-play-modal');
    this.btnClose = document.getElementById('btn-close-how');

    this.bindEvents();
  }

  bindEvents() {
    this.btnClose?.addEventListener('click', () => {
      this.audioManager?.playClick();
      this.hide();
    });

    // Close on backdrop click
    this.container?.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.audioManager?.playClick();
        this.hide();
      }
    });
  }

  show() {
    this.container?.classList.remove('hidden');
  }

  hide() {
    this.container?.classList.add('hidden');
  }
}
