import { Board } from '../src/game/Board.js';
import { Game } from '../src/game/Game.js';
import { GameState } from '../src/game/GameState.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('--- Testing Board Topology ---');
const board3 = new Board(3, 2.0);
assert(board3.dots.length === 9, '3x3 grid has 9 dots');
assert(board3.boxes.size === 4, '3x3 grid has 4 boxes (2x2)');
assert(board3.lines.size === 12, '3x3 grid has 12 lines (3*2 + 2*3)');

const board5 = new Board(5, 2.0);
assert(board5.dots.length === 25, '5x5 grid has 25 dots');
assert(board5.boxes.size === 16, '5x5 grid has 16 boxes (4x4)');
assert(board5.lines.size === 40, '5x5 grid has 40 lines (5*4 + 4*5)');

const board10 = new Board(10, 2.0);
assert(board10.boxes.size === 81, '10x10 grid has 81 boxes');

console.log('\n--- Testing Game Rules & Box Completion ---');
const game = new Game({ gridSize: 3, spacing: 2.0 });
game.start(3);

assert(game.getCurrentPlayerId() === 'p1', 'Game starts with Player 1');

// Box 0_0 has lines: h_0_0 (top), h_1_0 (bottom), v_0_0 (left), v_0_1 (right)
// P1 claims h_0_0
let res1 = game.claimLine('h_0_0');
assert(res1.completedBoxes.length === 0, 'No box completed on 1st line');
assert(game.getCurrentPlayerId() === 'p2', 'Turn passed to Player 2');

// P2 claims v_0_0
let res2 = game.claimLine('v_0_0');
assert(res2.completedBoxes.length === 0, 'No box completed on 2nd line');
assert(game.getCurrentPlayerId() === 'p1', 'Turn passed to Player 1');

// P1 claims h_1_0
let res3 = game.claimLine('h_1_0');
assert(res3.completedBoxes.length === 0, 'No box completed on 3rd line');
assert(game.getCurrentPlayerId() === 'p2', 'Turn passed to Player 2');

// P2 claims v_0_1 -> completes box_0_0!
let res4 = game.claimLine('v_0_1');
assert(res4.completedBoxes.length === 1, 'Box completed on 4th line!');
assert(res4.completedBoxes[0].boxId === 'box_0_0', 'box_0_0 completed');
assert(res4.isExtraTurn === true, 'Player 2 gets an EXTRA turn');
assert(game.getCurrentPlayerId() === 'p2', 'Player 2 retains turn for extra move');
assert(game.getScores().p2 === 1, 'Player 2 score is 1');
assert(game.getScores().p1 === 0, 'Player 1 score is 0');

console.log('\n--- Testing Double Box Completion ---');
// In a 3x3 board, consider line between box_0_1 and box_1_1, or line shared by two adjacent boxes.
// v_0_1 was already claimed.
// Let's create a new fresh game to test a shared line completing 2 boxes simultaneously:
const doubleGame = new Game({ gridSize: 3 });
doubleGame.start(3);
// Box 0,0 and Box 0,1 share vertical line v_0_1
// Box 0,0 needs h_0_0, h_1_0, v_0_0
// Box 0,1 needs h_0_1, h_1_1, v_0_2
// Claim the 6 outer lines first:
doubleGame.claimLine('h_0_0'); // p1
doubleGame.claimLine('h_1_0'); // p2
doubleGame.claimLine('v_0_0'); // p1
doubleGame.claimLine('h_0_1'); // p2
doubleGame.claimLine('h_1_1'); // p1
doubleGame.claimLine('v_0_2'); // p2
// Now both Box 0,0 and Box 0,1 are 3-sided!
// Next move is p1 claiming shared line v_0_1:
assert(doubleGame.getCurrentPlayerId() === 'p1', 'Player 1 is active');
let doubleRes = doubleGame.claimLine('v_0_1');
assert(doubleRes.completedBoxes.length === 2, 'Shared line completed 2 boxes simultaneously!');
assert(doubleGame.getScores().p1 === 2, 'Player 1 scored +2 points');
assert(doubleRes.isExtraTurn === true, 'Player 1 gets extra turn');
assert(doubleGame.getCurrentPlayerId() === 'p1', 'Player 1 retains turn');

console.log('\n--- Testing Full Game Completion & Winner ---');
// Complete remaining lines on doubleGame
doubleGame.claimLine('v_1_0'); // p1
doubleGame.claimLine('v_1_1'); // p2
doubleGame.claimLine('v_1_2'); // p1
doubleGame.claimLine('h_2_0'); // p2
let finalMove = doubleGame.claimLine('h_2_1'); // p1 completes remaining boxes
assert(doubleGame.state.status === 'gameover', 'Game status is gameover when all 4 boxes claimed');
assert(doubleGame.state.winner !== null, `Winner determined: ${doubleGame.state.winner}`);

console.log('\n--- Testing Consecutive Win Streaks (Play Again) ---');
const streakGame = new Game({ gridSize: 3 });
streakGame.start(3);
// Let P1 win first match
streakGame.state.scores = { p1: 3, p2: 1 };
streakGame.state.claimedBoxes = new Map([['b1',{}],['b2',{}],['b3',{}],['b4',{}]]);
streakGame.state.checkGameOver(4);
assert(streakGame.getStreaks().p1 === 1, 'P1 has 1 win streak after 1st victory');

// Player chooses "Play Again" -> preserveStreak = true
streakGame.start(3, true);
assert(streakGame.getStreaks().p1 === 1, 'P1 streak preserved when starting new match with play again');
assert(streakGame.state.scores.p1 === 0 && streakGame.state.scores.p2 === 0, 'Scores reset for new match');

// P1 wins second consecutive match
streakGame.state.scores = { p1: 4, p2: 0 };
streakGame.state.claimedBoxes = new Map([['b1',{}],['b2',{}],['b3',{}],['b4',{}]]);
streakGame.state.checkGameOver(4);
assert(streakGame.getStreaks().p1 === 2, 'P1 has 2 consecutive win streak!');

// Player chooses "Play Again" again
streakGame.start(3, true);
assert(streakGame.getStreaks().p1 === 2, 'Streak still 2 at start of 3rd game');

// P2 wins 3rd match -> breaks P1 streak and starts P2 streak
streakGame.state.scores = { p1: 1, p2: 3 };
streakGame.state.claimedBoxes = new Map([['b1',{}],['b2',{}],['b3',{}],['b4',{}]]);
streakGame.state.checkGameOver(4);
assert(streakGame.getStreaks().p1 === 0, 'P1 streak reset on loss');
assert(streakGame.getStreaks().p2 === 1, 'P2 starts 1 win streak');

// New Game (not play again) -> preserveStreak = false
streakGame.start(3, false);
assert(streakGame.getStreaks().p2 === 0, 'All streaks reset on New Game');

console.log('\n🎉 ALL LOGIC, RULES, AND WIN STREAK TESTS PASSED PERFECTLY!');
