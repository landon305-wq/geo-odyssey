// ---------- Game Configuration ----------
const MAX_LIVES = 3;
const QUESTION_TIME = 20;

// Milestone thresholds mapping to rocket progress percentages
const MILESTONES = [
  { score: 0, pct: 0 },
  { score: 500, pct: 12.5 },
  { score: 1500, pct: 25 },
  { score: 3000, pct: 37.5 },
  { score: 5500, pct: 50 },
  { score: 9000, pct: 62.5 },
  { score: 13000, pct: 75 },
  { score: 20000, pct: 87.5 },
  { score: 30000, pct: 100 }
];

const $ = id => document.getElementById(id);

const BASE = { color: '#38bdf8', weight: 1.2, fillColor: '#1e293b', fillOpacity: 0.95 };
const SELECTED = { color: '#f39c12', weight: 2.5, fillColor: '#f39c12', fillOpacity: 0.95 };
const GOOD = { color: '#27ae60', weight: 2.5, fillColor: '#27ae60', fillOpacity: 0.95 };
const BAD = { color: '#c0392b', weight: 2.5, fillColor: '#c0392b', fillOpacity: 0.95 };

let entries = [], questionsPool = [], currentQuestion = null;
let selectedEntry = null;
let lives = MAX_LIVES, score = 0, locked = false;
let mapInstance = null;
let audioCtx = null;
let questionTimeLeft = QUESTION_TIME;
let questionTimer = null;

let highScore = localStorage.getItem('astro_geo_highscore') || 0;


// ---------- Web Audio Synthesizer ----------

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(type) {
  try {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    if (type === 'blastoff') {
      const bufferSize = audioCtx.sampleRate * 2.0;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(80, now);
      filter.frequency.exponentialRampToValueAtTime(800, now + 1.2);
      filter.frequency.exponentialRampToValueAtTime(40, now + 2.0);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      noise.start(now);
      noise.stop(now + 2.0);

    } else if (type === 'confirm') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(440, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);

    } else if (type === 'correct') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(261.63, now);
      osc.frequency.setValueAtTime(329.63, now + 0.1);
      osc.frequency.setValueAtTime(392.00, now + 0.2);
      osc.frequency.setValueAtTime(523.25, now + 0.3);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);

    } else if (type === 'universe') {
      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(90, now);
      subOsc.frequency.exponentialRampToValueAtTime(30, now + 1.0);

      subOsc.connect(subGain);
      subGain.connect(audioCtx.destination);

      subGain.gain.setValueAtTime(0.45, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      subOsc.start(now);
      subOsc.stop(now + 1.0);

      const lowNotes = [130.81, 164.81, 196.00, 261.63, 329.63];

      lowNotes.forEach((freq, idx) => {
        const t = now + (idx * 0.12);
        const synth = audioCtx.createOscillator();
        const sGain = audioCtx.createGain();

        synth.type = 'triangle';
        synth.frequency.setValueAtTime(freq, t);

        synth.connect(sGain);
        sGain.connect(audioCtx.destination);

        sGain.gain.setValueAtTime(0.2, t);
        sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        synth.start(t);
        synth.stop(t + 0.4);
      });

    } else if (type === 'wrong') {
      [196, 146.83].forEach((frequency, index) => {
        const start = now + index * 0.13;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.10, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(start);
        osc.stop(start + 0.23);
      });
    }

  } catch (e) {}
}


// ---------- Start Game ----------

window.addEventListener('DOMContentLoaded', () => {
  ensureTimerDisplay();

  $('home-highscore').textContent = highScore;

  const startBtn = $('start-btn');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      initAudio();
      playSound('blastoff');
      startGame();
    });
  }
});

function startGame() {
  $('home-screen').classList.add('hidden');
  $('game-screen').classList.add('active');

  if (!mapInstance) {
    initGameEngine();
  } else {
    resetGameState();
    setTimeout(() => mapInstance.invalidateSize(), 100);
  }
}

window.startGame = startGame;


// ---------- Initialize Game Engine ----------

