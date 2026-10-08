// Tiny canvas confetti. No dependencies. Exposes window.ErrorBuddyConfetti.fire().
(function () {
  'use strict';

  var COLORS = ['#ff5252', '#ffd54a', '#4caf50', '#40c4ff', '#e040fb', '#ff9100'];
  var GRAVITY = 0.25;
  var DRAG = 0.985;

  var canvas = null;
  var ctx = null;
  var particles = [];
  var frame = 0;

  function resize() {
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function setup() {
    if (canvas) {
      return true;
    }
    canvas = document.getElementById('confetti');
    if (!canvas || !canvas.getContext) {
      canvas = null;
      return false;
    }
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return true;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawn(count) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    for (var i = 0; i < count; i++) {
      // Two cannons, one in each bottom corner, firing up and inwards.
      var fromLeft = i % 2 === 0;
      var angle = fromLeft ? random(-80, -45) : random(-135, -100);
      var speed = random(7, 15);
      var radians = (angle * Math.PI) / 180;
      particles.push({
        x: fromLeft ? 0 : width,
        y: height * 0.75,
        vx: Math.cos(radians) * speed,
        vy: Math.sin(radians) * speed,
        size: random(5, 9),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: random(0, Math.PI * 2),
        spin: random(-0.25, 0.25),
        life: random(90, 150)
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    var height = window.innerHeight;

    particles = particles.filter(function (p) {
      return p.life > 0 && p.y < height + 20;
    });

    particles.forEach(function (p) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      p.life -= 1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });

    if (particles.length > 0) {
      frame = window.requestAnimationFrame(tick);
    } else {
      frame = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function fire() {
    if (!setup()) {
      return;
    }
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    spawn(reduced ? 30 : 140);
    if (!frame) {
      frame = window.requestAnimationFrame(tick);
    }
  }

  window.ErrorBuddyConfetti = { fire: fire };
})();
