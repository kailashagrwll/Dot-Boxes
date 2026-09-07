/**
 * BoardRenderer.js
 * Renders the 3D game board, dots, lines with growth animations, and boxes with elevation springs.
 */
import * as THREE from 'three';
import { PLAYERS } from '../game/Player.js';

export class BoardRenderer {
  constructor(scene) {
    this.scene = scene;
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    // Storage for interactive and visual elements
    this.dots = new Map();         // id -> { mesh, baseScale, targetScale, baseColor, targetColor }
    this.lines = new Map();        // id -> { lineData, visualMesh, hitMesh, state: 'unclaimed'|'growing'|'claimed', animProgress }
    this.boxes = new Map();        // id -> { boxData, mesh, baseY, targetY, currentY, claimed: false, color }
    this.hitMeshes = [];           // Array of hit meshes for raycasting

    // Animation queues
    this.animatingLines = [];
    this.animatingBoxes = [];

    // Materials cache
    this.initSharedMaterials();
  }

  initSharedMaterials() {
    // Dot materials
    this.dotBaseMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x1e293b,
      emissiveIntensity: 0.2,
    });

    // Unclaimed line visual material (subtle track)
    this.unclaimedLineMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.5,
      roughness: 0.5,
      transparent: true,
      opacity: 0.35,
    });

    // Invisible hit area material for raycasting
    this.hitMat = new THREE.MeshBasicMaterial({
      visible: false,
    });

    // Box unclaimed material (sleek dark recessed surface)
    this.boxBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      metalness: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0.6,
    });
  }

  buildBoard(board) {
    this.clear();
    this.board = board;

    const N = board.gridSize;
    const spacing = board.spacing;
    const boardRadius = board.getBoardWorldRadius();

    // 1. Futuristic Base Plinth / Platform
    this.buildBasePlatform(boardRadius, spacing);

    // 2. Build Boxes (3D tiles)
    const boxSize = spacing * 0.94;
    const boxGeo = new THREE.BoxGeometry(boxSize, 0.2, boxSize);

    for (const [id, box] of board.boxes.entries()) {
      const mat = this.boxBaseMat.clone();
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(box.x, -0.1, box.z);
      mesh.receiveShadow = true;
      this.boardGroup.add(mesh);

      this.boxes.set(id, {
        boxData: box,
        mesh,
        baseY: -0.1,
        targetY: -0.1,
        currentY: -0.1,
        claimed: false,
      });
    }

    // 3. Build Lines (Visible track + wide invisible hit mesh)
    const lineRadius = 0.055;       // Visible sleek line
    const hitRadius = 0.38;         // Large 35-50px equivalent hit cylinder

    for (const [id, line] of board.lines.entries()) {
      const dotA = board.dots.find(d => d.id === line.dotA);
      const dotB = board.dots.find(d => d.id === line.dotB);
      if (!dotA || !dotB) continue;

      const posA = new THREE.Vector3(dotA.x, 0.05, dotA.z);
      const posB = new THREE.Vector3(dotB.x, 0.05, dotB.z);
      const dir = new THREE.Vector3().subVectors(posB, posA);
      const length = dir.length();

      // Orientation quaternion (align Y-axis cylinder to direction vector)
      const orientation = new THREE.Quaternion();
      orientation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

      // Visible track mesh (unclaimed)
      const visualGeo = new THREE.CylinderGeometry(lineRadius, lineRadius, length, 16);
      const visualMesh = new THREE.Mesh(visualGeo, this.unclaimedLineMat.clone());
      visualMesh.position.copy(line.center);
      visualMesh.position.y = 0.05;
      visualMesh.quaternion.copy(orientation);
      visualMesh.castShadow = true;
      visualMesh.receiveShadow = true;
      this.boardGroup.add(visualMesh);

      // Invisible hit cylinder for raycasting
      const hitGeo = new THREE.CylinderGeometry(hitRadius, hitRadius, length, 12);
      const hitMesh = new THREE.Mesh(hitGeo, this.hitMat);
      hitMesh.position.copy(visualMesh.position);
      hitMesh.quaternion.copy(orientation);
      hitMesh.userData = { lineId: id };
      this.boardGroup.add(hitMesh);
      this.hitMeshes.push(hitMesh);

      this.lines.set(id, {
        id,
        lineData: line,
        posA,
        posB,
        orientation,
        fullLength: length,
        visualMesh,
        hitMesh,
        state: 'unclaimed',
        isHovered: false,
        animProgress: 0,
      });
    }

    // 4. Build Dots (3D spherical caps / pins)
    const dotRadius = 0.18;
    const dotGeo = new THREE.SphereGeometry(dotRadius, 24, 24);

    for (const dot of board.dots) {
      const mat = this.dotBaseMat.clone();
      const mesh = new THREE.Mesh(dotGeo, mat);
      mesh.position.set(dot.x, 0.08, dot.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.boardGroup.add(mesh);

      // Metallic ring pedestal under dot
      const ringGeo = new THREE.CylinderGeometry(dotRadius * 1.3, dotRadius * 1.4, 0.06, 24);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.9,
        roughness: 0.2,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(dot.x, 0.02, dot.z);
      ringMesh.receiveShadow = true;
      this.boardGroup.add(ringMesh);

      this.dots.set(dot.id, {
        id: dot.id,
        mesh,
        baseScale: 1.0,
        currentScale: 1.0,
        targetScale: 1.0,
        emissiveIntensity: 0.2,
        targetEmissiveIntensity: 0.2,
      });
    }
  }

  buildBasePlatform(boardRadius, spacing) {
    const pad = spacing * 0.85;
    const size = (boardRadius + pad) * 2;
    const thickness = 0.45;

    // Beveled floating platform
    const baseGeo = new THREE.BoxGeometry(size, thickness, size);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f19,
      metalness: 0.8,
      roughness: 0.25,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -thickness / 2 - 0.05;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    this.boardGroup.add(baseMesh);

    // Glowing border frame around platform
    const edgeGeo = new THREE.BoxGeometry(size + 0.06, 0.04, size + 0.06);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.8,
    });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.position.y = 0.01;
    this.boardGroup.add(edgeMesh);
  }

  setLineHover(lineId, isHovered, activePlayer) {
    const line = this.lines.get(lineId);
    if (!line || line.state !== 'unclaimed') return;

    line.isHovered = isHovered;
    const mat = line.visualMesh.material;

    if (isHovered) {
      const color = activePlayer ? activePlayer.colorHex : 0x00d2ff;
      mat.color.setHex(color);
      mat.emissive = new THREE.Color(color);
      mat.emissiveIntensity = 0.85;
      mat.opacity = 0.95;
      line.visualMesh.scale.set(1.4, 1.0, 1.4);

      // React connected dots
      this.setDotHover(line.lineData.dotA, true, color);
      this.setDotHover(line.lineData.dotB, true, color);
    } else {
      mat.color.setHex(0x1e293b);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.opacity = 0.35;
      line.visualMesh.scale.set(1.0, 1.0, 1.0);

      // Reset connected dots
      this.setDotHover(line.lineData.dotA, false);
      this.setDotHover(line.lineData.dotB, false);
    }
  }

  setDotHover(dotId, isHovered, colorHex) {
    const dot = this.dots.get(dotId);
    if (!dot) return;

    if (isHovered) {
      dot.targetScale = 1.35;
      dot.targetEmissiveIntensity = 1.2;
      dot.mesh.material.emissive.setHex(colorHex || 0x00d2ff);
    } else {
      dot.targetScale = 1.0;
      dot.targetEmissiveIntensity = 0.2;
      dot.mesh.material.emissive.setHex(0x1e293b);
    }
  }

  animateLineClaim(lineId, player, onComplete) {
    const line = this.lines.get(lineId);
    if (!line) {
      if (onComplete) onComplete();
      return;
    }

    line.state = 'growing';
    line.isHovered = false;

    // Switch to active player's glowing material
    const playerMat = new THREE.MeshStandardMaterial({
      color: player.colorHex,
      metalness: 0.3,
      roughness: 0.15,
      emissive: player.colorHex,
      emissiveIntensity: 0.7,
    });
    line.visualMesh.material.dispose();
    line.visualMesh.material = playerMat;
    line.visualMesh.scale.set(1.15, 1.0, 1.15);

    // Disable its hit mesh so it can no longer be raycast
    const hitIdx = this.hitMeshes.indexOf(line.hitMesh);
    if (hitIdx !== -1) {
      this.hitMeshes.splice(hitIdx, 1);
    }

    // Smooth growth animation from dot A toward dot B (approx 220ms)
    this.animatingLines.push({
      line,
      player,
      elapsed: 0,
      duration: 0.22, // 220 ms
      onComplete,
    });
  }

  animateBoxClaim(boxId, player, onComplete) {
    const box = this.boxes.get(boxId);
    if (!box) {
      if (onComplete) onComplete();
      return;
    }

    box.claimed = true;
    box.targetY = 0.08; // Raise tile upwards

    // Replace material with glowing player tile
    const claimedMat = new THREE.MeshStandardMaterial({
      color: player.boxColorHex,
      metalness: 0.4,
      roughness: 0.2,
      emissive: player.colorHex,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.0,
    });

    box.mesh.material.dispose();
    box.mesh.material = claimedMat;

    this.animatingBoxes.push({
      box,
      player,
      elapsed: 0,
      duration: 0.35, // 350 ms
      onComplete,
    });
  }

  update(delta) {
    // 1. Update line growth animations
    for (let i = this.animatingLines.length - 1; i >= 0; i--) {
      const anim = this.animatingLines[i];
      anim.elapsed += delta;
      const t = Math.min(1.0, anim.elapsed / anim.duration);
      // Ease out cubic
      const progress = 1 - Math.pow(1 - t, 3);

      const line = anim.line;
      const currentLength = Math.max(0.01, line.fullLength * progress);

      // Current center during growth from posA to posB
      const dir = new THREE.Vector3().subVectors(line.posB, line.posA).normalize();
      const currentEnd = new THREE.Vector3().addVectors(line.posA, dir.clone().multiplyScalar(currentLength));
      const currentCenter = new THREE.Vector3().addVectors(line.posA, currentEnd).multiplyScalar(0.5);

      line.visualMesh.position.copy(currentCenter);
      line.visualMesh.scale.set(1.2, progress, 1.2);

      if (t >= 1.0) {
        // Finalize line
        line.state = 'claimed';
        line.visualMesh.position.copy(line.lineData.center);
        line.visualMesh.position.y = 0.05;
        line.visualMesh.scale.set(1.2, 1.0, 1.2);

        if (anim.onComplete) anim.onComplete();
        this.animatingLines.splice(i, 1);
      }
    }

    // 2. Update box claim animations
    for (let i = this.animatingBoxes.length - 1; i >= 0; i--) {
      const anim = this.animatingBoxes[i];
      anim.elapsed += delta;
      const t = Math.min(1.0, anim.elapsed / anim.duration);
      // Spring bounce easing
      const bounce = Math.sin(t * Math.PI);

      const box = anim.box;
      box.mesh.position.y = box.baseY + (box.targetY - box.baseY) * t + bounce * 0.06;
      box.mesh.material.opacity = Math.min(0.9, t * 0.9);
      box.mesh.material.emissiveIntensity = 0.3 + bounce * 0.5;

      if (t >= 1.0) {
        box.mesh.position.y = box.targetY;
        box.mesh.material.opacity = 0.9;
        box.mesh.material.emissiveIntensity = 0.35;
        if (anim.onComplete) anim.onComplete();
        this.animatingBoxes.splice(i, 1);
      }
    }

    // 3. Update dot hover scaling
    const dotDamping = 1.0 - Math.exp(-15 * delta);
    for (const dot of this.dots.values()) {
      dot.currentScale += (dot.targetScale - dot.currentScale) * dotDamping;
      dot.mesh.scale.setScalar(dot.currentScale);
      dot.emissiveIntensity += (dot.targetEmissiveIntensity - dot.emissiveIntensity) * dotDamping;
      dot.mesh.material.emissiveIntensity = dot.emissiveIntensity;
    }
  }

  clear() {
    // Clear all line & box animations
    this.animatingLines = [];
    this.animatingBoxes = [];
    this.hitMeshes = [];

    // Dispose meshes
    while (this.boardGroup.children.length > 0) {
      const child = this.boardGroup.children[0];
      this.boardGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    this.dots.clear();
    this.lines.clear();
    this.boxes.clear();
  }
}
