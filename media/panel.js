// ErrorBuddy panel. Displays ToPanel messages and sends FromPanel messages (see src/types.ts).
(function () {
  'use strict';

  var AVATARS = {
    pirate: '🏴‍☠️',
    sportscaster: '🎙️',
    parent: '😔',
    shakespeare: '🎭',
    narrator: '🦎'
  };
  var IDLE_AVATAR = '😌';
  var IDLE_TEXT = 'No errors. Suspiciously quiet…';
  var TOAST_MS = 4000;
  // How long a celebration stays up before an 'idle' message is allowed to replace it.
  var CELEBRATION_MS = 4000;

  var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

  var el = {
    personality: document.getElementById('personality'),
    streak: document.getElementById('streak'),
    streakCount: document.getElementById('streakCount'),
    scene: document.getElementById('scene'),
    banner: document.getElementById('legendaryBanner'),
    avatar: document.getElementById('avatar'),
    bubbleText: document.getElementById('bubbleText'),
    typing: document.getElementById('typing'),
    errorMeta: document.getElementById('errorMeta'),
    explainBox: document.getElementById('explainBox'),
    explanation: document.getElementById('explanation'),
    fixBox: document.getElementById('fixBox'),
    fixList: document.getElementById('fixList'),
    jumpBtn: document.getElementById('jumpBtn'),
    toasts: document.getElementById('toasts'),
    mockBar: document.getElementById('mockBar'),
    mockTheme: document.getElementById('mockTheme')
  };

  var jumpTarget = null;      // { file, line } for the "Go to line" button
  var shownErrorId = null;    // error the avatar last bounced in for
  var lastAvatar = IDLE_AVATAR;
  var celebrationEndsAt = 0;
  var idleTimer = 0;
  var toastQueue = [];
  var toastShowing = false;

  function send(msg) {
    if (vscode) {
      vscode.postMessage(msg);
    } else {
      console.log('[ErrorBuddy → extension]', msg);
    }
  }

  // ---------- Small helpers ----------

  function restartAnimation(node, className) {
    node.classList.remove(className);
    void node.offsetWidth; // force a reflow so the animation replays
    node.classList.add(className);
  }

  // Shows `backticked` words as code. Builds nodes instead of HTML, so AI text can't inject markup.
  function setRichText(node, text) {
    node.textContent = '';
    String(text == null ? '' : text).split('`').forEach(function (part, i) {
      if (!part) {
        return;
      }
      if (i % 2 === 1) {
        var code = document.createElement('code');
        code.textContent = part;
        node.appendChild(code);
      } else {
        node.appendChild(document.createTextNode(part));
      }
    });
  }

  function setScene(name, legendary) {
    el.scene.className = 'scene is-' + name + (legendary ? ' is-legendary' : '');
    el.banner.hidden = !legendary;
  }

  function setAvatar(personality) {
    lastAvatar = AVATARS[personality] || lastAvatar;
    el.avatar.textContent = lastAvatar;
  }

  function setBubble(text) {
    el.typing.hidden = true;
    el.bubbleText.hidden = false;
    setRichText(el.bubbleText, text);
  }

  function setErrorMeta(error) {
    if (error && error.fileName) {
      el.errorMeta.textContent = error.fileName + ' · line ' + error.line;
      el.errorMeta.hidden = false;
    } else {
      el.errorMeta.hidden = true;
    }
  }

  function hideBoxes() {
    el.explainBox.hidden = true;
    el.fixBox.hidden = true;
    jumpTarget = null;
  }

  function bounceForNewError(error) {
    var id = error && error.id;
    if (id !== shownErrorId) {
      shownErrorId = id;
      el.avatar.classList.remove('bounce');
      restartAnimation(el.avatar, 'bounce');
    }
  }

  function setStreak(streak, pop) {
    var count = Math.max(0, Number(streak) || 0);
    var changed = String(count) !== el.streakCount.textContent;
    el.streakCount.textContent = String(count);
    el.streak.classList.toggle('is-zero', count === 0);
    if (pop && (changed || count > 0)) {
      restartAnimation(el.streakCount, 'pop');
    }
  }

  function cancelPendingIdle() {
    if (idleTimer) {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    }
  }

  // ---------- Message handlers ----------

  function showThinking(msg) {
    cancelPendingIdle();
    celebrationEndsAt = 0;
    setScene('thinking', false);
    setAvatar(msg.personality);
    bounceForNewError(msg.error);
    el.bubbleText.hidden = true;
    el.typing.hidden = false;
    setErrorMeta(msg.error);
    hideBoxes();
  }

  function showResponse(msg) {
    var response = msg.response;
    var error = msg.error;
    cancelPendingIdle();
    celebrationEndsAt = 0;

    setScene('response', !!response.legendary);
    setAvatar(response.personality);
    bounceForNewError(error);
    setBubble(response.reaction);
    setErrorMeta(error);

    setRichText(el.explanation, response.explanation);
    el.explainBox.hidden = false;

    el.fixList.textContent = '';
    (response.fix || []).forEach(function (step) {
      var li = document.createElement('li');
      setRichText(li, step);
      el.fixList.appendChild(li);
    });

    var line = response.line || error.line;
    jumpTarget = { file: error.file, line: line };
    el.jumpBtn.textContent = 'Go to line ' + line;
    el.fixBox.hidden = false;
  }

  function showFixed(msg) {
    cancelPendingIdle();
    celebrationEndsAt = Date.now() + CELEBRATION_MS;
    shownErrorId = null;
    setScene('fixed', false);
    el.avatar.classList.remove('bounce');
    el.avatar.textContent = lastAvatar;
    setBubble('🎉 ' + msg.celebration);
    el.errorMeta.hidden = true;
    hideBoxes();
    setStreak(msg.streak, true);
    if (window.ErrorBuddyConfetti) {
      window.ErrorBuddyConfetti.fire();
    }
  }

  function showIdleNow() {
    idleTimer = 0;
    celebrationEndsAt = 0;
    shownErrorId = null;
    setScene('idle', false);
    el.avatar.classList.remove('bounce');
    el.avatar.textContent = IDLE_AVATAR;
    setBubble(IDLE_TEXT);
    el.errorMeta.hidden = true;
    hideBoxes();
  }

  // 'idle' usually arrives right after 'fixed'. Let the celebration finish first.
  function showIdle() {
    cancelPendingIdle();
    var wait = celebrationEndsAt - Date.now();
    if (wait > 0) {
      idleTimer = window.setTimeout(showIdleNow, wait);
    } else {
      showIdleNow();
    }
  }

  function applyState(state) {
    if (!state) {
      return;
    }
    if (state.personality) {
      el.personality.value = state.personality;
    }
    setStreak(state.streak, false);
  }

  // ---------- Achievement toasts (one at a time, 4 seconds each) ----------

  function showNextToast() {
    var achievement = toastQueue.shift();
    if (!achievement) {
      toastShowing = false;
      return;
    }
    toastShowing = true;

    var toast = document.createElement('div');
    toast.className = 'toast';

    var emoji = document.createElement('div');
    emoji.className = 'toast-emoji';
    emoji.textContent = achievement.emoji || '🏆';

    var body = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'toast-title';
    title.textContent = '🏆 Unlocked: ' + achievement.title;
    body.appendChild(title);
    if (achievement.description) {
      var desc = document.createElement('div');
      desc.className = 'toast-desc';
      desc.textContent = achievement.description;
      body.appendChild(desc);
    }

    toast.appendChild(emoji);
    toast.appendChild(body);
    el.toasts.appendChild(toast);

    window.setTimeout(function () {
      toast.classList.add('leaving');
      window.setTimeout(function () {
        toast.remove();
        showNextToast();
      }, 300);
    }, TOAST_MS);
  }

  function queueToast(achievement) {
    if (!achievement) {
      return;
    }
    toastQueue.push(achievement);
    if (!toastShowing) {
      showNextToast();
    }
  }

  // ---------- Wiring ----------

  function handle(msg) {
    if (!msg || typeof msg.type !== 'string') {
      return;
    }
    switch (msg.type) {
      case 'thinking':
        showThinking(msg);
        break;
      case 'response':
        showResponse(msg);
        break;
      case 'fixed':
        showFixed(msg);
        break;
      case 'achievement':
        queueToast(msg.achievement);
        break;
      case 'state':
        applyState(msg.state);
        break;
      case 'idle':
        showIdle();
        break;
    }
  }

  window.addEventListener('message', function (event) {
    handle(event.data);
  });

  el.personality.addEventListener('change', function () {
    send({ type: 'setPersonality', personality: el.personality.value });
  });

  el.jumpBtn.addEventListener('click', function () {
    if (jumpTarget) {
      send({ type: 'jumpToLine', file: jumpTarget.file, line: jumpTarget.line });
    }
  });

  setStreak(0, false);
  send({ type: 'ready' });

  // ---------- Mock mode: open panel.html?mock in a browser ----------

  function startMock() {
    var REAL = ['pirate', 'sportscaster', 'parent', 'shakespeare', 'narrator'];
    var streak = 3;

    var error = {
      id: 'C:/demo/broken.js::userName is not defined',
      file: 'C:/demo/broken.js',
      fileName: 'broken.js',
      line: 12,
      column: 15,
      message: "'userName' is not defined.",
      code: '2304',
      language: 'javascript',
      snippet: '11 | function greet() {\n12 |   console.log(userName);\n13 | }'
    };
    var legendaryError = {
      id: 'C:/demo/broken.js::Type mismatch of doom',
      file: 'C:/demo/broken.js',
      fileName: 'broken.js',
      line: 40,
      column: 3,
      message: 'Argument of type "{ a: string; b: number; }" is not assignable to parameter of type …',
      code: '2345',
      language: 'javascript',
      snippet: '40 |   launch({ a: "one", b: 2 });'
    };

    var REACTIONS = {
      pirate: "Arrr! Ye be callin' for `userName`, but no such sailor be aboard this ship!",
      sportscaster: "OH! `userName` steps up to the line and… nobody's there! What a fumble, folks!",
      parent: "I'm not angry about `userName`. I'm just… disappointed. We talked about this.",
      shakespeare: 'O `userName`, `userName`! Wherefore art thou undefined?',
      narrator: 'Here we observe the developer, calling out to `userName`. Sadly, it was never born.'
    };
    var LEGENDARY = {
      pirate: "SHIVER ME TIMBERS! In forty years upon the seven seas I've ne'er laid eyes on such a beast! The kraken itself be weepin'! Batten down the hatches, this error be the stuff o' legend!",
      sportscaster: "STOP EVERYTHING! This is the error of the CENTURY, folks! The crowd is on its feet! I have never, EVER seen a play like this! They will be showing this replay for generations!",
      parent: "Sit down. No, sit. I have raised you for years and I have never seen anything like this. Your grandmother is going to hear about it. I need a moment. I truly need a moment.",
      shakespeare: 'Hark! The very heavens crack and tremble! Never did quill nor code beget so monstrous a calamity! Let poets sing of this dread hour for a thousand years! Alas, poor compiler!',
      narrator: 'Extraordinary. In all my years in the field, I have never witnessed this. A once-in-a-lifetime specimen, majestic and terrible. The herd falls silent. Nature holds its breath.'
    };
    var CELEBRATIONS = {
      pirate: "The undefined `userName` has been banished to Davy Jones' locker!",
      sportscaster: 'AND THE `userName` ERROR IS OUT OF HERE! What a recovery!',
      parent: "You defined `userName`. See? I knew you had it in you.",
      shakespeare: "All's well that ends well: `userName` is undefined no more!",
      narrator: 'And so, `userName` finds its place in the ecosystem. Life goes on.'
    };

    function pick() {
      var chosen = el.personality.value;
      return chosen === 'random' ? REAL[Math.floor(Math.random() * REAL.length)] : chosen;
    }

    function post(msg) {
      window.postMessage(msg, '*');
    }

    function postState() {
      post({
        type: 'state',
        state: {
          streak: streak,
          bestStreak: Math.max(streak, 5),
          totalFixes: streak,
          personality: el.personality.value,
          unlocked: []
        }
      });
    }

    var current = pick();
    var steps = [
      function () {
        post({ type: 'idle' });
      },
      function () {
        current = pick();
        post({ type: 'thinking', error: error, personality: current });
      },
      function () {
        post({
          type: 'response',
          error: error,
          response: {
            errorId: error.id,
            personality: current,
            reaction: REACTIONS[current],
            explanation: "You asked for something out of a box called userName, but nobody ever made that box. The computer looked everywhere and came back empty-handed.",
            fix: [
              'Create the box first: add `const userName = "Sam";` above line 12.',
              'Or check the spelling. Maybe you meant `username`?'
            ],
            line: 12,
            legendary: false
          }
        });
      },
      function () {
        streak += 1;
        post({ type: 'fixed', error: error, celebration: CELEBRATIONS[current], streak: streak });
        postState();
      },
      function () {
        post({
          type: 'achievement',
          achievement: { id: 'night_owl', title: 'Night Owl', description: 'Hit an error after 11 pm.', emoji: '🦉' }
        });
        post({
          type: 'achievement',
          achievement: { id: 'first_fix', title: 'First Fix', description: 'Squashed your very first error.', emoji: '🩹' }
        });
      },
      function () {
        current = pick();
        post({
          type: 'response',
          error: legendaryError,
          response: {
            errorId: legendaryError.id,
            personality: current,
            reaction: LEGENDARY[current],
            explanation: "You handed over a lunchbox with a sandwich and an apple, but the function only accepts a lunchbox with a sandwich and a juice. Close, but it's picky.",
            fix: ['On line 40, change `b: 2` to the text the function expects, like `b: "two"`.'],
            line: 40,
            legendary: true
          }
        });
      },
      function () {
        streak += 1;
        post({
          type: 'fixed',
          error: legendaryError,
          celebration: 'The legendary type mismatch on line 40 has been slain!',
          streak: streak
        });
        postState();
      }
    ];

    var index = 0;
    function next() {
      steps[index]();
      index = (index + 1) % steps.length;
    }

    el.mockBar.hidden = false;
    el.mockTheme.addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
    });

    postState();
    next();
    window.setInterval(next, 3000);
  }

  if (/[?&]mock\b/.test(window.location.search)) {
    startMock();
  }
})();
