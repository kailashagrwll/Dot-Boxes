/**
 * Effects.js
 * Particle bursts, glowing shockwaves, and visual celebration effects.
 */
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.activeEffects = [];

    // Shared circular particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    this.particleTexture = new THREE.CanvasTexture(canvas);
  }

  createBoxBurst(x, y, z, colorHex) {
    // 1. Particle burst
    const count = 35;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y + 0.1;
      positions[i3 + 2] = z;

      // Radial speed + upward kick
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8;
      const vy = 1.8 + Math.random() * 3.2;

      velocities.push({
        vx: Math.cos(angle) * speed,
        vy: vy,
        vz: Math.sin(angle) * speed,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.45,
      map: this.particleTexture,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // 2. Expanding shockwave ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.25, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.08, z);
    this.scene.add(ring);

    this.activeEffects.push({
      particles,
      velocities,
      ring,
      age: 0,
      lifespan: 0.75, // seconds
    });
  }

  update(delta) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      fx.age += delta;
      const progress = fx.age / fx.lifespan;

      if (progress >= 1.0) {
        // Cleanup
        this.scene.remove(fx.particles);
        this.scene.remove(fx.ring);
        fx.particles.geometry.dispose();
        fx.particles.material.dispose();
        fx.ring.geometry.dispose();
        fx.ring.material.dispose();
        this.activeEffects.splice(i, 1);
        continue;
      }

      // Update particles
      const positions = fx.particles.geometry.attributes.position.array;
      for (let j = 0; j < fx.velocities.length; j++) {
        const j3 = j * 3;
        const vel = fx.velocities[j];

        positions[j3] += vel.vx * delta;
        positions[j3 + 1] += vel.vy * delta;
        positions[j3 + 2] += vel.vz * delta;

        // Gravity & drag
        vel.vy -= 8.0 * delta;
        vel.vx *= 0.96;
        vel.vz *= 0.96;
      }
      fx.particles.geometry.attributes.position.needsUpdate = true;
      fx.particles.material.opacity = Math.max(0, 1.0 - progress * progress);

      // Update ring shockwave
      const ringScale = 1.0 + progress * 5.5;
      fx.ring.scale.set(ringScale, ringScale, ringScale);
      fx.ring.material.opacity = Math.max(0, (1.0 - progress) * 0.9);
    }
  }

  clear() {
    for (const fx of this.activeEffects) {
      this.scene.remove(fx.particles);
      this.scene.remove(fx.ring);
      fx.particles.geometry.dispose();
      fx.particles.material.dispose();
      fx.ring.geometry.dispose();
      fx.ring.material.dispose();
    }
    this.activeEffects = [];
  }
}
