/**
 * CameraManager.js
 * Perspective camera with smooth damping, clamped orbit controls (cannot flip upside down),
 * pinch zoom, and adaptive framing based on board size.
 */
import * as THREE from 'three';

export class CameraManager {
  constructor(container) {
    this.container = container;

    // Perspective camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    // Spherical coordinates for smooth orbit
    this.target = new THREE.Vector3(0, 0, 0);
    this.currentTarget = new THREE.Vector3(0, 0, 0);

    // View mode: 'front' (top-down front-facing) or 'tilted' (3D isometric perspective)
    this.viewMode = 'front'; // Default to front-facing / top-down as requested

    // Current and target spherical params
    this.spherical = {
      radius: 20,
      theta: 0,                 // Facing directly front-on
      phi: THREE.MathUtils.degToRad(3), // Top-down front-facing
    };

    this.targetSpherical = { ...this.spherical };

    // Clamps
    this.minPolarAngle = THREE.MathUtils.degToRad(2);   // Allows front-facing top-down view
    this.maxPolarAngle = THREE.MathUtils.degToRad(78);  // Cannot flip below board
    this.minDistance = 8;
    this.maxDistance = 65;

    // Pointer tracking
    this.isDragging = false;
    this.hasMovedSignificantly = false;
    this.previousPointerPosition = { x: 0, y: 0 };
    this.startPointerPosition = { x: 0, y: 0 };
    this.touchStartDistance = 0;

    this.enabled = true;

    this.initEventListeners();
    this.updateCameraPosition(1.0);
  }

  fitToBoard(gridSize, spacing = 2.0, animate = true) {
    this.gridSize = gridSize;
    this.spacing = spacing;

    const boardWidth = (gridSize - 1) * spacing;
    // Calculate ideal distance based on FOV and aspect ratio
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);

    let distance = (boardWidth * 1.38) / (2 * Math.tan(fovRad / 2));
    if (aspect < 1.0) {
      // Mobile portrait - zoom out more so board fits nicely with HUD
      distance = distance / (aspect * 0.82);
    } else {
      distance = Math.max(distance, 14);
    }

    this.minDistance = Math.max(6, distance * 0.5);
    this.maxDistance = distance * 2.5;

    this.targetSpherical.radius = distance;

    if (this.viewMode === 'front') {
      this.targetSpherical.theta = 0;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(3);
    } else {
      this.targetSpherical.theta = Math.PI / 4;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(aspect < 1.0 ? 46 : 52);
    }

    if (!animate) {
      this.spherical.radius = this.targetSpherical.radius;
      this.spherical.phi = this.targetSpherical.phi;
      this.spherical.theta = this.targetSpherical.theta;
      this.updateCameraPosition(1.0);
    }
  }

  setViewMode(mode, animate = true) {
    this.viewMode = mode === 'tilted' ? 'tilted' : 'front';
    const aspect = this.container.clientWidth / this.container.clientHeight;

    if (this.viewMode === 'front') {
      this.targetSpherical.theta = 0;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(3);
    } else {
      this.targetSpherical.theta = Math.PI / 4;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(aspect < 1.0 ? 46 : 52);
    }

    if (!animate) {
      this.spherical.theta = this.targetSpherical.theta;
      this.spherical.phi = this.targetSpherical.phi;
    }
    return this.viewMode;
  }

  toggleViewMode(animate = true) {
    const nextMode = this.viewMode === 'front' ? 'tilted' : 'front';
    return this.setViewMode(nextMode, animate);
  }

  initEventListeners() {
    const el = this.container;

    // Pointer down
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.isDragging = true;
      this.hasMovedSignificantly = false;
      this.startPointerPosition = { x: e.clientX, y: e.clientY };
      this.previousPointerPosition = { x: e.clientX, y: e.clientY };
    });

    // Pointer move
    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.enabled) return;

      const deltaX = e.clientX - this.previousPointerPosition.x;
      const deltaY = e.clientY - this.previousPointerPosition.y;

      const totalDist = Math.hypot(
        e.clientX - this.startPointerPosition.x,
        e.clientY - this.startPointerPosition.y
      );
      if (totalDist > 6) {
        this.hasMovedSignificantly = true;
      }

      this.targetSpherical.theta -= deltaX * 0.006;
      this.targetSpherical.phi = Math.max(
        this.minPolarAngle,
        Math.min(this.maxPolarAngle, this.targetSpherical.phi - deltaY * 0.005)
      );

      this.previousPointerPosition = { x: e.clientX, y: e.clientY };
    });

    // Pointer up
    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    // Wheel zoom
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const zoomFactor = e.deltaY * 0.015;
      this.targetSpherical.radius = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.targetSpherical.radius + zoomFactor)
      );
    }, { passive: false });

    // Touch pinch-to-zoom support
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.touchStartDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const diff = this.touchStartDistance - currentDistance;
        this.targetSpherical.radius = Math.max(
          this.minDistance,
          Math.min(this.maxDistance, this.targetSpherical.radius + diff * 0.05)
        );
        this.touchStartDistance = currentDistance;
      }
    }, { passive: true });
  }

  update(delta) {
    // Smooth damping / interpolation (60fps lerp)
    const damping = 1.0 - Math.exp(-12 * delta);

    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * damping;
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * damping;
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * damping;

    this.currentTarget.lerp(this.target, damping);

    this.updateCameraPosition();
  }

  updateCameraPosition() {
    const sinPhi = Math.sin(this.spherical.phi);
    const cosPhi = Math.cos(this.spherical.phi);
    const sinTheta = Math.sin(this.spherical.theta);
    const cosTheta = Math.cos(this.spherical.theta);

    this.camera.position.x = this.currentTarget.x + this.spherical.radius * sinPhi * sinTheta;
    this.camera.position.y = this.currentTarget.y + this.spherical.radius * cosPhi;
    this.camera.position.z = this.currentTarget.z + this.spherical.radius * sinPhi * cosTheta;

    this.camera.lookAt(this.currentTarget);
  }

  resetView(animate = true) {
    if (this.viewMode === 'front') {
      this.targetSpherical.theta = 0;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(3);
    } else {
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.targetSpherical.theta = Math.PI / 4;
      this.targetSpherical.phi = THREE.MathUtils.degToRad(aspect < 1.0 ? 46 : 52);
    }
    if (!animate) {
      this.spherical.theta = this.targetSpherical.theta;
      this.spherical.phi = this.targetSpherical.phi;
    }
  }

  resize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
  }
}
