/**
 * SocketClient.js
 * Manages Socket.IO connection, session persistence, and typed network events.
 */
import { io } from 'socket.io-client';

export class SocketClient {
  constructor() {
    this.socket = null;
    this.serverUrl = import.meta.env.VITE_SERVER_URL ||
      (window.location.port === '3000'
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin);
    this.sessionToken = this.getOrCreateSessionToken();
    this.connected = false;
    this.eventListeners = new Map();
  }

  getOrCreateSessionToken() {
    let token = sessionStorage.getItem('dots_session_token');
    if (!token) {
      token = 'usr_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      sessionStorage.setItem('dots_session_token', token);
    }
    return token;
  }

  connect() {
    if (this.socket && this.socket.connected) {
      return Promise.resolve(this.socket);
    }

    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve(this.socket);
      });

      this.socket.on('connect_error', (err) => {
        console.warn('Socket connection error:', err.message);
        // Do not reject immediately on reconnect attempts
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
      });
    });
  }

  createRoom() {
    return new Promise((resolve, reject) => {
      this.connect().then(() => {
        this.socket.emit('CREATE_ROOM', { sessionToken: this.sessionToken }, (response) => {
          if (response?.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Failed to create room'));
          }
        });
      }).catch(reject);
    });
  }

  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      this.connect().then(() => {
        this.socket.emit('JOIN_ROOM', {
          roomId: roomId.toUpperCase().trim(),
          sessionToken: this.sessionToken,
        }, (response) => {
          if (response?.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Failed to join room'));
          }
        });
      }).catch(reject);
    });
  }

  setReady(isReady) {
    return new Promise((resolve) => {
      this.socket?.emit('SET_READY', { isReady }, resolve);
    });
  }

  setBoardSize(size) {
    return new Promise((resolve, reject) => {
      this.socket?.emit('SET_BOARD_SIZE', { size }, (res) => {
        if (res?.success) resolve(res);
        else reject(new Error(res?.error || 'Failed to change size'));
      });
    });
  }

  makeMove(lineId) {
    return new Promise((resolve, reject) => {
      this.socket?.emit('MAKE_MOVE', { lineId }, (res) => {
        if (res?.success) resolve(res.moveData);
        else reject(new Error(res?.error || 'Move rejected'));
      });
    });
  }

  requestRematch() {
    return new Promise((resolve) => {
      this.socket?.emit('REMATCH_REQUEST', { sessionToken: this.sessionToken }, resolve);
    });
  }

  leaveRoom() {
    this.socket?.emit('LEAVE_ROOM');
  }

  on(event, callback) {
    if (!this.socket) this.connect();
    this.socket?.on(event, callback);
  }

  off(event, callback) {
    this.socket?.off(event, callback);
  }
}