async function initGameEngine() {
  try {
    const geoRes = await fetch('countries.geojson');

    if (!geoRes.ok) throw new Error("Could not load countries.geojson");

    const geo = await geoRes.json();

    mapInstance = L.map('map', {
      minZoom: 1,
      maxZoom: 8,
      worldCopyJump: true,
      maxBounds: [[-90, -180 * 10], [90, 180 * 10]],
      maxBoundsViscosity: 0.5
    }).setView([25, 10], 2);

    const specificMicrostates = [
      'Singapore',
      'Andorra',
      'Liechtenstein',
      'San Marino',
      'Monaco',
      'Vatican',
      'Holy See'
    ];

    L.geoJSON(geo, {
      filter: f => f.properties.CONTINENT !== 'Antarctica',
      style: () => BASE,

      onEachFeature: (f, layer) => {
        const code = f.properties.SU_A3 || f.properties.ADM0_A3 || f.properties.ISO_A3;
        const name = f.properties.ADMIN || f.properties.NAME;
        const subregion = f.properties.SUBREGION || '';
        const continent = f.properties.CONTINENT || '';

        const e = { p: f.properties, name, code, layer };

        entries.push(e);

        const isKiribati = code === 'KIR' || name.toLowerCase().includes('kiribati');

        const isOceaniaIsland =
          !isKiribati &&
          continent === 'Oceania' &&
          (
            subregion.includes('Polynesia') ||
            subregion.includes('Micronesia') ||
            subregion.includes('Melanesia') ||
            f.properties.POP_EST < 1000000
          );

        const isTargetMicrostate = specificMicrostates.some(
          m => name.toLowerCase().includes(m.toLowerCase())
        );

        if ((isOceaniaIsland || isTargetMicrostate) && layer.getBounds) {
          try {
            const center = layer.getBounds().getCenter();
            const bubbleRadius = isTargetMicrostate ? 50000 : 140000;

            const hitBubble = L.circle(center, {
              radius: bubbleRadius,
              color: '#38bdf8',
              weight: 1,
              opacity: 0.4,
              fillColor: '#0284c7',
              fillOpacity: 0.18,
              dashArray: '3, 3'
            }).addTo(mapInstance);

            hitBubble.on('click', () => handleCountryClick(e));

            hitBubble.on('mouseover', () => {
              if (!locked && selectedEntry !== e) {
                layer.setStyle({
                  fillColor: '#334155',
                  color: '#67e8f9',
                  weight: 1.8
                });

                hitBubble.setStyle({
                  fillOpacity: 0.35,
                  opacity: 0.7
                });
              }
            });

            hitBubble.on('mouseout', () => {
              if (!locked && selectedEntry !== e) {
                layer.setStyle(BASE);

                hitBubble.setStyle({
                  fillOpacity: 0.18,
                  opacity: 0.4
                });
              }
            });

          } catch (err) {}
        }

        layer.on('mouseover', () => {
          if (!locked && selectedEntry !== e) {
            layer.setStyle({
              fillColor: '#334155',
              color: '#67e8f9',
              weight: 1.8
            });
          }
        });

        layer.on('mouseout', () => {
          if (!locked && selectedEntry !== e) {
            layer.setStyle(BASE);
          }
        });

        layer.on('click', () => handleCountryClick(e));
      }

    }).addTo(mapInstance);


    // Load question bank
    let bank = null;

    try {
      const bankRes = await fetch('questions.json');

      if (bankRes.ok) {
        bank = await bankRes.json();
      }

    } catch (e) {
      console.warn("Using fallback question bank.");
    }

    if (!bank || !bank.questions) {
      bank = {
        lists: {
          leftDriving: ["GBR", "IRL", "AUS", "NZL", "JPN", "IND", "PAK", "BGD", "ZAF", "KEN", "SGP", "MYS"]
        },

        questions: [
          {
            id: 1,
            category: "Continents",
            prompt: "Click a country in South America",
            rule: { continent: "South America" }
          },
          {
            id: 2,
            category: "Continents",
            prompt: "Click a country in Europe",
            rule: { continent: "Europe" }
          }
        ]
      };
    }

    questionsPool = bank.questions.map(q => {
      const matchingEntries = entries.filter(e => matches(e.p, q.rule, bank.lists));

      return {
        ...q,
        matchingEntries
      };

    }).filter(q => q.matchingEntries.length > 0);

    nextQuestion();

    setTimeout(() => mapInstance.invalidateSize(), 100);

  } catch (err) {
    console.error("Initialization Error:", err);

    if ($('prompt-text')) {
      $('prompt-text').textContent = 'Error loading map geometry.';
    }
  }
}


// ---------- Question Matching ----------

