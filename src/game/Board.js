/**
 * Board.js
 * Mathematical representation of the Dots and Boxes grid.
 * Pure logic: grid layout, line topology, adjacent box relations.
 */
export class Board {
  constructor(gridSize = 5, spacing = 2.0) {
    this.gridSize = Math.max(3, Math.min(12, gridSize));
    this.spacing = spacing;
    this.dots = [];
    this.lines = new Map();
    this.boxes = new Map();

    this.initTopology();
  }

  initTopology() {
    const N = this.gridSize;
    const offset = ((N - 1) * this.spacing) / 2;

    // 1. Generate Dots
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const id = `dot_${r}_${c}`;
        const x = c * this.spacing - offset;
        const z = r * this.spacing - offset;
        this.dots.push({ id, r, c, x, y: 0, z });
      }
    }

    // 2. Generate Boxes
    const numBoxRows = N - 1;
    const numBoxCols = N - 1;

    for (let br = 0; br < numBoxRows; br++) {
      for (let bc = 0; bc < numBoxCols; bc++) {
        const id = `box_${br}_${bc}`;
        // Center position of box
        const x = (bc + 0.5) * this.spacing - offset;
        const z = (br + 0.5) * this.spacing - offset;

        // 4 boundary lines
        const top = `h_${br}_${bc}`;
        const bottom = `h_${br + 1}_${bc}`;
        const left = `v_${br}_${bc}`;
        const right = `v_${br}_${bc + 1}`;

        this.boxes.set(id, {
          id,
          br,
          bc,
          x,
          z,
          lines: [top, bottom, left, right],
        });
      }
    }

    // 3. Generate Horizontal Lines
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N - 1; c++) {
        const id = `h_${r}_${c}`;
        const dotA = `dot_${r}_${c}`;
        const dotB = `dot_${r}_${c + 1}`;

        const adjBoxes = [];
        if (r > 0) adjBoxes.push(`box_${r - 1}_${c}`);      // Box above
        if (r < N - 1) adjBoxes.push(`box_${r}_${c}`);      // Box below

        const x = (c + 0.5) * this.spacing - offset;
        const z = r * this.spacing - offset;

        this.lines.set(id, {
          id,
          type: 'h',
          r,
          c,
          dotA,
          dotB,
          adjBoxes,
          center: { x, y: 0, z },
          length: this.spacing,
        });
      }
    }

    // 4. Generate Vertical Lines
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N; c++) {
        const id = `v_${r}_${c}`;
        const dotA = `dot_${r}_${c}`;
        const dotB = `dot_${r + 1}_${c}`;

        const adjBoxes = [];
        if (c > 0) adjBoxes.push(`box_${r}_${c - 1}`);      // Box left
        if (c < N - 1) adjBoxes.push(`box_${r}_${c}`);      // Box right

        const x = c * this.spacing - offset;
        const z = (r + 0.5) * this.spacing - offset;

        this.lines.set(id, {
          id,
          type: 'v',
          r,
          c,
          dotA,
          dotB,
          adjBoxes,
          center: { x, y: 0, z },
          length: this.spacing,
        });
      }
    }
  }

  getDot(r, c) {
    const N = this.gridSize;
    return this.dots[r * N + c];
  }

  getLine(id) {
    return this.lines.get(id);
  }

  getBox(id) {
    return this.boxes.get(id);
  }

  getTotalBoxesCount() {
    return (this.gridSize - 1) * (this.gridSize - 1);
  }

  getTotalLinesCount() {
    const N = this.gridSize;
    return N * (N - 1) + (N - 1) * N;
  }

  getBoardWorldRadius() {
    return ((this.gridSize - 1) * this.spacing) / 2;
  }
}
