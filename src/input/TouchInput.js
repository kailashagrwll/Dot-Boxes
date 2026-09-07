/**
 * TouchInput.js
 * Dedicated mobile touch handling with generous tap-to-select and drag-to-orbit differentiation.
 */
import * as THREE from 'three';

export class TouchInput {
  constructor(container, cameraManager, boardRenderer, game, onSelectLine) {
    this.container = container;
    this.cameraManager = cameraManager;
    this.boardRenderer = boardRenderer;
    this.game = game;
    this.delegate = game;
    this.onSelectLine = onSelectLine;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.touchStart = { x: 0, y: 0, time: 0 };
    this.enabled = true;

    this.initListeners();
  }

  setGameDelegate(delegate) {
    this.delegate = delegate;
  }

  initListeners() {
    const el = this.container;

    el.addEventListener('touchstart', (e) => {
      if (!this.enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      this.touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!this.enabled) return;
      const duration = Date.now() - this.touchStart.time;

      // Only evaluate if it was a single-finger tap
      if (e.changedTouches.length === 1 && duration < 500) {
        const touch = e.changedTouches[0];
        const dist = Math.hypot(
          touch.clientX - this.touchStart.x,
          touch.clientY - this.touchStart.y
        );

        // Tap detected (not an intentional swipe/orbit)
        if (dist < 28 && !this.cameraManager.isDragging) {
          this.handleTap(touch.clientX, touch.clientY);
        }
      }
    }, { passive: false });
  }

  handleTap(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.cameraManager.camera);
    const intersects = this.raycaster.intersectObjects(this.boardRenderer.hitMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const lineId = hit.object.userData?.lineId;

      if (lineId && this.delegate.isLineAvailable(lineId)) {
        this.onSelectLine(lineId);
      }
    }
  }

  setEnabled(val) {
    this.enabled = val;
  }
}