function matches(p, rule, lists) {
  if (rule.continent && p.CONTINENT !== rule.continent) return false;
  if (rule.subregion && p.SUBREGION !== rule.subregion) return false;
  if (rule.popMin && p.POP_EST < rule.popMin) return false;
  if (rule.popMax && p.POP_EST > rule.popMax) return false;

  const countryCode = p.SU_A3 || p.ADM0_A3 || p.ISO_A3;

  if (rule.list && lists && lists[rule.list] && !lists[rule.list].includes(countryCode)) {
    return false;
  }

  return true;
}


// ---------- Reset and Load Questions ----------

function resetGameState(startTimer = true) {
  score = 0;
  lives = MAX_LIVES;

  updateStatus();
  nextQuestion(startTimer);
}

function nextQuestion(startTimer = true) {
  stopQuestionTimer();

  locked = false;
  selectedEntry = null;

  entries.forEach(e => e.layer.setStyle(BASE));

  if (questionsPool.length === 0) return;

  const randomIndex = Math.floor(Math.random() * questionsPool.length);

  currentQuestion = questionsPool[randomIndex];

  if ($('prompt-text')) {
    $('prompt-text').innerHTML = currentQuestion.prompt;
  }

  updateStatus();

  if (startTimer) {
    startQuestionTimer();
  } else {
    questionTimeLeft = QUESTION_TIME;
    updateQuestionTimer();
  }
}


// ---------- Question Timer ----------

function stopQuestionTimer() {
  if (questionTimer) {
    clearInterval(questionTimer);
    questionTimer = null;
  }
}

function ensureTimerDisplay() {
  if ($('question-timer')) return;

  const hud = document.querySelector('.hud');

  if (!hud) return;

  const timer = document.createElement('div');

  timer.id = 'question-timer';
  timer.className = 'hud-item timer-display';
  timer.innerHTML = 'TIME: <span id="timer-val">20</span>s';

  const scoreDisplay = $('score-display');

  if (scoreDisplay && scoreDisplay.parentNode === hud) {
    hud.insertBefore(timer, scoreDisplay);
  } else {
    hud.appendChild(timer);
  }
}

function updateQuestionTimer() {
  ensureTimerDisplay();

  const timerDisplay = $('timer-val');
  const timerContainer = $('question-timer');

  if (timerDisplay) {
    timerDisplay.textContent = questionTimeLeft;
  }

  if (timerContainer) {
    timerContainer.classList.toggle(
      'timer-warning',
      questionTimeLeft <= 5
    );
  }
}

function startQuestionTimer() {
  stopQuestionTimer();

  questionTimeLeft = QUESTION_TIME;
  updateQuestionTimer();

  questionTimer = setInterval(() => {
    if (locked) {
      stopQuestionTimer();
      return;
    }

    questionTimeLeft--;

    updateQuestionTimer();

    if (questionTimeLeft <= 0) {
      handleTimeExpired();
    }

  }, 1000);
}

function handleTimeExpired() {
  if (locked || !currentQuestion) return;

  locked = true;
  stopQuestionTimer();

  selectedEntry = null;

  entries.forEach(e => e.layer.setStyle(BASE));

  lives--;

  updateStatus();
  playSound('wrong');

  if (lives <= 0) {
    showModal(
      "TIME'S UP!",
      `You ran out of time. Final Score: ${score}. Returning to Base.`,
      true,
      true,
      false
    );

  } else {
    showModal(
      "TIME'S UP!",
      'You took too long to answer. Life support compromised!',
      true,
      false,
      false
    );
  }
}


// ---------- Score and Lives ----------

function updateStatus() {
  if ($('lives-val')) {
    $('lives-val').textContent = '❤️'.repeat(Math.max(0, lives));
  }

  if ($('score-val')) {
    $('score-val').textContent = score;
  }

  if (score > highScore) {
    highScore = score;

    localStorage.setItem('astro_geo_highscore', highScore);
  }

  updateRocketTracker();
}

function updateRocketTracker() {
  const rocket = $('rocket-icon');
  const milestones = document.querySelectorAll('.space-track .milestone');

  let currentPct = 0;

  milestones.forEach(m => {
    const targetScore = parseInt(m.getAttribute('data-score'));

    if (score >= targetScore) {
      m.classList.add('achieved');

      const found = MILESTONES.find(ms => ms.score === targetScore);

      if (found) {
        currentPct = found.pct;
      }

    } else {
      m.classList.remove('achieved');
    }
  });

  if (rocket) {
    const trackHeight = 525;
    const pixelTop = (currentPct / 100) * trackHeight;

    rocket.style.top = `${pixelTop}px`;
  }
}


