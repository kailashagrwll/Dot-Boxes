/**
 * SceneManager.js
 * Configures the Three.js scene, renderer, shadow mapping, lighting, and ambient environment.
 */
import * as THREE from 'three';

export class SceneManager {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.scene = new THREE.Scene();

    // Subtle dark atmospheric fog
    this.scene.fog = new THREE.FogExp2(0x080b14, 0.015);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setClearColor(0x080b14, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.container.appendChild(this.renderer.domElement);

    this.lights = {};
    this.initLights();
    this.initEnvironment();

    this.clock = new THREE.Clock();
    this.floatingParticles = null;
    this.initBackgroundParticles();
  }

  initLights() {
    // 1. Ambient Light (Rich deep indigo-slate)
    const ambient = new THREE.AmbientLight(0x182033, 1.4);
    this.scene.add(ambient);
    this.lights.ambient = ambient;

    // 2. Main Key Directional Light with soft shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(12, 22, 14);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 70;
    dirLight.shadow.bias = -0.0004;

    const d = 16;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;

    this.scene.add(dirLight);
    this.lights.directional = dirLight;

    // 3. Subtle Cyan Rim Light for futuristic edge highlight
    const rimLight1 = new THREE.DirectionalLight(0x00d2ff, 1.2);
    rimLight1.position.set(-15, 8, -12);
    this.scene.add(rimLight1);
    this.lights.rim1 = rimLight1;

    // 4. Subtle Magenta/Crimson Warm Fill from bottom-right
    const rimLight2 = new THREE.PointLight(0xff2a5f, 1.0, 40);
    rimLight2.position.set(12, -4, 10);
    this.scene.add(rimLight2);
    this.lights.rim2 = rimLight2;
  }

  initEnvironment() {
    // Subtle reflective circular plinth/ground below board to receive shadows
    const groundGeo = new THREE.CircleGeometry(35, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x05080e,
      roughness: 0.85,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.8;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Outer subtle glowing ring on the ground
    const ringGeo = new THREE.RingGeometry(18, 18.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.78;
    this.scene.add(ring);
  }

  initBackgroundParticles() {
    const count = 250;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 45;
      positions[i3 + 1] = Math.random() * 20 - 4;
      positions[i3 + 2] = (Math.random() - 0.5) * 45;
      scales[i] = Math.random() * 0.8 + 0.3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    // Custom circular particle texture via canvas
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(0,210,255,0.7)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.35,
      map: texture,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.floatingParticles = new THREE.Points(geometry, material);
    this.scene.add(this.floatingParticles);
  }

  update(delta) {
    if (this.floatingParticles) {
      this.floatingParticles.rotation.y += delta * 0.015;
      const positions = this.floatingParticles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] += delta * 0.2;
        if (positions[i] > 18) {
          positions[i] = -4;
        }
      }
      this.floatingParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateShadowBounds(radius) {
    const d = Math.max(12, radius * 1.6);
    const light = this.lights.directional;
    if (light) {
      light.shadow.camera.left = -d;
      light.shadow.camera.right = d;
      light.shadow.camera.top = d;
      light.shadow.camera.bottom = -d;
      light.shadow.camera.updateProjectionMatrix();
    }
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}
