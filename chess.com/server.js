const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function ensureRoom(id) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      chess: new Chess(),
      players: {}, // socketId -> 'w' | 'b' | 'spectator'
      sockets: new Set()
    });
  }
  return rooms.get(id);
}

io.on('connection', (socket) => {
  socket.on('join', ({ room }) => {
    const st = ensureRoom(room);
    socket.join(room);
    st.sockets.add(socket.id);

    const colors = Object.values(st.players);
    if (!colors.includes('w')) st.players[socket.id] = 'w';
    else if (!colors.includes('b')) st.players[socket.id] = 'b';
    else st.players[socket.id] = 'spectator';

    socket.emit('state', {
      fen: st.chess.fen(),
      turn: st.chess.turn()
    });

    io.to(room).emit('room-info', {
      players: st.players
    });
  });

  socket.on('try-move', ({ room, from, to }) => {
    const st = rooms.get(room);
    if (!st) return;
    const myColor = st.players[socket.id];
    if (myColor === 'spectator' || myColor !== st.chess.turn()) return;

    const mv = st.chess.move({ from, to, promotion: 'q' });
    if (!mv) return;

    io.to(room).emit('state', {
      fen: st.chess.fen(),
      lastMove: mv,
      turn: st.chess.turn()
    });

    if (st.chess.isCheckmate()) {
      io.to(room).emit('game-over', { winner: myColor });
    }
  });

  socket.on('disconnect', () => {
    for (const [room, st] of rooms.entries()) {
      if (st.sockets.has(socket.id)) {
        st.sockets.delete(socket.id);
        delete st.players[socket.id];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`ManoChess running at http://localhost:${PORT}`);
});