// ---------- Country Selection ----------

function handleCountryClick(e) {
  if (locked || !currentQuestion) return;

  if (selectedEntry !== e) {
    if (selectedEntry) {
      selectedEntry.layer.setStyle(BASE);
    }

    selectedEntry = e;
    selectedEntry.layer.setStyle(SELECTED);

    if ($('prompt-text')) {
      $('prompt-text').innerHTML =
        `${currentQuestion.prompt} <br><span style="font-size: 0.85rem; color: #f39c12;">[Selected: ${e.name} — Click again to Confirm]</span>`;
    }

    return;
  }

  confirmAnswer();
}


// ---------- Confirm Answer ----------

function confirmAnswer() {
  if (!selectedEntry || locked) return;

  locked = true;
  stopQuestionTimer();

  playSound('confirm');

  const e = selectedEntry;

  const isMatch = currentQuestion.matchingEntries.some(
    match => match.code === e.code || match.name === e.name
  );

  if (isMatch) {
    e.layer.setStyle(GOOD);

    // Look up exact rarity from question's explicit rarityMap
    let rarity = 'common';

    if (currentQuestion.rarityMap && currentQuestion.rarityMap[e.code]) {
      rarity = currentQuestion.rarityMap[e.code];

    } else {
      const pop = e.p.POP_EST || 10000000;

      const microstates = [
        'AND', 'LIE', 'SMR', 'MCO', 'VAT',
        'TUV', 'NRU', 'PLW', 'KIR', 'MHL'
      ];

      if (microstates.includes(e.code) || pop < 100000) {
        rarity = 'superRare';
      } else if (pop < 2000000) {
        rarity = 'rare';
      } else if (pop < 15000000) {
        rarity = 'uncommon';
      } else {
        rarity = 'common';
      }
    }

    let points = 50;
    let tierTitle = "🌍 Lunar Answer!";
    let isUniverse = false;

    if (rarity === 'superRare') {
      points = 300;
      tierTitle = "🌠 Cosmic Answer!";
      isUniverse = true;

    } else if (rarity === 'rare') {
      points = 175;
      tierTitle = "🚀 Galactic Answer!";

    } else if (rarity === 'uncommon') {
      points = 100;
      tierTitle = "🪐 Stellar Answer!";

    } else {
      points = 50;
      tierTitle = "🌍 Lunar Answer!";
    }

    score += points;

    updateStatus();

    if (isUniverse) {
      playSound('universe');
    } else {
      playSound('correct');
    }

    showModal(
      tierTitle,
      `Correct! ${e.name} confirmed (+${points} pts)`,
      false,
      false,
      isUniverse
    );

  } else {
    lives--;

    e.layer.setStyle(BAD);

    updateStatus();
    playSound('wrong');

    if (lives <= 0) {
      showModal(
        "CRITICAL FAILURE",
        `Hull breached! Final Score: ${score}. Returning to Base.`,
        true,
        true,
        false
      );

    } else {
      showModal(
        "Hull Impact / Incorrect",
        `${e.name} is off target. Life support compromised!`,
        true,
        false,
        false
      );
    }
  }
}


// ---------- Feedback Modal ----------

function showModal(title, desc, isError = false, isGameOver = false, isUniverse = false) {
  stopQuestionTimer();

  const modal = $('feedback-modal');

  if (!modal) return;

  const modalContent = modal.querySelector('.modal-content');

  modalContent.classList.remove('meteor-shower');

  if (isUniverse) {
    modalContent.classList.add('meteor-shower');
  }

  if ($('feedback-title')) {
    $('feedback-title').innerText = title;
  }

  if ($('feedback-desc')) {
    $('feedback-desc').innerText = desc;
  }

  const btn = $('modal-action-btn');

  if (btn) {
    btn.textContent = isGameOver ? "Return to Home" : "Proceed Mission";

    btn.onclick = () => {
      modal.classList.add('hidden');

      modalContent.classList.remove('meteor-shower');

      if (isGameOver) {
        $('game-screen').classList.remove('active');
        $('home-screen').classList.remove('hidden');
        $('home-highscore').textContent = highScore;

        resetGameState(false);

      } else {
        nextQuestion();
      }
    };
  }

  modal.classList.remove('hidden');
}