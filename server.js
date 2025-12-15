const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques du dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));

// État du jeu en mémoire (pour ce démo)
const rooms = {};

io.on('connection', (socket) => {
  console.log('Un utilisateur connecté:', socket.id);

  // --- TEACHER EVENTS ---
  
  socket.on('create-room', ({ room, quiz }) => {
    rooms[room] = {
      quiz: quiz,
      currentQuestionIndex: -1,
      players: [],
      answers: {} // Stocke les réponses pour la question en cours
    };
    socket.join(room);
    console.log(`Salle créée: ${room}`);
  });

  socket.on('start-game', (room) => {
    if(rooms[room]) {
      rooms[room].currentQuestionIndex = 0;
      io.to(room).emit('game-started');
      sendQuestion(room);
    }
  });

  socket.on('next-question', (room) => {
    if(rooms[room]) {
      rooms[room].currentQuestionIndex++;
      if(rooms[room].currentQuestionIndex < rooms[room].quiz.questions.length){
        sendQuestion(room);
      } else {
        finishGame(room);
      }
    }
  });

  socket.on('end-game', (room) => {
    finishGame(room);
  });

  // --- STUDENT EVENTS ---

  socket.on('join-room', ({ room, name }) => {
    if(rooms[room]) {
      socket.join(room);
      const player = { id: socket.id, name, score: 0 };
      rooms[room].players.push(player);
      
      // Notifier le prof
      io.to(room).emit('player-joined', rooms[room].players.map(p => p.name));
      console.log(`${name} a rejoint ${room}`);
    } else {
      socket.emit('error', 'Salle introuvable');
    }
  });

  socket.on('submit-answer', ({ room, answerIdx }) => {
    const r = rooms[room];
    if(r) {
        const qIdx = r.currentQuestionIndex;
        const q = r.quiz.questions[qIdx];
        
        // Vérifier si correct
        if(q.correct == answerIdx) {
            const player = r.players.find(p => p.id === socket.id);
            if(player) player.score += 10;
        }

        // Stats pour le prof
        if(!r.answers[answerIdx]) r.answers[answerIdx] = 0;
        r.answers[answerIdx]++;
        
        // Update prof view live
        io.to(room).emit('update-teacher-view', {
            question: q,
            index: qIdx,
            stats: r.answers
        });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    // Gestion propre des déconnexions à ajouter pour une V5
  });
});

function sendQuestion(room){
  const r = rooms[room];
  const q = r.quiz.questions[r.currentQuestionIndex];
  r.answers = {}; // Reset answers stats
  
  // Envoyer la question aux élèves (sans la réponse correcte !)
  io.to(room).emit('new-question', {
    question: q.question,
    answers: q.answers
  });
  
  // Envoyer au prof
  io.to(room).emit('update-teacher-view', {
    question: q,
    index: r.currentQuestionIndex,
    stats: {}
  });
}

function finishGame(room){
    if(rooms[room]){
        // Trier par score
        const results = rooms[room].players.sort((a,b) => b.score - a.score);
        io.to(room).emit('game-ended', results);
        delete rooms[room]; // Nettoyage
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});