/**
 * Player.js
 * Player definitions, color themes (3D hex and CSS), and helper constants.
 */
export const PLAYERS = {
  P1: {
    id: 'p1',
    name: 'Player 1',
    colorHex: 0x00d2ff,      // Electric cyan / blue for Three.js
    colorCss: '#00d2ff',
    glowColorHex: 0x0099ff,
    accentCss: 'rgba(0, 210, 255, 0.3)',
    boxColorHex: 0x0077b6,
    boxColorCss: '#0077b6',
  },
  P2: {
    id: 'p2',
    name: 'Player 2',
    colorHex: 0xff2a5f,      // Vibrant neon crimson / red for Three.js
    colorCss: '#ff2a5f',
    glowColorHex: 0xff0044,
    accentCss: 'rgba(255, 42, 95, 0.3)',
    boxColorHex: 0x9e0031,
    boxColorCss: '#9e0031',
  }
};

export class Player {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.colorHex = config.colorHex;
    this.colorCss = config.colorCss;
    this.glowColorHex = config.glowColorHex;
    this.accentCss = config.accentCss;
    this.boxColorHex = config.boxColorHex;
    this.boxColorCss = config.boxColorCss;
  }
}
