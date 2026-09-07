/**
 * RoomManager.js
 * Registry for active game rooms and human-friendly room code generation.
 */
import { GameRoom } from './GameRoom.js';

// Unambiguous characters for easy typing on mobile and desktop
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> GameRoom
  }

  generateRoomCode() {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        const idx = Math.floor(Math.random() * CODE_CHARS.length);
        code += CODE_CHARS[idx];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId, hostSessionToken) {
    const roomId = this.generateRoomCode();
    const room = new GameRoom(
      roomId,
      hostSocketId,
      hostSessionToken,
      this.io,
      (id) => this.removeRoom(id)
    );
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId.toUpperCase().trim()) || null;
  }

  removeRoom(roomId) {
    const id = roomId.toUpperCase().trim();
    const room = this.rooms.get(id);
    if (room) {
      this.rooms.delete(id);
    }
  }

  getStats() {
    return {
      activeRooms: this.rooms.size,
    };
  }
}
