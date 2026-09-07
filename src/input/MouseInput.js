/**
 * MouseInput.js
 * Raycasts against wide invisible line hitboxes, provides hover states, and handles clicks.
 */
import * as THREE from 'three';

export class MouseInput {
  constructor(container, cameraManager, boardRenderer, game, audioManager, onSelectLine) {
    this.container = container;
    this.cameraManager = cameraManager;
    this.boardRenderer = boardRenderer;
    this.game = game;
    this.audioManager = audioManager;
    this.onSelectLine = onSelectLine;
    this.delegate = game;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.currentHoveredLineId = null;
    this.enabled = true;

    this.pointerDownPos = { x: 0, y: 0 };
    this.initListeners();
  }

  setGameDelegate(delegate) {
    this.delegate = delegate;
    this.clearHover();
  }

  initListeners() {
    const el = this.container;

    el.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      this.updatePointer(e.clientX, e.clientY);
      this.checkHover();
    });

    el.addEventListener('pointerup', (e) => {
      if (!this.enabled || e.button !== 0) return;

      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );

      // If user was dragging to rotate the camera, don't trigger click
      if (dist > 8 || this.cameraManager.hasMovedSignificantly) {
        return;
      }

      this.handleClick();
    });

    el.addEventListener('pointerleave', () => {
      this.clearHover();
    });
  }

  updatePointer(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  checkHover() {
    if (!this.enabled || this.cameraManager.isDragging) return;

    this.raycaster.setFromCamera(this.pointer, this.cameraManager.camera);
    const intersects = this.raycaster.intersectObjects(this.boardRenderer.hitMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const lineId = hit.object.userData?.lineId;

      if (lineId && this.delegate.isLineAvailable(lineId)) {
        if (this.currentHoveredLineId !== lineId) {
          this.clearHover();
          this.currentHoveredLineId = lineId;
          const activePlayer = this.delegate.getCurrentPlayer ? this.delegate.getCurrentPlayer() : null;
          this.boardRenderer.setLineHover(lineId, true, activePlayer);
          this.audioManager.playHover();
          this.container.style.cursor = 'pointer';
        }
        return;
      }
    }

    this.clearHover();
  }

  handleClick() {
    if (!this.currentHoveredLineId) return;

    const lineId = this.currentHoveredLineId;
    if (this.delegate.isLineAvailable(lineId)) {
      this.clearHover();
      this.onSelectLine(lineId);
    }
  }

  clearHover() {
    if (this.currentHoveredLineId) {
      this.boardRenderer.setLineHover(this.currentHoveredLineId, false);
      this.currentHoveredLineId = null;
      this.container.style.cursor = 'default';
    }
  }

  setEnabled(val) {
    this.enabled = val;
    if (!val) {
      this.clearHover();
    }
  }
}
